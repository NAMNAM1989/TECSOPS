from __future__ import annotations

import re
from dataclasses import dataclass


AWB_DIGIT_RE = re.compile(r"^\d{11}$")


@dataclass(frozen=True)
class AwbNormalizeResult:
    ok: bool
    digits: str
    display: str
    error: str | None = None


def digits_only(raw: str | None) -> str:
    return re.sub(r"\D", "", str(raw or ""))


def format_awb_display(digits: str) -> str:
    d = digits_only(digits)[:11]
    if len(d) <= 3:
        return d
    if len(d) <= 7:
        return f"{d[:3]}-{d[3:]}"
    return f"{d[:3]}-{d[3:7]} {d[7:]}"


def normalize_awb(raw: str | None) -> AwbNormalizeResult:
    """Chuẩn hóa AWB: 11 chữ số; hiển thị XXX-XXXX XXXX (khớp Ops formatAwb)."""
    digits = digits_only(raw)
    if not digits:
        return AwbNormalizeResult(False, "", "", "AWB trống")
    if len(digits) != 11:
        return AwbNormalizeResult(
            False,
            digits,
            format_awb_display(digits),
            f"AWB phải đủ 11 chữ số (hiện {len(digits)})",
        )
    if not AWB_DIGIT_RE.match(digits):
        return AwbNormalizeResult(False, digits, format_awb_display(digits), "AWB không hợp lệ")
    return AwbNormalizeResult(True, digits, format_awb_display(digits), None)


def safe_filename_awb(digits_or_display: str) -> str:
    digits = digits_only(digits_or_display)
    if len(digits) == 11:
        return f"{digits[:3]}-{digits[3:]}"
    return re.sub(r"[^\w\-]+", "_", str(digits_or_display)).strip("_") or "AWB"