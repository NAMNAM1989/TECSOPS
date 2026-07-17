"""Live: Danh sách ESID → AWB# 8 số → dòng Hoàn thành tiếp nhận → IN → PDF."""
from __future__ import annotations

import json
import sys
from datetime import datetime
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
    awb = "".join(c for c in (sys.argv[1] if len(sys.argv) > 1 else "23218276495") if c.isdigit())[:11]
    settings = load_settings()
    ensure_runtime_dirs(settings)
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    session = BrowserSession(settings)
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
        print("login_ok=", ok)
        if not ok:
            return 2

        esid = EsidListPage(page, loc)
        raw, status = esid.read_reception_status(awb)
        print("lookup_status=", status.value)
        print("raw=", raw.encode("ascii", "replace").decode("ascii"))

        fpath = settings.output_dir / "docs" / build_document_filename(awb, "ESID")
        try:
            esid.download_awb_pdf(awb, fpath)
            ok_pdf = verify_download(fpath)
            print("pdf_ok=", ok_pdf, "path=", fpath, "size=", fpath.stat().st_size if fpath.exists() else 0)
        except Exception as e:
            print("pdf_fail=", e)
            shot = settings.screenshots_dir / f"esid_fail_{awb}.png"
            try:
                page.screenshot(path=str(shot), full_page=True)
                print("shot=", shot)
            except Exception:
                pass
            ok_pdf = False

        out = settings.output_dir / f"LIVE_ESID_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        out.write_text(
            json.dumps(
                {
                    "awb": awb,
                    "last8": awb[3:],
                    "status": status.value,
                    "raw": raw,
                    "pdf": str(fpath) if ok_pdf else "",
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print("Wrote", out)
        print("DONE_OK" if ok_pdf else "DONE_FAIL")
        page.wait_for_timeout(3000)
        return 0 if ok_pdf else 3
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
