from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from app.config import Settings

AGENT_HOME = "https://www.tcs.com.vn/Awb/Agent"


def _system_chrome_likely() -> bool:
    """True khi máy có thể có Google Chrome (channel=chrome)."""
    if sys.platform == "win32":
        candidates = [
            os.environ.get("PROGRAMFILES", r"C:\Program Files") + r"\Google\Chrome\Application\chrome.exe",
            os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")
            + r"\Google\Chrome\Application\chrome.exe",
            os.environ.get("LOCALAPPDATA", "") + r"\Google\Chrome\Application\chrome.exe",
        ]
        return any(p and Path(p).is_file() for p in candidates)
    return any(
        Path(p).is_file()
        for p in (
            "/opt/google/chrome/chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
        )
    )


class BrowserSession:
    """Persistent Chrome/Chromium context — user tự đăng nhập / CAPTCHA."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._playwright = None
        self._context = None
        self.page = None
        # True khi không có cửa sổ OS (Railway / headless).
        self.headless_mode: bool = True
        self.browser_engine: str = ""

    def is_alive(self) -> bool:
        """True khi context và page Playwright vẫn dùng được."""
        if self._context is None or self.page is None:
            return False
        try:
            return not self.page.is_closed()
        except Exception:
            return False

    def new_page(self, url: str | None = None):
        """Tạo page cùng persistent context để dùng chung cookie/session TCS."""
        if self._context is None or not self.is_alive():
            raise RuntimeError("NO_BROWSER")
        page = self._context.new_page()
        if url:
            self._goto_fast(page, url)
        return page

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
        self.headless_mode = bool(headless)
        self.browser_engine = ""
        primary_profile = self.settings.browser_profile
        recovery_profile = primary_profile.with_name(f"{primary_profile.name}_recovery")
        primary_profile.mkdir(parents=True, exist_ok=True)
        self._playwright = sync_playwright().start()

        chrome_args = ["--disable-dev-shm-usage"]
        # Container / Xvfb: Chromium thường chạy root → cần no-sandbox
        on_linux = sys.platform.startswith("linux")
        has_display = bool(str(os.environ.get("DISPLAY") or "").strip())
        on_xvfb = (not headless) and on_linux and has_display
        if headless or on_xvfb:
            chrome_args += [
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ]
        if headless:
            chrome_args += [
                "--disable-gpu",
                "--disable-software-rasterizer",
            ]
        elif on_xvfb:
            # Cửa sổ cố định trên framebuffer 1366x900 (noVNC)
            chrome_args += ["--window-size=1366,900", "--window-position=0,0"]
        else:
            # Máy kho Windows headed
            chrome_args += ["--start-maximized"]

        base_kwargs: dict[str, Any] = dict(
            headless=headless,
            accept_downloads=True,
            viewport={"width": 1366, "height": 900} if (headless or on_xvfb) else None,
            args=chrome_args,
            timeout=15000,
        )

        # Thứ tự thử:
        # 1) Google Chrome (máy kho Windows) — headed, không dùng trên Xvfb container
        # 2) Chromium bundled Playwright — profile chính (Railway Xvfb + fallback)
        # 3) Chromium + profile recovery
        attempts: list[tuple[str, Path, dict[str, Any]]] = []
        if not headless and not on_xvfb and _system_chrome_likely():
            attempts.append(("chrome", primary_profile, {**base_kwargs, "channel": "chrome"}))
        attempts.append(("chromium", primary_profile, dict(base_kwargs)))
        attempts.append(("chromium_recovery", recovery_profile, dict(base_kwargs)))

        errors: list[str] = []
        try:
            for label, profile_dir, kwargs in attempts:
                profile_dir.mkdir(parents=True, exist_ok=True)
                try:
                    self._context = self._playwright.chromium.launch_persistent_context(
                        user_data_dir=str(profile_dir),
                        **kwargs,
                    )
                    self.browser_engine = label
                    break
                except Exception as e:
                    errors.append(f"{label}: {e}")
                    self._context = None

            if self._context is None:
                raise RuntimeError(
                    f"Không mở được browser profile ({primary_profile}). "
                    f"Đóng mọi Chrome Playwright đang mở rồi thử lại. "
                    f"Lỗi: {' | '.join(errors[-3:])}"
                )

            self.page = self._context.pages[0] if self._context.pages else self._context.new_page()
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
                    try:
                        cdp.send(
                            "Browser.setWindowBounds",
                            {"windowId": wid, "bounds": {"windowState": "maximized"}},
                        )
                    except Exception:
                        pass
                    notes.append("window")
                try:
                    targets = cdp.send("Target.getTargets")
                    for t in targets.get("targetInfos") or []:
                        if t.get("type") != "page":
                            continue
                        url = str(t.get("url") or "")
                        if "tcs.com.vn" in url or t.get("attached"):
                            cdp.send("Target.activateTarget", {"targetId": t["targetId"]})
                            notes.append("activate")
                            break
                except Exception as e:
                    notes.append(f"act:{type(e).__name__}")
            finally:
                try:
                    cdp.detach()
                except Exception:
                    pass
        except Exception as e:
            notes.append(f"cdp:{type(e).__name__}")
        if not self.headless_mode:
            win_note = self._win_foreground_chrome()
            if win_note:
                notes.append(win_note)
        headed = not bool(self.headless_mode)
        return {
            "ok": True,
            "headless": not headed,
            "message": "Đã hiện Chrome" if headed else "Headless — không có cửa sổ OS",
            "detail": "+".join(notes),
            "engine": self.browser_engine,
        }

    @staticmethod
    def _win_foreground_chrome() -> str:
        """Đưa cửa sổ Chrome lên foreground trên Windows (máy kho)."""
        if sys.platform != "win32":
            return ""
        try:
            import subprocess

            ps = (
                "$w = New-Object -ComObject WScript.Shell; "
                "foreach ($t in @('*tcs.com.vn*','*TCS*','*Chromium*','*Chrome*')) { "
                "  if ($w.AppActivate($t)) { exit 0 } "
                "}; exit 1"
            )
            r = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps],
                capture_output=True,
                timeout=3,
                check=False,
            )
            return "win_fg" if r.returncode == 0 else "win_fg_miss"
        except Exception:
            return "win_fg_err"

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
