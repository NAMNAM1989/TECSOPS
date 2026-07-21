"""
Probe + thử CHỌN CHUYẾN BAY trên form KHAI BÁO ESID.

Usage:
  python scripts/live_esid_choose_flight_probe.py [FLIGHT] [YYYY-MM-DD] [DEST]
  VD: python scripts/live_esid_choose_flight_probe.py VN0773 2026-07-21 ICN

Không bấm HOÀN TẤT. Ghi artifact JSON + screenshot.
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta
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
from app.browser.pages.esid_declare_page import EsidDeclarePage
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings


def main() -> int:
    flight = (sys.argv[1] if len(sys.argv) > 1 else "VN0773").strip()
    fdate = (sys.argv[2] if len(sys.argv) > 2 else "").strip()
    dest = (sys.argv[3] if len(sys.argv) > 3 else "ICN").strip().upper()
    if not fdate:
        fdate = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    settings = load_settings()
    ensure_runtime_dirs(settings)
    out_dir = Path(settings.output_dir) / "esid_declare_probe"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))
    result: dict = {
        "flight": flight,
        "flight_date": fdate,
        "dest": dest,
        "at": stamp,
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
        result["logged_in"] = bool(ok)
        result["login_msg"] = msg
        _p("login", ok, msg)
        if not ok:
            (out_dir / f"choose_flight_{stamp}.json").write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            return 2

        declare = EsidDeclarePage(page, loc)
        declare.goto_declare_tab()
        if dest:
            declare._set_id("codFds", dest)
            page.wait_for_timeout(300)

        dump_before = page.evaluate(
            """() => {
              const btn = [...document.querySelectorAll('button,a,span')].find(n =>
                /CH[ỌO]N\\s*CHUY[ẾE]N\\s*BAY/i.test((n.innerText||'').trim())
              );
              return {
                url: location.href,
                hasBtn: !!btn,
                btnText: btn ? (btn.innerText||'').trim().slice(0,40) : null,
                flightNo: (document.getElementById('flightNo')||{}).value || '',
                datFltOri: (document.getElementById('datFltOri')||{}).value || '',
              };
            }"""
        )
        result["before"] = dump_before
        _p("before:", dump_before)

        t0 = time.time()
        cf = declare.choose_flight(flight, fdate)
        result["choose_flight"] = cf
        result["elapsed_ms"] = int((time.time() - t0) * 1000)
        _p("choose_flight:", json.dumps(cf, ensure_ascii=False, indent=2))

        modal_dump = page.evaluate(
            """() => {
              const wrap = [...document.querySelectorAll(
                '.ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal, [role=dialog]'
              )].find(el => el.getBoundingClientRect().width > 80);
              if (!wrap) return { open: false };
              const inputs = [...wrap.querySelectorAll('input')].map(i => ({
                id: i.id, ph: i.placeholder, type: i.type, value: i.value
              })).slice(0, 20);
              const rows = [...wrap.querySelectorAll('.ant-table-tbody tr, table tbody tr')]
                .slice(0, 10)
                .map(tr => (tr.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 160));
              const buttons = [...wrap.querySelectorAll('button')].map(b =>
                (b.innerText||'').trim().slice(0, 40)
              ).filter(Boolean).slice(0, 15);
              const headers = [...wrap.querySelectorAll('th, .ant-table-thead th')]
                .map(th => (th.innerText||'').trim()).filter(Boolean).slice(0, 12);
              return { open: true, inputs, rows, buttons, headers };
            }"""
        )
        result["modal"] = modal_dump
        _p("modal:", json.dumps(modal_dump, ensure_ascii=False)[:800])

        shot = out_dir / f"choose_flight_{stamp}.png"
        try:
            page.screenshot(path=str(shot), full_page=False)
            result["screenshot"] = str(shot)
        except Exception as e:
            result["screenshot_error"] = str(e)[:200]

        path = out_dir / f"choose_flight_{stamp}.json"
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        _p("wrote", path)
        _p(
            "OK" if cf.get("ok") else "PARTIAL/FAIL",
            "date_ok=",
            cf.get("date_ok"),
            "flight_ok=",
            cf.get("flight_ok"),
        )
        return 0 if cf.get("ok") else 1
    finally:
        try:
            session.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
