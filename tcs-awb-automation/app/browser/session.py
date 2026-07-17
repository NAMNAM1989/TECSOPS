from __future__ import annotations

import time
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

    def open(self, *, headless: bool = False) -> Any:
        from playwright.sync_api import sync_playwright

        self.settings.browser_profile.mkdir(parents=True, exist_ok=True)
        self._playwright = sync_playwright().start()
        launch_kwargs = dict(
            user_data_dir=str(self.settings.browser_profile),
            headless=headless,
            accept_downloads=True,
            viewport={"width": 1366, "height": 900},
            args=["--disable-dev-shm-usage"],
        )
        last_err: Exception | None = None
        for attempt in range(2):
            try:
                self._context = self._playwright.chromium.launch_persistent_context(
                    channel="chrome",
                    **launch_kwargs,
                )
                last_err = None
                break
            except Exception as e:
                last_err = e
                time.sleep(1.2)
        if self._context is None:
            # Fallback Chromium — cùng profile path để giữ cookie nếu được
            try:
                self._context = self._playwright.chromium.launch_persistent_context(**launch_kwargs)
            except Exception as e:
                raise RuntimeError(
                    f"Không mở được Chrome profile ({self.settings.browser_profile}). "
                    f"Đóng mọi Chrome Playwright đang mở rồi thử lại. Lỗi: {last_err or e}"
                ) from e

        self.page = self._context.pages[0] if self._context.pages else self._context.new_page()
        # Vào Agent trước — cookie persistent có thể đã login
        try:
            self.page.goto(AGENT_HOME, wait_until="domcontentloaded", timeout=60000)
        except Exception:
            self.page.goto(self.settings.base_url, wait_until="domcontentloaded", timeout=60000)
        return self.page

    def close(self) -> None:
        if self._context:
            self._context.close()
            self._context = None
        if self._playwright:
            self._playwright.stop()
            self._playwright = None
        self.page = None


def try_open_session(settings: Settings) -> BrowserSession | None:
    try:
        session = BrowserSession(settings)
        session.open(headless=False)
        return session
    except Exception:
        return None
