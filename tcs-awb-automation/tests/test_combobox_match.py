from app.browser.pages.esid_declare_page import EsidDeclarePage


def test_fold_text_strips_vietnamese():
    assert EsidDeclarePage._fold_text("Chi nhánh Số 1") == "CHI NHANH SO 1"


def test_combobox_search_queries_prefer_short_tail():
    name = (
        "CHI NHANH SO 1 CONG TY CO PHAN THUONG MAI VA DICH VU "
        "CHUYEN PHAT NHANH PCS"
    )
    qs = EsidDeclarePage._combobox_search_queries(name)
    assert qs[0] == "PCS"
    assert any("CHUYEN PHAT NHANH" in q or q.endswith("PCS") for q in qs)
    assert qs[-1].startswith("CHI NHANH") or "PCS" in qs[-1]
