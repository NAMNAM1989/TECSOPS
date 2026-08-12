from __future__ import annotations

import os
import time
from datetime import datetime
from pathlib import Path

from app.utils.awb import safe_filename_awb


def build_document_filename(awb: str, document_type: str, when: datetime | None = None) -> str:
    ts = (when or datetime.now()).strftime("%Y%m%d_%H%M%S")
    doc = "".join(ch for ch in (document_type or "AWB").upper() if ch.isalnum() or ch in "-_") or "AWB"
    return f"{safe_filename_awb(awb)}_{doc}_{ts}.pdf"


def pdf_cache_ttl_s() -> float:
    """TTL tái dùng PDF ESID đã in (giây). Mặc định 8h trong ca; 0 = tắt cache."""
    raw = os.getenv("TCS_PDF_CACHE_TTL_S", "28800").strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 28800.0


def find_recent_esid_pdf(
    docs_dir: Path,
    awb: str,
    *,
    max_age_s: float | None = None,
    document_type: str = "ESID",
) -> Path | None:
    """
    Tìm PDF ESID mới nhất cùng AWB trong docs/ (tránh bấm IN + print lại).
    Tên file: {safe_awb}_{DOC}_{YYYYMMDD_HHMMSS}.pdf
    """
    ttl = pdf_cache_ttl_s() if max_age_s is None else max(0.0, float(max_age_s))
    if ttl <= 0:
        return None
    docs = Path(docs_dir)
    if not docs.is_dir():
        return None
    prefix = f"{safe_filename_awb(awb)}_"
    doc = "".join(ch for ch in (document_type or "ESID").upper() if ch.isalnum() or ch in "-_") or "ESID"
    now = time.time()
    best: Path | None = None
    best_mtime = 0.0
    for path in docs.glob(f"{prefix}*.pdf"):
        name = path.name
        if f"_{doc}_" not in name:
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        if st.st_size < 100:
            continue
        if (now - st.st_mtime) > ttl:
            continue
        if st.st_mtime >= best_mtime:
            best_mtime = st.st_mtime
            best = path
    return best


def _pdf_escape(text: str) -> str:
    return (
        (text or "")
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .encode("latin-1", errors="replace")
        .decode("latin-1")
    )


def write_placeholder_pdf(path: Path, title: str) -> Path:
    """PDF tối giản (không phụ thuộc thư viện ngoài) — mock / đến khi có PDF thật từ TCS."""
    path.parent.mkdir(parents=True, exist_ok=True)
    line1 = _pdf_escape((title or "TCS AWB")[:80])
    line2 = _pdf_escape(f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    stream = f"BT /F1 11 Tf 24 110 Td ({line1}) Tj 0 -18 Td ({line2}) Tj ET"
    stream_bytes = stream.encode("latin-1", errors="replace")
    objs = []
    objs.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objs.append(b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
    objs.append(
        b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 160] "
        b"/Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n"
    )
    objs.append(
        f"4 0 obj<< /Length {len(stream_bytes)} >>stream\n".encode("ascii")
        + stream_bytes
        + b"\nendstream endobj\n"
    )
    objs.append(b"5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objs:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n".encode("ascii"))
    out.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
    out.extend(
        f"trailer<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii")
    )
    path.write_bytes(bytes(out))
    return path


def verify_download(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


def resolve_docs_file(docs_dir: Path, name: str) -> Path | None:
    """Chỉ cho phép file PDF/PNG/JPG trong docs_dir (chống path traversal)."""
    if not name or "/" in name or "\\" in name or ".." in name:
        return None
    lower = name.lower()
    if not lower.endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp")):
        return None
    docs_dir = docs_dir.resolve()
    candidate = (docs_dir / name).resolve()
    try:
        candidate.relative_to(docs_dir)
    except ValueError:
        return None
    if candidate.is_file() and candidate.stat().st_size > 0:
        return candidate
    return None


def pdf_download_name(path: Path) -> str:
    return path.name


def docs_retention_s() -> float:
    """Giữ docs tối đa N giây. Mặc định 48h. 0 = không prune."""
    raw = os.getenv("TCS_DOCS_RETENTION_S", "172800").strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 172800.0


def prune_docs(
    docs_dir: Path,
    *,
    retention_s: float | None = None,
) -> dict[str, int | float]:
    """
    Xóa PDF/PNG/JPG trong docs/ già hơn retention.
    Giữ file mới nhất mỗi prefix AWB nếu vẫn trong TTL PDF cache (tránh mất cache hit).
    """
    docs = Path(docs_dir)
    retention = docs_retention_s() if retention_s is None else max(0.0, float(retention_s))
    if retention <= 0 or not docs.is_dir():
        return {"deleted": 0, "bytes": 0, "kept": 0}
    now = time.time()
    cache_ttl = pdf_cache_ttl_s()
    # Nhóm theo prefix trước _ESID_ / _AWB_ / preview
    newest_keep: set[Path] = set()
    by_prefix: dict[str, list[tuple[float, Path]]] = {}
    deleted = 0
    freed = 0
    kept = 0
    for path in docs.iterdir():
        if not path.is_file():
            continue
        lower = path.name.lower()
        if not lower.endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp")):
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        age = now - st.st_mtime
        # Prefix AWB 11 số đầu (safe_filename)
        stem = path.name
        prefix = stem.split("_", 1)[0] if "_" in stem else stem
        by_prefix.setdefault(prefix, []).append((st.st_mtime, path))

    for _prefix, items in by_prefix.items():
        items.sort(key=lambda x: x[0], reverse=True)
        if items:
            newest_mtime, newest_path = items[0]
            if (now - newest_mtime) <= max(cache_ttl, retention):
                newest_keep.add(newest_path)

    for path in docs.iterdir():
        if not path.is_file():
            continue
        lower = path.name.lower()
        if not lower.endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp")):
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        age = now - st.st_mtime
        if path in newest_keep and age <= max(cache_ttl, retention):
            kept += 1
            continue
        if age <= retention:
            kept += 1
            continue
        try:
            size = st.st_size
            path.unlink()
            deleted += 1
            freed += size
        except OSError:
            continue
    return {"deleted": deleted, "bytes": freed, "kept": kept}


def prune_chromium_disk_cache(profile_dir: Path) -> dict[str, int]:
    """
    Xóa Cache/Code Cache/GPUCache/Shader* dưới profile Chromium.
    Giữ Cookies, Local Storage, Login Data, marker login.
    """
    root = Path(profile_dir)
    if not root.is_dir():
        return {"deleted_dirs": 0, "bytes": 0}
    targets = (
        "Default/Cache",
        "Default/Code Cache",
        "Default/GPUCache",
        "Default/GrShaderCache",
        "Default/ShaderCache",
        "GrShaderCache",
        "ShaderCache",
        "GraphiteDawnCache",
    )
    deleted_dirs = 0
    freed = 0
    import shutil

    for rel in targets:
        p = root / rel
        if not p.exists():
            continue
        try:
            for sub in p.rglob("*"):
                if sub.is_file():
                    try:
                        freed += sub.stat().st_size
                    except OSError:
                        pass
            shutil.rmtree(p, ignore_errors=True)
            deleted_dirs += 1
        except Exception:
            continue
    # Recovery sibling profile cũ
    recovery = Path(str(root) + "_recovery")
    if recovery.is_dir():
        try:
            shutil.rmtree(recovery, ignore_errors=True)
            deleted_dirs += 1
        except Exception:
            pass
    return {"deleted_dirs": deleted_dirs, "bytes": freed}