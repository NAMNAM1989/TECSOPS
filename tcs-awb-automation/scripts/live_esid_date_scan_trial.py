"""Thử lọc ESID theo 1 ngày (DD-MM-YYYY) → đọc dòng Hoàn thành tiếp nhận."""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.browser.locators import LocatorsConfig, locators_path
from app.browser.login_assist import ensure_logged_in_smart
from app.browser.pages.awb_page import AwbPortalPage
from app.browser.pages.esid_page import EsidListPage, RECEPTION_STATUS
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings


def set_date_range(page, ymd: str) -> None:
    """ymd = YYYY-MM-DD → DD-MM-YYYY trên ant-picker-range."""
    parts = ymd.split("-")
    if len(parts) != 3:
        raise ValueError(ymd)
    dmy = f"{parts[2]}-{parts[1]}-{parts[0]}"
    # Ant Design range: 2 inputs
    start = page.locator("#search-form_dateSearch")
    start.wait_for(state="visible", timeout=10000)
    start.click()
    start.fill("")
    start.fill(dmy)
    page.keyboard.press("Enter")
    page.wait_for_timeout(200)
    end = page.get_by_placeholder("Ngày kết thúc")
    end.click()
    end.fill("")
    end.fill(dmy)
    page.keyboard.press("Enter")
    page.wait_for_timeout(200)
    # blur / đóng panel
    try:
        page.keyboard.press("Escape")
    except Exception:
        pass


def main() -> int:
    ymd = sys.argv[1] if len(sys.argv) > 1 else "2026-07-17"
    settings = load_settings()
    ensure_runtime_dirs(settings)
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    session = BrowserSession(settings)
    t0 = time.perf_counter()
    try:
        page = session.open(headless=False)
        portal = AwbPortalPage(page, loc)
        ok, msg = ensure_logged_in_smart(
            portal,
            username=settings.tcs_username,
            password=settings.tcs_password,
            prefer_session=True,
            use_ocr=settings.captcha_ocr and settings.has_login_credentials,
            ocr_attempts=3,
            manual_timeout_s=60,
            debug_dir=settings.screenshots_dir / "captcha",
        )
        print("login_ok=", ok)
        if not ok:
            return 2
        esid = EsidListPage(page, loc)
        esid.goto_list(force=True)
        # xóa AWB nếu có
        try:
            page.get_by_placeholder("AWB#").fill("")
        except Exception:
            pass
        set_date_range(page, ymd)
        page.get_by_role("button", name="TÌM KIẾM").click()
        page.wait_for_timeout(1200)
        try:
            page.wait_for_load_state("networkidle", timeout=12000)
        except Exception:
            pass
        rows = esid.list_row_statuses()
        reception = []
        for r in rows:
            blob = f"{r.get('status') or ''} {r.get('text') or ''}".lower()
            if "hoàn thành tiếp nhận" in blob or "hoan thanh tiep nhan" in blob:
                reception.append(r)
            elif ("hoàn thành" in blob or "hoan thanh" in blob) and (
                "tiếp nhận" in blob or "tiep nhan" in blob
            ):
                reception.append(r)
        elapsed = time.perf_counter() - t0
        out = {
            "ymd": ymd,
            "seconds": round(elapsed, 2),
            "total_rows": len(rows),
            "reception_count": len(reception),
            "reception": reception[:40],
            "sample_rows": rows[:8],
        }
        path = settings.output_dir / f"ESID_DATE_SCAN_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        print("seconds=", round(elapsed, 2))
        print("total_rows=", len(rows), "reception=", len(reception))
        for r in reception[:15]:
            print(
                "READY",
                (r.get("awb") or "")[:20],
                "|",
                (r.get("status") or "")[:40],
                "|",
                (r.get("flight") or "")[:12],
            )
        print("Wrote", path)
        print("DONE_OK" if reception or rows else "DONE_EMPTY")
        return 0
    finally:
        try:
            session.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
