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


def test_score_rejects_add_new_and_short_substring():
    page = object.__new__(EsidDeclarePage)
    full = "CONG TY TNHH GIAO NHAN VAN TAI NAM NAM"
    assert page._score_select_option(full, "+ Thêm mới") == 0
    assert page._score_select_option(full, "NAM") == 0
    assert page._score_select_option(full, full) == 100
    assert page._score_select_option(full, full + " - MST 0312345678") >= 96


def test_score_requires_majority_rare_tokens():
    page = object.__new__(EsidDeclarePage)
    full = "CONG TY TNHH LOGISTICS ABC XYZ EXPRESS"
    # Chỉ khớp 1/2 token riêng → dưới 60% → 0
    assert page._score_select_option(full, "CONG TY TNHH LOGISTICS ABC OTHER") == 0
    # Khớp cụm đầu + đuôi
    good = page._score_select_option(
        full, "CONG TY TNHH LOGISTICS ABC XYZ EXPRESS HA NOI"
    )
    assert good >= 70


def test_hint_boost_matches_vat_digits():
    page = object.__new__(EsidDeclarePage)
    assert (
        page._hint_boost_score(
            "PCS EXPRESS - 0312345678",
            ["0312345678"],
        )
        >= 98
    )
    assert page._hint_boost_score("PCS EXPRESS", ["0312345678"]) == 0
