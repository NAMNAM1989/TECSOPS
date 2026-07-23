"""Quét Danh sách ESID lấy lô Hoàn thành tiếp nhận."""
from __future__ import annotations

from typing import Any

from app.browser.locators import LocatorsConfig, locators_path
from app.browser.pages.awb_page import NeedsLoginError
from app.browser.pages.esid_page import EsidListPage
from app.browser.session_manager import SessionManager
from app.config import Settings


def _session_gate(sessions: SessionManager, settings: Settings) -> dict[str, Any] | None:
    st = sessions.status()
    if not st.open:
        return {
            "ok": False,
            "error": "NO_BROWSER",
            "message": "Chưa mở Chrome — POST /session/open",
            "items": [],
            "ready": [],
            "total": 0,
            "ready_count": 0,
        }
    if not st.logged_in:
        return {
            "ok": False,
            "error": "NEEDS_LOGIN",
            "message": "Cần đăng nhập TCS (CAPTCHA/OCR) trước khi quét ESID",
            "items": [],
            "ready": [],
            "total": 0,
            "ready_count": 0,
        }
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    if not loc.esid_list_confirmed:
        return {
            "ok": False,
            "error": "LOCATORS",
            "message": "esid_list chưa confirmed trong locators.json",
            "items": [],
            "ready": [],
            "total": 0,
            "ready_count": 0,
        }
    return None


def scan_esid_by_date(
    sessions: SessionManager,
    settings: Settings,
    session_date: str,
    ops_awbs: list[str] | None = None,
) -> dict[str, Any]:
    """
    Lọc ESID theo ngày bay (= ngày phiên Ops), đọc các dòng Hoàn thành tiếp nhận,
    khớp với AWB trên Ops (không gõ từng AWB).
    """
    gate = _session_gate(sessions, settings)
    if gate:
        return gate
    sessions.focus_if_headed()
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    portal = sessions.portal("list")
    esid = EsidListPage(portal.page, loc)
    try:
        result = esid.scan_by_flight_date(session_date, ops_awbs or [])
    except NeedsLoginError as e:
        return {
            "ok": False,
            "error": "NEEDS_LOGIN",
            "message": str(e),
            "items": [],
            "ready": [],
            "total": 0,
            "ready_count": 0,
        }
    except Exception as e:
        return {
            "ok": False,
            "error": "SCAN_FAILED",
            "message": str(e)[:300],
            "items": [],
            "ready": [],
            "total": 0,
            "ready_count": 0,
        }
    ready = result["ready"]
    items = result["items"]
    return {
        "ok": True,
        "mode": "by_date",
        "session_date": session_date,
        "items": items,
        "ready": ready,
        "reception_all": result.get("reception_all") or [],
        "index_rows": result.get("index_rows") or [],
        "total": len(items) if items else int(result.get("list_total") or 0),
        "ready_count": len(ready),
        "list_total": result.get("list_total"),
        "reception_total": result.get("reception_total"),
        "message": (
            f"ESID ngày {session_date}: {result.get('list_total', 0)} dòng · "
            f"{result.get('reception_total', 0)} hoàn thành tiếp nhận · "
            f"khớp Ops {len(ready)} lô"
        ),
    }


def scan_esid_reception(
    sessions: SessionManager,
    settings: Settings,
    awbs: list[str],
    *,
    session_date: str | None = None,
) -> dict[str, Any]:
    """
    Ưu tiên quét theo ngày (nhanh). Fallback từng AWB nếu không có session_date.
    """
    if session_date and len(session_date) >= 8:
        return scan_esid_by_date(sessions, settings, session_date, awbs)

    gate = _session_gate(sessions, settings)
    if gate:
        return gate
    sessions.focus_if_headed()
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    portal = sessions.portal("list")
    esid = EsidListPage(portal.page, loc)
    try:
        items = esid.scan_awbs(awbs)
    except NeedsLoginError as e:
        return {
            "ok": False,
            "error": "NEEDS_LOGIN",
            "message": str(e),
            "items": [],
            "ready": [],
            "total": 0,
            "ready_count": 0,
        }
    ready = [i for i in items if i.get("ready")]
    return {
        "ok": True,
        "mode": "by_awb",
        "items": items,
        "ready": ready,
        "total": len(items),
        "ready_count": len(ready),
        "message": f"Đã quét {len(items)} AWB — {len(ready)} lô Hoàn thành tiếp nhận",
    }
