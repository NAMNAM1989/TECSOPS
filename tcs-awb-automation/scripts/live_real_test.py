"""
Test thật cổng TCS:
1) Mở Chrome persistent
2) Chờ user đăng nhập tay (CAPTCHA) tối đa --wait-login giây
3) Chụp DOM, gợi ý locators AWB
4) Nếu có --awb: thử LOOKUP + DOWNLOAD

Usage:
  python scripts/live_real_test.py --wait-login 300 --awb 23218276495
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.browser.discovery import DOM_SCRIPT, _update_locators_from_artifacts, _write_report
from app.browser.locators import LocatorsConfig, locators_path, suggest_awb_locators_from_elements
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings
from app.data.repository import Repository
from app.services.awb_service import validate_ops_payload
from app.services.batch_service import BatchService
from app.browser.pages.awb_page import AwbPortalPage
from app.browser.locators import LocatorsConfig as LC


def wait_login(page, seconds: int) -> bool:
    print(f"\n>>> Đăng nhập tay trên Chrome (CAPTCHA). Chờ tối đa {seconds}s...\n")
    deadline = time.time() + seconds
    while time.time() < deadline:
        url = (page.url or "").lower()
        if "awblogin" not in url and "checkoutlogin" not in url and "login" not in url:
            print(f"Đã rời trang login → {page.url}")
            return True
        # vẫn có thể login xong nhưng URL chứa 'awb'
        try:
            has_user = page.locator("#basic_username").count()
            if has_user == 0 and "tcs.com.vn" in url:
                # form login biến mất
                print(f"Form login biến mất → {page.url}")
                return True
        except Exception:
            pass
        time.sleep(2)
        left = int(deadline - time.time())
        if left % 30 < 2:
            print(f"  ... còn ~{left}s | url={page.url}")
    return False


def capture(page, settings, step: str) -> dict:
    shot = settings.screenshots_dir / f"live_{step}_{datetime.now().strftime('%H%M%S')}.png"
    try:
        page.screenshot(path=str(shot), full_page=True)
    except Exception as e:
        shot = Path(str(e))
    try:
        summary = page.evaluate(DOM_SCRIPT)
        url, title = page.url, page.title()
    except Exception as e:
        summary, url, title = {"inputs": [], "error": str(e)}, page.url, ""
    return {
        "step": step,
        "url": url,
        "title": title,
        "screenshot": str(shot),
        "elements": summary,
        "downloads_seen": [],
        "captured_at": datetime.now().isoformat(timespec="seconds"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait-login", type=int, default=300)
    ap.add_argument("--awb", action="append", default=[], help="AWB 11 số (có thể lặp)")
    args = ap.parse_args()

    settings = load_settings()
    ensure_runtime_dirs(settings)
    session = BrowserSession(settings)
    artifacts = []
    try:
        page = session.open(headless=False)
        artifacts.append(capture(page, settings, "login_page"))
        if not wait_login(page, args.wait_login):
            print("TIMEOUT: chưa đăng nhập — dừng test thật.")
            return 2

        page.wait_for_timeout(1500)
        artifacts.append(capture(page, settings, "after_login"))

        # Gợi ý locators từ trang sau login
        inputs = (artifacts[-1].get("elements") or {}).get("inputs") or []
        suggested = suggest_awb_locators_from_elements(inputs)
        loc_path = locators_path(settings.discovery_dir)
        cfg = LocatorsConfig.load(loc_path)
        cfg.data["awb_lookup"] = {**(cfg.data.get("awb_lookup") or {}), **suggested}
        # Nếu heuristic yếu, vẫn lưu candidates
        cfg.save()
        print("Locators cập nhật:", loc_path)
        print("awb_lookup.confirmed =", cfg.data["awb_lookup"].get("confirmed"))

        _update_locators_from_artifacts(loc_path, artifacts)
        report = settings.discovery_dir.parent / "discovery_report.md"
        _write_report(report, artifacts, loc_path)

        if not args.awb:
            print("Không có --awb → chỉ discovery sau login. Xong.")
            print("Giữ Chrome mở 20s để bạn xem...")
            page.wait_for_timeout(20000)
            return 0

        cfg = LC.load(loc_path)
        if not cfg.awb_lookup_confirmed:
            print("AWB locators chưa confirmed — thử dump menu/links để bạn xem:")
            for el in inputs[:40]:
                print(" ", el.get("tag"), el.get("id"), el.get("text") or el.get("placeholder"))
            print("Cập nhật tay locators.json rồi chạy lại với --awb")
            page.wait_for_timeout(15000)
            return 3

        portal = AwbPortalPage(page, cfg)
        repo = Repository(settings.db_path)
        batch = BatchService(settings, repo)
        rows = validate_ops_payload(
            {
                "warehouse": "TECS-TCS",
                "rows": [
                    {"awb": a, "action": "DOWNLOAD", "ops_status": "COMPLETED"} for a in args.awb
                ],
            }
        )
        job = batch.create_job_from_rows(rows, source="live_test", dry_run=True, mock=False)
        results, report_xlsx = batch.run(job, portal=portal)
        out = {
            "report": str(report_xlsx),
            "results": [r.to_dict() for r in results],
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0 if any(r.downloaded_file for r in results) else 4
    finally:
        # Không đóng ngay — để user xem; đóng sau 5s
        try:
            page.wait_for_timeout(5000)
        except Exception:
            pass
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
