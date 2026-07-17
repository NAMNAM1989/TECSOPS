from __future__ import annotations

"""
Client tương tác cổng TCS.

- mock=True: mô phỏng (Ops status / chữ số cuối).
- mock=False: Page Object + locators.json (sau discovery).
"""

from dataclasses import dataclass
from pathlib import Path

from app.browser.locators import LocatorsConfig, locators_path
from app.browser.pages.awb_page import AwbPortalPage, NeedsLoginError, SiteChangedError
from app.browser.pages.esid_page import EsidListPage
from app.data.models import NormalizedStatus
from app.services.awb_service import map_tcs_status_to_normalized


@dataclass
class LookupOutcome:
    tcs_status_raw: str
    normalized: NormalizedStatus
    error_code: str = ""
    error_message: str = ""
    downloaded_path: str = ""


class TcsClient:
    def __init__(
        self,
        *,
        mock: bool = False,
        discovery_report: Path | None = None,
        locators_file: Path | None = None,
        portal: AwbPortalPage | None = None,
    ) -> None:
        self.mock = mock
        self.discovery_report = discovery_report
        self.locators_file = locators_file
        self._portal = portal

    def attach_portal(self, portal: AwbPortalPage) -> None:
        self._portal = portal

    def _locators(self) -> LocatorsConfig | None:
        if self.locators_file and self.locators_file.exists():
            return LocatorsConfig.load(self.locators_file)
        if self.discovery_report:
            path = locators_path(self.discovery_report.parent / "discovery_artifacts")
            # discovery_report is at root; discovery_dir is discovery_artifacts
            alt = self.discovery_report.parent / "discovery_artifacts" / "locators.json"
            if alt.exists():
                return LocatorsConfig.load(alt)
            if path.exists():
                return LocatorsConfig.load(path)
        return None

    def has_discovery(self) -> bool:
        loc = self._locators()
        return bool(loc and loc.login_confirmed)

    def lookup(self, awb_digits: str, *, ops_status: str = "") -> LookupOutcome:
        if self.mock:
            return self._mock_lookup(awb_digits, ops_status=ops_status)

        loc = self._locators()
        if not loc or not loc.login_confirmed:
            return LookupOutcome(
                "",
                NormalizedStatus.SITE_CHANGED,
                "NO_DISCOVERY",
                "Chưa có locators login — chạy discovery",
            )
        if not loc.awb_lookup_confirmed:
            return LookupOutcome(
                "",
                NormalizedStatus.SITE_CHANGED,
                "LOCATORS_PENDING",
                "AWB locators chưa confirmed — chạy discovery sau login + tra AWB mẫu",
            )
        if self._portal is None:
            return LookupOutcome(
                "",
                NormalizedStatus.NEEDS_LOGIN,
                "NO_BROWSER",
                "Chưa mở Chrome session — POST /session/open và đăng nhập tay",
            )
        try:
            loc = self._locators()
            # Ưu tiên Danh sách ESID — cột Trạng thái «Hoàn thành tiếp nhận»
            if loc and loc.esid_list_confirmed:
                try:
                    esid = EsidListPage(self._portal.page, loc)
                    raw, normalized = esid.read_reception_status(awb_digits)
                    return LookupOutcome(raw, normalized)
                except NeedsLoginError:
                    raise
                except Exception:
                    pass
            self._portal.lookup_awb(awb_digits)
            raw, normalized = self._portal.read_normalized_status()
            return LookupOutcome(raw, normalized)
        except NeedsLoginError as e:
            return LookupOutcome("", NormalizedStatus.NEEDS_LOGIN, "NEEDS_LOGIN", str(e))
        except SiteChangedError as e:
            return LookupOutcome("", NormalizedStatus.SITE_CHANGED, "SITE_CHANGED", str(e))
        except Exception as e:
            return LookupOutcome("", NormalizedStatus.FAILED, "LOOKUP_ERROR", str(e))

    def download_pdf(
        self,
        awb_digits: str,
        dest: Path,
        *,
        session_date: str | None = None,
    ) -> LookupOutcome:
        if self.mock:
            return LookupOutcome("", NormalizedStatus.FAILED, "MOCK", "download_pdf không dùng ở mock")
        if self._portal is None:
            return LookupOutcome("", NormalizedStatus.NEEDS_LOGIN, "NO_BROWSER", "Chưa mở Chrome session")
        try:
            loc = self._locators()
            # Flow: AWB# 8 số → chi tiết → IN → lưu PDF
            if loc and loc.esid_list_confirmed:
                esid = EsidListPage(self._portal.page, loc)
                path = esid.download_awb_pdf(awb_digits, dest, session_date=session_date or None)
                if path.exists() and path.stat().st_size > 0:
                    return LookupOutcome("PDF_ESID", NormalizedStatus.DOWNLOADED, downloaded_path=str(path))
                return LookupOutcome("", NormalizedStatus.FAILED, "DOWNLOAD_EMPTY", "File PDF ESID rỗng")
            path = self._portal.download_document(dest)
            if path.exists() and path.stat().st_size > 0:
                return LookupOutcome("PDF", NormalizedStatus.DOWNLOADED, downloaded_path=str(path))
            return LookupOutcome("", NormalizedStatus.FAILED, "DOWNLOAD_EMPTY", "File PDF rỗng")
        except NeedsLoginError as e:
            return LookupOutcome("", NormalizedStatus.NEEDS_LOGIN, "NEEDS_LOGIN", str(e))
        except SiteChangedError as e:
            return LookupOutcome("", NormalizedStatus.SITE_CHANGED, "SITE_CHANGED", str(e))
        except Exception as e:
            return LookupOutcome("", NormalizedStatus.FAILED, "DOWNLOAD_ERROR", str(e)[:300])

    def print_esid_dialog(
        self,
        awb_digits: str,
        *,
        session_date: str | None = None,
    ) -> LookupOutcome:
        """In ESID: AWB# 8 số → IN → mở hộp thoại in cho user (không tự gửi máy in)."""
        if self.mock:
            return LookupOutcome("PRINT_DIALOG_MOCK", NormalizedStatus.PRINTED)
        if self._portal is None:
            return LookupOutcome("", NormalizedStatus.NEEDS_LOGIN, "NO_BROWSER", "Chưa mở Chrome session")
        try:
            loc = self._locators()
            if not loc or not loc.esid_list_confirmed:
                return LookupOutcome(
                    "",
                    NormalizedStatus.SITE_CHANGED,
                    "NO_ESID_LOCATORS",
                    "Chưa có locator ESID",
                )
            esid = EsidListPage(self._portal.page, loc)
            esid.click_in_for_user_print(awb_digits, session_date=session_date or None)
            return LookupOutcome("PRINT_DIALOG", NormalizedStatus.PRINTED)
        except NeedsLoginError as e:
            return LookupOutcome("", NormalizedStatus.NEEDS_LOGIN, "NEEDS_LOGIN", str(e))
        except SiteChangedError as e:
            return LookupOutcome("", NormalizedStatus.SITE_CHANGED, "SITE_CHANGED", str(e))
        except Exception as e:
            return LookupOutcome("", NormalizedStatus.FAILED, "PRINT_ERROR", str(e)[:300])

    def _mock_lookup(self, awb_digits: str, *, ops_status: str = "") -> LookupOutcome:
        if not awb_digits or len(awb_digits) != 11:
            return LookupOutcome("INVALID", NormalizedStatus.VALIDATION_ERROR, "BAD_AWB", "AWB mock không hợp lệ")
        status = (ops_status or "").strip().upper()
        if status in {"COMPLETED", "WEIGH_SLIP"}:
            raw = f"Hoàn thành (mock theo Ops {status})"
            return LookupOutcome(raw, NormalizedStatus.COMPLETED)
        if status in {
            "RECEIVED",
            "VOLUME_DONE",
            "CUSTOMS",
            "SECURITY",
            "OLA_PULL",
            "RECEPTION_COMPLETED",
        }:
            # Mô phỏng TCS đã tiếp nhận (đủ tải phiếu) — khác Ops COMPLETED
            raw = (
                f"THÔNG TIN TIẾP NHẬN\nNgày tiếp nhận: July 17, 2026 14:25\n"
                f"(mock theo Ops {status})"
            )
            return LookupOutcome(raw, NormalizedStatus.RECEPTION_COMPLETED)
        last = awb_digits[-1]
        if last == "9":
            return LookupOutcome("Lỗi hệ thống (mock)", NormalizedStatus.FAILED, "MOCK_ERROR", "Mô phỏng lỗi TCS")
        if int(last) % 2 == 0:
            raw = "Hoàn thành (mock)"
        else:
            raw = "Chưa hoàn thành (mock)"
        return LookupOutcome(raw, map_tcs_status_to_normalized(raw))
