from __future__ import annotations

from pathlib import Path

from app.data.models import AwbJobResult
from app.services.excel_service import export_result_excel


def write_batch_report(results: list[AwbJobResult], output_dir: Path, stamp: str) -> Path:
    path = output_dir / f"TCS_AWB_RESULT_{stamp}.xlsx"
    return export_result_excel(results, path)