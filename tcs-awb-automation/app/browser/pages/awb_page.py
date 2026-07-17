from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.browser.locators import LocatorRef, LocatorsConfig
from app.services.awb_service import map_tcs_status_to_normalized
from app.data.models import NormalizedStatus


class SiteChangedError(RuntimeError):
    pass


class NeedsLoginError(RuntimeError):
    pass


class AwbPortalPage:
    def __init__(self, page, locators: LocatorsConfig) -> None:
        self.page = page
        self.locators = locators

    def _resolve(self, ref: LocatorRef | None):
        if ref is None or not ref.by:
            raise SiteChangedError("Thiếu locator")
        p = self.page
        by = ref.by.lower()
        if by == "id":
            return p.locator(f"#{ref.value}")
        if by == "css":
            return p.locator(ref.value)
        if by == "placeholder":
            return p.get_by_placeholder(ref.value)
        if by == "role":
            return p.get_by_role(ref.role or "button", name=ref.name or ref.value)
        if by == "text":
            return p.get_by_text(ref.value, exact=False)
        if by == "label":
            return p.get_by_label(ref.value)
        raise SiteChangedError(f"Kiểu locator không hỗ trợ: {ref.by}")

    def is_login_page(self) -> bool:
        url = (self.page.url or "").lower()
        if "checkoutlogin" in url:
            return True
        substr = (self.locators.data.get("login") or {}).get("login_url_substr") or "awblogin"
        if substr.lower() in url:
            return True
        # Khu vực đã login: AWB Agent / ESID
        logged_in_paths = ("/awb/agent", "/esid/", "/awb/")
        in_app = any(p in url for p in logged_in_paths)
        try:
            awb_first = self.page.locator("#awbFirst")
            if awb_first.count() > 0 and awb_first.first.is_visible():
                return False
            kiem_tra = self.page.get_by_role("button", name="KIỂM TRA")
            if kiem_tra.count() > 0 and kiem_tra.first.is_visible():
                return False
            if in_app and self.page.get_by_text("DANH SÁCH ESID", exact=False).count() > 0:
                return False
            if in_app and self.page.get_by_placeholder("AWB#").count() > 0:
                return False
        except Exception:
            pass
        # Form login Ant Design
        try:
            ref = self.locators.login_ref("username")
            if ref:
                loc = self._resolve(ref)
                if loc.count() > 0 and loc.first.is_visible():
                    return True
        except Exception:
            pass
        # Sau Đăng Xuất / trang chủ — coi như chưa login
        if not in_app:
            return True
        return False

    def ensure_logged_in(self) -> None:
        if self.is_login_page():
            raise NeedsLoginError("Đang ở trang đăng nhập TCS — user cần đăng nhập tay (CAPTCHA)")

    def goto_lookup_home(self) -> None:
        home = (self.locators.data.get("awb_lookup") or {}).get("home_url")
        if home:
            try:
                self.page.goto(home, wait_until="domcontentloaded", timeout=30000)
            except Exception:
                pass
        # Tab thông tin hàng hóa (tránh kẹt tab khác / sau khi click nhầm)
        try:
            tab = self.page.get_by_text("THÔNG TIN HÀNG HOÁ", exact=False)
            if tab.count() > 0:
                tab.first.click(timeout=3000)
                self.page.wait_for_timeout(500)
        except Exception:
            pass

    def lookup_awb(self, awb_digits: str) -> None:
        if not self.locators.awb_lookup_confirmed:
            raise SiteChangedError(
                "AWB locators chưa confirmed — chạy discovery sau khi login và tra AWB mẫu"
            )
        self.ensure_logged_in()
        if len(awb_digits) != 11:
            raise SiteChangedError("AWB phải đủ 11 chữ số")
        submit_ref = self.locators.awb_ref("submit")
        if not submit_ref:
            raise SiteChangedError("Thiếu submit trong locators.json")
        mode = (self.locators.data.get("awb_lookup") or {}).get("awb_mode") or "single"
        try:
            self.goto_lookup_home()
            if mode == "split":
                first_ref = self.locators.awb_ref("awb_first")
                last_ref = self.locators.awb_ref("awb_last")
                if not first_ref or not last_ref:
                    raise SiteChangedError("Thiếu awb_first/awb_last (mode split)")
                first = self._resolve(first_ref)
                last = self._resolve(last_ref)
                first.first.wait_for(state="visible", timeout=20000)
                first.first.fill("")
                first.first.fill(awb_digits[:3])
                last.first.fill("")
                last.first.fill(awb_digits[3:])
            else:
                awb_ref = self.locators.awb_ref("awb_input")
                if not awb_ref:
                    raise SiteChangedError("Thiếu awb_input/submit trong locators.json")
                inp = self._resolve(awb_ref)
                inp.first.wait_for(state="visible", timeout=20000)
                inp.first.fill("")
                display = f"{awb_digits[:3]}-{awb_digits[3:]}"
                inp.first.fill(display)
            btn = self._resolve(submit_ref)
            btn.first.click()
            self.page.wait_for_timeout(1500)
            try:
                self.page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
        except NeedsLoginError:
            raise
        except SiteChangedError:
            raise
        except Exception as e:
            raise SiteChangedError(f"LOOKUP thất bại / UI đổi: {e}") from e

    def read_status_raw(self) -> str:
        self.ensure_logged_in()
        status_ref = self.locators.awb_ref("status_text")
        if status_ref:
            try:
                loc = self._resolve(status_ref)
                if loc.count() > 0:
                    txt = (loc.first.inner_text(timeout=5000) or "").strip()
                    if txt:
                        return txt
            except Exception:
                pass
        # Fallback: quét body — lấy đủ để có khối THÔNG TIN TIẾP NHẬN
        try:
            body = self.page.evaluate(
                """() => {
                  const text = (document.body && document.body.innerText) || '';
                  const markers = ['THÔNG TIN TIẾP NHẬN', 'THÔNG TIN HOÀN TẤT', 'TÌNH TRẠNG HÀNG'];
                  let start = -1;
                  for (const m of markers) {
                    const i = text.indexOf(m);
                    if (i >= 0 && (start < 0 || i < start)) start = i;
                  }
                  const from = start < 0 ? 0 : start;
                  return text.slice(from, from + 6000) || text.slice(0, 6000);
                }"""
            )
            return str(body)[:8000]
        except Exception as e:
            raise SiteChangedError(f"Không đọc được trạng thái: {e}") from e

    def read_normalized_status(self) -> tuple[str, NormalizedStatus]:
        raw = self.read_status_raw()
        # Map trên full raw; chỉ cắt khi trả về hiển thị/log
        mapped = map_tcs_status_to_normalized(raw)
        if mapped in {
            NormalizedStatus.RECEPTION_COMPLETED,
            NormalizedStatus.COMPLETED,
            NormalizedStatus.NEEDS_LOGIN,
            NormalizedStatus.FAILED,
        }:
            return raw[:2500], mapped
        low = raw.lower()
        for kw in self.locators.completed_keywords():
            if kw.lower() in low:
                return raw[:2500], NormalizedStatus.COMPLETED
        for kw in self.locators.not_completed_keywords():
            if kw.lower() in low:
                return raw[:2500], NormalizedStatus.NOT_COMPLETED
        return raw[:2500], mapped

    def open_arrival_notice_tab(self) -> bool:
        """Mở tab PHIẾU THÔNG BÁO HÀNG ĐẾN nếu có."""
        ref = self.locators.awb_ref("arrival_notice_tab")
        try:
            if ref:
                self._resolve(ref).first.click(timeout=5000)
            else:
                self.page.get_by_text("PHIẾU THÔNG BÁO HÀNG ĐẾN", exact=False).first.click(timeout=5000)
            self.page.wait_for_timeout(1200)
            return True
        except Exception:
            return False

    def download_document(self, dest_path: Path, *, timeout_ms: int = 30000) -> Path:
        """Tải PDF qua nút download hoặc expect_download; lưu vào dest_path."""
        self.ensure_logged_in()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dl_ref = self.locators.awb_ref("download_button")
        print_ref = self.locators.awb_ref("print_button")

        def _bad_name(name: str | None) -> bool:
            n = (name or "").lower()
            return any(x in n for x in ("đăng xuất", "dang xuat", "logout", "liên hệ", "lien he"))

        def _save_download(download: Any) -> Path:
            download.save_as(str(dest_path))
            return dest_path

        def _click_download(locator) -> Path:
            with self.page.expect_download(timeout=timeout_ms) as di:
                locator.first.click()
            return _save_download(di.value)

        def _print_to_pdf() -> Path:
            """Fallback khi nút IN mở dialog in thay vì download file."""
            import base64

            cdp = self.page.context.new_cdp_session(self.page)
            result = cdp.send(
                "Page.printToPDF",
                {
                    "printBackground": True,
                    "preferCSSPageSize": True,
                },
            )
            data = base64.b64decode(result.get("data") or "")
            if len(data) < 100:
                raise SiteChangedError("printToPDF trả về rỗng")
            dest_path.write_bytes(data)
            return dest_path

        def _click_or_print(locator) -> Path:
            try:
                return _click_download(locator)
            except Exception:
                try:
                    locator.first.click(timeout=5000)
                except Exception:
                    pass
                self.page.wait_for_timeout(800)
                return _print_to_pdf()

        try:
            # Nút IN/PDF nằm trong tab PHIẾU THÔNG BÁO — mở tab trước
            self.open_arrival_notice_tab()

            if dl_ref and not _bad_name(dl_ref.name or dl_ref.value):
                return _click_or_print(self._resolve(dl_ref))
            if print_ref and not _bad_name(print_ref.name or print_ref.value):
                return _click_or_print(self._resolve(print_ref))

            for label in ("IN", "In", "Tải PDF", "Tải xuống", "Download", "In phiếu", "Xuất PDF", "PDF"):
                btn = self.page.get_by_role("button", name=re.compile(f"^{re.escape(label)}$", re.I))
                if btn.count() == 0:
                    btn = self.page.get_by_role("button", name=label)
                if btn.count() > 0 and btn.first.is_visible():
                    return _click_or_print(btn)
                link = self.page.get_by_role("link", name=label)
                if link.count() > 0 and link.first.is_visible():
                    return _click_or_print(link)

            pdf_link = self.page.locator('a[href*=".pdf"]')
            if pdf_link.count() > 0:
                return _click_download(pdf_link)

            # Không có nút — vẫn thử in trang hiện tại
            return _print_to_pdf()
        except NeedsLoginError:
            raise
        except SiteChangedError:
            raise
        except Exception as e:
            raise SiteChangedError(f"Không tải được chứng từ PDF: {e}") from e
