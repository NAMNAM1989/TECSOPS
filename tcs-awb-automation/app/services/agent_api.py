from __future__ import annotations

import concurrent.futures
import json
import mimetypes
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, unquote, urlparse

from app import __version__
from app.browser.pages.awb_page import NeedsLoginError, SiteChangedError
from app.browser.session_manager import SessionManager
from app.browser.locators import ensure_default_locators, locators_path
from app.config import Settings, ensure_runtime_dirs, load_settings
from app.data.repository import Repository
from app.services.awb_service import validate_ops_payload
from app.services.batch_service import BatchService
from app.services.download_service import resolve_docs_file
from app.services.esid_scan_service import scan_esid_reception
from app.services.esid_declare_service import fill_esid_declare, submit_esid_declare
from app.services.tcs_client import TcsClient
from app.utils.awb import digits_only


class AgentState:
    # Cache prepare còn hiệu lực (giây) — FE cũng debounce tương tự
    PREPARED_TTL_S = 120

    def __init__(self, settings: Settings) -> None:
        ensure_runtime_dirs(settings)
        self.settings = settings
        self.repo = Repository(settings.db_path)
        self.batch = BatchService(settings, self.repo)
        self.sessions = SessionManager(settings)
        self.lock = threading.Lock()
        self.last_job: dict[str, Any] | None = None
        self.running = False
        # Pre-warm ESID (menu ⋮): {awb, ready_at, has_in_button}
        self.prepared: dict[str, Any] | None = None
        self.preparing_awb: str | None = None
        self.prepare_done = threading.Event()
        self.prepare_done.set()
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

    def clear_prepared(self) -> None:
        self.prepared = None

    def prepared_hot_awb(self) -> str | None:
        p = self.prepared
        if not p or not p.get("has_in_button"):
            return None
        awb = str(p.get("awb") or "")
        if len(awb) != 11:
            return None
        ready_at = float(p.get("ready_at") or 0)
        if ready_at and (time.time() - ready_at) > self.PREPARED_TTL_S:
            return None
        return awb

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
                hot = state.prepared_hot_awb()
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
                        "docs_dir": str(docs),
                        "session": {**sess, "headless": bool(state.settings.headless)},
                        "prepared_awb": hot,
                        "preparing_awb": state.preparing_awb,
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
                snap = {**snap, "headless": bool(state.settings.headless)}
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
                with state.lock:
                    if state.running:
                        self._json(
                            409,
                            {"ok": False, "error": "BUSY", "message": "Agent đang chạy job khác"},
                        )
                        return
                    state.running = True
                try:
                    def _open() -> dict[str, Any]:
                        st = state.sessions.open(headless=state.settings.headless)
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
                    self._json(500, {"ok": False, "error": "SESSION_OPEN_FAILED", "message": str(e)})
                finally:
                    with state.lock:
                        state.running = False
                return
            if path == "/session/close":
                def _close() -> dict[str, Any]:
                    state.sessions.close()
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
                with state.lock:
                    if state.running:
                        self._json(
                            409,
                            {"ok": False, "error": "BUSY", "message": "Agent đang chạy job khác"},
                        )
                        return
                    state.running = True
                try:
                    def _focus() -> dict[str, Any]:
                        return state.sessions.focus_window()

                    result = state.call_on_worker(_focus)
                    code = 200 if result.get("ok") else 400
                    self._json(code, result)
                except Exception as e:
                    self._json(500, {"ok": False, "error": "INTERNAL", "message": str(e)})
                finally:
                    with state.lock:
                        state.running = False
                return
            if path == "/jobs":
                self._handle_job(payload)
                return
            if path == "/esid/prepare":
                self._handle_esid_prepare(payload)
                return
            if path == "/esid/scan":
                self._handle_esid_scan(payload)
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

        def _handle_esid_prepare(self, payload: dict[str, Any]) -> None:
            """Pre-warm trang chi tiết ESID (nút IN) — gọi khi mở menu ⋮."""
            awb = digits_only(str(payload.get("awb") or payload.get("awb_digits") or ""))
            session_date = str(payload.get("session_date") or payload.get("sessionDate") or "").strip()
            if len(awb) != 11:
                self._json(400, {"ok": False, "error": "VALIDATION", "message": "AWB phải đủ 11 số"})
                return

            # Đã prepare cùng AWB còn TTL → trả ngay
            hot = state.prepared_hot_awb()
            if hot == awb:
                self._json(
                    200,
                    {
                        "ok": True,
                        "prepared": True,
                        "awb": awb,
                        "has_in_button": True,
                        "elapsed_ms": 0,
                        "cached": True,
                        "message": "Đã sẵn sàng (cache)",
                    },
                )
                return

            # Đang prepare cùng AWB → chờ xong
            with state.lock:
                if state.preparing_awb == awb and not state.prepare_done.is_set():
                    wait_same = True
                else:
                    wait_same = False
            if wait_same:
                if not state.prepare_done.wait(timeout=120):
                    self._json(504, {"ok": False, "error": "PREPARE_TIMEOUT", "message": "Chờ prepare quá lâu"})
                    return
                if state.prepared_hot_awb() == awb:
                    self._json(
                        200,
                        {
                            "ok": True,
                            "prepared": True,
                            "awb": awb,
                            "has_in_button": True,
                            "elapsed_ms": 0,
                            "cached": True,
                            "message": "Đã sẵn sàng (đợi prepare)",
                        },
                    )
                    return

            with state.lock:
                if state.running:
                    self._json(409, {"ok": False, "error": "BUSY", "message": "Agent đang chạy job khác"})
                    return
                state.running = True
                state.preparing_awb = awb
                state.prepare_done.clear()

            t0 = time.perf_counter()

            def _prepare() -> dict[str, Any]:
                st = state.sessions.status()
                state.session_snapshot = st.to_dict()
                if not st.open:
                    return {
                        "ok": False,
                        "error": "NO_BROWSER",
                        "message": "Chưa mở Chrome — POST /session/open",
                    }
                if not st.logged_in:
                    return {
                        "ok": False,
                        "error": "NEEDS_LOGIN",
                        "message": "Cần login TCS trước khi prepare ESID",
                    }
                loc_file = state.settings.discovery_dir / "locators.json"
                client = TcsClient(
                    mock=False,
                    discovery_report=state.settings.discovery_dir.parent / "discovery_report.md",
                    locators_file=loc_file,
                    portal=state.sessions.portal(),
                )
                info = client.prepare_esid(awb, session_date=session_date or None)
                state.prepared = {
                    "awb": awb,
                    "ready_at": time.time(),
                    "has_in_button": bool(info.get("has_in_button")),
                }
                state.refresh_session_snapshot()
                return {
                    "ok": True,
                    "prepared": True,
                    "awb": awb,
                    "has_in_button": True,
                    "message": info.get("message") or "ESID sẵn sàng",
                }

            try:
                body = state.call_on_worker(_prepare)
                elapsed_ms = int((time.perf_counter() - t0) * 1000)
                if not body.get("ok"):
                    state.clear_prepared()
                    code = 400 if body.get("error") in {"NO_BROWSER", "NEEDS_LOGIN"} else 500
                    self._json(code, {**body, "elapsed_ms": elapsed_ms})
                    return
                self._json(200, {**body, "elapsed_ms": elapsed_ms, "cached": False})
            except NeedsLoginError as e:
                state.clear_prepared()
                self._json(400, {"ok": False, "error": "NEEDS_LOGIN", "message": str(e)})
            except SiteChangedError as e:
                state.clear_prepared()
                self._json(400, {"ok": False, "error": "SITE_CHANGED", "message": str(e)})
            except Exception as e:
                state.clear_prepared()
                self._json(500, {"ok": False, "error": "INTERNAL", "message": str(e)})
            finally:
                with state.lock:
                    state.running = False
                    state.preparing_awb = None
                    state.prepare_done.set()

        def _handle_esid_scan(self, payload: dict[str, Any]) -> None:
            with state.lock:
                if state.running:
                    self._json(409, {"ok": False, "error": "BUSY", "message": "Agent đang chạy job khác"})
                    return
                state.running = True
                try:
                    state.session_snapshot = dict(state.session_snapshot)
                except Exception:
                    pass

            def _scan() -> tuple[int, dict[str, Any]]:
                warehouse = str(payload.get("warehouse") or "TECS-TCS")
                if warehouse.upper() not in {"TECS-TCS", "KHO-TCS"}:
                    return 400, {"ok": False, "error": "WAREHOUSE_SCOPE", "message": "Chỉ TECS-TCS"}
                session_date = str(payload.get("session_date") or payload.get("sessionDate") or "").strip()
                raw_awbs = payload.get("awbs") or []
                if not isinstance(raw_awbs, list):
                    return 400, {"ok": False, "error": "VALIDATION", "message": "awbs phải là mảng"}
                awbs = [str(a) for a in raw_awbs]
                if not session_date and not awbs:
                    return 400, {
                        "ok": False,
                        "error": "VALIDATION",
                        "message": "Cần session_date (YYYY-MM-DD) hoặc awbs[]",
                    }
                result = scan_esid_reception(
                    state.sessions,
                    state.settings,
                    awbs,
                    session_date=session_date or None,
                )
                code = 200 if result.get("ok") else 400
                if result.get("error") in {"NEEDS_LOGIN", "NO_BROWSER"}:
                    code = 400
                state.refresh_session_snapshot()
                return code, result

            try:
                code, result = state.call_on_worker(_scan)
                self._json(code, result)
            except Exception as e:
                self._json(500, {"ok": False, "error": "INTERNAL", "message": str(e)})
            finally:
                with state.lock:
                    state.running = False

        def _handle_esid_declare_fill(self, payload: dict[str, Any]) -> None:
            """Điền form KHAI BÁO ESID từ Ops — mặc định không HOÀN TẤT."""
            with state.lock:
                if state.running:
                    self._json(409, {"ok": False, "error": "BUSY", "message": "Agent đang chạy job khác"})
                    return
                state.running = True

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
                with state.lock:
                    state.running = False

        def _handle_esid_declare_submit(self, payload: dict[str, Any]) -> None:
            """HOÀN TẤT form KHAI BÁO đang mở — bắt buộc confirm_submit."""
            with state.lock:
                if state.running:
                    self._json(409, {"ok": False, "error": "BUSY", "message": "Agent đang chạy job khác"})
                    return
                state.running = True

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
                with state.lock:
                    state.running = False

        def _handle_job(self, payload: dict[str, Any]) -> None:
            # Nếu đang prepare đúng AWB của job → chờ prepare xong rồi chạy hot-path
            try:
                peek_rows = payload.get("rows") or []
                peek_awb = ""
                if isinstance(peek_rows, list) and peek_rows:
                    peek_awb = digits_only(str(peek_rows[0].get("awb") or ""))
            except Exception:
                peek_awb = ""

            with state.lock:
                preparing = state.preparing_awb
                is_running = state.running
            if is_running and preparing and peek_awb and preparing == peek_awb:
                if not state.prepare_done.wait(timeout=120):
                    self._json(504, {"ok": False, "error": "PREPARE_TIMEOUT", "message": "Chờ prepare quá lâu"})
                    return
            with state.lock:
                if state.running:
                    self._json(409, {"ok": False, "error": "BUSY", "message": "Agent đang chạy job khác"})
                    return
                state.running = True

            def _job() -> tuple[int, dict[str, Any]]:
                warehouse = str(payload.get("warehouse") or "TECS-TCS")
                if warehouse.upper() not in {"TECS-TCS", "KHO-TCS"}:
                    return 400, {"ok": False, "error": "WAREHOUSE_SCOPE", "message": "Chỉ TECS-TCS"}
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
                    try:
                        portal = state.sessions.portal()
                    except Exception as e:
                        return 500, {"ok": False, "error": "PORTAL", "message": str(e)}

                prepared_awb = state.prepared_hot_awb()
                results, report = state.batch.run(
                    job, portal=portal, prepared_awb=prepared_awb
                )
                # Sau IN: cache không còn hợp lệ
                state.clear_prepared()
                enriched = []
                for r in results:
                    d = r.to_dict()
                    if r.downloaded_file:
                        name = Path(r.downloaded_file).name
                        d["download_url"] = f"/docs?file={name}"
                        d["pdf_name"] = name
                    if prepared_awb and digits_only(r.awb) == prepared_awb:
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
                    "hot_path": bool(prepared_awb),
                    "results": enriched,
                }
                state.last_job = summary
                # Hộp in OS (USER_*) có thể chặn page — không đọc DOM session
                opened_dialog = any(
                    str(getattr(r, "print_status", "") or "").startswith("USER_")
                    for r in results
                )
                if opened_dialog:
                    snap = dict(state.session_snapshot or {})
                    snap["message"] = (snap.get("message") or "Đã login") + " · hộp Save/In đang mở"
                    state.session_snapshot = snap
                else:
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
                with state.lock:
                    state.running = False

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
    httpd = ThreadingHTTPServer((host, port), make_handler(state))
    mode = "MOCK" if settings.mock else "REAL"
    print(f"TCS AWB Agent [{mode}] http://{host}:{port} scope={settings.warehouse_scope}")
    print("GET  /health  /session/status  /docs?file=")
    print(
        f"mode={'HEADLESS' if settings.headless else 'HEADED'} · "
        "POST /session/open|/close|/focus  /jobs  /esid/prepare|/scan|/declare-fill|/declare-submit"
    )
    if not settings.mock:
        print(
            "REAL mode: POST /session/open → login → POST /esid/prepare|declare-fill|declare-submit → /jobs DOWNLOAD"
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
