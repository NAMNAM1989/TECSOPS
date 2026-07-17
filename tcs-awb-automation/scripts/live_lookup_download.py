"""LOOKUP + DOWNLOAD thật với session đã login (persistent profile)."""
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
from app.services.download_service import build_document_filename, verify_download


def main() -> int:
    wait_login = 300
    awbs: list[str] = []
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--wait-login" and i + 1 < len(args):
            wait_login = int(args[i + 1])
            i += 2
            continue
        if args[i].strip():
            awbs.append(args[i].strip())
        i += 1
    if not awbs:
        awbs = ["23218276495", "23218276370"]
    settings = load_settings()
    ensure_runtime_dirs(settings)
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    print("awb_lookup.confirmed =", loc.awb_lookup_confirmed, "mode =", (loc.data.get("awb_lookup") or {}).get("awb_mode"))

    session = BrowserSession(settings)
    results = []
    page = None
    try:
        page = session.open(headless=False)
        try:
            page.bring_to_front()
        except Exception:
            pass
        portal = AwbPortalPage(page, loc)
        print(
            "URL=",
            page.url,
            "LOGIN=",
            portal.is_login_page(),
            "prefer_session=",
            settings.prefer_session,
            "ocr=",
            settings.captcha_ocr,
        )
        if portal.is_login_page():
            print("Cách 1: session hết → Cách 2: OCR CAPTCHA (nếu bật) → fallback tay")
            ok, msg = ensure_logged_in_smart(
                portal,
                username=settings.tcs_username,
                password=settings.tcs_password,
                prefer_session=settings.prefer_session,
                use_ocr=settings.captcha_ocr and settings.has_login_credentials,
                ocr_attempts=settings.captcha_ocr_attempts,
                manual_timeout_s=wait_login,
                debug_dir=settings.screenshots_dir / "captcha",
            )
            print(msg)
            if not ok:
                print("TIMEOUT login")
                return 2
            print("LOGIN_OK url=", page.url)
        else:
            print("LOGIN_OK (session) url=", page.url)

        for awb in awbs:
            digits = "".join(c for c in awb if c.isdigit())[:11]
            item = {"awb": digits, "status": "", "raw": "", "file": "", "error": ""}
            try:
                portal.lookup_awb(digits)
                time.sleep(1.5)
                # dump buttons after lookup
                dump = page.evaluate(
                    """() => [...document.querySelectorAll('button,a,[role=button]')]
                      .slice(0,60).map(el => ({
                        tag: el.tagName,
                        id: el.id||null,
                        text: (el.innerText||'').trim().slice(0,60),
                        href: el.getAttribute('href')
                      }))"""
                )
                shot = settings.screenshots_dir / f"lookup_{digits}_{datetime.now().strftime('%H%M%S')}.png"
                page.screenshot(path=str(shot), full_page=True)
                item["screenshot"] = str(shot)
                item["buttons"] = dump
                raw, norm = portal.read_normalized_status()
                item["raw"] = raw[:800]
                item["status"] = norm.value
                print(f"\n=== {digits} → {norm.value} ===")
                print("buttons:", [(b.get("text"), b.get("id")) for b in dump if (b.get("text") or "").strip()][:20])

                # cập nhật download_button nếu thấy nút tải thật (tránh khớp "Đăng Xuất")
                for b in dump:
                    t = (b.get("text") or "").lower().strip()
                    if any(bad in t for bad in ("đăng xuất", "dang xuat", "logout")):
                        continue
                    if any(k in t for k in ("tải pdf", "tải xuống", "download", "xuất pdf", "in phiếu")):
                        name = (b.get("text") or "").strip().split("\n")[0][:40]
                        if name:
                            loc.data.setdefault("awb_lookup", {})["download_button"] = {
                                "by": "role",
                                "role": "button",
                                "name": name,
                            }
                            loc.save()
                            portal.locators = loc
                            print("updated download_button=", name)
                            break

                if norm.value in {"COMPLETED", "RECEPTION_COMPLETED"}:
                    fname = build_document_filename(digits, "AWB")
                    fpath = settings.output_dir / "docs" / fname
                    try:
                        portal.download_document(fpath)
                        if verify_download(fpath):
                            item["file"] = str(fpath)
                            print("PDF OK", fpath, fpath.stat().st_size)
                        else:
                            item["error"] = "empty pdf"
                    except Exception as e:
                        item["error"] = f"download: {e}"
                        html_path = settings.output_dir / "docs" / f"{digits}_result.html"
                        html_path.write_text(page.content(), encoding="utf-8")
                        item["html"] = str(html_path)
                        print("download fail, saved html", html_path)
                else:
                    print("skip PDF — status", norm.value)
                    # vẫn thử mở tab phiếu để ghi nhận nút (không bắt buộc tải)
                    try:
                        portal.open_arrival_notice_tab()
                        time.sleep(1)
                        dump2 = page.evaluate(
                            """() => [...document.querySelectorAll('button,a,[role=button]')]
                              .map(el => (el.innerText||'').trim()).filter(Boolean).slice(0,30)"""
                        )
                        item["arrival_tab_buttons"] = dump2
                        print("arrival tab buttons:", dump2[:15])
                        shot2 = settings.screenshots_dir / f"arrival_{digits}_{datetime.now().strftime('%H%M%S')}.png"
                        page.screenshot(path=str(shot2), full_page=True)
                        item["arrival_screenshot"] = str(shot2)
                    except Exception as e:
                        print("arrival tab:", e)
            except Exception as e:
                item["error"] = str(e)
                print("ERR", digits, e)
            results.append(item)

        out = settings.output_dir / f"LIVE_LOOKUP_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        print("\nWrote", out)
        return 0
    finally:
        if page is not None:
            try:
                page.wait_for_timeout(5000)
            except Exception:
                pass
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
