# -*- coding: utf-8 -*-
"""Tạo CSD-PR.pdf sạch từ mẫu PAL F-0462 — giữ default hữu ích, xóa chữ mẫu cá nhân."""
from __future__ import annotations

import os
import shutil

import fitz

SRC = r"e:\MẪU LÁT XÓA\FORM CÁC HÃNG\CSD PR.pdf"
SRC_COPY = r"D:\TECSOPS\public\templates\csd\_src-CSD-PR.pdf"
OUT = r"D:\TECSOPS\public\templates\csd\CSD-PR.pdf"
PREVIEW = r"D:\TECSOPS\public\templates\csd"

WHITE = (1, 1, 1)


def wipe(page: fitz.Page, boxes: list[tuple[float, float, float, float]]) -> None:
    for box in boxes:
        page.draw_rect(fitz.Rect(*box), color=WHITE, fill=WHITE, width=0)


def main() -> None:
    if not os.path.isfile(SRC):
        raise SystemExit(f"missing source: {SRC}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    shutil.copy2(SRC, SRC_COPY)

    src = fitz.open(SRC)
    out = fitz.open()
    out.insert_pdf(src)
    src.close()
    page = out[0]

    # Xóa tên screener mẫu + Verified-by cố định (sẽ điền theo kho khi in)
    wipe(
        page,
        [
            (57.0, 560.0, 200.0, 576.0),  # LUY DOAN
            (378.0, 345.5, 530.0, 354.5),  # TCS Co., Ltd. - PAL Cargo Handler
        ],
    )

    out.set_metadata(
        {
            "title": "Philippine Airlines — Cargo Security Declaration (blank)",
            "author": "TECSOPS",
            "subject": "CSD PR F-0462 — blank for TECSOPS fill",
        }
    )
    out.save(OUT, garbage=4, deflate=True)
    print("wrote", OUT, "pages", out.page_count)

    pix = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4), alpha=False)
    path = rf"{PREVIEW}\_preview-pr-clean.png"
    pix.save(path)
    print("preview", path)
    out.close()
    print("size", os.path.getsize(OUT))


if __name__ == "__main__":
    main()
