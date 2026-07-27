from pathlib import Path

from app.services.download_service import (
    build_document_filename,
    find_recent_esid_pdf,
    write_placeholder_pdf,
)


def test_find_recent_esid_pdf(tmp_path: Path) -> None:
    docs = tmp_path / "docs"
    docs.mkdir()
    older = docs / build_document_filename("23218276495", "ESID")
    write_placeholder_pdf(older, "old")
    # Make mtime older
    import os
    import time

    older_ts = time.time() - 120
    os.utime(older, (older_ts, older_ts))

    newer = docs / build_document_filename("23218276495", "ESID")
    write_placeholder_pdf(newer, "new")

    hit = find_recent_esid_pdf(docs, "23218276495", max_age_s=600)
    assert hit is not None
    assert hit.name == newer.name

    miss = find_recent_esid_pdf(docs, "23218276495", max_age_s=1)
    # newer just written → still within 1s usually; force age
    os.utime(newer, (time.time() - 10, time.time() - 10))
    os.utime(older, (time.time() - 20, time.time() - 20))
    miss = find_recent_esid_pdf(docs, "23218276495", max_age_s=1)
    assert miss is None

    # TTL mặc định phải > 0 (trong ca)
    from app.services.download_service import pdf_cache_ttl_s

    assert pdf_cache_ttl_s() >= 600
