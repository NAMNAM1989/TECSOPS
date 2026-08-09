from __future__ import annotations

import concurrent.futures
import base64
import json
import mimetypes
import queue
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, unquote, urlparse

from app import __version__
from app.browser.captcha_ocr import ddddocr_ready, ocr_image_bytes_detailed
from app.browser.session_manager import SessionManager
from app.browser.locators import ensure_default_locators, locators_path
from app.config import Settings, ensure_runtime_dirs, load_settings
from app.data.repository import Repository
from app.services.awb_service import validate_ops_payload
from app.services.batch_service import BatchService
from app.services.download_service import find_recent_esid_pdf, resolve_docs_file
from app.data.models import NormalizedStatus
from app.services.esid_declare_service import fill_esid_declare, submit_esid_declare
from app.services.tcs_workspace_service import TcsWorkspaceService
from app.utils.awb import digits_only


class AgentHttpServer(ThreadingHTTPServer):
    """Một cổng chỉ thuộc một Agent, tránh request rơi vào tiến trình code cũ."""

    allow_reuse_address = False

    def server_bind(self) -> None:
        # Windows cho phép hai listener cùng địa chỉ trong một số cấu hình
        # SO_REUSEADDR. SO_EXCLUSIVEADDRUSE buộc Agent thứ hai fail ngay.
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(
                socket.SOL_SOCKET,
                socket.SO_EXCLUSIVEADDRUSE,
                1,
            )
        super().server_bind()


class AgentState:
    def __init__(self, settings: Settings) -> None:
        ensure_runtime_dirs(settings)
        self.settings = settings
        self.repo = Repository(settings.db_path)
        self.batch = BatchService(settings, self.repo)
        self.sessions = SessionManager(settings)
        self.workspace = TcsWorkspaceService(self.sessions, settings)
        self.lock = threading.Lock()
        self.last_job: dict[str, Any] | None = None
        self.running = False
        # Cache session cho /health khi đang bận Playwright (tránh treo health)
        self.session_snapshot: dict[str, Any] = self.sessions.status().to_dict()
        # Playwright + session phải chạy đúng 1 thread; HTTP dùng ThreadingHTTPServer
        # để /health vẫn trả lời trong lúc job dài.
        self._work_q: queue.Queue[
            tuple[Callable[..., Any], tuple[Any, ...], dict[str, Any], concurrent.futures.Future[Any]]
            | None
        ] = queue.Queue()
        self._worker = threading.Thread(
            target=self._worker_loop, name="tcs-playwright-worker", daemon=True
        )
        self._worker.start()

    def acquire_running(self, timeout_s: float = 120.0, poll_s: float = 0.12) -> bool:
        """Chờ lấy exclusive slot — xếp hàng thay vì 409 BUSY ngay (prefetch vs tải PDF)."""
        deadline = time.monotonic() + max(0.0, float(timeout_s))
        while True:
            with self.lock:
                if not self.running:
                    self.running = True
                    return True
            if time.monotonic() >= deadline:
                return False
            time.sleep(max(0.05, float(poll_s)))

    def release_running(self) -> None:
        with self.lock:
            self.running = False

    def refresh_session_snapshot(self) -> dict[str, Any]:
        try:
            self.session_snapshot = self.sessions.status().to_dict()
        except Exception as e:
            self.session_snapshot = {
                **(self.session_snapshot or {}),
                "message": f"Lỗi đọc session: {e}",
            }
        return self.session_snapshot

    def _worker_loop(self) -> None:
        while True:
            item = self._work_q.get()
            if item is None:
                return
            fn, args, kwargs, fut = item
            try:
                fut.set_result(fn(*args, **kwargs))
            except BaseException as e:  # noqa: BLE001 — chuyển hết về Future
                fut.set_exception(e)

    def call_on_worker(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """Chạy fn trên thread Playwright (đồng bộ — caller chờ kết quả)."""
        fut: concurrent.futures.Future[Any] = concurrent.futures.Future()
        self._work_q.put((fn, args, kwargs, fut))
        return fut.result()


def make_handler(state: AgentState):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:
            return

        def _cors(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def _try_begin_job(self, timeout_s: float = 120.0) -> bool:
            """Chờ exclusive slot. False → đã gửi 409 BUSY (hết thời gian chờ)."""
            if state.acquire_running(timeout_s=timeout_s):
                return True
            self._json(
                409,
                {
                    "ok": False,
                    "error": "BUSY",
                    "message": (
                        "Agent đang chạy job khác — đã chờ hết thời gian. "
                        "Thử lại sau vài giây."
                    ),
                },
            )
            return False

        def _json(self, code: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                # Client abort (poll timeout) — bỏ qua, không spam traceback
                return

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(204)
            self._cors()
            self.end_headers()

        def _file(self, code: int, data: bytes, content_type: str, filename: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            # Ảnh preview: inline để <img src="/docs?file=…"> load được; PDF vẫn attachment
            if content_type.startswith("image/"):
                self.send_header("Content-Disposition", f'inline; filename="{filename}"')
                self.send_header("Cache-Control", "no-store")
            else:
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(data)))
            self._cors()
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                return

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            if path in {"/", "/health"}:
                # Khi đang job: trả snapshot (không đụng page — tránh treo /health)
                if state.running:
                    sess = dict(state.session_snapshot)
                    base_msg = (sess.get("message") or "").strip()
                    sess["message"] = (base_msg + " · đang chạy job").strip(" ·")
                else:
                    # status() đọc page — marshal sang worker
                    try:
                        sess = state.call_on_worker(state.refresh_session_snapshot)
                    except Exception:
                        sess = dict(state.session_snapshot)
                docs = state.settings.output_dir / "docs"
                ocr_ok = ddddocr_ready()
                self._json(
                    200,
                    {
                        "ok": True,
                        "service": "tcs-awb-agent",
                        "version": __version__,
                        "warehouse_scope": state.settings.warehouse_scope,
                        "mock": state.settings.mock,
                        "dry_run": state.settings.dry_run,
                        "headless": bool(state.settings.headless),
                        "running": state.running,
                        "captcha_ocr": ocr_ok,
                        "docs_dir": str(docs),
                        "session": {**sess, "headless": bool(state.settings.headless)},
                        "workspace": state.workspace.snapshot(),
                        **(
                            {}
                            if ocr_ok
                            else {
                                "message": (
                                    "Agent thiếu ddddocr — Ext Đồng bộ không OCR được CAPTCHA. "
                                    "Chạy: cd tcs-awb-automation && .venv\\Scripts\\pip install -r requirements.txt "
                                    "rồi npm run tcs:agent:real"
                                )
                            }
                        ),
                    },
                )
                return
            if path == "/session/status":
                if state.running:
                    snap = dict(state.session_snapshot)
                else:
                    try:
                        snap = state.call_on_worker(state.refresh_session_snapshot)
                    except Exception:
                        snap = dict(state.session_snapshot)
                # Ưu tiên headless thật của session đang mở
                sess_hl = snap.get("headless")
                if sess_hl is None:
                    snap["headless"] = bool(state.settings.headless)
                self._json(200, {"ok": True, **snap})
                return
            if path == "/last-job":
                self._json(200, {"ok": True, "job": state.last_job})
                return
            if path == "/docs" or path.startswith("/docs/"):
                docs_dir = state.settings.output_dir / "docs"
                if path == "/docs":
                    qs = parse_qs(parsed.query)
                    name = (qs.get("file") or [""])[0]
                else:
                    name = unquote(path[len("/docs/") :])
                file_path = resolve_docs_file(docs_dir, name)
                if not file_path:
                    self._json(404, {"ok": False, "error": "FILE_NOT_FOUND", "message": name})
                    return
                data = file_path.read_bytes()
                ctype = mimetypes.guess_type(file_path.name)[0] or "application/pdf"
                self._file(200, data, ctype, file_path.name)
                return
            self._json(404, {"ok": False, "error": "NOT_FOUND"})

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                self._json(400, {"ok": False, "error": "INVALID_JSON"})
                return

            if path == "/session/open":
                if not self._try_begin_job():
                    return
                # Ops Login: visible=true → headed (máy kho). Cloud gửi visible=false.
                want_visible = bool(
                    payload.get("visible", False)
                    or payload.get("headed", False)
                    or payload.get("show_browser", False)
                )
                try:
                    def _open() -> dict[str, Any]:
                        st = state.sessions.open(
                            headless=False if want_visible else state.settings.headless,
                            visible=want_visible,
                            show_portal=True,
                        )
                        data = st.to_dict()
                        state.session_snapshot = data
                        return data

                    data = state.call_on_worker(_open)
                    if not data.get("open"):
                        self._json(
                            500,
                            {
                                "ok": False,
                                "error": "SESSION_OPEN_FAILED",
                                "message": data.get("message") or "Không mở được Chrome",
                                **data,
                            },
                        )
                        return
                    self._json(200, {"ok": True, **data})
                except Exception as e:
                    try:
                        state.call_on_worker(state.refresh_session_snapshot)
                    except Exception:
                        pass
                    err_msg = str(e)
                    code = "HEADED_REQUIRED" if want_visible else "SESSION_OPEN_FAILED"
                    self._json(
                        500,
                        {
                            "ok": False,
                            "error": code,
                            "message": err_msg,
                            "headless": bool(state.settings.headless) and not want_visible,
                        },
                    )
                finally:
                    state.release_running()
                return
            if path == "/workspace/bootstrap":
                self._handle_workspace_bootstrap(payload)
                return
            if path == "/workspace/prefetch-pdfs":
                self._handle_prefetch_pdfs(payload)
                return
            if path == "/captcha/solve":
                raw_image = str(payload.get("image") or payload.get("data_url") or "")
                if "," in raw_image:
                    raw_image = raw_image.split(",", 1)[1]
                try:
                    image = base64.b64decode(raw_image, validate=True)
                except Exception:
                    self._json(
                        400,
                        {
                            "ok": False,
                            "error": "INVALID_IMAGE",
                            "message": "Ảnh CAPTCHA không phải base64 hợp lệ",
                        },
                    )
                    return
                if not image or len(image) > 2_000_000:
                    self._json(
                        400,
                        {
                            "ok": False,
                            "error": "INVALID_IMAGE",
                            "message": "Ảnh CAPTCHA trống hoặc quá lớn",
                        },
                    )
                    return
                try:
                    expected_length = int(payload.get("expected_length") or 5)
                    # CAPTCHA TCS đơn giản — mặc định nới hơn 0.60 cũ; client vẫn có thể siết.
                    min_confidence = float(payload.get("min_confidence") or 0.40)
                    mode = str(payload.get("mode") or "auto").strip().lower() or "auto"
                    if mode not in {"auto", "fast", "medium", "full"}:
                        mode = "auto"
                    result = ocr_image_bytes_detailed(
                        image,
                        expected_length=max(1, min(expected_length, 12)),
                        min_confidence=max(0.0, min(min_confidence, 1.0)),
                        mode=mode,
                    )
                except Exception as e:
                    self._json(
                        500,
                        {"ok": False, "error": "OCR_FAILED", "message": str(e)[:240]},
                    )
                    return
                self._json(
                    200 if result.accepted else 422,
                    {
                        "ok": result.accepted,
                        "text": result.text,
                        "confidence": result.confidence,
                        "candidates": [
                            {"text": text, "votes": votes}
                            for text, votes in result.candidates[:5]
                        ],
                        "samples": result.samples,
                        "error": result.error,
                    },
                )
                return
            if path == "/session/close":
                def _close() -> dict[str, Any]:
                    state.sessions.close()
                    state.workspace.reset()
                    state.session_snapshot = state.sessions.status().to_dict()
                    return state.session_snapshot

                try:
                    state.call_on_worker(_close)
                except Exception:
                    state.session_snapshot = {"open": False, "logged_in": False, "url": "", "message": "closed"}
                self._json(200, {"ok": True, "open": False})
                return
            if path == "/session/focus":
                # Đưa cửa sổ Chrome lên trước (headed máy kho) — không đụng form
                if not self._try_begin_job(timeout_s=60.0):
                    return
                try:
                    def _focus() -> dict[str, Any]:
                        return state.sessions.focus_window()

                    result = state.call_on_worker(_focus)
                    code = 200 if result.get("ok") else 400
                    self._json(code, result)
                except Exception as e:
                    self._json(500, {"ok": False, "error": "INTERNAL", "message": str(e)})
                finally:
                    state.release_running()
                return
            if path == "/jobs":
                self._handle_job(payload)
                return
            if path == "/esid/declare-fill":
                self._handle_esid_declare_fill(payload)
                return
            if path == "/esid/declare-submit":
                self._handle_esid_declare_submit(payload)
                return
            if path == "/control/pause":
                state.batch.pause()
                self._json(200, {"ok": True, "action": "pause"})
                return
            if path == "/control/resume":
                state.batch.resume()
                self._json(200, {"ok": True, "action": "resume"})
                return
            if path == "/control/stop":
                state.batch.stop()
                self._json(200, {"ok": True, "action": "stop"})
                return
            self._json(404, {"ok": False, "error": "NOT_FOUND"})

        def _handle_workspace_bootstrap(self, payload: dict[str, Any]) -> None:
            session_date = str(
                payload.get("session_date") or payload.get("sessionDate") or ""
            ).strip()
            raw_awbs = payload.get("awbs") or []
            if not session_date:
                self._json(
                    400,
                    {
                        "ok": False,
                        "error": "VALIDATION",
                        "message": "Thiếu session_date để Login và quét sẵn ESID",
                    },
                )
                return
            if not isinstance(raw_awbs, list):
                self._json(
                    400,
                    {"ok": False, "error": "VALIDATION", "message": "awbs phải là mảng"},
                )
                return
            if not self._try_begin_job():
                return
            want_visible = bool(
                payload.get("visible", False)
                or payload.get("headed", False)
                or payload.get("show_browser", False)
            )
            try:
                result = state.call_on_worker(
                    state.workspace.bootstrap,
                    session_date=session_date,
                    raw_awbs=raw_awbs,
                    visible=want_visible,
                )
                state.call_on_worker(state.refresh_session_snapshot)
                code = 200 if result.get("ok") else 400
                if result.get("error") in {"NO_BROWSER", "NEEDS_LOGIN"}:
                    code = 400
                self._json(code, result)
            except Exception as e:
                state.workspace.phase = "ERROR"
                state.workspace.error = str(e)[:300]
                try:
                    state.call_on_worker(state.refresh_session_snapshot)
                except Exception:
                    pass
                self._json(
                    500,
                    {"ok": False, "error": "INTERNAL", "message": str(e)[:300]},
                )
            finally:
                state.release_running()

        def _handle_prefetch_pdfs(self, payload: dict[str, Any]) -> None:
            """In sẵn PDF cho AWB ready — dùng sau Đồng bộ (Ext hoặc Agent)."""
            if not self._try_begin_job():
                return

            def _run() -> tuple[int, dict[str, Any]]:
                st = state.sessions.status()
                state.session_snapshot = st.to_dict()
                if not st.open or not st.logged_in:
                    return 400, {
                        "ok": False,
                        "error": "NEEDS_LOGIN" if st.open else "NO_BROWSER",
                        "message": st.message or "Cần login TCS trước khi prefetch PDF",
                    }
                raw_awbs = payload.get("awbs") or []
                limit = payload.get("limit")
                try:
                    limit_n = int(limit) if limit is not None else None
                except (TypeError, ValueError):
                    limit_n = None
                result = state.workspace.prefetch_ready_pdfs(
                    awbs=[str(x) for x in raw_awbs] if isinstance(raw_awbs, list) else None,
                    limit=limit_n,
                )
                return 200, {"ok": True, **result}

            try:
                code, body = state.call_on_worker(_run)
                self._json(code, body)
            except Exception as e:
                self._json(500, {"ok": False, "error": "INTERNAL", "message": str(e)[:300]})
            finally:
                state.release_running()

        def _handle_esid_declare_fill(self, payload: dict[str, Any]) -> None:
            """Điền form KHAI BÁO ESID từ Ops — mặc định không HOÀN TẤT."""
            if not self._try_begin_job():
                return

            def _fill() -> tuple[int, dict[str, Any]]:
                result = fill_esid_declare(state.sessions, state.settings, payload)
                state.refresh_session_snapshot()
                code = 200 if result.get("ok") else 400
                if result.get("error") in {"NEEDS_LOGIN", "NO_BROWSER"}:
                    code = 400
                return code, result

            try:
                code, result = state.call_on_worker(_fill)
                self._json(code, result)
            except Exception as e:
                self._json(500, {"ok": False, "error": "INTERNAL", "message": str(e)})
            finally:
                state.release_running()

        def _handle_esid_declare_submit(self, payload: dict[str, Any]) -> None:
            """HOÀN TẤT form KHAI BÁO đang mở — bắt buộc confirm_submit."""
            if not self._try_begin_job():
                return

            def _submit() -> tuple[int, dict[str, Any]]:
                result = submit_esid_declare(state.sessions, state.settings, payload)
                state.refresh_session_snapshot()
                code = 200 if result.get("ok") else 400
                if result.get("error") in {"NEEDS_LOGIN", "NO_BROWSER", "CONFIRM_REQUIRED"}:
                    code = 400
                return code, result

            try:
                code, result = state.call_on_worker(_submit)
                self._json(code, result)
            except Exception as e:
                self._json(500, {"ok": False, "error": "INTERNAL", "message": str(e)})
            finally:
                state.release_running()

        def _handle_job(self, payload: dict[str, Any]) -> None:
                # PDF cache: trả ngay, không chiếm Playwright worker / không cần login
            try:
                warehouse = str(payload.get("warehouse") or "TECS-TCS")
                force_pdf = bool(
                    payload.get("force")
                    or payload.get("force_pdf")
                    or payload.get("forcePdf")
                )
                # FORCE_BYPASS_V1 — bỏ qua cache khi Ops/bench gửi force=true
                if force_pdf:
                    pass  # rơi xuống worker in lại
                elif (
                    warehouse.upper() in {"TECS-TCS", "KHO-TCS", "TCS"}
                    and not bool(payload.get("mock", state.settings.mock))
                ):
                    try:
                        preview_rows = validate_ops_payload(payload)
                    except Exception:
                        preview_rows = []
                    if (
                        len(preview_rows) == 1
                        and preview_rows[0].action.value == "DOWNLOAD"
                    ):
                        cached = find_recent_esid_pdf(
                            state.settings.output_dir / "docs",
                            preview_rows[0].awb_digits,
                            document_type=preview_rows[0].document_type or "ESID",
                        )
                        if (
                            cached is not None
                            and cached.is_file()
                            and cached.stat().st_size >= 100
                        ):
                            name = cached.name
                            self._json(
                                200,
                                {
                                    "ok": True,
                                    "job_id": "cache",
                                    "total": 1,
                                    "ok_count": 1,
                                    "downloaded_count": 1,
                                    "reception_completed": 0,
                                    "not_completed": 0,
                                    "errors": 0,
                                    "report_path": "",
                                    "docs_dir": str(state.settings.output_dir / "docs"),
                                    "mock": False,
                                    "hot_path": True,
                                    "cache_hit": True,
                                    "results": [
                                        {
                                            "stt": preview_rows[0].stt,
                                            "awb": preview_rows[0].awb_display
                                            or preview_rows[0].awb_digits,
                                            "action": "DOWNLOAD",
                                            "normalized_status": NormalizedStatus.DOWNLOADED.value,
                                            "downloaded_file": str(cached),
                                            "download_url": f"/docs?file={name}",
                                            "pdf_name": name,
                                            "print_status": "CACHE_HIT",
                                            "tcs_status_raw": f"PDF cache ({name})",
                                            "hot_path": True,
                                            "cache_hit": True,
                                            "shipment_id": preview_rows[0].shipment_id,
                                        }
                                    ],
                                },
                            )
                            return
            except Exception:
                pass

            if not self._try_begin_job():
                return

            def _job() -> tuple[int, dict[str, Any]]:
                warehouse = str(payload.get("warehouse") or "TECS-TCS")
                if warehouse.upper() not in {"TECS-TCS", "KHO-TCS", "TCS"}:
                    return 400, {"ok": False, "error": "WAREHOUSE_SCOPE", "message": "Chỉ TECS-TCS / TCS"}
                rows = validate_ops_payload(payload)
                dry_run = bool(payload.get("dry_run", state.settings.dry_run))
                mock = bool(payload.get("mock", state.settings.mock))
                confirm_register = bool(payload.get("confirm_register", False))
                session_date = str(
                    payload.get("session_date") or payload.get("sessionDate") or ""
                ).strip()
                job = state.batch.create_job_from_rows(
                    rows,
                    source="ops",
                    dry_run=dry_run,
                    mock=mock,
                    confirm_register=confirm_register,
                    session_date=session_date,
                )

                portal = None
                if not mock:
                    st = state.sessions.status()
                    state.session_snapshot = st.to_dict()
                    if not st.open:
                        return 400, {
                            "ok": False,
                            "error": "NO_BROWSER",
                            "message": "Chưa mở Chrome — POST /session/open (sẽ tự điền user/pass nếu có .env)",
                        }
                    if not st.logged_in:
                        return 400, {
                            "ok": False,
                            "error": "NEEDS_LOGIN",
                            "message": "Chrome đang ở trang login — nhập CAPTCHA rồi Đăng nhập, sau đó thử lại",
                        }
                    # DOWNLOAD đơn: bỏ focus cửa sổ (tiết kiệm thời gian máy kho)
                    is_single_download = (
                        len(rows) == 1 and rows[0].action.value == "DOWNLOAD"
                    )
                    if not is_single_download:
                        state.sessions.focus_if_headed()
                    try:
                        portal = state.sessions.portal("list")
                    except Exception as e:
                        return 500, {"ok": False, "error": "PORTAL", "message": str(e)}

                prepared_awb = None
                # Sau Login/Quét: dùng index AWB→page để mở thẳng dòng, tránh
                # xóa filter và tìm AWB# lại. Cache stale sẽ tự fallback cold-path.
                if not mock and not prepared_awb and len(rows) == 1:
                    row0 = rows[0]
                    if row0.action.value == "DOWNLOAD":
                        try:
                            if state.workspace.prepare_pdf_from_cache(row0.awb_digits):
                                prepared_awb = row0.awb_digits
                        except Exception:
                            prepared_awb = None
                results, report = state.batch.run(
                    job, portal=portal, prepared_awb=prepared_awb
                )
                enriched = []
                for r in results:
                    d = r.to_dict()
                    if r.downloaded_file:
                        name = Path(r.downloaded_file).name
                        d["download_url"] = f"/docs?file={name}"
                        d["pdf_name"] = name
                    if getattr(r, "print_status", "") == "CACHE_HIT":
                        d["cache_hit"] = True
                        d["hot_path"] = True
                    elif prepared_awb and digits_only(r.awb) == prepared_awb:
                        d["hot_path"] = True
                    enriched.append(d)
                summary = {
                    "job_id": job.job_id,
                    "total": len(results),
                    "ok_count": sum(
                        1
                        for r in results
                        if r.normalized_status
                        in {"COMPLETED", "RECEPTION_COMPLETED", "DOWNLOADED", "PRINTED"}
                    ),
                    "downloaded_count": sum(1 for r in results if r.downloaded_file),
                    "reception_completed": sum(
                        1 for r in results if r.normalized_status == "RECEPTION_COMPLETED"
                    ),
                    "not_completed": sum(1 for r in results if r.normalized_status == "NOT_COMPLETED"),
                    "errors": sum(
                        1
                        for r in results
                        if r.normalized_status
                        in {"FAILED", "VALIDATION_ERROR", "SITE_CHANGED", "NEEDS_LOGIN"}
                    ),
                    "report_path": str(report),
                    "docs_dir": str(state.settings.output_dir / "docs"),
                    "mock": mock,
                    "hot_path": bool(prepared_awb) or any(x.get("cache_hit") for x in enriched),
                    "cache_hit": any(x.get("cache_hit") for x in enriched),
                    "results": enriched,
                }
                state.last_job = summary
                # Hộp in OS (USER_*) có thể chặn page — không đọc DOM session
                opened_dialog = any(
                    str(getattr(r, "print_status", "") or "").startswith("USER_")
                    for r in results
                )
                is_single_download = (
                    len(rows) == 1 and rows[0].action.value == "DOWNLOAD"
                )
                if opened_dialog:
                    snap = dict(state.session_snapshot or {})
                    snap["message"] = (snap.get("message") or "Đã login") + " · hộp Save/In đang mở"
                    state.session_snapshot = snap
                elif not is_single_download:
                    try:
                        state.refresh_session_snapshot()
                    except Exception:
                        pass
                return 200, {"ok": True, **summary}

            try:
                code, body = state.call_on_worker(_job)
                self._json(code, body)
            except ValueError as e:
                self._json(400, {"ok": False, "error": "VALIDATION", "message": str(e)})
            except Exception as e:
                self._json(500, {"ok": False, "error": "INTERNAL", "message": str(e)})
            finally:
                state.release_running()

    return Handler


def _auto_open_session(state: AgentState) -> None:
    """Railway/server: tự mở Chrome headless + login OCR lúc boot (không có người bấm nút)."""
    settings = state.settings
    if settings.mock:
        return

    def _open() -> None:
        with state.lock:
            if state.running:
                return
            state.running = True
        try:
            st = state.sessions.open(headless=settings.headless)
            state.session_snapshot = st.to_dict()
            print(
                f"[auto-open] open={st.open} logged_in={st.logged_in} · {st.message}"
            )
        except Exception as e:  # noqa: BLE001
            print(f"[auto-open] LỖI mở session: {e}")
        finally:
            with state.lock:
                state.running = False

    def _runner() -> None:
        try:
            state.call_on_worker(_open)
        except Exception as e:  # noqa: BLE001
            print(f"[auto-open] runner lỗi: {e}")

    threading.Thread(target=_runner, name="tcs-auto-open", daemon=True).start()


def serve_agent(settings: Settings | None = None) -> None:
    settings = settings or load_settings()
    ensure_runtime_dirs(settings)
    # Seed locators.json từ DEFAULT nếu container chưa có discovery_artifacts/
    ensure_default_locators(locators_path(settings.discovery_dir))
    state = AgentState(settings)
    host = settings.agent_host
    port = settings.agent_port
    if settings.auto_open and not settings.mock:
        print("[auto-open] TCS_AUTO_OPEN=1 → mở Chrome headless + login OCR…")
        _auto_open_session(state)
    # ThreadingHTTPServer: /health trả lời khi job đang chạy trên worker.
    # Playwright vẫn chỉ chạy trên 1 worker thread (call_on_worker).
    httpd = AgentHttpServer((host, port), make_handler(state))
    mode = "MOCK" if settings.mock else "REAL"
    print(f"TCS AWB Agent [{mode}] http://{host}:{port} scope={settings.warehouse_scope}")
    print("GET  /health  /session/status  /docs?file=")
    print(
        f"mode={'HEADLESS' if settings.headless else 'HEADED'} · "
        "POST /workspace/bootstrap  /session/open|/close|/focus  /jobs  "
        "/esid/declare-fill|/declare-submit"
    )
    if not settings.mock:
        print(
            "REAL mode: POST /workspace/bootstrap → Login + Quét → "
            "/esid/declare-fill|declare-submit → /jobs DOWNLOAD"
        )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nAgent stopped.")
        try:
            state.call_on_worker(state.sessions.close)
        except Exception:
            state.sessions.close()
    finally:
        httpd.server_close()


if __name__ == "__main__":
    serve_agent()
