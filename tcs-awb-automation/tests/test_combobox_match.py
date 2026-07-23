from app.browser.pages.esid_declare_page import EsidDeclarePage


def test_fold_text_strips_vietnamese():
    assert EsidDeclarePage._fold_text("Chi nhánh Số 1") == "CHI NHANH SO 1"
    assert EsidDeclarePage._fold_text("Đồng ý") == "DONG Y"


def test_combobox_search_queries_prefer_short_tail():
    name = (
        "CHI NHANH SO 1 CONG TY CO PHAN THUONG MAI VA DICH VU "
        "CHUYEN PHAT NHANH PCS"
    )
    qs = EsidDeclarePage._combobox_search_queries(name)
    assert qs[0] == "PCS"
    assert any("CHUYEN PHAT NHANH" in q or q.endswith("PCS") for q in qs)
    assert qs[-1].startswith("CHI NHANH") or "PCS" in qs[-1]


def test_flight_normalization_ignores_airline_zero_padding():
    assert EsidDeclarePage._norm_flight("VN570") == "VN570"
    assert EsidDeclarePage._norm_flight("VN0570") == "VN570"
    assert EsidDeclarePage._flight_search_query("AK523") == "AK0523"
    assert EsidDeclarePage._flight_search_query("AK0523") == "AK0523"
    assert EsidDeclarePage._ymd_to_mdy("2026-07-25") == "07-25-2026"
    assert EsidDeclarePage._norm_flight("AK 0523") == "AK523"


def test_payment_final_state_suppresses_false_warning():
    page = object.__new__(EsidDeclarePage)
    page._fill_payment = lambda _value: False
    page._read_payment_label = lambda: "Chuyển khoản/Bank transfer"
    fills = {}
    warnings = []

    page._fill_ops_selects(
        {"payment_mode": "BANK_TRANSFER"},
        fills,
        warnings,
        include_destination=False,
        include_payment=True,
    )

    assert fills["codPayMod"] is True
    assert warnings == []
