from pathlib import Path

from app.config import Settings, ensure_runtime_dirs
from app.services.esid_declare_service import fill_esid_declare


def _settings(tmp: Path) -> Settings:
    s = Settings(
        mock=True,
        dry_run=True,
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


class _FakeStatus:
    def __init__(self, *, open: bool = True, logged_in: bool = True):
        self.open = open
        self.logged_in = logged_in


class _FakeSessions:
    def __init__(self, *, open: bool = True, logged_in: bool = True, page=None):
        self._open = open
        self._logged_in = logged_in
        self.page = page

    def status(self):
        return _FakeStatus(open=self._open, logged_in=self._logged_in)


def test_fill_esid_declare_needs_browser(tmp_path: Path):
    settings = _settings(tmp_path)
    sessions = _FakeSessions(open=False, page=None)
    res = fill_esid_declare(
        sessions,
        settings,
        {"shipment": {"awb": "73807183061"}},
    )
    assert res["ok"] is False
    assert res["error"] == "NO_BROWSER"


def test_fill_esid_declare_bad_awb(tmp_path: Path):
    settings = _settings(tmp_path)
    sessions = _FakeSessions(open=True, logged_in=True, page=object())
    res = fill_esid_declare(sessions, settings, {"shipment": {"awb": "123"}})
    assert res["ok"] is False
    assert res["error"] == "VALIDATION"


def test_fill_esid_declare_needs_login(tmp_path: Path):
    settings = _settings(tmp_path)
    sessions = _FakeSessions(open=True, logged_in=False, page=object())
    res = fill_esid_declare(sessions, settings, {"shipment": {"awb": "73807183061"}})
    assert res["ok"] is False
    assert res["error"] == "NEEDS_LOGIN"
