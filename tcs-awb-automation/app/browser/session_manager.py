from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
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
    visible_ok: bool = False
    preview_file: str | None = None
    preview_url: str | None = None
    browser_engine: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = {
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
            "visible_ok": self.visible_ok,
            "preview_file": self.preview_file,
            "preview_url": self.preview_url,
            "browser_engine": self.browser_engine,
        }
        data.update(self.extra or {})
        return data


class SessionManager:
    """Giữ một BrowserSession sống trong process agent."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.session: BrowserSession | None = None
        self.locators = LocatorsConfig.load(locators_path(settings.discovery_dir))
        # Hai page cố định dùng chung persistent browser context/cookie:
        # list = Quét/PDF, declare = KHAI BÁO ESID.
        self._workspace_pages: dict[str, Any] = {}

    def reload_locators(self) -> None:
        self.locators = LocatorsConfig.load(locators_path(self.settings.discovery_dir))

    def _has_live_session(self) -> bool:
        return bool(self.session and self.session.is_alive())

    @property
    def page(self):
        return self.session.page if self._has_live_session() else None

    @staticmethod
    def _page_alive(page: Any) -> bool:
        if page is None:
            return False
        try:
            return not page.is_closed()
        except Exception:
            return False

    def workspace_page(self, role: str = "list", *, url: str | None = None):
        """Lấy/tạo page theo vai trò nhưng vẫn dùng chung session đăng nhập."""
        if not self._has_live_session() or self.session is None:
            if self.session is not None:
                self.close()
            raise RuntimeError("NO_BROWSER")
        pages = getattr(self, "_workspace_pages", None)
        if pages is None:
            pages = {}
            self._workspace_pages = pages
        if role == "list":
            page = self.session.page
            pages["list"] = page
        else:
            page = pages.get(role)
            if not self._page_alive(page):
                page = self.session.new_page(url)
                pages[role] = page
                url = None
        if url and page is not None:
            current = str(getattr(page, "url", "") or "")
            if url.lower() not in current.lower():
                BrowserSession._goto_fast(page, url)
        return page

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

        visible=True (máy kho): Chrome headed + focus cửa sổ.
        Cloud / TCS_HEADLESS=1: bỏ qua headed — API-first (Điền/HOÀN TẤT từ Ops).
        """
        import os
        import sys

        self.reload_locators()
        visible_ok = False
        headed_err: str | None = None

        # Không ép headed khi agent đang cấu hình headless (Railway API-first)
        # hoặc Linux không có DISPLAY (không VNC).
        want_headed = bool(visible) and not bool(self.settings.headless)
        if want_headed and sys.platform.startswith("linux"):
            display = str(os.environ.get("DISPLAY") or "").strip()
            if not display:
                want_headed = False

        if want_headed:
            headless = False
            # Reuse Chrome headed đang sống; chỉ reopen khi phiên hiện tại là
            # headless nhưng caller thực sự cần cửa sổ nhìn thấy được.
            if self._has_live_session() and bool(
                getattr(self.session, "headless_mode", True)
            ):
                self.close()
        elif visible and self.settings.headless:
            # Ops gửi visible nhưng cloud headless → mở nhanh, không thử headed
            headless = True

        if self._has_live_session():
            try:
                BrowserSession._goto_fast(self.session.page, AGENT_HOME)
            except Exception:
                self.close()

        if not self._has_live_session():
            self.close()
            self.session = BrowserSession(self.settings)
            try:
                self.session.open(headless=headless)
                visible_ok = not headless
            except Exception as e:
                self.close()
                # Railway / không có display / không có Chrome: fallback headless
                if want_headed or visible:
                    headed_err = str(e)[:280]
                    self.session = BrowserSession(self.settings)
                    try:
                        self.session.open(headless=True)
                        headless = True
                        visible_ok = False
                    except Exception as e2:
                        self.close()
                        raise RuntimeError(
                            "Không mở được browser (headed lẫn headless). "
                            f"Headed: {headed_err} · Headless: {e2}"
                        ) from e2
                else:
                    raise

        self._workspace_pages["list"] = self.session.page

        filled = False
        login_msg = ""
        if auto_login:
            filled, login_msg = self._ensure_login()
        else:
            filled = self._try_fill_credentials_only()

        st = self.status()
        st.credentials_filled = filled
        st.visible_ok = visible_ok and not headless
        if self.session is not None:
            st.browser_engine = getattr(self.session, "browser_engine", "") or ""
        if login_msg and not st.logged_in:
            st.message = login_msg
        elif login_msg and st.logged_in:
            st.message = login_msg

        # Tự mở trang TCS + focus (headed) hoặc chụp ảnh (headless/Railway)
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
                st.visible_ok = True
                st.message = (
                    "Đã tự mở trang TCS trên Chrome — sẵn sàng Quét/Điền"
                    if st.logged_in
                    else "Đã tự mở trang đăng nhập TCS trên Chrome — nhập CAPTCHA trên cửa sổ đó"
                )
            else:
                shot = self._capture_login_preview()
                if shot.get("preview_file"):
                    st.preview_file = shot["preview_file"]
                    st.preview_url = shot["preview_url"]
                st.visible_ok = False
                tip = (
                    "Cloud headless: tiếp tục Quét → Điền → preview → HOÀN TẤT trên Ops. "
                    "Máy kho: npm run tcs:agent:real. Desktop noVNC chỉ khi TCS_VNC=1."
                )
                if headed_err:
                    tip += f" (headed lỗi: {headed_err[:120]})"
                st.message = (
                    f"{'Đã login' if st.logged_in else 'Chrome headless đã mở'} — {tip}"
                )
        return st

    def _capture_login_preview(self) -> dict[str, Any]:
        """Screenshot một lần sau Login (headless) — không poll live."""
        if not self._has_live_session() or self.session is None or self.session.page is None:
            return {}
        docs = self.settings.output_dir / "docs"
        docs.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        name = f"TCS_LOGIN_PREVIEW_{stamp}.png"
        path = docs / name
        try:
            self.session.page.screenshot(path=str(path), full_page=False, type="png")
            if not path.is_file() or path.stat().st_size < 100:
                return {}
            return {
                "preview_file": name,
                "preview_url": f"/docs?file={name}",
            }
        except Exception:
            return {}

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
        self._workspace_pages = {}
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
                visible_ok=not sess_headless,
                browser_engine=getattr(self.session, "browser_engine", "") or "",
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

    def focus_workspace_page(self, role: str) -> dict[str, Any]:
        """Đưa đúng page workspace lên trước; không đổi page danh sách mặc định."""
        try:
            page = self.workspace_page(role)
            page.bring_to_front()
        except Exception as e:
            return {"ok": False, "message": str(e)}
        if self.session is None or getattr(self.session, "headless_mode", True):
            return {"ok": True, "headless": True, "message": f"Đã chọn page {role}"}
        result = self.session.focus_window()
        # focus_window giữ cửa sổ OS nổi nhưng mặc định biết page danh sách;
        # chọn lại page đích để Điền không bị trả về Danh sách.
        try:
            page.bring_to_front()
        except Exception:
            pass
        return result

    def portal(self, role: str = "list") -> AwbPortalPage:
        self.reload_locators()
        if not self._has_live_session():
            if self.session is not None:
                self.close()
            raise RuntimeError("NO_BROWSER")
        return AwbPortalPage(self.workspace_page(role), self.locators)
