from __future__ import annotations

from app.browser.pages.esid_page import EsidListPage


def test_normalize_flight_date_to_ymd():
    assert EsidListPage._normalize_flight_date_to_ymd("25-07-2026") == "2026-07-25"
    assert EsidListPage._normalize_flight_date_to_ymd("25/07/2026") == "2026-07-25"
    assert EsidListPage._normalize_flight_date_to_ymd("2026-07-25") == "2026-07-25"
    assert EsidListPage._normalize_flight_date_to_ymd("") is None


def test_row_matches_session_date():
    row_ok = {"flight_date": "25-07-2026", "awb": "123-12345670"}
    row_other = {"flight_date": "24-07-2026", "awb": "123-12345671"}
    row_blank = {"flight_date": "", "awb": "123-12345672"}
    assert EsidListPage._row_matches_session_date(row_ok, "2026-07-25") is True
    assert EsidListPage._row_matches_session_date(row_other, "2026-07-25") is False
    assert EsidListPage._row_matches_session_date(row_blank, "2026-07-25") is True
