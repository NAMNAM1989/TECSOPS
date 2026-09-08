# -*- coding: utf-8 -*-
"""
Mẫu điền EK (Letter + CSD) — review layout (khớp LAYOUT_EK_* trong csdForms.ts).
"""
from __future__ import annotations

import fitz

BLANK = r"D:\TECSOPS\public\templates\csd\CSD-EK.pdf"
OUT_PDF = r"D:\TECSOPS\public\templates\csd\CSD-EK-MOCKUP.pdf"
OUT_DIR = r"D:\TECSOPS\public\templates\csd"

SAMPLE = {
    "company_block": "ACME IMPORTS LTD\nMadrid, Spain",
    "awb": "176-2121 6812",
    "dest": "MAD",
    "routing": "SGN-DXB-MAD",
    "letter_date": "08-Sep-2026",
    "goods": "FRESH FRUITS",
    "pcs": "120",
    "kg": "850",
    "issued_by": "NGUYEN VAN A",
    "title": "STAFF",
    "sign_company": "SAIGON CARGO SERVICE CORP.",
    "issued_datetime": "08-Sep-2026  15:30",
    "ra": "VN/RA3/00009-01",
    "origin": "SGN",
    "transfer": "DXB",
    "additional": "NO HAWB",
}


def draw(page: fitz.Page, text: str, x: float, y: float, size: float = 11) -> None:
    page.insert_text(
        fitz.Point(x, y),
        text,
        fontsize=size,
        fontname="hebo",
        color=(0, 0, 0),
    )


def draw_reg(page: fitz.Page, text: str, x: float, y: float, size: float = 10) -> None:
    page.insert_text(
        fitz.Point(x, y),
        text,
        fontsize=size,
        fontname="helv",
        color=(0, 0, 0),
    )


def fill_letter(page: fitz.Page) -> None:
    s = SAMPLE
    for i, line in enumerate(s["company_block"].split("\n")):
        draw_reg(page, line, 78, 118 + i * 12, size=10)
    draw(page, s["awb"], 144, 238, size=14)
    draw(page, s["routing"], 388, 236, size=11)
    draw(page, s["letter_date"], 144, 258, size=13)
    draw(page, s["goods"], 388, 258, size=12)
    draw(page, s["pcs"], 150, 278, size=12)
    draw(page, s["kg"], 390, 278, size=12)
    draw(page, s["issued_by"], 120, 662, size=11)
    draw(page, s["title"], 365, 662, size=10)
    draw_reg(page, s["sign_company"], 120, 686, size=10)
    draw(page, s["letter_date"], 365, 686, size=10)


def fill_csd(page: fitz.Page) -> None:
    s = SAMPLE
    draw(page, s["ra"], 18, 191, size=10)
    draw(page, s["awb"], 250, 191, size=12)
    draw(page, s["goods"], 18, 232, size=15)
    draw(page, s["pcs"], 286, 217, size=11)
    draw(page, s["kg"], 416, 217, size=11)
    draw(page, s["origin"], 56, 262, size=14)
    draw(page, s["dest"], 185, 262, size=16)
    draw(page, s["transfer"], 390, 258, size=12)
    # SPX / REGULATED AGENT bake trên blank
    draw(page, "X", 268, 319, size=10)
    draw(page, s["issued_by"], 20, 534, size=11)
    draw(page, s["issued_datetime"], 348, 540, size=10)
    draw(page, s["ra"], 36, 584, size=11)
    draw(page, s["additional"], 20, 630, size=11)


def main() -> None:
    doc = fitz.open(BLANK)
    assert doc.page_count == 2, doc.page_count
    fill_letter(doc[0])
    fill_csd(doc[1])
    doc.save(OUT_PDF, garbage=4, deflate=True)
    print("wrote", OUT_PDF)
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4))
        path = rf"{OUT_DIR}\_preview-ek-mockup-p{i}.png"
        pix.save(path)
        print("preview", path)
    doc.close()


if __name__ == "__main__":
    main()
