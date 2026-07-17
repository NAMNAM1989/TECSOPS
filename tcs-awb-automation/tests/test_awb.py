from app.utils.awb import format_awb_display, normalize_awb, safe_filename_awb


def test_normalize_with_dash():
    r = normalize_awb("123-12345678")
    assert r.ok
    assert r.digits == "12312345678"
    assert r.display == "123-1234 5678"


def test_normalize_plain_digits():
    r = normalize_awb("12312345678")
    assert r.ok
    assert r.digits == "12312345678"


def test_normalize_keeps_leading_zeros_as_text():
    r = normalize_awb("012-34567890")
    assert r.ok
    assert r.digits == "01234567890"
    assert r.display.startswith("012-")


def test_normalize_rejects_short():
    r = normalize_awb("12345")
    assert not r.ok
    assert "11" in (r.error or "")


def test_safe_filename():
    assert "123-12345678" in safe_filename_awb("123-1234 5678") or safe_filename_awb("12312345678") == "123-12345678"


def test_format_display():
    assert format_awb_display("78420042005") == "784-2004 2005"