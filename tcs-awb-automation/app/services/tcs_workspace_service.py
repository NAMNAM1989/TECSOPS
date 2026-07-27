"""Workspace TCS dùng một persistent session cho Quét, Điền và PDF."""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from app.browser.locators import LocatorsConfig, locators_path
from app.browser.pages.esid_declare_page import EsidDeclarePage
from app.browser.pages.esid_page import EsidListPage
from app.browser.session_manager import ESID_HOME, SessionManager
from app.config import Settings
from app.services.download_service import (
    build_document_filename,
    find_recent_esid_pdf,
    verify_download,
)
from app.services.esid_scan_service import scan_esid_reception
from app.utils.awb import digits_only


class TcsWorkspaceService:
    """Giữ hai page cùng cookie và index AWB từ lần quét gần nhất."""

    CACHE_TTL_S = 600

    def __init__(self, sessions: SessionManager, settings: Settings) -> None:
        self.sessions = sessions
        self.settings = settings
        self.phase = "IDLE"
        self.session_date = ""
        self.awbs: list[str] = []
        self.index: dict[str, dict[str, Any]] = {}
        self.last_scan: dict[str, Any] | None = None
        self.scanned_at = 0.0
        self.error = ""

    def reset(self) -> None:
        self.phase = "IDLE"
        self.session_date = ""
        self.awbs = []
        self.index = {}
        self.last_scan = None
        self.scanned_at = 0.0
        self.error = ""

    @staticmethod
    def _normalize_awbs(raw_awbs: list[Any] | None) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for raw in raw_awbs or []:
            awb = digits_only(str(raw or ""))[:11]
            if len(awb) != 11 or awb in seen:
                continue
            seen.add(awb)
            result.append(awb)
        return result

    def snapshot(self) -> dict[str, Any]:
        age = int(time.time() - self.scanned_at) if self.scanned_at else None
        return {
            # Hàm này được /health gọi từ HTTP thread khi worker Playwright đang
            # bận, nên tuyệt đối không đọc page/session tại đây.
            "phase": self.phase,
            "session_date": self.session_date,
            "awb_count": len(self.awbs),
            "cache_count": len(self.index),
            "ready_count": len((self.last_scan or {}).get("ready") or []),
            "scan_total": int((self.last_scan or {}).get("list_total") or 0),
            "scanned_at": self.scanned_at or None,
            "cache_age_seconds": age,
            "cache_fresh": bool(age is not None and age <= self.CACHE_TTL_S),
            "error": self.error,
        }

    def _build_index(self, scan: dict[str, Any]) -> None:
        index: dict[str, dict[str, Any]] = {}
        for row in scan.get("index_rows") or []:
            if not isinstance(row, dict):
                continue
            awb = digits_only(str(row.get("awb") or ""))[:11]
            if len(awb) != 11:
                continue
            index[awb] = {
                "awb": awb,
                "page_number": int(row.get("page_number") or 1),
                "status": str(row.get("status") or ""),
                "esid_code": str(row.get("esid") or ""),
                "flight_date": str(row.get("flight_date") or ""),
            }
        self.index = index

    def warm_declare_page(self) -> dict[str, Any]:
        """Mở sẵn page KHAI BÁO nhưng không làm hỏng page danh sách."""
        try:
            loc = LocatorsConfig.load(locators_path(self.settings.discovery_dir))
            page = self.sessions.workspace_page("declare", url=ESID_HOME)
            EsidDeclarePage(page, loc).goto_declare_tab()
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "message": str(e)[:240]}

    def refresh_scan(self, session_date: str, raw_awbs: list[Any] | None) -> dict[str, Any]:
        self.phase = "SCANNING"
        self.error = ""
        self.session_date = str(session_date or "").strip()
        self.awbs = self._normalize_awbs(raw_awbs)
        result = scan_esid_reception(
            self.sessions,
            self.settings,
            self.awbs,
            session_date=self.session_date or None,
        )
        if not result.get("ok"):
            self.phase = "ERROR"
            self.error = str(result.get("message") or result.get("error") or "Quét thất bại")
            self.last_scan = result
            return result
        self._build_index(result)
        self.last_scan = {k: v for k, v in result.items() if k != "index_rows"}
        self.scanned_at = time.time()
        self.phase = "READY"
        return {
            **self.last_scan,
            "workspace": self.snapshot(),
        }

    def bootstrap(
        self,
        *,
        session_date: str,
        raw_awbs: list[Any] | None,
        visible: bool,
    ) -> dict[str, Any]:
        self.phase = "OPENING"
        self.error = ""
        st = self.sessions.open(
            headless=False if visible else self.settings.headless,
            visible=visible,
            show_portal=True,
        )
        if not st.open or not st.logged_in:
            self.phase = "NEEDS_LOGIN"
            self.error = st.message
            return {
                "ok": bool(st.open),
                **st.to_dict(),
                "workspace": self.snapshot(),
                "items": [],
                "ready": [],
                "total": 0,
                "ready_count": 0,
            }
        result = self.refresh_scan(session_date, raw_awbs)
        scan_ok = bool(result.get("ok"))
        scan_error = "" if scan_ok else str(
            result.get("message") or result.get("error") or "Quét thất bại"
        )
        # Prefetch PDF trước warm declare — lần bấm Tải PDF sau ≈ cache hit
        prefetch = self.prefetch_ready_pdfs()
        if prefetch.get("prefetched"):
            result.setdefault("warnings", []).append(
                f"Đã prefetch {prefetch['prefetched']} PDF ESID"
            )
        result["pdf_prefetch"] = prefetch
        warm = self.warm_declare_page()
        if not warm.get("ok"):
            result.setdefault("warnings", []).append(
                f"Chưa warm được trang khai báo: {warm.get('message') or ''}"
            )
        # Trả session cùng scan để frontend cập nhật trạng thái Ops ngay sau Login.
        return {
            **result,
            **st.to_dict(),
            # Login là điều kiện chính; scan lỗi vẫn giữ session/page Khai báo
            # để người dùng Điền và có thể bấm Làm mới sau.
            "ok": True,
            "scan_ok": scan_ok,
            "scan_error": scan_error,
            "workspace": self.snapshot(),
        }

    def prefetch_ready_pdfs(
        self,
        *,
        awbs: list[str] | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        """
        In sẵn PDF cho AWB «Hoàn thành tiếp nhận» (hoặc danh sách chỉ định).
        TCS_PDF_PREFETCH_N=0 tắt. Mặc định 5.
        """
        raw_n = os.getenv("TCS_PDF_PREFETCH_N", "5").strip()
        try:
            default_n = max(0, int(raw_n))
        except ValueError:
            default_n = 5
        n = default_n if limit is None else max(0, int(limit))
        if n <= 0:
            return {"ok": True, "prefetched": 0, "skipped": 0, "failed": 0, "awbs": []}

        targets: list[str] = []
        if awbs:
            for raw in awbs:
                d = digits_only(str(raw or ""))[:11]
                if len(d) == 11 and d not in targets:
                    targets.append(d)
        else:
            for row in (self.last_scan or {}).get("ready") or []:
                if not isinstance(row, dict):
                    continue
                d = digits_only(str(row.get("awb") or ""))[:11]
                if len(d) == 11 and d not in targets:
                    targets.append(d)
        targets = targets[:n]
        if not targets:
            return {"ok": True, "prefetched": 0, "skipped": 0, "failed": 0, "awbs": []}

        docs = Path(self.settings.output_dir) / "docs"
        docs.mkdir(parents=True, exist_ok=True)
        loc = LocatorsConfig.load(locators_path(self.settings.discovery_dir))
        try:
            portal = self.sessions.portal("list")
            esid = EsidListPage(portal.page, loc)
        except Exception as e:
            return {
                "ok": False,
                "prefetched": 0,
                "skipped": 0,
                "failed": len(targets),
                "message": str(e)[:200],
                "awbs": [],
            }

        prefetched: list[str] = []
        skipped = 0
        failed = 0
        for awb in targets:
            if find_recent_esid_pdf(docs, awb, document_type="ESID") is not None:
                skipped += 1
                continue
            fname = build_document_filename(awb, "ESID")
            fpath = docs / fname
            try:
                # Ưu tiên index quét ngày
                skip_prepare = False
                row = self.cached_row(awb)
                if row:
                    skip_prepare = esid.prepare_esid_detail_cached(
                        awb, page_number=int(row.get("page_number") or 1)
                    )
                path = esid.download_awb_pdf(
                    awb, fpath, session_date=None, skip_prepare=skip_prepare
                )
                if verify_download(Path(path)):
                    prefetched.append(awb)
                else:
                    failed += 1
            except Exception:
                failed += 1
        return {
            "ok": True,
            "prefetched": len(prefetched),
            "skipped": skipped,
            "failed": failed,
            "awbs": prefetched,
        }

    def cached_row(self, awb: str) -> dict[str, Any] | None:
        digits = digits_only(awb)[:11]
        if len(digits) != 11:
            return None
        return self.index.get(digits)

    def prepare_pdf_from_cache(self, awb: str) -> bool:
        """Cache hit: mở dòng đúng page; cache stale thì trả False để fallback."""
        digits = digits_only(awb)[:11]
        row = self.cached_row(digits)
        if not row:
            return False
        loc = LocatorsConfig.load(locators_path(self.settings.discovery_dir))
        portal = self.sessions.portal("list")
        esid = EsidListPage(portal.page, loc)
        return esid.prepare_esid_detail_cached(
            digits,
            page_number=int(row.get("page_number") or 1),
        )
