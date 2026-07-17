from __future__ import annotations

import json
import mimetypes
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from app import __version__
from app.browser.session_manager import SessionManager
from app.config import Settings, ensure_runtime_dirs, load_settings
from app.data.repository import Repository
from app.services.awb_service import validate_ops_payload
from app.services.batch_service import BatchService
from app.services.download_service import resolve_docs_file
from app.services.esid_scan_service import scan_esid_reception


class AgentState:
    def __init__(self, settings: Settings) -> None:
        ensure_runtime_dirs(settings)
        self.settings = settings
        self.repo = Repository(settings.db_path)
        self.batch = BatchService(settings, self.repo)
        self.sessions = SessionManager(settings)
        self.lock = threading.Lock()
        self.last_job: dict[str, Any] | None = None
        self.running = False
        # Cache session cho /health khi đang bận Playwright (tránh treo health)
        self.session_snapshot: dict[str, Any] = self.sessions.status().to_dict()

    def refresh_session_snapshot(self) -> dict[str, Any]:
        try:
            self.session_snapshot = self.sessions.status().to_dict()
        except Exception as e:
            self.session_snapshot = {
                **(self.session_snapshot or {}),
                "message": f"Lỗi đọc session: {e}",
            }
        return self.session_snapshot


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
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(204)
            self._cors()
            self.end_headers()

        def _file(self, code: int, data: bytes, content_type: str, filename: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(data)))
            self._cors()
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            if path in {"/", "/health"}:
                # Khi đang job Playwright: trả snapshot (không đụng page — tránh treo /health)
                if state.running:
                    sess = dict(state.session_snapshot)
                    sess["message"] = (sess.get("message") or "") + " · đang chạy job"
                else:
                    sess = state.refresh_session_snapshot()
                docs = state.settings.output_dir / "docs"
                self._json(
                    200,
                    {
                        "ok": True,
                        "service": "tcs-awb-agent",
                        "version": __version__,
                        "warehouse_scope": state.settings.warehouse_scope,
                        "mock": state.settings.mock,
                        "dry_run": state.settings.dry_run,
                        "running": state.running,
                        "docs_dir": str(docs),
                        "session": sess,
                    },
                )
                return
            if path == "/session/status":
                if state.running:
                    self._json(200, {"ok": True, **state.session_snapshot})
                else:
                    self._json(200, {"ok": True, **state.refresh_session_snapshot()})
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
                try:
                    st = state.sessions.open(headless=False)
                    data = st.to_dict()
                    state.session_snapshot = data
                    # open:false = thất bại thật (tránh FE hiểu nhầm "đã mở")
                    if not st.open:
                        self._json(
                            500,
                            {
                                "ok": False,
                                "error": "SESSION_OPEN_FAILED",
                                "message": st.message or "Không mở được Chrome",
                                **data,
                            },
                        )
                        return
                    self._json(200, {"ok": True, **data})
                except Exception as e:
                    state.refresh_session_snapshot()
                    self._json(500, {"ok": False, "error": "SESSION_OPEN_FAILED", "message": str(e)})
                return
            if path == "/session/close":
                state.sessions.close()
                state.session_snapshot = state.sessions.status().to_dict()
                self._json(200, {"ok": True, "open": False})
                return
            if path == "/jobs":
                self._handle_job(payload)
                return
            if path == "/esid/scan":
                self._handle_esid_scan(payload)
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

        def _handle_esid_scan(self, payload: dict[str, Any]) -> None:
            with state.lock:
                if state.running:
                    self._json(409, {"ok": False, "error": "BUSY", "message": "Agent đang chạy job khác"})
                    return
                state.running = True
            try:
                warehouse = str(payload.get("warehouse") or "TECS-TCS")
                if warehouse.upper() not in {"TECS-TCS", "KHO-TCS"}:
                    self._json(400, {"ok": False, "error": "WAREHOUSE_SCOPE", "message": "Chỉ TECS-TCS"})
                    return
                session_date = str(payload.get("session_date") or payload.get("sessionDate") or "").strip()
                raw_awbs = payload.get("awbs") or []
                if not isinstance(raw_awbs, list):
                    self._json(400, {"ok": False, "error": "VALIDATION", "message": "awbs phải là mảng"})
                    return
                awbs = [str(a) for a in raw_awbs]
                # Ưu tiên lọc theo ngày phiên Ops (nhanh). awbs dùng để khớp cập nhật Ops.
                if not session_date and not awbs:
                    self._json(
                        400,
                        {
                            "ok": False,
                            "error": "VALIDATION",
                            "message": "Cần session_date (YYYY-MM-DD) hoặc awbs[]",
                        },
                    )
                    return
                result = scan_esid_reception(
                    state.sessions,
                    state.settings,
                    awbs,
                    session_date=session_date or None,
                )
                code = 200 if result.get("ok") else 400
                if result.get("error") == "NEEDS_LOGIN":
                    code = 400
                elif result.get("error") == "NO_BROWSER":
                    code = 400
                self._json(code, result)
            except Exception as e:
                self._json(500, {"ok": False, "error": "INTERNAL", "message": str(e)})
            finally:
                with state.lock:
                    state.running = False

        def _handle_job(self, payload: dict[str, Any]) -> None:
            with state.lock:
                if state.running:
                    self._json(409, {"ok": False, "error": "BUSY", "message": "Agent đang chạy job khác"})
                    return
                state.running = True
            try:
                warehouse = str(payload.get("warehouse") or "TECS-TCS")
                if warehouse.upper() not in {"TECS-TCS", "KHO-TCS"}:
                    self._json(400, {"ok": False, "error": "WAREHOUSE_SCOPE", "message": "Chỉ TECS-TCS"})
                    return
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
                    if not st.open:
                        self._json(
                            400,
                            {
                                "ok": False,
                                "error": "NO_BROWSER",
                                "message": "Chưa mở Chrome — POST /session/open (sẽ tự điền user/pass nếu có .env)",
                            },
                        )
                        return
                    if not st.logged_in:
                        self._json(
                            400,
                            {
                                "ok": False,
                                "error": "NEEDS_LOGIN",
                                "message": "Chrome đang ở trang login — nhập CAPTCHA rồi Đăng nhập, sau đó thử lại",
                            },
                        )
                        return
                    try:
                        portal = state.sessions.portal()
                    except Exception as e:
                        self._json(500, {"ok": False, "error": "PORTAL", "message": str(e)})
                        return

                results, report = state.batch.run(job, portal=portal)
                enriched = []
                for r in results:
                    d = r.to_dict()
                    if r.downloaded_file:
                        name = Path(r.downloaded_file).name
                        d["download_url"] = f"/docs?file={name}"
                        d["pdf_name"] = name
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
                    "results": enriched,
                }
                state.last_job = summary
                self._json(200, {"ok": True, **summary})
            except ValueError as e:
                self._json(400, {"ok": False, "error": "VALIDATION", "message": str(e)})
            except Exception as e:
                self._json(500, {"ok": False, "error": "INTERNAL", "message": str(e)})
            finally:
                with state.lock:
                    state.running = False

    return Handler


def serve_agent(settings: Settings | None = None) -> None:
    settings = settings or load_settings()
    ensure_runtime_dirs(settings)
    state = AgentState(settings)
    host = settings.agent_host
    port = settings.agent_port
    # Sync Playwright bắt buộc cùng 1 thread với browser — không dùng ThreadingHTTPServer.
    httpd = HTTPServer((host, port), make_handler(state))
    mode = "MOCK" if settings.mock else "REAL"
    print(f"TCS AWB Agent [{mode}] http://{host}:{port} scope={settings.warehouse_scope}")
    print("GET  /health  /session/status  /docs?file=")
    print("POST /session/open  /session/close  /jobs  /esid/scan  /control/pause|resume|stop")
    if not settings.mock:
        print(
            "REAL mode: POST /session/open → login → POST /esid/scan (lô Hoàn thành tiếp nhận) → /jobs DOWNLOAD"
        )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nAgent stopped.")
        state.sessions.close()
    finally:
        httpd.server_close()


if __name__ == "__main__":
    serve_agent()
