from app.data.models import Action, NormalizedStatus
from app.services.awb_service import (
    map_tcs_status_to_normalized,
    mark_duplicates,
    validate_ops_payload,
    validate_row,
)


def test_validate_lookup_ok():
    row = validate_row({"AWB": "123-12345678", "ACTION": "LOOKUP"}, 1)
    assert row.validation_error is None
    assert row.action == Action.LOOKUP
    assert row.awb_digits == "12312345678"


def test_validate_register_requires_fields():
    row = validate_row({"AWB": "12312345678", "ACTION": "REGISTER"}, 1)
    assert row.validation_error
    assert "FLIGHT_NO" in row.validation_error
    assert "PCS" in row.validation_error


def test_duplicates():
    a = validate_row({"AWB": "12312345678", "ACTION": "LOOKUP"}, 1)
    b = validate_row({"AWB": "123-12345678", "ACTION": "LOOKUP"}, 2)
    rows = mark_duplicates([a, b])
    assert rows[0].validation_error is None
    assert rows[1].validation_error and "Trùng" in rows[1].validation_error


def test_warehouse_scope():
    row = validate_row({"AWB": "12312345678", "ACTION": "LOOKUP", "warehouse": "TECS-SCSC"}, 1)
    assert row.validation_error and "TECS-TCS" in row.validation_error


def test_ops_payload():
    rows = validate_ops_payload(
        {
            "warehouse": "TECS-TCS",
            "rows": [
                {"awb": "12312345678", "action": "LOOKUP"},
                {"awb": "12312345679", "action": "PRINT"},
            ],
        }
    )
    assert len(rows) == 2


def test_map_status():
    assert map_tcs_status_to_normalized("Hoàn thành") == NormalizedStatus.COMPLETED
    assert map_tcs_status_to_normalized("Chưa hoàn thành") == NormalizedStatus.NOT_COMPLETED
    assert map_tcs_status_to_normalized("Chua hoan thanh (mock)") == NormalizedStatus.NOT_COMPLETED
    assert map_tcs_status_to_normalized("needs login") == NormalizedStatus.NEEDS_LOGIN


def test_map_reception_completed():
    raw = (
        "THÔNG TIN TIẾP NHẬN\nNgày tiếp nhận: July 17, 2026 14:25\n"
        "THÔNG TIN HOÀN TẤT THỦ TỤC HẢI QUAN\nLô hàng chưa được hoàn tất thủ tục Hải quan"
    )
    assert map_tcs_status_to_normalized(raw) == NormalizedStatus.RECEPTION_COMPLETED
    assert (
        map_tcs_status_to_normalized("Hoàn thành tiếp nhận AWB 232")
        == NormalizedStatus.RECEPTION_COMPLETED
    )