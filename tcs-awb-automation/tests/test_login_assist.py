from pathlib import Path

from app.browser.locators import LocatorsConfig
from app.browser.login_assist import (
    fill_login_form,
    prepare_assisted_login,
    read_captcha_len,
    wait_until_logged_in,
)
from app.config import load_dotenv_file, load_settings


class FakeLocator:
    def __init__(self, visible=True, value=""):
        self._visible = visible
        self._value = value
        self.first = self
        self.fills: list[str] = []
        self.clicks = 0

    def count(self):
        return 1

    def is_visible(self):
        return self._visible

    def wait_for(self, **kwargs):
        return None

    def fill(self, v):
        self._value = v
        self.fills.append(v)

    def click(self, **kwargs):
        self.clicks += 1

    def input_value(self, timeout=0):
        return self._value

    def inner_text(self, timeout=0):
        return self._value


class FakeLoginPage:
    def __init__(self):
        self.url = "https://www.tcs.com.vn/AwbLogin"
        self.fields = {
            "basic_username": FakeLocator(),
            "basic_password": FakeLocator(),
            "basic_captchaCode": FakeLocator(),
        }
        self.submit = FakeLocator()
        self._logged_in_after = 0
        self._polls = 0

    def locator(self, sel: str):
        key = sel.lstrip("#")
        return self.fields.get(key, FakeLocator(visible=False))

    def get_by_role(self, role, name=None):
        return self.submit


def _portal(tmp_path: Path):
    src = Path(__file__).resolve().parents[1] / "discovery_artifacts" / "locators.json"
    loc = tmp_path / "locators.json"
    loc.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    from app.browser.pages.awb_page import AwbPortalPage

    page = FakeLoginPage()
    return AwbPortalPage(page, LocatorsConfig.load(loc)), page


def test_fill_login_form(tmp_path: Path):
    portal, page = _portal(tmp_path)
    fill_login_form(portal, "demo_user", "secret")
    assert page.fields["basic_username"]._value == "demo_user"
    assert page.fields["basic_password"]._value == "secret"
    assert page.fields["basic_captchaCode"].clicks >= 1


def test_prepare_message(tmp_path: Path):
    portal, _ = _portal(tmp_path)
    msg = prepare_assisted_login(portal, "u", "p")
    assert "CAPTCHA" in msg


def test_wait_auto_submit(tmp_path: Path):
    portal, page = _portal(tmp_path)
    page.fields["basic_captchaCode"]._value = "ABCD"

    original_is_login = portal.is_login_page

    def flip():
        page._polls += 1
        if page.submit.clicks > 0:
            page.url = "https://www.tcs.com.vn/Awb/Agent"
            return False
        return original_is_login()

    portal.is_login_page = flip  # type: ignore[method-assign]
    assert wait_until_logged_in(portal, timeout_s=5, poll_s=0.01, min_captcha_len=4) is True
    assert page.submit.clicks >= 1


def test_read_captcha_len(tmp_path: Path):
    portal, page = _portal(tmp_path)
    page.fields["basic_captchaCode"]._value = "xy"
    assert read_captcha_len(portal) == 2


def test_dotenv_credentials(tmp_path: Path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("TCS_USERNAME=ops1\nTCS_PASSWORD=pw123\n", encoding="utf-8")
    monkeypatch.delenv("TCS_USERNAME", raising=False)
    monkeypatch.delenv("TCS_PASSWORD", raising=False)
    load_dotenv_file(env)
    assert load_settings().has_login_credentials is True
    assert load_settings().tcs_username == "ops1"
