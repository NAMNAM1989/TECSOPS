from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.browser.session import BrowserSession
from app.browser.session_manager import SessionManager
from app.config import Settings


class FakePage:
    def __init__(self, *, closed: bool = False) -> None:
        self.closed = closed
        self.url = "https://www.tcs.com.vn/Esid/Export"
        self.goto_calls: list[dict] = []
        self.wait_calls: list[dict] = []

    def is_closed(self) -> bool:
        return self.closed

    def goto(self, url: str, **kwargs) -> None:
        self.goto_calls.append({"url": url, **kwargs})

    def wait_for_load_state(self, state: str, **kwargs) -> None:
        self.wait_calls.append({"state": state, **kwargs})
        raise TimeoutError("TCS keeps loading")


def test_close_stops_playwright_even_when_context_is_already_closed(tmp_path):
    session = BrowserSession(Settings(browser_profile=tmp_path / "profile"))

    class DeadContext:
        def close(self):
            raise RuntimeError("Target page, context or browser has been closed")

    class Driver:
        stopped = False

        def stop(self):
            self.stopped = True

    driver = Driver()
    session._context = DeadContext()
    session._playwright = driver
    session.page = FakePage(closed=True)

    session.close()

    assert driver.stopped is True
    assert session._context is None
    assert session._playwright is None
    assert session.page is None


def test_goto_fast_does_not_wait_60_seconds_for_domcontentloaded():
    page = FakePage()

    BrowserSession._goto_fast(page, "https://www.tcs.com.vn/Esid/Export")

    assert page.goto_calls == [
        {
            "url": "https://www.tcs.com.vn/Esid/Export",
            "wait_until": "commit",
            "timeout": 15000,
        }
    ]
    assert page.wait_calls == [{"state": "domcontentloaded", "timeout": 3000}]


def test_status_marks_closed_page_offline_and_clears_zombie(tmp_path):
    manager = SessionManager.__new__(SessionManager)
    manager.settings = Settings(
        browser_profile=tmp_path / "profile",
        discovery_dir=tmp_path / "discovery",
    )
    manager.locators = SimpleNamespace(awb_lookup_confirmed=True)
    manager.reload_locators = lambda: None

    closed = False

    class ZombieSession:
        page = FakePage(closed=True)

        def is_alive(self):
            return False

        def close(self):
            nonlocal closed
            closed = True

    manager.session = ZombieSession()

    status = manager.status()

    assert status.open is False
    assert status.logged_in is False
    assert "Chrome đã đóng" in status.message
    assert closed is True
    assert manager.session is None


def test_portal_rejects_closed_page(tmp_path):
    manager = SessionManager.__new__(SessionManager)
    manager.settings = Settings(
        browser_profile=tmp_path / "profile",
        discovery_dir=tmp_path / "discovery",
    )
    manager.locators = SimpleNamespace()
    manager.reload_locators = lambda: None
    manager.session = SimpleNamespace(
        page=FakePage(closed=True),
        is_alive=lambda: False,
        close=lambda: None,
    )

    with pytest.raises(RuntimeError, match="NO_BROWSER"):
        manager.portal()

    assert manager.session is None
