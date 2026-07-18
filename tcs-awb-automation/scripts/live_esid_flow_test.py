"""Live: PDF ESID (danh sách → AWB# → IN → Save PDF) + In ESID (hộp thoại)."""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.browser.locators import LocatorsConfig, locators_path
from app.browser.login_assist import ensure_logged_in_smart
from app.browser.pages.awb_page import AwbPortalPage
from app.browser.pages.esid_page import EsidListPage
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings
from app.services.download_service import build_document_filename, verify_download


def main() -> int:
    awb = "".join(c for c in (sys.argv[1] if len(sys.argv) > 1 else "23218276370") if c.isdigit())[:11]
    mode = (sys.argv[2] if len(sys.argv) > 2 else "pdf").lower()
    session_date = sys.argv[3] if len(sys.argv) > 3 else "2026-07-17"
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
            ocr_attempts=settings.captcha_ocr_attempts,
            manual_timeout_s=90,
            debug_dir=settings.screenshots_dir / "captcha",
        )
        print("login", ok, msg, f"{time.perf_counter()-t0:.1f}s", flush=True)
        if not ok:
            return 2
        esid = EsidListPage(page, loc)
        if mode == "print":
            print("step PRINT: list → AWB# → IN → dialog", flush=True)
            esid.click_in_for_user_print(awb, session_date=session_date)
            print("PRINT_DIALOG_OPEN", f"{time.perf_counter()-t0:.1f}s", flush=True)
            print("DONE_OK", flush=True)
            time.sleep(6)
            return 0
        fpath = settings.output_dir / "docs" / build_document_filename(awb, "ESID")
        print("step PDF: list → AWB# last8 → scroll IN → Save PDF", awb[3:], "→", fpath, flush=True)
        path = esid.download_awb_pdf(awb, fpath, session_date=session_date)
        ok_pdf = verify_download(path)
        print(
            "pdf_ok",
            ok_pdf,
            "size",
            path.stat().st_size if path.exists() else 0,
            path,
            flush=True,
        )
        print("DONE_OK" if ok_pdf else "DONE_FAIL", f"{time.perf_counter()-t0:.1f}s", flush=True)
        return 0 if ok_pdf else 1
    finally:
        try:
            session.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
