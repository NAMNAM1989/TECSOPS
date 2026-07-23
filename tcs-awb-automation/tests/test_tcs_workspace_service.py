from __future__ import annotations

from types import SimpleNamespace

from app.config import Settings
from app.services import tcs_workspace_service as workspace_module
from app.services.tcs_workspace_service import TcsWorkspaceService


class FakeSessions:
    def __init__(self) -> None:
        self.open_calls: list[dict] = []

    def open(self, **kwargs):
        self.open_calls.append(kwargs)
        return SimpleNamespace(
            open=True,
            logged_in=True,
            message="ok",
            to_dict=lambda: {
                "open": True,
                "logged_in": True,
                "message": "ok",
                "headless": True,
            },
        )


def test_refresh_scan_builds_awb_page_index(monkeypatch, tmp_path):
    sessions = FakeSessions()
    settings = Settings(discovery_dir=tmp_path / "discovery")
    workspace = TcsWorkspaceService(sessions, settings)  # type: ignore[arg-type]

    def fake_scan(_sessions, _settings, awbs, *, session_date=None):
        assert awbs == ["12312345670"]
        assert session_date == "2026-07-23"
        return {
            "ok": True,
            "ready": [{"awb": "12312345670", "ready": True}],
            "items": [{"awb": "12312345670", "ready": True}],
            "list_total": 12,
            "index_rows": [
                {
                    "awb": "123-12345670",
                    "page_number": 3,
                    "status": "Hoàn thành tiếp nhận",
                    "esid": "ESID-1",
                }
            ],
        }

    monkeypatch.setattr(workspace_module, "scan_esid_reception", fake_scan)
    result = workspace.refresh_scan("2026-07-23", ["123-12345670", "bad"])

    assert result["ok"] is True
    assert "index_rows" not in result
    assert workspace.phase == "READY"
    assert workspace.cached_row("12312345670") == {
        "awb": "12312345670",
        "page_number": 3,
        "status": "Hoàn thành tiếp nhận",
        "esid_code": "ESID-1",
        "flight_date": "",
    }
    assert workspace.snapshot()["cache_count"] == 1


def test_bootstrap_opens_once_scans_and_warms_declare(monkeypatch, tmp_path):
    sessions = FakeSessions()
    settings = Settings(discovery_dir=tmp_path / "discovery")
    workspace = TcsWorkspaceService(sessions, settings)  # type: ignore[arg-type]

    monkeypatch.setattr(
        workspace,
        "refresh_scan",
        lambda date, awbs: {
            "ok": True,
            "ready": [],
            "items": [],
            "total": 0,
            "workspace": {"phase": "READY"},
        },
    )
    monkeypatch.setattr(workspace, "warm_declare_page", lambda: {"ok": True})

    result = workspace.bootstrap(
        session_date="2026-07-23",
        raw_awbs=["12312345670"],
        visible=False,
    )

    assert result["ok"] is True
    assert result["logged_in"] is True
    assert sessions.open_calls == [
        {"headless": False, "visible": False, "show_portal": True}
    ]


def test_bootstrap_keeps_logged_in_workspace_when_scan_fails(monkeypatch, tmp_path):
    sessions = FakeSessions()
    settings = Settings(discovery_dir=tmp_path / "discovery")
    workspace = TcsWorkspaceService(sessions, settings)  # type: ignore[arg-type]

    def failed_scan(date, awbs):
        workspace.phase = "ERROR"
        workspace.error = "Khong tai duoc danh sach"
        return {
            "ok": False,
            "error": "TCS_LIST_TIMEOUT",
            "message": "Khong tai duoc danh sach",
        }

    monkeypatch.setattr(workspace, "refresh_scan", failed_scan)
    monkeypatch.setattr(workspace, "warm_declare_page", lambda: {"ok": True})

    result = workspace.bootstrap(
        session_date="2026-07-23",
        raw_awbs=["12312345670"],
        visible=False,
    )

    assert result["ok"] is True
    assert result["logged_in"] is True
    assert result["scan_ok"] is False
    assert result["scan_error"] == "Khong tai duoc danh sach"
    assert workspace.snapshot()["phase"] == "ERROR"
