from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import httpx
import pytest

from app.config import Settings, ensure_runtime_dirs
from app.services.agent_api import AgentHttpServer, AgentState, make_handler
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def _settings(tmp: Path, *, agent_port: int = 18765) -> Settings:
    s = Settings(
        mock=True,
        dry_run=True,
        agent_host="127.0.0.1",
        agent_port=agent_port,
        output_dir=tmp / "output",
        browser_profile=tmp / "profile",
        screenshots_dir=tmp / "shots",
        logs_dir=tmp / "logs",
        db_path=tmp / "data" / "t.db",
        templates_dir=tmp / "templates",
        discovery_dir=tmp / "discovery",
        min_delay_ms=1,
        max_delay_ms=2,
    )
    ensure_runtime_dirs(s)
    return s


def test_agent_server_rejects_second_listener_on_same_port():
    first = AgentHttpServer(("127.0.0.1", 0), BaseHTTPRequestHandler)
    host, port = first.server_address
    try:
        with pytest.raises(OSError):
            AgentHttpServer((host, port), BaseHTTPRequestHandler)
    finally:
        first.server_close()


def test_agent_health_and_job(tmp_path: Path):
    settings = _settings(tmp_path)
    state = AgentState(settings)
    httpd = ThreadingHTTPServer((settings.agent_host, settings.agent_port), make_handler(state))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.2)
    base = f"http://{settings.agent_host}:{settings.agent_port}"
    try:
        h = httpx.get(f"{base}/health", timeout=5)
        assert h.status_code == 200
        assert h.json()["ok"] is True
        assert h.json()["warehouse_scope"] == "TECS-TCS"

        bad = httpx.post(
            f"{base}/jobs",
            json={"warehouse": "TECS-SCSC", "rows": [{"awb": "12312345670", "action": "LOOKUP"}]},
            timeout=10,
        )
        assert bad.status_code == 400

        ok = httpx.post(
            f"{base}/jobs",
            json={
                "warehouse": "TECS-TCS",
                "mock": True,
                "dry_run": True,
                "rows": [
                    {"awb": "12312345670", "action": "DOWNLOAD", "shipment_id": "s1"},
                    {"awb": "12312345671", "action": "LOOKUP", "shipment_id": "s2"},
                ],
            },
            timeout=30,
        )
        assert ok.status_code == 200
        body = ok.json()
        assert body["ok"] is True
        assert body["total"] == 2
        assert Path(body["report_path"]).exists()
        statuses = {r["shipment_id"]: r["normalized_status"] for r in body["results"]}
        assert statuses["s1"] == "DOWNLOADED"
        assert statuses["s2"] == "NOT_COMPLETED"
    finally:
        httpd.shutdown()


def test_health_stays_responsive_during_long_job(tmp_path: Path):
    """ThreadingHTTPServer + worker: /health không bị treo khi worker đang bận."""
    settings = _settings(tmp_path, agent_port=18766)
    state = AgentState(settings)
    httpd = ThreadingHTTPServer((settings.agent_host, settings.agent_port), make_handler(state))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.2)
    base = f"http://{settings.agent_host}:{settings.agent_port}"

    def block_worker():
        state.running = True
        try:
            state.call_on_worker(time.sleep, 1.2)
        finally:
            state.running = False

    try:
        blocker = threading.Thread(target=block_worker, daemon=True)
        blocker.start()
        time.sleep(0.15)
        t0 = time.perf_counter()
        h = httpx.get(f"{base}/health", timeout=2)
        elapsed = time.perf_counter() - t0
        assert h.status_code == 200
        body = h.json()
        assert body["ok"] is True
        assert body["running"] is True
        assert elapsed < 1.0, f"health bị block {elapsed:.2f}s"
        blocker.join(timeout=5)
    finally:
        httpd.shutdown()


def test_workspace_bootstrap_route(tmp_path: Path, monkeypatch):
    settings = _settings(tmp_path, agent_port=18768)
    state = AgentState(settings)
    seen: dict = {}

    def fake_bootstrap(*, session_date, raw_awbs, visible):
        seen.update(
            session_date=session_date,
            raw_awbs=raw_awbs,
            visible=visible,
        )
        return {
            "ok": True,
            "open": True,
            "logged_in": True,
            "ready": [],
            "items": [],
            "total": 0,
            "workspace": {
                "phase": "READY",
                "session_date": session_date,
                "cache_count": 0,
            },
        }

    monkeypatch.setattr(state.workspace, "bootstrap", fake_bootstrap)
    httpd = ThreadingHTTPServer((settings.agent_host, settings.agent_port), make_handler(state))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.2)
    base = f"http://{settings.agent_host}:{settings.agent_port}"
    try:
        res = httpx.post(
            f"{base}/workspace/bootstrap",
            json={
                "session_date": "2026-07-23",
                "awbs": ["12312345670"],
                "visible": False,
            },
            timeout=10,
        )
        assert res.status_code == 200, res.text
        assert res.json()["workspace"]["phase"] == "READY"
        assert seen == {
            "session_date": "2026-07-23",
            "raw_awbs": ["12312345670"],
            "visible": False,
        }
    finally:
        httpd.shutdown()


def test_captcha_solve_route(tmp_path: Path, monkeypatch):
    from app.browser.captcha_ocr import CaptchaOcrResult

    settings = _settings(tmp_path, agent_port=18769)
    state = AgentState(settings)
    monkeypatch.setattr(
        "app.services.agent_api.ocr_image_bytes_detailed",
        lambda image, **kwargs: CaptchaOcrResult(
            text="AB123",
            confidence=1.0,
            candidates=(("AB123", 6),),
            samples=6,
            accepted=True,
        ),
    )
    httpd = ThreadingHTTPServer((settings.agent_host, settings.agent_port), make_handler(state))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.2)
    base = f"http://{settings.agent_host}:{settings.agent_port}"
    try:
        import base64

        encoded = base64.b64encode(b"captcha-bytes").decode("ascii")
        res = httpx.post(
            f"{base}/captcha/solve",
            json={"image": f"data:image/png;base64,{encoded}"},
            timeout=10,
        )
        assert res.status_code == 200
        assert res.json() == {
            "ok": True,
            "text": "AB123",
            "confidence": 1.0,
            "candidates": [{"text": "AB123", "votes": 6}],
            "samples": 6,
            "error": "",
        }

        bad = httpx.post(
            f"{base}/captcha/solve",
            json={"image": "not-base64"},
            timeout=10,
        )
        assert bad.status_code == 400
        assert bad.json()["error"] == "INVALID_IMAGE"
    finally:
        httpd.shutdown()
