from app.browser.captcha_ocr import normalize_captcha_text, ocr_image_bytes
from app.browser.login_assist import ensure_logged_in_smart


def test_normalize_captcha_text():
    assert normalize_captcha_text(" ab 12 ") == "AB12"
    assert normalize_captcha_text("A-B_3!") == "AB3"
    assert normalize_captcha_text("Lzk3h") == "LZK3H"


def test_ensure_prefers_session(monkeypatch):
    class P:
        def is_login_page(self):
            return False

    ok, msg = ensure_logged_in_smart(P(), username="u", password="p", use_ocr=True)
    assert ok is True
    assert "Session" in msg


def test_ocr_image_bytes_monkeypatch(monkeypatch):
    class FakeOcr:
        def classification(self, data):
            return "xY9k"

    monkeypatch.setattr("app.browser.captcha_ocr._get_ocr", lambda: FakeOcr())
    assert ocr_image_bytes(b"fake") == "XY9K"
