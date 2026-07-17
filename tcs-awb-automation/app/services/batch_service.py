from __future__ import annotations

import random
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Callable

from app.config import Settings
from app.data.models import Action, AwbJobResult, AwbJobRow, BatchJob, NormalizedStatus
from app.data.repository import Repository
from app.services.download_service import build_document_filename, verify_download, write_placeholder_pdf
from app.services.excel_service import export_result_excel
from app.services.print_service import print_with_dedupe
from app.services.tcs_client import TcsClient
from app.utils.logging_setup import setup_logging

if TYPE_CHECKING:
    from app.browser.pages.awb_page import AwbPortalPage

ProgressCb = Callable[[AwbJobResult], None]


class BatchService:
    def __init__(self, settings: Settings, repo: Repository) -> None:
        self.settings = settings
        self.repo = repo
        self.log = setup_logging(settings.logs_dir)
        self._pause = False
        self._stop = False

    def pause(self) -> None:
        self._pause = True

    def resume(self) -> None:
        self._pause = False

    def stop(self) -> None:
        self._stop = True

    def _delay(self) -> None:
        lo = self.settings.min_delay_ms / 1000
        hi = max(lo, self.settings.max_delay_ms / 1000)
        time.sleep(random.uniform(lo, hi))

    def create_job_from_rows(
        self,
        rows: list[AwbJobRow],
        *,
        source: str,
        dry_run: bool | None = None,
        mock: bool | None = None,
        confirm_register: bool = False,
        session_date: str = "",
    ) -> BatchJob:
        job = BatchJob(
            job_id=str(uuid.uuid4()),
            source=source,
            warehouse=self.settings.warehouse_scope,
            dry_run=self.settings.dry_run if dry_run is None else dry_run,
            mock=self.settings.mock if mock is None else mock,
            rows=rows,
            confirm_register=confirm_register,
            session_date=(session_date or "").strip(),
        )
        self.repo.save_job(job.job_id, job.source, job.warehouse, job.to_dict(), "QUEUED")
        return job

    def run(
        self,
        job: BatchJob,
        on_progress: ProgressCb | None = None,
        *,
        portal: "AwbPortalPage | None" = None,
    ) -> tuple[list[AwbJobResult], Path]:
        self._stop = False
        self._pause = False
        self.repo.update_job_status(job.job_id, "RUNNING")
        loc_file = self.settings.discovery_dir / "locators.json"
        client = TcsClient(
            mock=job.mock,
            discovery_report=self.settings.discovery_dir.parent / "discovery_report.md",
            locators_file=loc_file if loc_file.exists() else None,
            portal=portal,
        )
        results: list[AwbJobResult] = []
        checkpoint = self.repo.get_checkpoint(job.job_id)
        start_stt = (checkpoint or {}).get("last_stt", 0)

        for row in job.rows:
            if self._stop:
                break
            while self._pause and not self._stop:
                time.sleep(0.2)
            if row.stt <= start_stt:
                continue

            result = self._process_row(job, row, client)
            results.append(result)
            self.repo.save_result(job.job_id, row.awb_digits, row.action.value, result.normalized_status, result.to_dict())
            self.repo.audit(
                job_id=job.job_id,
                awb_digits=row.awb_digits,
                action=row.action.value,
                result=result.normalized_status,
                error=result.error_message,
                file_path=result.downloaded_file,
            )
            self.repo.save_checkpoint(job.job_id, row.stt, {"results": [r.to_dict() for r in results]})
            if on_progress:
                on_progress(result)
            if result.normalized_status == NormalizedStatus.SITE_CHANGED.value:
                self.log.error("SITE_CHANGED — dừng lô an toàn tại STT %s", row.stt)
                break
            if result.normalized_status == NormalizedStatus.NEEDS_LOGIN.value:
                self.log.error("NEEDS_LOGIN — dừng để user đăng nhập lại")
                break
            self._delay()

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out = self.settings.output_dir / f"TCS_AWB_RESULT_{ts}.xlsx"
        export_result_excel(results, out)
        self.repo.update_job_status(job.job_id, "DONE" if not self._stop else "STOPPED")
        return results, out

    def _process_row(self, job: BatchJob, row: AwbJobRow, client: TcsClient) -> AwbJobResult:
        started = datetime.now()
        result = AwbJobResult(
            stt=row.stt,
            awb=row.awb_display or row.awb_raw,
            action=row.action.value,
            document_type=row.document_type,
            start_time=started.isoformat(timespec="seconds"),
            shipment_id=row.shipment_id,
        )
        if row.validation_error:
            result.normalized_status = NormalizedStatus.VALIDATION_ERROR.value
            if "SKIPPED_DUPLICATE" in (row.validation_error or ""):
                result.normalized_status = NormalizedStatus.SKIPPED_DUPLICATE.value
            result.error_code = "VALIDATION"
            result.error_message = row.validation_error
            result.end_time = datetime.now().isoformat(timespec="seconds")
            result.duration_seconds = (datetime.now() - started).total_seconds()
            return result

        if row.action == Action.REGISTER and not job.confirm_register:
            result.normalized_status = NormalizedStatus.FAILED.value
            result.error_code = "CONFIRM_REQUIRED"
            result.error_message = "REGISTER yêu cầu xác nhận cả lô (confirm_register=true)"
            result.end_time = datetime.now().isoformat(timespec="seconds")
            result.duration_seconds = (datetime.now() - started).total_seconds()
            return result

        # REGISTER thật bị chặn cho đến khi discovery + locators sẵn sàng
        if row.action == Action.REGISTER and not job.mock:
            result.normalized_status = NormalizedStatus.FAILED.value
            result.error_code = "REGISTER_BLOCKED"
            result.error_message = "REGISTER thật bị khóa đến khi discovery hoàn tất và user xác nhận"
            result.end_time = datetime.now().isoformat(timespec="seconds")
            result.duration_seconds = (datetime.now() - started).total_seconds()
            return result

        # DOWNLOAD/PRINT thật: bỏ LOOKUP riêng (trước đây search ESID 2 lần / AWB).
        if row.action in {Action.DOWNLOAD, Action.PRINT} and not job.mock:
            return self._download_print_fast(job, row, client, result, started)

        retries = 0
        outcome = None
        while retries <= self.settings.max_retries:
            result.retry_count = retries
            outcome = client.lookup(row.awb_digits, ops_status=row.ops_status)
            if outcome.normalized not in {NormalizedStatus.FAILED}:
                break
            if outcome.error_code in {"NO_DISCOVERY", "LOCATORS_PENDING", "NO_BROWSER"}:
                break
            retries += 1
            time.sleep(0.5 * retries)

        assert outcome is not None
        result.tcs_status_raw = outcome.tcs_status_raw
        result.normalized_status = outcome.normalized.value
        result.error_code = outcome.error_code
        result.error_message = outcome.error_message

        # P0: đã tiếp nhận (hoặc hoàn tất) → tải PDF (LOOKUP mock/thật)
        downloadable = {
            NormalizedStatus.COMPLETED,
            NormalizedStatus.RECEPTION_COMPLETED,
        }
        if outcome.normalized in downloadable and row.action in {
            Action.LOOKUP,
            Action.DOWNLOAD,
            Action.PRINT,
        }:
            self._attach_pdf(job, row, client, result, outcome.tcs_status_raw)

        if outcome.normalized == NormalizedStatus.NOT_COMPLETED:
            result.normalized_status = NormalizedStatus.NOT_COMPLETED.value
            # Không in

        if job.mock and row.action == Action.REGISTER and job.confirm_register:
            result.tcs_status_raw = "Đã đăng ký (mock)"
            result.normalized_status = NormalizedStatus.COMPLETED.value
            result.error_code = ""
            result.error_message = ""

        result.end_time = datetime.now().isoformat(timespec="seconds")
        result.duration_seconds = round((datetime.now() - started).total_seconds(), 3)
        return result

    def _download_print_fast(
        self,
        job: BatchJob,
        row: AwbJobRow,
        client: TcsClient,
        result: AwbJobResult,
        started: datetime,
    ) -> AwbJobResult:
        """
        ESID: AWB# 8 số → chi tiết → nút IN.
        - DOWNLOAD: lưu PDF (download / page.pdf).
        - PRINT: mở hộp thoại in trên Chrome cho user (không tự gửi máy in Windows).
        """
        if row.action == Action.PRINT and not job.mock:
            result.tcs_status_raw = "ESID IN → hộp thoại in"
            pr = client.print_esid_dialog(
                row.awb_digits,
                session_date=job.session_date or None,
            )
            result.normalized_status = pr.normalized.value
            result.error_code = pr.error_code
            result.error_message = pr.error_message
            if pr.normalized == NormalizedStatus.PRINTED:
                result.print_status = "USER_PRINT_DIALOG"
                result.error_message = ""
                result.tcs_status_raw = (
                    "Đã bấm IN — hộp thoại in đã mở trên Chrome, chọn máy in và In"
                )
            result.end_time = datetime.now().isoformat(timespec="seconds")
            result.duration_seconds = round((datetime.now() - started).total_seconds(), 3)
            return result

        result.tcs_status_raw = "ESID IN → PDF"
        self._attach_pdf(job, row, client, result, result.tcs_status_raw)
        result.end_time = datetime.now().isoformat(timespec="seconds")
        result.duration_seconds = round((datetime.now() - started).total_seconds(), 3)
        return result

    def _attach_pdf(
        self,
        job: BatchJob,
        row: AwbJobRow,
        client: TcsClient,
        result: AwbJobResult,
        status_raw: str,
    ) -> None:
        fname = build_document_filename(row.awb_digits, row.document_type)
        fpath = self.settings.output_dir / "docs" / fname
        if job.mock:
            write_placeholder_pdf(
                fpath,
                f"TCS AWB {row.awb_display} | {row.document_type} | {status_raw}",
            )
        else:
            dl = client.download_pdf(
                row.awb_digits,
                fpath,
                session_date=job.session_date or None,
            )
            if dl.normalized != NormalizedStatus.DOWNLOADED:
                result.normalized_status = dl.normalized.value
                result.error_code = dl.error_code
                result.error_message = dl.error_message
                return
            if dl.downloaded_path:
                fpath = Path(dl.downloaded_path)
        if verify_download(fpath):
            result.downloaded_file = str(fpath)
            result.normalized_status = NormalizedStatus.DOWNLOADED.value
            if row.action == Action.PRINT and job.mock:
                ok, pstatus = print_with_dedupe(
                    self.repo,
                    awb_digits=row.awb_digits,
                    document_type=row.document_type,
                    path=fpath,
                    dry_run=job.dry_run,
                    copies=row.print_copies,
                )
                result.print_status = pstatus
                if ok:
                    result.normalized_status = NormalizedStatus.PRINTED.value
                elif pstatus == "SKIPPED_DUPLICATE":
                    result.normalized_status = NormalizedStatus.SKIPPED_DUPLICATE.value
                else:
                    result.normalized_status = NormalizedStatus.FAILED.value
                    result.error_code = "PRINT_FAILED"
                    result.error_message = pstatus
        else:
            result.normalized_status = NormalizedStatus.FAILED.value
            result.error_code = "DOWNLOAD_EMPTY"
            result.error_message = "File tải về rỗng hoặc thiếu"