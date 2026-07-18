from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import httpx

from app.config import Settings, ensure_runtime_dirs
from app.services.agent_api import AgentState, make_handler
from app.services.tcs_client import TcsClient
from http.server import ThreadingHTTPServer


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


def test_esid_prepare_cache_then_job_hot_path(tmp_path: Path, monkeypatch):
    """POST /esid/prepare gắn cache; /jobs cùng AWB nhận prepared_awb (hot-path)."""
    settings = _settings(tmp_path, agent_port=18767)
    state = AgentState(settings)

    def fake_prepare(self, awb_digits, *, session_date=None):
        return {
            "ok": True,
            "awb": awb_digits,
            "has_in_button": True,
            "message": "PREPARE_FAKE",
            "hot_path": True,
        }

    monkeypatch.setattr(TcsClient, "prepare_esid", fake_prepare)

    seen: dict = {}

    original_run = state.batch.run

    def capture_run(job, on_progress=None, *, portal=None, prepared_awb=None):
        seen["prepared_awb"] = prepared_awb
        return original_run(job, on_progress, portal=portal, prepared_awb=None)

    monkeypatch.setattr(state.batch, "run", capture_run)

    httpd = ThreadingHTTPServer((settings.agent_host, settings.agent_port), make_handler(state))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.2)
    base = f"http://{settings.agent_host}:{settings.agent_port}"
    try:
        # Mock session open/logged_in for prepare path — bypass by setting snapshot + monkeypatch status
        from app.browser.session_manager import SessionStatus

        def fake_status():
            return SessionStatus(
                open=True,
                logged_in=True,
                url="https://www.tcs.com.vn/Esid/Export",
                awb_locators_confirmed=True,
                message="ok",
            )

        monkeypatch.setattr(state.sessions, "status", fake_status)
        monkeypatch.setattr(state.sessions, "portal", lambda: object())

        prep = httpx.post(
            f"{base}/esid/prepare",
            json={"awb": "12312345670", "session_date": "2026-07-17"},
            timeout=10,
        )
        assert prep.status_code == 200, prep.text
        assert prep.json()["prepared"] is True
        assert state.prepared_hot_awb() == "12312345670"

        job = httpx.post(
            f"{base}/jobs",
            json={
                "warehouse": "TECS-TCS",
                "mock": True,
                "dry_run": True,
                "rows": [{"awb": "12312345670", "action": "DOWNLOAD", "shipment_id": "h1"}],
            },
            timeout=30,
        )
        assert job.status_code == 200
        assert seen.get("prepared_awb") == "12312345670"
        assert job.json().get("hot_path") is True
        # Cache cleared after job
        assert state.prepared_hot_awb() is None
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