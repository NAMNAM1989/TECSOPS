from pathlib import Path

from app.services.download_service import (
    build_document_filename,
    find_recent_esid_pdf,
    prune_docs,
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

    # newer just written → still within 1s usually; force age
    os.utime(newer, (time.time() - 10, time.time() - 10))
    os.utime(older, (time.time() - 20, time.time() - 20))
    miss = find_recent_esid_pdf(docs, "23218276495", max_age_s=1)
    assert miss is None

    # TTL mặc định phải > 0 (trong ca)
    from app.services.download_service import pdf_cache_ttl_s

    assert pdf_cache_ttl_s() >= 600


def test_prune_docs_removes_old_keeps_recent(tmp_path: Path) -> None:
    import os
    import time

    docs = tmp_path / "docs"
    docs.mkdir()
    old = docs / build_document_filename("23218276495", "ESID")
    write_placeholder_pdf(old, "old")
    old_ts = time.time() - 200_000
    os.utime(old, (old_ts, old_ts))

    fresh = docs / build_document_filename("23218276496", "ESID")
    write_placeholder_pdf(fresh, "fresh")

    stats = prune_docs(docs, retention_s=86_400)
    assert stats["deleted"] >= 1
    assert not old.exists()
    assert fresh.exists()
