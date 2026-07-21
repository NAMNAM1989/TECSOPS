"""
Live: điền khối vận hành ESID (AWB/dest/pcs/HAWB/goods/payment + CHỌN CHUYẾN BAY).
Không HOÀN TẤT.

Usage:
  python scripts/live_esid_ops_fill_test.py [AWB11] [FLIGHT] [YYYY-MM-DD] [DEST] [PCS]
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass

from app.browser.locators import LocatorsConfig, locators_path
from app.browser.login_assist import ensure_logged_in_smart
from app.browser.pages.awb_page import AwbPortalPage
from app.browser.pages.esid_declare_page import EsidDeclarePage
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings


def main() -> int:
    awb = (sys.argv[1] if len(sys.argv) > 1 else "73807183999").strip()
    flight = (sys.argv[2] if len(sys.argv) > 2 else "VN0773").strip()
    fdate = (sys.argv[3] if len(sys.argv) > 3 else "").strip() or datetime.now().strftime(
        "%Y-%m-%d"
    )
    dest = (sys.argv[4] if len(sys.argv) > 4 else "ICN").strip().upper()
    pcs = int(sys.argv[5] if len(sys.argv) > 5 else "2")

    settings = load_settings()
    ensure_runtime_dirs(settings)
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    out_dir = Path(settings.output_dir) / "esid_declare_probe"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    data = {
        "awb": awb,
        "flight_no": flight,
        "flight_date": fdate,
        "dest": dest,
        "pcs": pcs,
        "total_hawbs": 0,
        "nature_of_goods": "GARMENT",
        "payment_mode": "Chuyển khoản/Bank transfer",
        "choose_flight": True,
        "tecs_warehouse": True,
        "registrant_name": "TEST REG",
        "registrant_tel": "0900000000",
        "registrant_cccd": "001122334455",
    }

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
        print("login", ok, msg, flush=True)
        if not ok:
            return 2

        # Dump payment options
        declare = EsidDeclarePage(page, loc)
        declare.goto_declare_tab()
        pay_opts = []
        try:
            page.locator("#codPayMod").first.click(timeout=2000)
            page.wait_for_timeout(400)
            pay_opts = page.evaluate(
                """() => [...document.querySelectorAll(
                  '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
                )].map(e => (e.innerText||'').trim()).filter(Boolean).slice(0, 12)"""
            )
            page.keyboard.press("Escape")
        except Exception as e:
            pay_opts = [f"err:{e}"]
        print("payment_options", pay_opts, flush=True)

        result = declare.fill_declare(data, submit=False)
        result["payment_options"] = pay_opts
        path = out_dir / f"ops_fill_{stamp}.json"
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            page.screenshot(path=str(out_dir / f"ops_fill_{stamp}.png"), full_page=False)
        except Exception:
            pass
        print(json.dumps({"ok": result.get("ok"), "fills": result.get("fills"), "values": result.get("values"), "warnings": result.get("warnings")}, ensure_ascii=False, indent=2), flush=True)
        print("wrote", path, flush=True)

        vals = result.get("values") or {}
        need = {
            "codAwbPfx": awb[:3],
            "codAwbNum": awb[3:],
            "qtyPcs": str(pcs),
            "totalOfHawbs": "0",
            "natureOfGoods": "GARMENT",
        }
        bad = []
        for k, expect in need.items():
            got = str(vals.get(k) or "")
            if expect not in got and got != expect:
                bad.append(f"{k}={got!r} want {expect!r}")
        if not vals.get("flightNo"):
            bad.append("flightNo empty")
        if not vals.get("datFltOri"):
            bad.append("datFltOri empty")
        if not (vals.get("codFds") or "").upper().startswith(dest[:1]):
            # dest may show as ICN or name
            if dest not in str(vals.get("codFds") or "").upper():
                bad.append(f"dest={vals.get('codFds')!r}")
        print("CHECK", "OK" if not bad else "FAIL", bad, flush=True)
        return 0 if not bad else 1
    finally:
        try:
            session.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
