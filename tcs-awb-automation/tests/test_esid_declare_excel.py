from pathlib import Path

from app.services.esid_declare_excel import (
    ESID_DECLARE_HEADERS,
    analyze_row_readiness,
    create_esid_declare_template,
    load_esid_declare_excel,
)


def test_esid_declare_template_roundtrip(tmp_path: Path):
    path = tmp_path / "ESID_DECLARE_TEMPLATE.xlsx"
    create_esid_declare_template(path)
    rows = load_esid_declare_excel(path)
    assert len(rows) >= 1
    assert "AWB" in rows[0]
    assert set(ESID_DECLARE_HEADERS).issubset(set(rows[0].keys()) | set(ESID_DECLARE_HEADERS))
    ready = analyze_row_readiness(rows[0])
    assert "can_dry_fill" in ready
