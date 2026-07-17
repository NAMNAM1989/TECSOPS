"""
Test thực tế Cách 1 (session) + Cách 2 (OCR):
1) Mở Chrome profile
2) Nếu đã login → Đăng Xuất để buộc về form CAPTCHA
3) ensure_logged_in_smart (OCR)
4) LOOKUP 1 AWB mẫu
"""
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
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings


def force_logout(portal: AwbPortalPage) -> None:
    page = portal.page
    print("STEP logout to force CAPTCHA (test OCR)")
    try:
        btn = page.get_by_role("button", name="Đăng Xuất")
        if btn.count() == 0:
            btn = page.get_by_text("Đăng Xuất", exact=False)
        if btn.count() > 0:
            btn.first.click(timeout=8000)
            page.wait_for_timeout(1200)
    except Exception as e:
        print("logout click failed:", e)
    # Luôn về AwbLogin để có form + ảnh CAPTCHA
    page.goto("https://www.tcs.com.vn/AwbLogin", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(1000)
    for _ in range(30):
        if portal.is_login_page():
            print("STEP now on login:", page.url)
            return
        time.sleep(0.4)
    print("WARN still not login page url=", page.url)


def main() -> int:
    force = "--force-logout" in sys.argv
    awb = "23218276495"
    for a in sys.argv[1:]:
        if a.startswith("--awb="):
            awb = "".join(c for c in a.split("=", 1)[1] if c.isdigit())[:11]
        elif a.isdigit() and len(a) >= 11:
            awb = a[:11]

    settings = load_settings()
    ensure_runtime_dirs(settings)
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))

    report = {
        "started": datetime.now().isoformat(timespec="seconds"),
        "prefer_session": settings.prefer_session,
        "captcha_ocr": settings.captcha_ocr,
        "creds": settings.has_login_credentials,
        "steps": [],
    }

    print("=== LIVE SESSION+OCR TEST ===")
    print("prefer_session=", settings.prefer_session, "ocr=", settings.captcha_ocr, "creds=", settings.has_login_credentials)

    session = BrowserSession(settings)
    page = None
    try:
        page = session.open(headless=False)
        try:
            page.bring_to_front()
        except Exception:
            pass
        portal = AwbPortalPage(page, loc)
        report["steps"].append({"after_open": {"url": page.url, "login": portal.is_login_page()}})
        print("AFTER_OPEN url=", page.url, "login=", portal.is_login_page())

        # Test OCR: đăng xuất nếu đang login (hoặc khi --force-logout)
        if (force or True) and not portal.is_login_page():
            force_logout(portal)
            report["steps"].append({"after_logout": {"url": page.url, "login": portal.is_login_page()}})

        print("LOGIN_FLOW start ocr=", settings.captcha_ocr)
        ok, msg = ensure_logged_in_smart(
            portal,
            username=settings.tcs_username,
            password=settings.tcs_password,
            prefer_session=settings.prefer_session,
            use_ocr=settings.captcha_ocr and settings.has_login_credentials,
            ocr_attempts=settings.captcha_ocr_attempts,
            manual_timeout_s=120,
            debug_dir=settings.screenshots_dir / "captcha",
        )
        # ascii-safe print
        print("LOGIN_RESULT ok=", ok, "msg=", msg.encode("ascii", "replace").decode("ascii"))
        report["steps"].append({"login": {"ok": ok, "msg": msg, "url": page.url, "login": portal.is_login_page()}})
        if not ok:
            report["ok"] = False
            out = settings.output_dir / f"LIVE_OCR_TEST_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print("Wrote", out)
            return 2

        print("LOOKUP", awb)
        portal.lookup_awb(awb)
        time.sleep(1.2)
        raw, norm = portal.read_normalized_status()
        shot = settings.screenshots_dir / f"ocr_test_lookup_{awb}.png"
        page.screenshot(path=str(shot), full_page=True)
        report["lookup"] = {
            "awb": awb,
            "status": norm.value,
            "raw_head": raw[:300],
            "screenshot": str(shot),
        }
        print("LOOKUP_STATUS", norm.value)
        report["ok"] = True
        out = settings.output_dir / f"LIVE_OCR_TEST_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Wrote", out)
        print("DONE_OK")
        page.wait_for_timeout(4000)
        return 0
    finally:
        try:
            session.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
