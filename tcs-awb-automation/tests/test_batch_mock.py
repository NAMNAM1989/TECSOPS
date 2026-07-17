from pathlib import Path

from app.config import Settings, ensure_runtime_dirs
from app.data.repository import Repository
from app.services.awb_service import validate_ops_payload
from app.services.batch_service import BatchService
from app.services.excel_service import create_import_template, excel_to_validated_rows
from app.services.print_service import file_hash, print_dedupe_key
from app.utils.awb import normalize_awb


def _settings(tmp: Path) -> Settings:
    s = Settings(
        mock=True,
        dry_run=True,
        output_dir=tmp / "output",
        browser_profile=tmp / "profile",
        screenshots_dir=tmp / "shots",
        logs_dir=tmp / "logs",
        db_path=tmp / "data" / "t.db",
        templates_dir=tmp / "templates",
        discovery_dir=tmp / "discovery",
    )
    ensure_runtime_dirs(s)
    return s


def test_mock_batch_completed_and_not(tmp_path: Path):
    settings = _settings(tmp_path)
    repo = Repository(settings.db_path)
    batch = BatchService(settings, repo)
    # even last digit -> completed; odd -> not
    rows = validate_ops_payload(
        {
            "warehouse": "TECS-TCS",
            "rows": [
                {"awb": "12312345670", "action": "DOWNLOAD"},  # 0 even
                {"awb": "12312345671", "action": "LOOKUP"},  # 1 odd
                {"awb": "12312345679", "action": "LOOKUP"},  # 9 error
            ],
        }
    )
    job = batch.create_job_from_rows(rows, source="test", dry_run=True, mock=True)
    results, report = batch.run(job)
    assert report.exists()
    assert results[0].normalized_status == "DOWNLOADED"
    assert results[0].downloaded_file
    assert results[1].normalized_status == "NOT_COMPLETED"
    assert not results[1].downloaded_file
    assert results[2].normalized_status == "FAILED"


def test_mock_ops_status_completed_downloads_pdf(tmp_path: Path):
    settings = _settings(tmp_path)
    repo = Repository(settings.db_path)
    batch = BatchService(settings, repo)
    # AWB lẻ (thường NOT_COMPLETED) nhưng ops_status COMPLETED → vẫn tải PDF
    rows = validate_ops_payload(
        {
            "warehouse": "TECS-TCS",
            "rows": [
                {"awb": "23218276495", "action": "DOWNLOAD", "ops_status": "COMPLETED"},
            ],
        }
    )
    job = batch.create_job_from_rows(rows, source="test", dry_run=True, mock=True)
    results, _ = batch.run(job)
    assert results[0].normalized_status == "DOWNLOADED"
    assert results[0].downloaded_file
    assert Path(results[0].downloaded_file).exists()


def test_mock_ops_received_reception_downloads_pdf(tmp_path: Path):
    settings = _settings(tmp_path)
    repo = Repository(settings.db_path)
    batch = BatchService(settings, repo)
    rows = validate_ops_payload(
        {
            "warehouse": "TECS-TCS",
            "rows": [
                {"awb": "23218276495", "action": "DOWNLOAD", "ops_status": "RECEIVED"},
            ],
        }
    )
    job = batch.create_job_from_rows(rows, source="test", dry_run=True, mock=True)
    results, _ = batch.run(job)
    assert results[0].normalized_status == "DOWNLOADED"
    assert results[0].downloaded_file


def test_print_dedupe(tmp_path: Path):
    settings = _settings(tmp_path)
    repo = Repository(settings.db_path)
    batch = BatchService(settings, repo)
    rows = validate_ops_payload(
        {
            "warehouse": "TECS-TCS",
            "rows": [
                {"awb": "12312345670", "action": "PRINT"},
                {"awb": "12312345670", "action": "PRINT"},
            ],
        }
    )
    # second row will be validation duplicate AWB+ACTION
    assert rows[1].validation_error
    job = batch.create_job_from_rows([rows[0]], source="test", dry_run=True, mock=True)
    results, _ = batch.run(job)
    assert results[0].normalized_status == "PRINTED"
    # same content printed again -> skip
    job2 = batch.create_job_from_rows([rows[0]], source="test", dry_run=True, mock=True)
    results2, _ = batch.run(job2)
    assert results2[0].normalized_status in {"PRINTED", "SKIPPED_DUPLICATE"}


def test_excel_template_roundtrip(tmp_path: Path):
    settings = _settings(tmp_path)
    path = settings.templates_dir / "AWB_IMPORT_TEMPLATE.xlsx"
    create_import_template(path)
    rows = excel_to_validated_rows(path)
    assert len(rows) >= 2
    assert all(normalize_awb(r.awb_raw).ok or r.validation_error for r in rows)


def test_register_blocked_without_confirm(tmp_path: Path):
    settings = _settings(tmp_path)
    repo = Repository(settings.db_path)
    batch = BatchService(settings, repo)
    rows = validate_ops_payload(
        {
            "warehouse": "TECS-TCS",
            "rows": [
                {
                    "awb": "12312345670",
                    "action": "REGISTER",
                    "flight": "VN123",
                    "pcs": 2,
                    "kg": 10,
                }
            ],
        }
    )
    job = batch.create_job_from_rows(rows, source="test", mock=True, confirm_register=False)
    results, _ = batch.run(job)
    assert results[0].error_code == "CONFIRM_REQUIRED"


def test_print_key_stable():
    key = print_dedupe_key("12312345678", "AWB", "abc")
    assert key.startswith("12312345678|AWB|")