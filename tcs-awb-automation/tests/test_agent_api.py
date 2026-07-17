from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import httpx

from app.config import Settings, ensure_runtime_dirs
from app.services.agent_api import AgentState, make_handler
from http.server import ThreadingHTTPServer


def _settings(tmp: Path) -> Settings:
    s = Settings(
        mock=True,
        dry_run=True,
        agent_host="127.0.0.1",
        agent_port=18765,
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