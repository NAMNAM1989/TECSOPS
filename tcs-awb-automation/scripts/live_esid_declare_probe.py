"""
Live probe: tab «Khai báo ESID» trên TCS — capture DOM, KHÔNG submit.

Chạy khi agent đang giữ Chrome:
  1) POST /session/close (giữ cookie trong browser_profile)
  2) python scripts/live_esid_declare_probe.py
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
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
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
from app.browser.session import BrowserSession
from app.config import ensure_runtime_dirs, load_settings

ESID_HOME = "https://www.tcs.com.vn/Esid/Export"

FORM_CAPTURE_JS = """() => {
  const abs = (el) => {
    if (!el) return null;
    const parts = [];
    let cur = el;
    for (let i = 0; i < 6 && cur && cur.nodeType === 1; i++) {
      let p = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift('#' + cur.id); break; }
      const cls = (cur.className && typeof cur.className === 'string')
        ? cur.className.trim().split(/\\s+/).slice(0, 2).join('.')
        : '';
      if (cls) p += '.' + cls;
      parts.unshift(p);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };
  const labelFor = (el) => {
    const item = el.closest('.ant-form-item');
    if (item) {
      const lab = item.querySelector('label');
      if (lab) return (lab.innerText || '').trim().slice(0, 120);
    }
    const id = el.id;
    if (id) {
      const lab = document.querySelector(`label[for="${id}"]`);
      if (lab) return (lab.innerText || '').trim().slice(0, 120);
    }
    return (el.getAttribute('aria-label') || el.placeholder || el.name || '').slice(0, 120);
  };
  const fields = [...document.querySelectorAll('input,select,textarea')]
    .filter(el => {
      const t = (el.getAttribute('type') || '').toLowerCase();
      if (t === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .slice(0, 80)
    .map(el => ({
      tag: el.tagName,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.id || null,
      placeholder: el.getAttribute('placeholder'),
      value: String(el.value || '').slice(0, 80),
      label: labelFor(el),
      role: el.getAttribute('role'),
      disabled: !!el.disabled,
      path: abs(el),
    }));
  const buttons = [...document.querySelectorAll('button,a,[role="button"]')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .slice(0, 40)
    .map(el => ({
      tag: el.tagName,
      text: (el.innerText || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
      type: el.getAttribute('type'),
      class: (el.className || '').toString().slice(0, 80),
      id: el.id || null,
    }));
  const tabs = [...document.querySelectorAll(
    '.ant-tabs-tab, [role="tab"], .ant-menu-item, a'
  )]
    .map(el => (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 80))
    .filter(t => /esid|khai|danh\\s*sách|dang\\s*ky|đăng\\s*ký/i.test(t))
    .slice(0, 20);
  const formIds = [...document.querySelectorAll('form')].map(f => f.id || f.className).slice(0, 10);
  return {
    url: location.href,
    title: document.title,
    tabs,
    formIds,
    fields,
    buttons,
    bodySample: (document.body?.innerText || '').slice(0, 2500),
  };
}"""


def _click_declare_tab(page) -> bool:
    """Bấm tab/menu «Khai báo ESID». True nếu click được."""
    patterns = [
        re.compile(r"KHAI\s*BÁO\s*ESID", re.I),
        re.compile(r"Khai\s*báo\s*ESID", re.I),
        re.compile(r"KHAI\s*BAO\s*ESID", re.I),
    ]
    for pat in patterns:
        for role in ("tab", "menuitem", "link", "button"):
            try:
                loc = page.get_by_role(role, name=pat)
                if loc.count() > 0 and loc.first.is_visible(timeout=400):
                    loc.first.click(timeout=3000)
                    page.wait_for_timeout(600)
                    return True
            except Exception:
                pass
        try:
            loc = page.get_by_text(pat)
            if loc.count() > 0:
                for i in range(min(loc.count(), 6)):
                    el = loc.nth(i)
                    try:
                        if el.is_visible(timeout=300):
                            el.click(timeout=3000)
                            page.wait_for_timeout(600)
                            return True
                    except Exception:
                        continue
        except Exception:
            pass
    # JS fallback — tìm text trong DOM
    try:
        ok = page.evaluate(
            """() => {
              const nodes = [...document.querySelectorAll(
                '.ant-tabs-tab, [role=tab], .ant-menu-item, a, button, span, div'
              )];
              const el = nodes.find(n => {
                const t = (n.innerText || '').trim();
                return /^KHAI\\s*B[ÁA]O\\s*ESID$/i.test(t)
                  || /^Khai\\s*báo\\s*ESID$/i.test(t)
                  || (t.length < 40 && /khai\\s*b[áa]o\\s*esid/i.test(t));
              });
              if (!el) return false;
              el.scrollIntoView({ block: 'center' });
              el.click();
              return true;
            }"""
        )
        if ok:
            page.wait_for_timeout(800)
            return True
    except Exception:
        pass
    return False


def main() -> int:
    settings = load_settings()
    ensure_runtime_dirs(settings)
    out_dir = settings.output_dir / "esid_declare_probe"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    loc = LocatorsConfig.load(locators_path(settings.discovery_dir))

    session = BrowserSession(settings)
    t0 = time.perf_counter()
    report: dict = {"stamp": stamp, "steps": []}

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
        report["login"] = {"ok": ok, "message": msg}
        _p("login", ok, msg)
        if not ok:
            (out_dir / f"report_{stamp}.json").write_text(
                json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            return 2

        # 1) List page baseline
        page.goto(ESID_HOME, wait_until="commit", timeout=20000)
        try:
            page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        page.wait_for_timeout(500)
        shot_list = out_dir / f"01_list_{stamp}.png"
        page.screenshot(path=str(shot_list), full_page=True)
        list_cap = page.evaluate(FORM_CAPTURE_JS)
        report["steps"].append(
            {"name": "list", "url": page.url, "screenshot": str(shot_list), "capture": list_cap}
        )
        _p("list url", page.url, "tabs", list_cap.get("tabs"))

        # 2) Click Khai báo ESID
        clicked = _click_declare_tab(page)
        report["declare_tab_clicked"] = clicked
        _p("declare_tab_clicked", clicked)
        page.wait_for_timeout(800)
        # Chờ URL hoặc form đổi
        try:
            page.wait_for_function(
                """() => {
                  const t = (document.body && document.body.innerText) || '';
                  const u = location.href.toLowerCase();
                  return /khai\\s*b[áa]o/i.test(t)
                    || /create|declare|declareesid|esid\\/create|export\\/create/i.test(u)
                    || document.querySelectorAll('form input, .ant-form input').length >= 5;
                }""",
                timeout=8000,
            )
        except Exception:
            pass

        shot_declare = out_dir / f"02_declare_{stamp}.png"
        page.screenshot(path=str(shot_declare), full_page=True)
        declare_cap = page.evaluate(FORM_CAPTURE_JS)
        report["steps"].append(
            {
                "name": "declare",
                "url": page.url,
                "screenshot": str(shot_declare),
                "capture": declare_cap,
            }
        )
        _p("declare url", page.url)
        _p("fields", len(declare_cap.get("fields") or []))
        for f in (declare_cap.get("fields") or [])[:25]:
            _p(
                "  FIELD",
                (f.get("label") or "")[:40],
                "|",
                f.get("id") or f.get("name") or f.get("placeholder"),
                "|",
                f.get("type"),
            )
        _p("buttons:")
        for b in (declare_cap.get("buttons") or [])[:20]:
            if b.get("text"):
                _p("  BTN", b.get("text")[:60])

        # 3) Gợi ý locator thô
        suggested = _suggest_declare_locators(declare_cap)
        report["suggested_locators"] = suggested
        loc_path = settings.discovery_dir / "esid_declare_suggested.json"
        loc_path.write_text(json.dumps(suggested, ensure_ascii=False, indent=2), encoding="utf-8")
        _p("suggested ->", loc_path)

        report_path = out_dir / f"report_{stamp}.json"
        report["elapsed_s"] = round(time.perf_counter() - t0, 1)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        _p("REPORT", report_path)
        _p("DONE_OK" if clicked or (declare_cap.get("fields") or []) else "DONE_PARTIAL")

        # Giữ Chrome ~8s để quan sát tay
        page.wait_for_timeout(8000)
        return 0 if clicked else 1
    except Exception as e:
        report["error"] = str(e)[:500]
        try:
            (out_dir / f"report_{stamp}.json").write_text(
                json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception:
            pass
        _p("DONE_FAIL", e)
        return 3
    finally:
        try:
            session.close()
        except Exception:
            pass


def _suggest_declare_locators(cap: dict) -> dict:
    fields = cap.get("fields") or []
    buttons = cap.get("buttons") or []
    by_label: dict[str, dict] = {}
    for f in fields:
        lab = (f.get("label") or f.get("placeholder") or "").strip()
        if not lab:
            continue
        key = lab.lower()
        ref = None
        if f.get("id"):
            ref = {"by": "id", "value": f["id"]}
        elif f.get("placeholder"):
            ref = {"by": "placeholder", "value": f["placeholder"]}
        elif f.get("name"):
            ref = {"by": "css", "value": f'[name="{f["name"]}"]'}
        if ref:
            by_label[key[:60]] = {"label": lab, "locator": ref, "type": f.get("type")}

    submit = None
    for b in buttons:
        t = (b.get("text") or "").strip()
        if re.search(r"LƯU|LUU|GỬI|GUI|SUBMIT|ĐĂNG\s*KÝ|DANG\s*KY|TẠO|TAO", t, re.I):
            submit = {"by": "role", "role": "button", "name": t[:40]}
            break

    return {
        "confirmed": False,
        "home_url": cap.get("url") or ESID_HOME,
        "tab": {"by": "text", "value": "KHAI BÁO ESID"},
        "fields_by_label": by_label,
        "submit": submit,
        "field_count": len(fields),
        "notes": "Gợi ý từ live probe — chưa confirmed, chưa submit.",
    }


if __name__ == "__main__":
    raise SystemExit(main())
