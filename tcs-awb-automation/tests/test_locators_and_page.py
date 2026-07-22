from pathlib import Path

from app.browser.locators import (
    DEFAULT_LOCATORS,
    LocatorsConfig,
    suggest_awb_locators_from_elements,
)
from app.browser.pages.awb_page import AwbPortalPage, NeedsLoginError
from app.browser.pages.esid_declare_page import EsidDeclarePage
from app.services.tcs_client import TcsClient


class FakeLocator:
    def __init__(self, visible=True, text=""):
        self._visible = visible
        self._text = text
        self.first = self

    def count(self):
        return 1

    def is_visible(self):
        return self._visible

    def wait_for(self, **kwargs):
        return None

    def fill(self, v):
        self._text = v

    def click(self):
        return None

    def inner_text(self, timeout=0):
        return self._text


class FakePage:
    def __init__(self, url="https://www.tcs.com.vn/AwbLogin"):
        self.url = url

    def locator(self, sel):
        if "basic_username" in sel:
            return FakeLocator(visible=True)
        return FakeLocator(visible=False)

    def get_by_role(self, *a, **k):
        return FakeLocator()

    def get_by_placeholder(self, *a, **k):
        return FakeLocator()

    def get_by_text(self, *a, **k):
        return FakeLocator()

    def get_by_label(self, *a, **k):
        return FakeLocator()

    def evaluate(self, *_a, **_k):
        return "Trạng thái: Hoàn thành"


def test_esid_declare_field_id_from_cfg():
    cfg = LocatorsConfig(
        path=Path("/tmp/locators-test.json"),
        data={"esid_declare": DEFAULT_LOCATORS["esid_declare"]},
    )
    page = EsidDeclarePage(FakePage(), cfg)
    assert page._field_id("other_request", "X") == "shcOthReq"
    assert page._field_id("shipper_tel", "telShp") == "telShp"
    assert page._field_id("missing_key", "fallback") == "fallback"
    cfg.data["esid_declare"]["other_request"] = {"by": "id", "value": "otherRequest"}
    assert page._field_id("other_request", "shcOthReq") == "otherRequest"


def test_suggest_awb_locators():
    suggested = suggest_awb_locators_from_elements(
        [
            {"tag": "INPUT", "id": "mawb", "placeholder": "Nhập AWB", "text": ""},
            {"tag": "BUTTON", "text": "Tra cứu", "id": None},
            {"tag": "BUTTON", "text": "Tải PDF", "id": None},
        ]
    )
    assert suggested["confirmed"] is True
    assert suggested["awb_input"]["value"] == "mawb"
    assert suggested["submit"] is not None


def test_is_login_page(tmp_path: Path):
    loc = tmp_path / "locators.json"
    loc.write_text(
        Path(__file__).resolve().parents[1].joinpath("discovery_artifacts/locators.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    cfg = LocatorsConfig.load(loc)
    page = AwbPortalPage(FakePage("https://www.tcs.com.vn/AwbLogin"), cfg)
    assert page.is_login_page() is True
    try:
        page.ensure_logged_in()
        assert False, "should raise"
    except NeedsLoginError:
        pass


def test_real_client_needs_locators_or_browser(tmp_path: Path):
    loc = tmp_path / "locators.json"
    loc.write_text(
        '{"version":1,"login":{"confirmed":true},"awb_lookup":{"confirmed":false}}',
        encoding="utf-8",
    )
    client = TcsClient(mock=False, locators_file=loc)
    out = client.lookup("12312345670")
    assert out.error_code == "LOCATORS_PENDING"

    loc.write_text(
        '{"version":1,"login":{"confirmed":true},"awb_lookup":{"confirmed":true,"awb_input":{"by":"id","value":"x"},"submit":{"by":"role","role":"button","name":"Tra cứu"}}}',
        encoding="utf-8",
    )
    client2 = TcsClient(mock=False, locators_file=loc)
    out2 = client2.lookup("12312345670")
    assert out2.error_code == "NO_BROWSER"
