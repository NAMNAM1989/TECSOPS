"""
Dry-run: mở KHAI BÁO ESID → điền vài field từ Ops-like payload → KHÔNG bấm HOÀN TẤT / không tick đồng ý.

Usage:
  python scripts/live_esid_declare_dryfill.py [AWB11] [FLIGHT] [DEST] [PCS]
  VD: python scripts/live_esid_declare_dryfill.py 73807183061 VN0773 ICN 2
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass


def _p(*args: object) -> None:
    try:
        print(*args, flush=True)
    except UnicodeEncodeError:
        print(*(str(a).encode("ascii", "replace").decode("ascii") for a in args), flush=True)


from app.browser.locators import LocatorsConfig, locators_path
from app.browser.login_assist import ensure_logged_in_smart
from app.browser.pages.awb_page import AwbPortalPage
from app.browser.pages.esid_page import EsidListPage
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings

ESID_HOME = "https://www.tcs.com.vn/Esid/Export"


def _click_declare_tab(page) -> bool:
    try:
        tab = page.get_by_role("tab", name=re.compile(r"KHAI\s*BÁO\s*ESID", re.I))
        if tab.count() > 0 and tab.first.is_visible(timeout=500):
            tab.first.click(timeout=3000)
            page.wait_for_timeout(700)
            return True
    except Exception:
        pass
    try:
        ok = page.evaluate(
            """() => {
              const nodes = [...document.querySelectorAll('.ant-tabs-tab, [role=tab]')];
              const el = nodes.find(n => /KHAI\\s*B[ÁA]O\\s*ESID/i.test((n.innerText||'').trim()));
              if (!el) return false;
              el.click();
              return true;
            }"""
        )
        if ok:
            page.wait_for_timeout(700)
            return True
    except Exception:
        pass
    return False


def _set(page, eid: str, value: str) -> bool:
    loc = page.locator(f"#{eid}")
    try:
        if loc.count() == 0 or not loc.first.is_visible(timeout=1500):
            return False
        EsidListPage._set_react_input(loc, value)
        got = ""
        try:
            got = (loc.first.input_value(timeout=400) or "").strip()
        except Exception:
            pass
        return got == str(value) or bool(got)
    except Exception as e:
        _p("  set fail", eid, e)
        return False


def _read_values(page, ids: list[str]) -> dict[str, str]:
    return page.evaluate(
        """(ids) => {
          const out = {};
          for (const id of ids) {
            const el = document.getElementById(id);
            out[id] = el ? String(el.value || '') : null;
          }
          return out;
        }""",
        ids,
    )


def main() -> int:
    awb = "".join(c for c in (sys.argv[1] if len(sys.argv) > 1 else "73807183061") if c.isdigit())[:11]
    flight = sys.argv[2] if len(sys.argv) > 2 else "VN0773"
    dest = (sys.argv[3] if len(sys.argv) > 3 else "ICN").upper()
    pcs = sys.argv[4] if len(sys.argv) > 4 else "2"
    if len(awb) != 11:
        _p("BAD_AWB", awb)
        return 2

    prefix, last8 = awb[:3], awb[3:]
    settings = load_settings()
    ensure_runtime_dirs(settings)
    out_dir = settings.output_dir / "esid_declare_probe"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))

    session = BrowserSession(settings)
    t0 = time.perf_counter()
    result: dict = {
        "stamp": stamp,
        "awb": awb,
        "flight": flight,
        "dest": dest,
        "pcs": pcs,
        "submitted": False,
        "fills": {},
    }

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
        _p("login", ok, msg)
        if not ok:
            return 2

        page.goto(ESID_HOME, wait_until="commit", timeout=20000)
        try:
            page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        page.wait_for_timeout(400)
        if not _click_declare_tab(page):
            _p("NO_DECLARE_TAB")
            return 1
        page.wait_for_timeout(500)

        # Chờ form (ô AWB)
        page.locator("#codAwbNum").first.wait_for(state="visible", timeout=10000)

        plan = [
            ("codAwbPfx", prefix),
            ("codAwbNum", last8),
            ("flightNo", flight),
            ("qtyPcs", pcs),
            ("destinationName", dest),
            ("addressShp", "TECS DRY-RUN ADDRESS — DO NOT SUBMIT"),
            ("natureOfGoods", "GENERAL CARGO DRY-RUN"),
            ("telShp", "0900000000"),
            ("emailShp", "dryrun@tecs.local"),
        ]
        for eid, val in plan:
            ok_set = _set(page, eid, val)
            result["fills"][eid] = {"value": val, "ok": ok_set}
            _p("fill", eid, ok_set, val)

        # Thử gõ dest code vào combobox #codFds nếu destinationName không đủ
        try:
            fds = page.locator("#codFds")
            if fds.count() > 0 and fds.first.is_visible(timeout=400):
                fds.first.click()
                fds.first.fill(dest)
                page.wait_for_timeout(400)
                # chọn option đầu nếu có
                opt = page.locator(".ant-select-item-option-content").filter(
                    has_text=re.compile(dest, re.I)
                )
                if opt.count() > 0:
                    opt.first.click(timeout=2000)
                    result["fills"]["codFds_select"] = {"value": dest, "ok": True}
                    _p("fill codFds select", dest)
        except Exception as e:
            result["fills"]["codFds_select"] = {"ok": False, "error": str(e)[:120]}

        ids = [p[0] for p in plan] + ["codFds", "originName", "agreeConfirm"]
        values = _read_values(page, ids)
        result["values_after"] = values
        _p("values_after", json.dumps(values, ensure_ascii=False))

        # Đảm bảo chưa tick đồng ý / chưa bấm HOÀN TẤT
        try:
            agree = page.locator("#agreeConfirm")
            if agree.count() > 0 and agree.first.is_checked():
                agree.first.uncheck(force=True)
        except Exception:
            pass
        result["hoan_tat_clicked"] = False
        result["agree_checked"] = False

        shot = out_dir / f"03_dryfill_{stamp}.png"
        page.screenshot(path=str(shot), full_page=True)
        result["screenshot"] = str(shot)
        result["elapsed_s"] = round(time.perf_counter() - t0, 1)
        report = out_dir / f"dryfill_{stamp}.json"
        report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        _p("REPORT", report)
        _p("SCREENSHOT", shot)
        ok_core = all(result["fills"].get(k, {}).get("ok") for k in ("codAwbPfx", "codAwbNum", "qtyPcs"))
        _p("DONE_OK" if ok_core else "DONE_PARTIAL")
        page.wait_for_timeout(6000)
        return 0 if ok_core else 1
    except Exception as e:
        result["error"] = str(e)[:400]
        (out_dir / f"dryfill_{stamp}.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        _p("DONE_FAIL", e)
        return 3
    finally:
        try:
            session.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
