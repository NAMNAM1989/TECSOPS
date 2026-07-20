"""Quét ESID: chỉ «Hoàn thành tiếp nhận» mới ready — không kết quả ảo."""
from app.browser.pages.esid_page import RECEPTION_STATUS, EsidListPage
from app.data.models import NormalizedStatus


def test_blob_requires_full_phrase():
    assert EsidListPage._blob_is_reception("Hoàn thành tiếp nhận", "")
    assert EsidListPage._blob_is_reception("", "AWB 123 Hoàn thành tiếp nhận KE")
    assert EsidListPage._blob_is_reception("Hoan thanh tiep nhan", "")
    # Không tách đôi — tránh khớp nhầm
    assert not EsidListPage._blob_is_reception("Hoàn thành", "có tiếp nhận hàng")
    assert not EsidListPage._blob_is_reception("Đang tiếp nhận", "")
    assert not EsidListPage._blob_is_reception("Hoàn thành khai báo", "")


def test_not_in_list_raw_must_not_contain_reception_phrase():
    """Message lỗi từng bị FE regex → gán Ops ảo."""
    esid = EsidListPage.__new__(EsidListPage)
    ready, items = esid.match_reception_to_ops([], ["73807183061", "23218276370"])
    assert ready == []
    assert len(items) == 2
    for it in items:
        assert it["ready"] is False
        assert it["normalized_status"] == NormalizedStatus.NOT_COMPLETED.value
        assert "hoàn thành tiếp nhận" not in (it.get("raw") or "").lower()
        assert "hoan thanh tiep nhan" not in (it.get("raw") or "").lower()


def test_match_only_reception_rows_to_ops():
    esid = EsidListPage.__new__(EsidListPage)
    reception = [
        {
            "awb": "73807183061",
            "ready": True,
            "normalized_status": NormalizedStatus.RECEPTION_COMPLETED.value,
            "tcs_status": RECEPTION_STATUS,
            "raw": "73807183061 VN0773 Hoàn thành tiếp nhận",
        },
        {
            # Không phải tiếp nhận — không được khớp dù có trong list
            "awb": "23218276370",
            "ready": False,
            "normalized_status": NormalizedStatus.NOT_COMPLETED.value,
            "tcs_status": "Đang xử lý",
            "raw": "23218276370 Đang xử lý",
        },
    ]
    ready, items = esid.match_reception_to_ops(
        reception, ["73807183061", "23218276370", "18010359440"]
    )
    assert [r["awb"] for r in ready] == ["73807183061"]
    by_awb = {i["awb"]: i for i in items}
    assert by_awb["73807183061"]["ready"] is True
    assert by_awb["23218276370"]["ready"] is False
    assert by_awb["18010359440"]["ready"] is False


def test_last8_ambiguous_not_matched():
    """Hai Ops cùng last8 → không đoán mò."""
    esid = EsidListPage.__new__(EsidListPage)
    reception = [
        {
            "awb": "07183061",  # thiếu prefix
            "ready": True,
            "normalized_status": NormalizedStatus.RECEPTION_COMPLETED.value,
            "tcs_status": RECEPTION_STATUS,
            "raw": "07183061 Hoàn thành tiếp nhận",
        }
    ]
    # Hai prefix khác nhau cùng last8 — không khớp
    ready, _ = esid.match_reception_to_ops(
        reception, ["73807183061", "99907183061"]
    )
    assert ready == []
