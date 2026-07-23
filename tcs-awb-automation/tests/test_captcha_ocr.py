from io import BytesIO

from PIL import Image

from app.browser.captcha_ocr import (
    _captcha_variants,
    normalize_captcha_text,
    ocr_image_bytes,
    ocr_image_bytes_detailed,
)
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
            return "xY9k2"

    monkeypatch.setattr("app.browser.captcha_ocr._get_ocr", lambda: FakeOcr())
    assert ocr_image_bytes(b"fake") == "XY9K2"


def test_transparent_captcha_is_composited_on_white():
    image = Image.new("RGBA", (100, 27), (0, 0, 0, 0))
    image.putpixel((40, 10), (0, 0, 0, 255))
    source = BytesIO()
    image.save(source, format="PNG")

    prepared = Image.open(BytesIO(_captcha_variants(source.getvalue())[0])).convert("RGB")
    assert prepared.getpixel((0, 0)) == (255, 255, 255)
    assert prepared.getpixel((40, 10)) == (0, 0, 0)


def test_ocr_uses_consensus_and_expected_length(monkeypatch):
    readings = iter(["AB123", "AB123", "ABI23", "AB123", "ABI23", "AB123"])

    class FakeOcr:
        def classification(self, data):
            return next(readings)

    monkeypatch.setattr("app.browser.captcha_ocr._get_ocr", lambda: FakeOcr())
    monkeypatch.setattr(
        "app.browser.captcha_ocr._captcha_variants",
        lambda data: [b"variant"] * 6,
    )
    result = ocr_image_bytes_detailed(b"image")
    assert result.accepted is True
    assert result.text == "AB123"
    assert result.confidence == 0.6667


def test_ocr_rejects_wrong_length_even_when_votes_agree(monkeypatch):
    class FakeOcr:
        def classification(self, data):
            return "AB12"

    monkeypatch.setattr("app.browser.captcha_ocr._get_ocr", lambda: FakeOcr())
    monkeypatch.setattr(
        "app.browser.captcha_ocr._captcha_variants",
        lambda data: [b"variant"] * 6,
    )
    result = ocr_image_bytes_detailed(b"image")
    assert result.accepted is False
    assert result.text == ""
    assert result.error == "OCR_LOW_CONFIDENCE"
