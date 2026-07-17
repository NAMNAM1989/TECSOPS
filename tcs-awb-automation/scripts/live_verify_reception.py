"""LOOKUP AWB thật → kỳ vọng RECEPTION_COMPLETED (+ PDF nếu DOWNLOAD)."""
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
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings
from app.services.awb_service import has_reception_completed, map_tcs_status_to_normalized
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
            prefer_session=settings.prefer_session,
            use_ocr=settings.captcha_ocr and settings.has_login_credentials,
            ocr_attempts=settings.captcha_ocr_attempts,
            manual_timeout_s=90,
            debug_dir=settings.screenshots_dir / "captcha",
        )
        print("login_ok=", ok, "msg=", msg.encode("ascii", "replace").decode("ascii"))
        if not ok:
            return 2
        portal.lookup_awb(awb)
        raw, norm = portal.read_normalized_status()
        mapped = map_tcs_status_to_normalized(raw)
        print("status=", norm.value, "mapped=", mapped.value)
        print("has_reception=", has_reception_completed(raw))
        print("raw_head=", raw[:280].replace("\n", " | ").encode("ascii", "replace").decode("ascii"))
        report = {
            "awb": awb,
            "status": norm.value,
            "has_reception": has_reception_completed(raw),
            "raw_head": raw[:500],
            "pdf": "",
        }
        if norm.value in {"RECEPTION_COMPLETED", "COMPLETED"}:
            fpath = settings.output_dir / "docs" / build_document_filename(awb, "AWB")
            try:
                portal.download_document(fpath)
                report["pdf"] = str(fpath) if verify_download(fpath) else "empty"
                print("pdf=", report["pdf"], "size=", fpath.stat().st_size if fpath.exists() else 0)
            except Exception as e:
                report["pdf_error"] = str(e)
                print("pdf_fail=", e)
        out = settings.output_dir / f"LIVE_RECEPTION_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Wrote", out)
        ok_status = norm.value == "RECEPTION_COMPLETED"
        print("DONE_OK" if ok_status else "DONE_UNEXPECTED_STATUS")
        return 0 if ok_status else 3
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
