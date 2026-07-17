from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from app.browser.locators import (
    LocatorsConfig,
    ensure_default_locators,
    locators_path,
    suggest_awb_locators_from_elements,
)
from app.browser.session import BrowserSession
from app.config import Settings


DISCOVERY_STEPS = [
    "login_ready",
    "lookup_sample",
    "open_completed_awb",
    "download_or_print",
    "open_register_form",
]

DOM_SCRIPT = """() => {
  const inputs = [...document.querySelectorAll('input,select,textarea,button,a,[role="button"]')]
    .slice(0, 120)
    .map(el => ({
      tag: el.tagName,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.id || null,
      placeholder: el.getAttribute('placeholder'),
      aria: el.getAttribute('aria-label'),
      text: (el.innerText || el.value || '').trim().slice(0, 80),
      href: el.getAttribute('href'),
    }));
  const headings = [...document.querySelectorAll('h1,h2,h3,.ant-page-header-heading-title')]
    .slice(0, 20)
    .map(el => (el.innerText || '').trim().slice(0, 120));
  return { inputs, headings, bodySample: (document.body?.innerText || '').slice(0, 1500) };
}"""


def _capture_step(page, settings: Settings, step: str, downloads_meta: list[dict]) -> dict:
    shot = settings.screenshots_dir / f"discovery_{step}_{datetime.now().strftime('%H%M%S')}.png"
    try:
        page.screenshot(path=str(shot), full_page=True)
    except Exception as e:
        shot = Path(f"(screenshot failed: {e})")
    try:
        url = page.url
        title = page.title()
        summary = page.evaluate(DOM_SCRIPT)
    except Exception as e:
        url, title, summary = "", "", {"error": str(e), "inputs": []}
    return {
        "step": step,
        "url": url,
        "title": title,
        "screenshot": str(shot),
        "elements": summary,
        "downloads_seen": list(downloads_meta),
        "captured_at": datetime.now().isoformat(timespec="seconds"),
    }


def run_discovery(settings: Settings, *, interactive: bool = True, login_only: bool = False) -> Path:
    """
    Khảo sát cổng TCS. User đăng nhập tay + CAPTCHA.
    Sinh discovery_report.md + discovery_artifacts/locators.json.
    """
    settings.discovery_dir.mkdir(parents=True, exist_ok=True)
    settings.screenshots_dir.mkdir(parents=True, exist_ok=True)
    report_path = settings.discovery_dir.parent / "discovery_report.md"
    meta_path = settings.discovery_dir / f"discovery_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    loc_path = locators_path(settings.discovery_dir)
    ensure_default_locators(loc_path)

    session = BrowserSession(settings)
    artifacts: list[dict] = []
    downloads_meta: list[dict] = []

    def on_download(download) -> None:
        try:
            downloads_meta.append(
                {
                    "suggested_filename": download.suggested_filename,
                    "url": getattr(download, "url", "") or "",
                    "at": datetime.now().isoformat(timespec="seconds"),
                }
            )
        except Exception:
            pass

    try:
        page = session.open(headless=False)
        try:
            page.on("download", on_download)
        except Exception:
            pass

        print("\n=== DISCOVERY MODE — Cổng TCS (TECS-TCS) ===")
        print(f"URL: {settings.base_url}")
        print("1) Đăng nhập thủ công (CAPTCHA nếu có) — KHÔNG lưu mật khẩu.")
        print("2) Sau mỗi bước mẫu, quay lại terminal nhấn Enter.\n")

        steps = ["login_ready"] if login_only else DISCOVERY_STEPS
        for step in steps:
            if interactive:
                hints = {
                    "login_ready": "Đăng nhập xong (hoặc đang ở form login) rồi Enter",
                    "lookup_sample": "Tra cứu 1 AWB mẫu rồi Enter",
                    "open_completed_awb": "Mở AWB đã hoàn thành rồi Enter",
                    "download_or_print": "Tải/in chứng từ PDF rồi Enter",
                    "open_register_form": "Mở form đăng ký (KHÔNG submit) rồi Enter",
                }
                input(f"[{step}] {hints.get(step, 'Enter để chụp')}...")
            elif step == "login_ready":
                page.wait_for_timeout(1500)

            art = _capture_step(page, settings, step, downloads_meta)
            artifacts.append(art)
            print(f"  → đã lưu: {step} @ {art.get('url')}")

        meta_path.write_text(json.dumps(artifacts, ensure_ascii=False, indent=2), encoding="utf-8")
        _update_locators_from_artifacts(loc_path, artifacts)
        _write_report(report_path, artifacts, loc_path)
        print(f"\nĐã tạo {report_path}")
        print(f"Locators: {loc_path}")
        return report_path
    finally:
        session.close()


def _update_locators_from_artifacts(loc_path: Path, artifacts: list[dict]) -> None:
    cfg = LocatorsConfig.load(loc_path)
    # Login đã confirmed từ quan sát AwbLogin
    login = cfg.data.setdefault("login", {})
    login["confirmed"] = True
    login.setdefault("username", {"by": "id", "value": "basic_username"})
    login.setdefault("password", {"by": "id", "value": "basic_password"})
    login.setdefault("captcha", {"by": "id", "value": "basic_captchaCode"})
    login.setdefault("submit", {"by": "role", "role": "button", "name": "Đăng nhập"})

    for art in artifacts:
        if art.get("step") in {"lookup_sample", "open_completed_awb", "download_or_print"}:
            inputs = (art.get("elements") or {}).get("inputs") or []
            if not inputs:
                continue
            suggested = suggest_awb_locators_from_elements(inputs)
            # Chỉ nâng confirmed nếu heuristic đủ mạnh
            prev = cfg.data.get("awb_lookup") or {}
            if suggested.get("confirmed") or not prev.get("confirmed"):
                # Giữ confirmed cũ nếu đã true; nếu suggested confirmed thì bật
                confirmed = bool(prev.get("confirmed")) or bool(suggested.get("confirmed"))
                merged = {**prev, **{k: v for k, v in suggested.items() if v is not None}}
                merged["confirmed"] = confirmed
                if art.get("downloads_seen"):
                    merged["download_evidence"] = art["downloads_seen"]
                cfg.data["awb_lookup"] = merged
    cfg.save()


def _write_report(path: Path, artifacts: list[dict], loc_path: Path) -> None:
    cfg = LocatorsConfig.load(loc_path)
    awb_ok = cfg.awb_lookup_confirmed
    lines = [
        "# Discovery Report — Cổng AWB TCS",
        "",
        f"Tạo lúc: {datetime.now().isoformat(timespec='seconds')}",
        "",
        "Phạm vi: chỉ kho **TECS-TCS** (sidecar TECSOPS).",
        "",
        f"- Locators file: `{loc_path}`",
        f"- Login locators confirmed: **{cfg.login_confirmed}**",
        f"- AWB lookup locators confirmed: **{awb_ok}**",
        "",
        "## Các bước đã quan sát",
        "",
    ]
    for a in artifacts:
        n_el = len((a.get("elements") or {}).get("inputs") or [])
        lines.extend(
            [
                f"### {a['step']}",
                f"- URL: `{a.get('url')}`",
                f"- Title: {a.get('title')}",
                f"- Screenshot: `{a.get('screenshot')}`",
                f"- Số element ghi nhận: {n_el}",
                f"- Downloads: {len(a.get('downloads_seen') or [])}",
                "",
            ]
        )
    lines.extend(
        [
            "## Login (đã quan sát)",
            "",
            "- Form Ant Design `#basic`",
            "- Username: `#basic_username`",
            "- Password: `#basic_password`",
            "- Captcha: `#basic_captchaCode` (user tự nhập)",
            "- Submit: button `Đăng nhập`",
            "",
            "## LOOKUP / DOWNLOAD",
            "",
            (
                "- Locators AWB **đã confirmed** — có thể chạy agent `--real`."
                if awb_ok
                else "- Locators AWB **chưa confirmed**. Chạy full discovery sau khi login + tra AWB mẫu."
            ),
            "",
            "## An toàn",
            "",
            "- Không lưu mật khẩu / cookie / token.",
            "- REGISTER vẫn khóa cho đến phase sau.",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")
