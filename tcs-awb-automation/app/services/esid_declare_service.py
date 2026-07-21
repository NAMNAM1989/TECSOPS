"""Điền form KHAI BÁO ESID từ payload Ops (session Chrome đã login)."""
from __future__ import annotations

from typing import Any

from app.browser.locators import LocatorsConfig, locators_path
from app.browser.pages.awb_page import AwbPortalPage, NeedsLoginError, SiteChangedError
from app.browser.pages.esid_declare_page import EsidDeclarePage
from app.browser.session_manager import SessionManager
from app.config import Settings
from app.utils.awb import digits_only


def _session_gate(
    sessions: SessionManager, awb: str
) -> dict[str, Any] | None:
    st = sessions.status()
    if not st.open or sessions.page is None:
        return {
            "ok": False,
            "error": "NO_BROWSER",
            "message": "Chưa mở Chrome — POST /session/open",
            "awb": awb,
        }
    if not st.logged_in:
        return {
            "ok": False,
            "error": "NEEDS_LOGIN",
            "message": "Cần login TCS trước khi điền ESID",
            "awb": awb,
        }
    return None


def fill_esid_declare(
    sessions: SessionManager,
    settings: Settings,
    payload: dict[str, Any],
) -> dict[str, Any]:
    warehouse = str(payload.get("warehouse") or "TECS-TCS").upper()
    if warehouse not in {"TECS-TCS", "KHO-TCS"}:
        return {"ok": False, "error": "WAREHOUSE_SCOPE", "message": "Chỉ TECS-TCS"}

    submit = bool(payload.get("submit", False))
    # An toàn: mặc định không submit; cần confirm_submit tường minh
    if submit and not bool(payload.get("confirm_submit", False)):
        submit = False

    shipment = payload.get("shipment") or payload
    if not isinstance(shipment, dict):
        return {"ok": False, "error": "VALIDATION", "message": "Thiếu shipment"}

    awb = digits_only(str(shipment.get("awb") or payload.get("awb") or ""))
    if len(awb) != 11:
        return {"ok": False, "error": "VALIDATION", "message": "AWB phải đủ 11 số"}

    registrant = payload.get("registrant") or {}
    if not isinstance(registrant, dict):
        registrant = {}

    data: dict[str, Any] = {
        "awb": awb,
        "flight_no": shipment.get("flight_no") or shipment.get("flight") or "",
        "flight_date": shipment.get("flight_date") or shipment.get("flightDate") or "",
        "dest": shipment.get("dest") or "",
        "shipper_name": shipment.get("shipper_name") or shipment.get("shipperNamePrint") or "",
        "shipper_address": shipment.get("shipper_address") or shipment.get("shipperAddressPrint") or "",
        "shipper_tel": shipment.get("shipper_tel") or shipment.get("shipperPhonePrint") or "",
        "shipper_email": shipment.get("shipper_email") or shipment.get("shipperEmailPrint") or "",
        "shipper_fax": shipment.get("shipper_fax") or "",
        "agent_name": shipment.get("agent_name") or shipment.get("agentNamePrint") or "",
        "agent_address": shipment.get("agent_address") or shipment.get("agentAddressPrint") or "",
        "agent_tel": shipment.get("agent_tel") or shipment.get("agentPhonePrint") or "",
        "agent_email": shipment.get("agent_email") or shipment.get("agentEmailPrint") or "",
        "agent_fax": shipment.get("agent_fax") or "",
        "agent_vat": shipment.get("agent_vat") or shipment.get("agentTaxCodePrint") or "",
        "consignee_name": shipment.get("consignee_name") or shipment.get("consigneeNamePrint") or "",
        "consignee_address": shipment.get("consignee_address") or shipment.get("consigneeAddressPrint") or "",
        "consignee_tel": shipment.get("consignee_tel") or shipment.get("consigneePhonePrint") or "",
        "consignee_email": shipment.get("consignee_email") or shipment.get("consigneeEmailPrint") or "",
        "consignee_fax": shipment.get("consignee_fax") or "",
        "consignee_vat": shipment.get("consignee_vat") or shipment.get("taxCodePrint") or "",
        "notify_name": shipment.get("notify_name") or shipment.get("notifyNamePrint") or "",
        "notify_address": shipment.get("notify_address") or "",
        "notify_tel": shipment.get("notify_tel") or "",
        "notify_email": shipment.get("notify_email") or "",
        "notify_fax": shipment.get("notify_fax") or "",
        "notify_remark": shipment.get("notify_remark") or "",
        "nature_of_goods": shipment.get("nature_of_goods") or shipment.get("goodsDescriptionPrint") or "",
        "other_request": shipment.get("other_request") or shipment.get("otherRequirementsPrint") or "",
        "consol": bool(shipment.get("consol", False)),
        "tecs_warehouse": shipment.get("tecs_warehouse", True),
        "payment_mode": shipment.get("payment_mode") or "Chuyển khoản/Bank transfer",
        "total_hawbs": (
            shipment.get("total_hawbs")
            if shipment.get("total_hawbs") is not None
            else (shipment.get("totalOfHawbs") if shipment.get("totalOfHawbs") is not None else 0)
        ),
        # pcs: thiếu / null → 0
        "pcs": (
            shipment.get("pcs")
            if shipment.get("pcs") is not None and str(shipment.get("pcs")).strip() != ""
            else 0
        ),
        "choose_flight": bool(payload.get("choose_flight", True)),
        "registrant_name": registrant.get("name") or payload.get("registrant_name") or "",
        "registrant_tel": registrant.get("tel") or payload.get("registrant_tel") or "",
        "registrant_cccd": registrant.get("cccd") or payload.get("registrant_cccd") or "",
    }

    gate = _session_gate(sessions, awb)
    if gate:
        return gate

    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    portal = AwbPortalPage(sessions.page, loc)
    declare = EsidDeclarePage(sessions.page, loc)
    docs_dir = settings.output_dir / "docs"
    t0 = time_ms()
    try:
        if portal.is_login_page():
            return {
                "ok": False,
                "error": "NEEDS_LOGIN",
                "message": "Đang ở trang login",
                "awb": awb,
            }
        result = declare.fill_declare(data, submit=submit)
        # Ảnh preview phụ (Ops từ máy khác); headed: cửa sổ Chrome máy kho là nguồn kiểm tra
        if result.get("ok") and not result.get("submitted"):
            preview = declare.capture_preview(docs_dir, awb)
            result.update(preview)
            if preview.get("preview_error"):
                result.setdefault("warnings", []).append(
                    f"Preview: {preview['preview_error']}"
                )
            # Đưa Chrome lên trước để nhìn form thật trên máy kho
            if sessions.session is not None and not settings.headless:
                focus = sessions.focus_window()
                result["browser_focused"] = bool(focus.get("ok"))
                result["headless"] = False
            else:
                result["headless"] = bool(settings.headless)
                result["browser_focused"] = False
        else:
            result["headless"] = bool(settings.headless)
        result["elapsed_ms"] = time_ms() - t0
        result["shipment_id"] = shipment.get("shipment_id") or shipment.get("id") or ""
        return result
    except NeedsLoginError as e:
        return {"ok": False, "error": "NEEDS_LOGIN", "message": str(e), "awb": awb}
    except SiteChangedError as e:
        return {"ok": False, "error": "SITE_CHANGED", "message": str(e), "awb": awb}
    except Exception as e:
        return {"ok": False, "error": "INTERNAL", "message": str(e)[:300], "awb": awb}


def submit_esid_declare(
    sessions: SessionManager,
    settings: Settings,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """HOÀN TẤT form KHAI BÁO đang mở — bắt buộc confirm_submit."""
    warehouse = str(payload.get("warehouse") or "TECS-TCS").upper()
    if warehouse not in {"TECS-TCS", "KHO-TCS"}:
        return {"ok": False, "error": "WAREHOUSE_SCOPE", "message": "Chỉ TECS-TCS"}

    if not bool(payload.get("confirm_submit", False)):
        return {
            "ok": False,
            "error": "CONFIRM_REQUIRED",
            "message": "Cần confirm_submit: true để HOÀN TẤT trên TCS",
            "submitted": False,
        }

    awb = digits_only(str(payload.get("awb") or ""))
    if len(awb) != 11:
        return {
            "ok": False,
            "error": "VALIDATION",
            "message": "AWB phải đủ 11 số",
            "submitted": False,
        }

    gate = _session_gate(sessions, awb)
    if gate:
        gate["submitted"] = False
        return gate

    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    portal = AwbPortalPage(sessions.page, loc)
    declare = EsidDeclarePage(sessions.page, loc)
    docs_dir = settings.output_dir / "docs"
    t0 = time_ms()
    try:
        if portal.is_login_page():
            return {
                "ok": False,
                "error": "NEEDS_LOGIN",
                "message": "Đang ở trang login",
                "awb": awb,
                "submitted": False,
            }
        result = declare.submit_open_declare(awb)
        # Ảnh sau submit (thành công hoặc lỗi) để Ops đối chiếu
        preview = declare.capture_preview(docs_dir, awb)
        # Đổi tên nhẹ: after-submit dùng cùng field để FE refresh ảnh
        if preview.get("preview_file"):
            result["preview_file"] = preview["preview_file"]
            result["preview_url"] = preview["preview_url"]
        elif preview.get("preview_error"):
            result.setdefault("warnings", []).append(
                f"Preview sau submit: {preview['preview_error']}"
            )
        result["elapsed_ms"] = time_ms() - t0
        result["shipment_id"] = payload.get("shipment_id") or ""
        return result
    except NeedsLoginError as e:
        return {
            "ok": False,
            "error": "NEEDS_LOGIN",
            "message": str(e),
            "awb": awb,
            "submitted": False,
        }
    except SiteChangedError as e:
        return {
            "ok": False,
            "error": "SITE_CHANGED",
            "message": str(e),
            "awb": awb,
            "submitted": False,
        }
    except Exception as e:
        return {
            "ok": False,
            "error": "INTERNAL",
            "message": str(e)[:300],
            "awb": awb,
            "submitted": False,
        }


def time_ms() -> int:
    import time

    return int(time.perf_counter() * 1000)
