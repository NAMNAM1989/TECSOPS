from __future__ import annotations

from types import SimpleNamespace

from app.config import Settings
from app.services import esid_scan_service as scan_module
from app.services.esid_scan_service import scan_esid_reception


class FakeSessions:
    def status(self):
        return SimpleNamespace(open=True, logged_in=True)


def test_scan_esid_reception_requires_session_date(monkeypatch, tmp_path):
    settings = Settings(discovery_dir=tmp_path / "discovery")
    sessions = FakeSessions()

    called = {"by_date": False}

    def fake_by_date(_sessions, _settings, session_date, ops_awbs):
        called["by_date"] = True
        assert session_date == "2026-07-25"
        return {"ok": True, "ready": [], "items": [], "list_total": 0}

    monkeypatch.setattr(scan_module, "scan_esid_by_date", fake_by_date)

    ok = scan_esid_reception(sessions, settings, ["12312345670"], session_date="2026-07-25")
    assert ok["ok"] is True
    assert called["by_date"] is True

    missing = scan_esid_reception(sessions, settings, ["12312345670"], session_date="")
    assert missing["ok"] is False
    assert missing["error"] == "DATE_REQUIRED"
