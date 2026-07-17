from __future__ import annotations

import hashlib
import os
import platform
from pathlib import Path

from app.data.repository import Repository


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def print_dedupe_key(awb_digits: str, document_type: str, digest: str) -> str:
    return f"{awb_digits}|{(document_type or 'AWB').upper()}|{digest}"


def send_to_printer(path: Path, *, dry_run: bool = False, copies: int = 1) -> tuple[bool, str]:
    """Gửi file vào hàng đợi in Windows. Dry-run chỉ xác nhận file tồn tại."""
    if not path.exists() or path.stat().st_size <= 0:
        return False, "FILE_MISSING"
    if dry_run:
        return True, "DRY_RUN"
    if platform.system() != "Windows":
        return False, "PRINT_UNSUPPORTED_OS"
    try:
        for _ in range(max(1, copies)):
            os.startfile(str(path), "print")  # type: ignore[attr-defined]
        return True, "OK"
    except OSError as e:
        return False, f"PRINT_FAILED:{e}"


def print_with_dedupe(
    repo: Repository,
    *,
    awb_digits: str,
    document_type: str,
    path: Path,
    dry_run: bool,
    copies: int,
    force: bool = False,
) -> tuple[bool, str]:
    digest = file_hash(path)
    key = print_dedupe_key(awb_digits, document_type, digest)
    if not force and repo.is_print_duplicate(key):
        return False, "SKIPPED_DUPLICATE"
    ok, status = send_to_printer(path, dry_run=dry_run, copies=copies)
    if ok:
        repo.mark_printed(key, digest)
    return ok, status