from __future__ import annotations

import re
from typing import Any

from app.data.models import Action, AwbJobRow, NormalizedStatus
from app.utils.awb import normalize_awb

_RECEPTION_DATE = re.compile(
    r"("
    r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"
    r"|\d{4}-\d{2}-\d{2}"
    r"|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}"
    r")",
    re.I,
)


VALID_ACTIONS = {a.value for a in Action}


def parse_action(raw: str | None) -> Action | None:
    key = str(raw or "").strip().upper()
    if key not in VALID_ACTIONS:
        return None
    return Action(key)


def validate_row(raw: dict[str, Any], stt: int) -> AwbJobRow:
    awb_norm = normalize_awb(raw.get("AWB") or raw.get("awb"))
    action = parse_action(raw.get("ACTION") or raw.get("action") or "LOOKUP")
    errors: list[str] = []
    if not awb_norm.ok:
        errors.append(awb_norm.error or "AWB lỗi")
    if action is None:
        errors.append("ACTION không hợp lệ (LOOKUP|REGISTER|DOWNLOAD|PRINT)")
        action = Action.LOOKUP

    pcs = raw.get("PCS") if "PCS" in raw else raw.get("pcs")
    kg = raw.get("GROSS_WEIGHT") if "GROSS_WEIGHT" in raw else raw.get("gross_weight") or raw.get("kg")
    pcs_i: int | None = None
    kg_f: float | None = None
    if pcs not in (None, ""):
        try:
            pcs_i = int(pcs)
            if pcs_i <= 0:
                errors.append("PCS phải là số nguyên dương")
        except (TypeError, ValueError):
            errors.append("PCS không phải số")
    if kg not in (None, ""):
        try:
            kg_f = float(kg)
            if kg_f <= 0:
                errors.append("GROSS_WEIGHT phải > 0")
        except (TypeError, ValueError):
            errors.append("GROSS_WEIGHT không phải số")

    if action == Action.REGISTER:
        if not (raw.get("FLIGHT_NO") or raw.get("flight_no") or raw.get("flight")):
            errors.append("REGISTER cần FLIGHT_NO")
        if pcs_i is None:
            errors.append("REGISTER cần PCS")
        if kg_f is None:
            errors.append("REGISTER cần GROSS_WEIGHT")

    copies = raw.get("PRINT_COPIES") if "PRINT_COPIES" in raw else raw.get("print_copies")
    try:
        print_copies = int(copies) if copies not in (None, "") else 1
        if print_copies < 1:
            print_copies = 1
    except (TypeError, ValueError):
        print_copies = 1
        errors.append("PRINT_COPIES không hợp lệ")

    warehouse = str(raw.get("warehouse") or raw.get("WAREHOUSE") or "TECS-TCS").strip()
    if warehouse.upper() not in {"TECS-TCS", "KHO-TCS"}:
        errors.append(f"Chỉ hỗ trợ kho TECS-TCS (nhận được: {warehouse})")

    return AwbJobRow(
        stt=stt,
        awb_raw=str(raw.get("AWB") or raw.get("awb") or ""),
        awb_digits=awb_norm.digits,
        awb_display=awb_norm.display,
        action=action,
        flight_date=str(raw.get("FLIGHT_DATE") or raw.get("flight_date") or raw.get("flightDate") or ""),
        flight_no=str(raw.get("FLIGHT_NO") or raw.get("flight_no") or raw.get("flight") or ""),
        pcs=pcs_i,
        gross_weight=kg_f,
        document_type=str(raw.get("DOCUMENT_TYPE") or raw.get("document_type") or "AWB"),
        print_copies=print_copies,
        note=str(raw.get("NOTE") or raw.get("note") or ""),
        shipment_id=str(raw.get("shipment_id") or raw.get("id") or ""),
        warehouse="TECS-TCS",
        ops_status=str(raw.get("ops_status") or raw.get("status") or "").strip().upper(),
        validation_error="; ".join(errors) if errors else None,
    )


def mark_duplicates(rows: list[AwbJobRow]) -> list[AwbJobRow]:
    seen: dict[tuple[str, str], int] = {}
    for row in rows:
        if row.validation_error:
            continue
        key = (row.awb_digits, row.action.value)
        if key in seen:
            row.validation_error = (
                f"Trùng AWB+ACTION với dòng STT {seen[key]} "
                f"({NormalizedStatus.SKIPPED_DUPLICATE.value})"
            )
        else:
            seen[key] = row.stt
    return rows


def has_reception_completed(raw_status: str) -> bool:
    """True khi TCS đã hoàn thành tiếp nhận (có ngày / keyword rõ)."""
    s = (raw_status or "").strip().lower()
    if not s:
        return False
    if any(
        k in s
        for k in (
            "hoàn thành tiếp nhận",
            "hoan thanh tiep nhan",
            "đã tiếp nhận",
            "da tiep nhan",
        )
    ):
        return True
    # "Ngày tiếp nhận" + giá trị ngày (quan sát thật trên /Awb/Agent)
    if re.search(r"ngày\s*tiếp\s*nhận\s*[:\s]+\S", s) or re.search(
        r"ngay\s*tiep\s*nhan\s*[:\s]+\S", s
    ):
        return True
    # Khối THÔNG TIN TIẾP NHẬN kèm ngày trong đoạn gần đó
    for marker in ("thông tin tiếp nhận", "thong tin tiep nhan", "tiếp nhận", "tiep nhan"):
        idx = s.find(marker)
        if idx < 0:
            continue
        chunk = s[idx : idx + 500]
        if _RECEPTION_DATE.search(chunk):
            return True
    return False


def map_tcs_status_to_normalized(raw_status: str) -> NormalizedStatus:
    """Map chuỗi trạng thái TCS (sau discovery) sang trạng thái nội bộ."""
    s = (raw_status or "").strip().lower()
    if not s:
        return NormalizedStatus.FAILED
    if "login" in s or "đăng nhập" in s or "dang nhap" in s:
        return NormalizedStatus.NEEDS_LOGIN
    # Ưu tiên tiếp nhận — đủ tải phiếu dù hải quan chưa xong
    if has_reception_completed(raw_status):
        return NormalizedStatus.RECEPTION_COMPLETED
    # Phủ định cụm đầy đủ (không dùng "chưa"/"đang" đơn lẻ)
    if any(
        k in s
        for k in (
            "chưa hoàn thành",
            "chua hoan thanh",
            "chưa được hoàn tất thủ tục hải quan",
            "chưa hoàn tất thủ tục",
            "không tìm thấy",
            "khong tim thay",
            "not completed",
            "not found",
            "incomplete",
            "pending",
            "đang xử lý",
            "dang xu ly",
        )
    ):
        # Vẫn có thể đã tiếp nhận ở trên; nếu tới đây = chưa có tín hiệu tiếp nhận
        return NormalizedStatus.NOT_COMPLETED
    if any(
        k in s
        for k in (
            "đã hoàn tất thủ tục hải quan",
            "hoàn tất thủ tục hải quan",
            "hoàn thành",
            "hoan thanh",
            "completed",
            "complete",
            "done",
        )
    ):
        return NormalizedStatus.COMPLETED
    return NormalizedStatus.NOT_COMPLETED


def validate_ops_payload(payload: dict[str, Any]) -> list[AwbJobRow]:
    warehouse = str(payload.get("warehouse") or "TECS-TCS")
    if warehouse.upper() not in {"TECS-TCS", "KHO-TCS"}:
        raise ValueError("Agent chỉ nhận job kho TECS-TCS")
    rows_raw = payload.get("rows") or []
    rows = [validate_row({**r, "warehouse": "TECS-TCS"}, i + 1) for i, r in enumerate(rows_raw)]
    return mark_duplicates(rows)