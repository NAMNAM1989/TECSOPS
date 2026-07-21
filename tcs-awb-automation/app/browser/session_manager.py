from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.browser.locators import LocatorsConfig, locators_path
from app.browser.login_assist import ensure_logged_in_smart, prepare_assisted_login
from app.browser.pages.awb_page import AwbPortalPage
from app.browser.session import AGENT_HOME, BrowserSession
from app.config import Settings

ESID_HOME = "https://www.tcs.com.vn/Esid/Export"


@dataclass
class SessionStatus:
    open: bool
    logged_in: bool
    url: str
    awb_locators_confirmed: bool
    message: str
    credentials_configured: bool = False
    credentials_filled: bool = False
    captcha_ocr: bool = False
    prefer_session: bool = True
    headless: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "open": self.open,
            "logged_in": self.logged_in,
            "url": self.url,
            "awb_locators_confirmed": self.awb_locators_confirmed,
            "message": self.message,
            "needs_login": self.open and not self.logged_in,
            "credentials_configured": self.credentials_configured,
            "credentials_filled": self.credentials_filled,
            "captcha_ocr": self.captcha_ocr,
            "prefer_session": self.prefer_session,
            "headless": self.headless,
        }


class SessionManager:
    """Giữ một BrowserSession sống trong process agent."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.session: BrowserSession | None = None
        self.locators = LocatorsConfig.load(locators_path(settings.discovery_dir))

    def reload_locators(self) -> None:
        self.locators = LocatorsConfig.load(locators_path(self.settings.discovery_dir))

    def _has_live_session(self) -> bool:
        return bool(self.session and self.session.is_alive())

    @property
    def page(self):
        return self.session.page if self._has_live_session() else None

    def open(
        self,
        *,
        headless: bool = False,
        auto_login: bool = True,
        visible: bool = False,
        show_portal: bool = True,
    ) -> SessionStatus:
        """
        Mở Chrome persistent.
        Cách 1: vào /Awb/Agent — nếu cookie còn → đã login.
        Cách 2: nếu cần login + TCS_CAPTCHA_OCR → OCR tự điền.

        visible=True (nút Login Ops): bắt buộc Chrome headed + đưa cửa sổ lên trước
        để nhìn thấy trang TCS và thao tác thật.
        """
        self.reload_locators()
        # Ops Login (visible): luôn đóng → mở lại Chrome headed để cửa sổ TỰ nhảy ra
        # trước mặt — không cần bấm «Hiện Chrome» hay thao tác riêng.
        if visible:
            headless = False
            if self._has_live_session():
                self.close()

        if self._has_live_session():
            try:
                # Ưu tiên Agent home, không ép về AwbLogin (tránh mất session)
                BrowserSession._goto_fast(self.session.page, AGENT_HOME)
            except Exception:
                self.close()
        # Zombie / Login visible: mở Chrome mới
        if not self._has_live_session():
            self.close()
            self.session = BrowserSession(self.settings)
            try:
                self.session.open(headless=headless)
            except Exception as e:
                self.close()
                if visible:
                    raise RuntimeError(
                        "Không mở được Chrome có cửa sổ. "
                        "Trên máy kho chạy: npm run tcs:agent:real (TCS_HEADLESS=0). "
                        "Railway headless không hiện trang TCS để xem tay. "
                        f"Chi tiết: {e}"
                    ) from e
                raise

        filled = False
        login_msg = ""
        if auto_login:
            filled, login_msg = self._ensure_login()
        else:
            filled = self._try_fill_credentials_only()

        st = self.status()
        st.credentials_filled = filled
        if login_msg and not st.logged_in:
            st.message = login_msg
        elif login_msg and st.logged_in:
            st.message = login_msg

        # Tự mở trang TCS + đưa cửa sổ lên (một thao tác Login là đủ)
        if show_portal and self._has_live_session():
            self._show_tcs_portal(logged_in=st.logged_in)
            if not headless:
                self.focus_window()
                try:
                    import time as _time

                    _time.sleep(0.25)
                    self.focus_window()
                except Exception:
                    pass
                if st.logged_in:
                    st.message = "Đã tự mở trang TCS (ESID) trên Chrome — sẵn sàng Quét/Điền"
                else:
                    st.message = (
                        "Đã tự mở trang đăng nhập TCS trên Chrome — "
                        "nhập CAPTCHA trên cửa sổ đó (không cần bấm thêm)"
                    )
        return st

    def _show_tcs_portal(self, *, logged_in: bool) -> None:
        """Tự mở trang TCS nhìn thấy được ngay sau Login."""
        if not self._has_live_session() or self.session is None or self.session.page is None:
            return
        page = self.session.page
        # Đã login → ESID Export; chưa → trang AwbLogin (CAPTCHA)
        target = ESID_HOME if logged_in else self.settings.base_url
        try:
            BrowserSession._goto_fast(page, target)
            page.wait_for_timeout(300)
        except Exception:
            try:
                BrowserSession._goto_fast(page, AGENT_HOME if logged_in else self.settings.base_url)
            except Exception:
                pass

    def _ensure_login(self) -> tuple[bool, str]:
        if not self._has_live_session():
            return False, ""
        assert self.session is not None
        portal = AwbPortalPage(self.session.page, self.locators)
        if not portal.is_login_page():
            return False, "Session còn hiệu lực — không cần CAPTCHA"
        if not self.settings.has_login_credentials:
            return False, "Thiếu TCS_USERNAME/TCS_PASSWORD trong .env"
        # Agent HTTP: chỉ OCR (không chặn lâu chờ tay). Script live dùng timeout đầy đủ.
        ok, msg = ensure_logged_in_smart(
            portal,
            username=self.settings.tcs_username,
            password=self.settings.tcs_password,
            prefer_session=self.settings.prefer_session,
            use_ocr=self.settings.captcha_ocr,
            ocr_attempts=self.settings.captcha_ocr_attempts,
            manual_timeout_s=0,
            debug_dir=self.settings.screenshots_dir / "captcha",
        )
        return True, msg if ok else f"NEEDS_LOGIN: {msg}"

    def _try_fill_credentials_only(self) -> bool:
        if not self.settings.has_login_credentials:
            return False
        if not self._has_live_session():
            return False
        assert self.session is not None
        try:
            portal = AwbPortalPage(self.session.page, self.locators)
            if not portal.is_login_page():
                return False
            prepare_assisted_login(portal, self.settings.tcs_username, self.settings.tcs_password)
            return True
        except Exception:
            return False

    def close(self) -> None:
        if self.session:
            try:
                self.session.close()
            except Exception:
                pass
            self.session = None

    def status(self) -> SessionStatus:
        self.reload_locators()
        creds = self.settings.has_login_credentials
        ocr = self.settings.captcha_ocr
        prefer = self.settings.prefer_session
        if not self._has_live_session():
            had_stale_session = self.session is not None
            if had_stale_session:
                self.close()
            tip = (
                "Chrome đã đóng — mở lại phiên TCS"
                if had_stale_session
                else "Chrome chưa mở — POST /session/open"
            )
            if creds and ocr:
                tip += " (ưu tiên session; nếu cần sẽ OCR CAPTCHA)"
            elif creds:
                tip += " (tự điền user/pass)"
            return SessionStatus(
                open=False,
                logged_in=False,
                url="",
                awb_locators_confirmed=self.locators.awb_lookup_confirmed,
                message=tip,
                credentials_configured=creds,
                captcha_ocr=ocr,
                prefer_session=prefer,
                headless=bool(self.settings.headless),
            )
        assert self.session is not None
        page = self.session.page
        sess_headless = bool(getattr(self.session, "headless_mode", self.settings.headless))
        try:
            url = page.url or ""
            portal = AwbPortalPage(page, self.locators)
            logged_in = not portal.is_login_page()
            if logged_in:
                msg = "Đã đăng nhập — sẵn sàng LOOKUP/DOWNLOAD"
            elif ocr and creds:
                msg = "Cần login — OCR CAPTCHA bật; hoặc nhập tay trên Chrome"
            elif creds:
                msg = "Đã cấu hình user/pass — nhập CAPTCHA trên Chrome"
            else:
                msg = "Cần đăng nhập (thiếu TCS_USERNAME/TCS_PASSWORD)"
            if logged_in and not self.locators.awb_lookup_confirmed:
                msg += " — AWB locators chưa confirmed"
            if not sess_headless:
                msg += " · Chrome thật (headed)"
            return SessionStatus(
                open=True,
                logged_in=logged_in,
                url=url,
                awb_locators_confirmed=self.locators.awb_lookup_confirmed,
                message=msg,
                credentials_configured=creds,
                captcha_ocr=ocr,
                prefer_session=prefer,
                headless=sess_headless,
            )
        except Exception as e:
            return SessionStatus(
                open=True,
                logged_in=False,
                url="",
                awb_locators_confirmed=self.locators.awb_lookup_confirmed,
                message=f"Lỗi đọc session: {e}",
                credentials_configured=creds,
                captcha_ocr=ocr,
                prefer_session=prefer,
                headless=sess_headless,
            )

    def focus_window(self) -> dict[str, Any]:
        """Đưa cửa sổ Chrome lên trước (headed máy kho)."""
        if not self._has_live_session() or self.session is None:
            return {
                "ok": False,
                "headless": bool(self.settings.headless),
                "message": "Chrome chưa mở — POST /session/open",
            }
        return self.session.focus_window()

    def focus_if_headed(self) -> dict[str, Any]:
        """Gọi trước mỗi thao tác để cửa sổ Chrome máy kho nhảy lên trước."""
        if not self._has_live_session() or self.session is None:
            return {"ok": False, "headless": True, "message": "no browser"}
        if getattr(self.session, "headless_mode", True):
            return {"ok": False, "headless": True, "message": "headless"}
        return self.focus_window()

    def portal(self) -> AwbPortalPage:
        self.reload_locators()
        if not self._has_live_session():
            if self.session is not None:
                self.close()
            raise RuntimeError("NO_BROWSER")
        assert self.session is not None
        return AwbPortalPage(self.session.page, self.locators)
