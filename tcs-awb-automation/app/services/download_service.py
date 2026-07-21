from __future__ import annotations

from datetime import datetime
from pathlib import Path

from app.utils.awb import safe_filename_awb


def build_document_filename(awb: str, document_type: str, when: datetime | None = None) -> str:
    ts = (when or datetime.now()).strftime("%Y%m%d_%H%M%S")
    doc = "".join(ch for ch in (document_type or "AWB").upper() if ch.isalnum() or ch in "-_") or "AWB"
    return f"{safe_filename_awb(awb)}_{doc}_{ts}.pdf"


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
