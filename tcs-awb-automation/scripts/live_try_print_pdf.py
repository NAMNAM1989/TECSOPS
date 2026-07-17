"""LOOKUP 1 AWB → tab PHIẾU → bấm IN thử lấy PDF (kể cả khi chưa COMPLETED)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.browser.locators import LocatorsConfig, locators_path
from app.browser.pages.awb_page import AwbPortalPage
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings
from app.services.download_service import build_document_filename, verify_download


def main() -> int:
    awb = "".join(c for c in (sys.argv[1] if len(sys.argv) > 1 else "23218276495") if c.isdigit())[:11]
    settings = load_settings()
    ensure_runtime_dirs(settings)
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    session = BrowserSession(settings)
    try:
        page = session.open(headless=False)
        portal = AwbPortalPage(page, loc)
        if portal.is_login_page():
            print("NEEDS_LOGIN — đăng nhập rồi chạy lại")
            return 2
        print("LOGIN_OK", page.url)
        portal.lookup_awb(awb)
        raw, norm = portal.read_normalized_status()
        print("status", norm.value, raw[:200].replace("\n", " | "))
        fpath = settings.output_dir / "docs" / build_document_filename(awb, "AWB")
        try:
            portal.download_document(fpath, timeout_ms=45000)
            ok = verify_download(fpath)
            print("PDF", "OK" if ok else "EMPTY", fpath, fpath.stat().st_size if fpath.exists() else 0)
            return 0 if ok else 3
        except Exception as e:
            print("PDF_FAIL", e)
            shot = settings.screenshots_dir / f"print_fail_{awb}.png"
            page.screenshot(path=str(shot), full_page=True)
            print("shot", shot)
            return 4
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
