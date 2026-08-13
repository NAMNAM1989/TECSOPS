from __future__ import annotations

from types import SimpleNamespace

from app.browser.session_manager import SessionManager
from app.config import Settings


class _Loc:
    def __init__(self, *, visible: bool = False, n: int = 0) -> None:
        self._visible = visible
        self._n = n
        self.first = self

    def count(self) -> int:
        return self._n

    def is_visible(self) -> bool:
        return self._visible


class _FakePortalPage:
    def __init__(self, url: str, *, logged_in_ui: bool = False, login_form: bool = False) -> None:
        self.url = url
        self._logged_in_ui = logged_in_ui
        self._login_form = login_form
        self.goto_urls: list[str] = []
        self.wait_timeouts: list[int] = []

    def wait_for_load_state(self, *_a, **_k) -> None:
        return None

    def wait_for_timeout(self, ms: int) -> None:
        self.wait_timeouts.append(ms)

    def locator(self, sel: str):
        if sel == "#awbFirst" and self._logged_in_ui:
            return _Loc(visible=True, n=1)
        if "username" in sel.lower() and self._login_form:
            return _Loc(visible=True, n=1)
        return _Loc()

    def get_by_text(self, text: str, exact: bool = False):
        if self._logged_in_ui and "ESID" in (text or "").upper():
            return _Loc(visible=True, n=1)
        return _Loc()

    def get_by_placeholder(self, _name: str):
        if self._logged_in_ui:
            return _Loc(visible=True, n=1)
        return _Loc()

    def get_by_role(self, _role: str, name: str | None = None):
        if self._logged_in_ui and name == "KIỂM TRA":
            return _Loc(visible=True, n=1)
        return _Loc()


def _manager(tmp_path, page: _FakePortalPage) -> SessionManager:
    mgr = SessionManager.__new__(SessionManager)
    mgr.settings = Settings(
        browser_profile=tmp_path / "profile",
        discovery_dir=tmp_path / "discovery",
        tcs_username="namnam8012",
        tcs_password="secret",
        captcha_ocr=True,
        captcha_ocr_attempts=2,
        prefer_session=True,
        warehouse_scope="TCS",
    )
    mgr.locators = SimpleNamespace(awb_lookup_confirmed=True)
    mgr.reload_locators = lambda: None
    mgr.session = SimpleNamespace(page=page, is_alive=lambda: True, headless_mode=True)
    mgr._workspace_pages = {"list": page}
    return mgr


def test_is_authenticated_requires_ui_not_just_agent_url(tmp_path):
    """Cookie hết: URL còn /Awb/Agent nhưng chưa có UI → không được bỏ OCR."""
    page = _FakePortalPage("https://www.tcs.com.vn/Awb/Agent", logged_in_ui=False)
    mgr = _manager(tmp_path, page)
    portal = SimpleNamespace(page=page, is_login_page=lambda: False)
    assert mgr._is_authenticated_app(portal) is False

    page_ok = _FakePortalPage(
        "https://www.tcs.com.vn/Esid/Export", logged_in_ui=True
    )
    mgr_ok = _manager(tmp_path, page_ok)
    portal_ok = SimpleNamespace(page=page_ok, is_login_page=lambda: False)
    assert mgr_ok._is_authenticated_app(portal_ok) is True


def test_ensure_login_does_not_trust_stale_marker_on_agent_url(tmp_path, monkeypatch):
    page = _FakePortalPage("https://www.tcs.com.vn/Awb/Agent", logged_in_ui=False)
    mgr = _manager(tmp_path, page)
    (tmp_path / "profile").mkdir(parents=True, exist_ok=True)
    (tmp_path / "profile" / ".tecsops_login_user").write_text(
        "namnam8012", encoding="utf-8"
    )

    called = {"ocr": 0, "goto": []}

    def fake_smart(*_a, **_k):
        called["ocr"] += 1
        return False, "OCR thất bại (captcha sai)"

    def fake_goto(p, url):
        called["goto"].append(url)
        p.url = "https://www.tcs.com.vn/AwbLogin"

    monkeypatch.setattr(
        "app.browser.session_manager.ensure_logged_in_smart", fake_smart
    )
    monkeypatch.setattr(
        "app.browser.session_manager.BrowserSession._goto_fast", fake_goto
    )
    monkeypatch.setattr(
        "app.browser.session_manager.AwbPortalPage",
        lambda p, _loc: SimpleNamespace(
            page=p,
            is_login_page=lambda: "awblogin" in (p.url or "").lower(),
        ),
    )

    filled, msg = mgr._ensure_login()
    assert filled is False
    assert "NEEDS_LOGIN" in msg
    assert called["ocr"] == 1
    assert any("tcs.com.vn" in u.lower() for u in called["goto"])


def test_ensure_login_skips_ocr_when_esid_ui_and_marker_match(tmp_path, monkeypatch):
    page = _FakePortalPage("https://www.tcs.com.vn/Esid/Export", logged_in_ui=True)
    mgr = _manager(tmp_path, page)
    (tmp_path / "profile").mkdir(parents=True, exist_ok=True)
    (tmp_path / "profile" / ".tecsops_login_user").write_text(
        "namnam8012", encoding="utf-8"
    )

    def boom(*_a, **_k):
        raise AssertionError("không được gọi OCR khi session thật còn hiệu lực")

    monkeypatch.setattr("app.browser.session_manager.ensure_logged_in_smart", boom)
    monkeypatch.setattr(
        "app.browser.session_manager.AwbPortalPage",
        lambda p, _loc: SimpleNamespace(page=p, is_login_page=lambda: False),
    )

    filled, msg = mgr._ensure_login()
    assert filled is False
    assert "Session còn hiệu lực" in msg
    assert "namnam8012" in msg
