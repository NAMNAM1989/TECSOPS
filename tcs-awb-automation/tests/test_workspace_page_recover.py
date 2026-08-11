"""Tab declare phụ không được kẹt login khi list còn session."""

from app.browser.session_manager import SessionManager


class _Page:
    def __init__(self, url: str, *, closed: bool = False):
        self.url = url
        self._closed = closed
        self.closed_calls = 0

    def is_closed(self):
        return self._closed

    def close(self):
        self.closed_calls += 1
        self._closed = True


class _Session:
    def __init__(self, list_url: str):
        self.page = _Page(list_url)
        self.created = []

    def new_page(self, url=None):
        p = _Page(url or "about:blank")
        self.created.append(p)
        return p


def test_reset_workspace_page_closes_declare(monkeypatch, tmp_path):
    from app.config import Settings, ensure_runtime_dirs

    s = Settings(
        mock=True,
        dry_run=True,
        output_dir=tmp_path / "output",
        browser_profile=tmp_path / "profile",
        screenshots_dir=tmp_path / "shots",
        logs_dir=tmp_path / "logs",
        db_path=tmp_path / "data" / "t.db",
        templates_dir=tmp_path / "templates",
        discovery_dir=tmp_path / "discovery",
    )
    ensure_runtime_dirs(s)
    sm = SessionManager(s)
    sess = _Session("https://www.tcs.com.vn/Esid/Export")
    stale = _Page("https://www.tcs.com.vn/Account/AwbLogin")
    sm.session = sess
    sm._workspace_pages = {"list": sess.page, "declare": stale}

    monkeypatch.setattr(sm, "_has_live_session", lambda: True)
    monkeypatch.setattr(
        "app.browser.pages.awb_page.AwbPortalPage.is_login_page",
        lambda self: "awblogin" in (self.page.url or "").lower(),
    )

    page = sm.workspace_page(
        "declare",
        url="https://www.tcs.com.vn/Esid/Export",
        recover_login=True,
    )
    assert stale.closed_calls == 1
    assert page is sess.created[0]
    assert page.url == "https://www.tcs.com.vn/Esid/Export"
