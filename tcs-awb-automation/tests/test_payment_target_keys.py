from app.browser.pages.esid_declare_page import _payment_target_keys


def test_payment_target_keys_cash():
    assert _payment_target_keys("Tiền mặt/Cash") == ("TIEN MAT", "CASH")
    assert _payment_target_keys("Cash") == ("TIEN MAT", "CASH")
    assert "CASH" in _payment_target_keys("tiền mặt")


def test_payment_target_keys_bank():
    assert _payment_target_keys("Chuyển khoản/Bank transfer") == (
        "CHUYEN KHOAN",
        "BANK TRANSFER",
    )
    assert _payment_target_keys("") == ("CHUYEN KHOAN", "BANK TRANSFER")
