from __future__ import annotations

from typing import Any

from app.config import Settings

AGENT_HOME = "https://www.tcs.com.vn/Awb/Agent"


class BrowserSession:
    """Persistent Chrome context — user tự đăng nhập / CAPTCHA."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._playwright = None
        self._context = None
        self.page = None

    def is_alive(self) -> bool:
        """True khi context và page Playwright vẫn dùng được."""
        if self._context is None or self.page is None:
            return False
        try:
            return not self.page.is_closed()
        except Exception:
            return False

    @staticmethod
    def _goto_fast(page, url: str) -> None:
        """
        Chỉ chờ navigation commit; TCS có tài nguyên giữ DOMContentLoaded tới ~60s.
        UI cụ thể sẽ được page object chờ sau đó.
        """
        page.goto(url, wait_until="commit", timeout=15000)
        try:
            page.wait_for_load_state("domcontentloaded", timeout=3000)
        except Exception:
            pass

    def open(self, *, headless: bool = False) -> Any:
        from playwright.sync_api import sync_playwright

        # Không để sót driver cũ nếu lần open trước hỏng giữa chừng.
        self.close()
        primary_profile = self.settings.browser_profile
        recovery_profile = primary_profile.with_name(f"{primary_profile.name}_recovery")
        primary_profile.mkdir(parents=True, exist_ok=True)
        self._playwright = sync_playwright().start()
        # Trong container (Railway) Chrome chạy bằng root, không có /dev/shm lớn,
        # không có GPU → cần các cờ này để không crash lúc launch.
        chrome_args = ["--disable-dev-shm-usage"]
        if headless:
            chrome_args += [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--disable-software-rasterizer",
            ]
        launch_kwargs = dict(
            headless=headless,
            accept_downloads=True,
            viewport={"width": 1366, "height": 900},
            args=chrome_args,
            timeout=15000,
        )
        try:
            last_err: Exception | None = None
            # Profile có thể hỏng/treo sau khi Chrome bị kill. Thử Chrome/profile
            # chính một lần; nếu lỗi thì dùng Chromium + profile recovery.
            #
            # Server/headless (container Railway): KHÔNG có channel "chrome" (chỉ có
            # Chromium bundled). Dùng thẳng Chromium + profile CHÍNH để session bám
            # đúng volume đã mount, tránh rơi xuống recovery profile ephemeral.
            try:
                if headless:
                    self._context = self._playwright.chromium.launch_persistent_context(
                        user_data_dir=str(primary_profile),
                        **launch_kwargs,
                    )
                else:
                    self._context = self._playwright.chromium.launch_persistent_context(
                        user_data_dir=str(primary_profile),
                        channel="chrome",
                        **launch_kwargs,
                    )
            except Exception as e:
                last_err = e
            if self._context is None:
                # Fallback Chromium — dùng profile recovery, OCR có thể login lại.
                recovery_profile.mkdir(parents=True, exist_ok=True)
                try:
                    self._context = self._playwright.chromium.launch_persistent_context(
                        user_data_dir=str(recovery_profile),
                        **launch_kwargs,
                    )
                except Exception as e:
                    raise RuntimeError(
                        f"Không mở được Chrome profile ({primary_profile}). "
                        f"Đóng mọi Chrome Playwright đang mở rồi thử lại. Lỗi: {last_err or e}"
                    ) from e

            self.page = self._context.pages[0] if self._context.pages else self._context.new_page()
            # Vào Agent trước — cookie persistent có thể đã login
            try:
                self._goto_fast(self.page, AGENT_HOME)
            except Exception:
                if not self.is_alive():
                    raise
                self._goto_fast(self.page, self.settings.base_url)
            return self.page
        except Exception:
            self.close()
            raise

    def focus_window(self) -> dict[str, Any]:
        """
        Đưa tab/cửa sổ Chrome lên trước (headed máy kho).
        Headless: chỉ bring_to_front tab (không có cửa sổ OS).
        """
        if not self.is_alive() or self.page is None:
            return {"ok": False, "message": "Chrome chưa mở"}
        notes: list[str] = []
        try:
            self.page.bring_to_front()
            notes.append("tab")
        except Exception as e:
            notes.append(f"tab_err:{e}")
        # Un-minimize / normal bounds qua CDP (chỉ hữu ích khi headed)
        try:
            cdp = self.page.context.new_cdp_session(self.page)
            try:
                info = cdp.send("Browser.getWindowForTarget")
                wid = info.get("windowId")
                if wid is not None:
                    cdp.send(
                        "Browser.setWindowBounds",
                        {"windowId": wid, "bounds": {"windowState": "normal"}},
                    )
                    notes.append("window")
            finally:
                try:
                    cdp.detach()
                except Exception:
                    pass
        except Exception as e:
            notes.append(f"cdp:{type(e).__name__}")
        return {
            "ok": True,
            "headless": bool(self.settings.headless),
            "message": "Đã hiện Chrome" if not self.settings.headless else "Headless — không có cửa sổ OS",
            "detail": "+".join(notes),
        }

    def close(self) -> None:
        # Tách cleanup context/driver: context đã chết vẫn phải stop Playwright.
        context, playwright = self._context, self._playwright
        self._context = None
        self._playwright = None
        self.page = None
        if context:
            try:
                context.close()
            except Exception:
                pass
        if playwright:
            try:
                playwright.stop()
            except Exception:
                pass


def try_open_session(settings: Settings) -> BrowserSession | None:
    try:
        session = BrowserSession(settings)
        session.open(headless=False)
        return session
    except Exception:
        return None
