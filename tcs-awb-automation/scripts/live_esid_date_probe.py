"""Probe form lọc ngày trên Danh sách ESID (dùng profile agent — tắt agent trước nếu lock)."""
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


PROBE_JS = """() => {
  const pickers = [...document.querySelectorAll(
    'input, .ant-picker, .ant-picker-input input, [class*="date"], [placeholder]'
  )].slice(0, 80).map(el => {
    const tag = el.tagName;
    const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 120) : '';
    return {
      tag,
      type: el.getAttribute('type') || '',
      id: el.id || '',
      name: el.getAttribute('name') || '',
      placeholder: el.getAttribute('placeholder') || '',
      value: (el.value || el.getAttribute('value') || '').toString().slice(0, 40),
      cls,
      text: (el.innerText || '').trim().slice(0, 60),
    };
  });
  const labels = [...document.querySelectorAll('label, .ant-form-item-label, th, span')]
    .map(el => (el.innerText || '').trim().replace(/\\s+/g, ' '))
    .filter(t => t && /ngày|date|từ|đến|from|to|flight|esid|awb/i.test(t))
    .slice(0, 40);
  const buttons = [...document.querySelectorAll('button')]
    .map(b => (b.innerText || '').trim().replace(/\\s+/g, ' '))
    .filter(Boolean)
    .slice(0, 30);
  const rows = [...document.querySelectorAll('table tbody tr, .ant-table-tbody tr')].length;
  return {
    url: location.href,
    title: document.title,
    pickers,
    labels,
    buttons,
    rowCount: rows,
  };
}"""


def main() -> int:
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
            manual_timeout_s=60,
            debug_dir=settings.screenshots_dir / "captcha",
        )
        print("login_ok=", ok, msg.encode("ascii", "replace").decode("ascii"))
        if not ok:
            return 2
        esid = EsidListPage(page, loc)
        esid.goto_list(force=True)
        page.wait_for_timeout(800)
        data = page.evaluate(PROBE_JS)
        shot = settings.screenshots_dir / f"esid_date_probe_{datetime.now().strftime('%H%M%S')}.png"
        page.screenshot(path=str(shot), full_page=True)
        out = settings.output_dir / f"ESID_DATE_PROBE_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        payload = {"probe": data, "screenshot": str(shot)}
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print("url=", data.get("url"))
        print("rows=", data.get("rowCount"))
        print("buttons=", data.get("buttons"))
        print("labels=", data.get("labels"))
        for p in data.get("pickers") or []:
            if any(
                k in json.dumps(p, ensure_ascii=False).lower()
                for k in ("date", "ngày", "picker", "from", "to", "từ", "đến", "dd", "mm", "yyyy")
            ) or p.get("type") == "date":
                print("PICKER=", json.dumps(p, ensure_ascii=False))
        print("Wrote", out)
        print("shot=", shot)
        return 0
    finally:
        try:
            session.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
