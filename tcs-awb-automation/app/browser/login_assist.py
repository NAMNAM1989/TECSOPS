"""Hỗ trợ đăng nhập: ưu tiên session; OCR CAPTCHA khi cần; fallback tay."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any


class LoginAssistError(RuntimeError):
    pass


def fill_login_form(portal: Any, username: str, password: str, *, captcha: str | None = None) -> None:
    """Điền username/password; có thể kèm CAPTCHA. Không bấm Đăng nhập trừ khi caller tự bấm."""
    if not username or not password:
        raise LoginAssistError("Thiếu TCS_USERNAME / TCS_PASSWORD")
    if not portal.is_login_page():
        return
    user_ref = portal.locators.login_ref("username")
    pass_ref = portal.locators.login_ref("password")
    captcha_ref = portal.locators.login_ref("captcha")
    if not user_ref or not pass_ref:
        raise LoginAssistError("Thiếu locator login username/password")
    user = portal._resolve(user_ref)
    pwd = portal._resolve(pass_ref)
    user.first.wait_for(state="visible", timeout=15000)
    user.first.fill("")
    user.first.fill(username)
    pwd.first.fill("")
    pwd.first.fill(password)
    if captcha_ref:
        cap = portal._resolve(captcha_ref)
        try:
            cap.first.click(timeout=3000)
            cap.first.fill("")
            if captcha:
                cap.first.fill(captcha)
        except Exception:
            pass


def read_captcha_len(portal: Any) -> int:
    captcha_ref = portal.locators.login_ref("captcha")
    if not captcha_ref:
        return 0
    try:
        loc = portal._resolve(captcha_ref)
        val = loc.first.input_value(timeout=2000)
        return len((val or "").strip())
    except Exception:
        return 0


def click_login_submit(portal: Any) -> None:
    submit_ref = portal.locators.login_ref("submit")
    if not submit_ref:
        raise LoginAssistError("Thiếu locator nút Đăng nhập")
    portal._resolve(submit_ref).first.click()


def refresh_captcha_image(portal: Any) -> None:
    """Click nút/ảnh CAPTCHA để đổi mã (khi OCR sai)."""
    from app.browser.captcha_ocr import refresh_captcha_via_reload_icon

    refresh_captcha_via_reload_icon(portal.page)


def prepare_assisted_login(portal: Any, username: str, password: str) -> str:
    """Điền form + focus CAPTCHA. Trả message cho UI/agent."""
    if not portal.is_login_page():
        return "Đã đăng nhập (session)"
    fill_login_form(portal, username, password)
    return (
        "Đã điền user/pass — nhập CAPTCHA trên Chrome hoặc bật TCS_CAPTCHA_OCR=1 để tự OCR"
    )


def attempt_ocr_login(
    portal: Any,
    username: str,
    password: str,
    *,
    max_attempts: int = 3,
    debug_dir: Path | None = None,
) -> tuple[bool, str]:
    """
    Tự điền user/pass + OCR CAPTCHA + Đăng nhập.
    Trả (ok, message).
    """
    from app.browser.captcha_ocr import solve_captcha_from_page

    if not portal.is_login_page():
        return True, "Đã đăng nhập (session) — bỏ qua OCR"
    if not username or not password:
        return False, "Thiếu TCS_USERNAME / TCS_PASSWORD"

    last_err = ""
    for attempt in range(1, max_attempts + 1):
        if not portal.is_login_page():
            return True, f"Đăng nhập OK (sau attempt {attempt - 1})"
        try:
            code = solve_captcha_from_page(portal.page, debug_dir=debug_dir)
            if len(code) < 3:
                last_err = f"OCR quá ngắn: {code!r}"
                refresh_captcha_image(portal)
                continue
            fill_login_form(portal, username, password, captcha=code)
            click_login_submit(portal)
            portal.page.wait_for_timeout(2000)
            try:
                portal.page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            if not portal.is_login_page():
                return True, f"OCR login OK (attempt {attempt}, captcha={code})"
            last_err = f"Vẫn ở trang login sau OCR attempt {attempt} (captcha={code})"
            refresh_captcha_image(portal)
        except Exception as e:
            last_err = str(e)
            refresh_captcha_image(portal)
        time.sleep(0.4)
    return False, last_err or "OCR login thất bại"


def ensure_logged_in_smart(
    portal: Any,
    *,
    username: str,
    password: str,
    prefer_session: bool = True,
    use_ocr: bool = True,
    ocr_attempts: int = 3,
    manual_timeout_s: int = 180,
    debug_dir: Path | None = None,
) -> tuple[bool, str]:
    """
    Cách 1: nếu đã login (session) → xong.
    Cách 2: OCR CAPTCHA tự động.
    Fallback: chờ nhập tay.
    """
    if not portal.is_login_page():
        return True, "Session còn hiệu lực — không cần CAPTCHA"

    if not prefer_session:
        # vẫn thử OCR nếu bật
        pass

    if use_ocr and username and password:
        ok, msg = attempt_ocr_login(
            portal,
            username,
            password,
            max_attempts=ocr_attempts,
            debug_dir=debug_dir,
        )
        if ok:
            return True, msg
        # tiếp tục chờ tay
        fill_login_form(portal, username, password)
        wait_msg = f"OCR thất bại ({msg}) — nhập CAPTCHA tay trong {manual_timeout_s}s"
    else:
        if username and password:
            fill_login_form(portal, username, password)
        wait_msg = f"Chờ CAPTCHA tay trong {manual_timeout_s}s"

    ok = wait_until_logged_in(
        portal,
        timeout_s=manual_timeout_s,
        auto_submit=bool(username and password),
    )
    if ok:
        return True, wait_msg + " → LOGIN_OK"
    return False, wait_msg + " → TIMEOUT"


def wait_until_logged_in(
    portal: Any,
    *,
    timeout_s: int = 300,
    auto_submit: bool = True,
    min_captcha_len: int = 4,
    poll_s: float = 1.0,
) -> bool:
    """
    Chờ rời trang login.
    Nếu auto_submit: khi ô CAPTCHA có >= min_captcha_len ký tự thì bấm Đăng nhập một lần.
    """
    if not portal.is_login_page():
        return True
    deadline = time.time() + timeout_s
    submitted = False
    while time.time() < deadline:
        if not portal.is_login_page():
            return True
        if auto_submit and not submitted and read_captcha_len(portal) >= min_captcha_len:
            try:
                click_login_submit(portal)
                submitted = True
                time.sleep(1.5)
                continue
            except Exception:
                submitted = False
        time.sleep(poll_s)
    return not portal.is_login_page()
