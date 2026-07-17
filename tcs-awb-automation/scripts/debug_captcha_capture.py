"""Mở login, chụp CAPTCHA, OCR thử nhiều cách, giữ Chrome mở."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.browser.captcha_ocr import (
    capture_captcha_image,
    find_captcha_image_locator,
    normalize_captcha_text,
    ocr_image_bytes,
    solve_captcha_from_page,
)
from app.browser.pages.awb_page import AwbPortalPage
from app.browser.locators import LocatorsConfig, locators_path
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings


def main() -> int:
    settings = load_settings()
    ensure_runtime_dirs(settings)
    debug = settings.screenshots_dir / "captcha"
    debug.mkdir(parents=True, exist_ok=True)
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    session = BrowserSession(settings)
    page = session.open(headless=False)
    page.goto("https://www.tcs.com.vn/AwbLogin", wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    portal = AwbPortalPage(page, loc)
    print("url", page.url, "login", portal.is_login_page())

    # dump imgs
    infos = page.evaluate(
        """() => [...document.querySelectorAll('img,canvas')].map(el => ({
          tag: el.tagName,
          id: el.id||null,
          src: (el.getAttribute('src')||'').slice(0,120),
          w: el.width||el.clientWidth,
          h: el.height||el.clientHeight,
          cls: el.className
        }))"""
    )
    print("images", infos)

    target = find_captcha_image_locator(page)
    print("target", target)
    path = debug / "debug_captcha.png"
    data = capture_captcha_image(page, path)
    print("saved", path, "bytes", len(data))
    text = ocr_image_bytes(data)
    print("ocr", text)

    # also try full form screenshot region
    try:
        form = page.locator("form#basic, form").first
        form_path = debug / "debug_form.png"
        form.screenshot(path=str(form_path))
        print("form shot", form_path)
    except Exception as e:
        print("form shot fail", e)

    print("solve", solve_captcha_from_page(page, debug_dir=debug))
    page.wait_for_timeout(8000)
    session.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
