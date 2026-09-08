# -*- coding: utf-8 -*-
"""
Tạo CSD-EK.pdf sạch:

1) Xóa data sample (không đụng nhãn Unique Consignment Identifier)
2) Whitify nền xám → trắng (giữ mực/đường kẻ)
3) Vẽ lại chỉ hairline đen thật — KHÔNG stroke nền xám thành ô
4) Mặc định SPX + REGULATED AGENT (không vẽ viền ô thêm)
5) Khôi phục nhãn Unique đầy đủ nếu bị cắt
"""
from __future__ import annotations

import os
import shutil

import fitz

SRC = r"D:\TECSOPS\public\templates\csd\_src-CSD-EK.pdf"
SRC_FALLBACK = r"e:\MẪU LÁT XÓA\FORM CÁC HÃNG\csd EK.pdf"
OUT = r"D:\TECSOPS\public\templates\csd\CSD-EK.pdf"
PREVIEW = r"D:\TECSOPS\public\templates\csd"

WHITE = (1.0, 1.0, 1.0)
CSD_SCALE = 3.0

LETTER_WIPES = [
    (142, 220, 278, 246),
    (384, 220, 555, 246),
    (142, 245, 265, 267),
    (385, 245, 600, 266),
    # Pcs / Weight: chỉ wipe vùng số — giữ chữ đơn vị pcs / kgs
    (144, 268, 200, 286),
    (386, 268, 452, 286),
    (116, 648, 280, 672),
    (356, 648, 523, 672),
    (116, 672, 300, 696),
    (356, 672, 523, 696),
    (116, 704, 290, 748),
    (498, 84, 555, 106),
    (458, 742, 605, 764),
    (70, 108, 555, 178),
]

CSD_SAMPLE_EXACT = {"SGN", "MAD", "DXB", "SPX", "FCO"}
CSD_SAMPLE_CONTAINS = (
    "VN/RA3/00009-01",
    "176 2121 6812",
    "FRESH FRUITS",
    "REGULATED AGENT",
    "NO HAWB",
    "28-11-2025",
    "15H30",
)
LABEL_HINTS = (
    "ORIGIN",
    "DESTINATION",
    "TRANSFER",
    "SECURITY",
    "SCREENING",
    "STATEMENT",
    "REGULATED ENTITY",
    "ADDITIONAL",
    "CONSIGNMENT",
    "CONTENTS",
    "WEIGHT",
    "RECEIVED",
    "IDENTIFIER",
    "METHODS",
    "EXEMPTION",
    "ISSUED",
    "NOTE",
    "UNIQUE",
    "XRY",
    "PHS",
    "EDS",
    "EDD",
    "ETD",
)


def wipe_white(page: fitz.Page, boxes: list[tuple[float, float, float, float]]) -> None:
    for x0, y0, x1, y1 in boxes:
        page.draw_rect(fitz.Rect(x0, y0, x1, y1), color=WHITE, fill=WHITE, width=0)


def is_sample_span(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    upper = t.upper()
    if upper in {"XRY", "PHS", "EDS", "EDD", "ETD"}:
        return False
    if any(h in upper for h in LABEL_HINTS) and upper not in CSD_SAMPLE_EXACT:
        if len(upper) > 8:
            return False
    if upper in CSD_SAMPLE_EXACT:
        return True
    for marker in CSD_SAMPLE_CONTAINS:
        m = marker.upper()
        if upper == m or m in upper:
            return True
    return False


def tight_rect(bbox: fitz.Rect, scale: float = 0.92) -> fitz.Rect:
    cx = (bbox.x0 + bbox.x1) / 2
    cy = (bbox.y0 + bbox.y1) / 2
    w = max(bbox.width * scale, 2.0)
    h = max(bbox.height * scale, 2.0)
    return fitz.Rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def redact_sample_data(page: fitz.Page) -> int:
    """Phủ sample value — tuyệt đối không đụng dải nhãn y≈168–181 (Unique…)."""
    rects: list[fitz.Rect] = []
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if not is_sample_span(span.get("text") or ""):
                    continue
                bbox = fitz.Rect(span["bbox"])
                # Không đụng hàng nhãn Identifier (Unique / Regulated Entity)
                if bbox.y1 <= 181.5 and bbox.y0 >= 168:
                    continue
                rects.append(tight_rect(bbox, 0.90))

    for needle in (
        "176 2121 6812",
        "VN/RA3/00009-01",
        "FRESH FRUITS",
        "REGULATED AGENT",
        "NO HAWB",
        "28-11-2025",
        "15H30",
        "SGN",
        "MAD",
        "DXB",
        "SPX",
        "FCO",
    ):
        for hit in page.search_for(needle):
            if hit.y1 <= 181.5 and hit.y0 >= 168:
                continue  # nhãn Unique…
            rects.append(tight_rect(hit, 0.90))

    for hit in page.search_for("XRY"):
        # tick/checkbox nằm bên phải mã XRY (không phải bên trái)
        rects.append(fitz.Rect(hit.x1 + 2, hit.y0 - 1, hit.x1 + 18, hit.y1 + 1))
        rects.append(fitz.Rect(hit.x0 - 16, hit.y0 + 1, hit.x0 - 4, hit.y1 - 1))

    # Ô value — dưới nhãn
    for box in (
        (18, 182.5, 110, 193),  # RA
        (250, 182.5, 360, 193),  # AWB (x>=250 tránh chân chữ Unique)
        (18, 220, 240, 243),  # Contents
        (286, 220, 316, 230),  # Pcs
        (416, 220, 444, 230),  # Weight
        (55, 259, 110, 269),  # Origin
        (180, 259, 240, 269),  # Dest
        (390, 259, 480, 269),  # Transfer
        # SPX / REGULATED AGENT — không wipe (để mặc định; sẽ ghi lại cho chắc)
        (16, 520, 200, 542),  # Issued by
        (340, 514, 505, 538),  # Date-Time
        (34, 572, 140, 592),  # footer RA
        (18, 615, 500, 668),  # Additional
    ):
        rects.append(fitz.Rect(*box))

    for r in rects:
        page.add_redact_annot(r, fill=WHITE)
    if rects:
        page.apply_redactions()
    return len(rects)


def whitify_background_keep_lines(pix: fitz.Pixmap) -> fitz.Pixmap:
    if pix.alpha:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    w, h, n = pix.w, pix.h, pix.n
    src = memoryview(pix.samples)
    avg = bytearray(w * h)
    for y in range(h):
        base = y * w
        for x in range(w):
            i = (base + x) * n
            r, g, b = src[i], src[i + 1], src[i + 2]
            avg[base + x] = (r + g + b) // 3

    out = bytearray(pix.samples)
    for y in range(h):
        for x in range(w):
            idx = y * w + x
            i = idx * n
            r, g, b = out[i], out[i + 1], out[i + 2]
            if max(r, g, b) - min(r, g, b) > 40:
                continue
            a = avg[idx]
            if a < 145:
                continue
            if a >= 190:
                out[i] = out[i + 1] = out[i + 2] = 255
                continue
            near_ink = False
            for dy in (-1, 0, 1):
                yy = y + dy
                if yy < 0 or yy >= h:
                    continue
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    xx = x + dx
                    if 0 <= xx < w and avg[yy * w + xx] < 120:
                        near_ink = True
                        break
                if near_ink:
                    break
            if not near_ink:
                out[i] = out[i + 1] = out[i + 2] = 255
    return fitz.Pixmap(pix.colorspace, w, h, bytes(out), False)


def _is_gray_fill(fill: object) -> bool:
    if not fill or not isinstance(fill, (tuple, list)) or len(fill) < 3:
        return False
    r, g, b = float(fill[0]), float(fill[1]), float(fill[2])
    # nền xám/be (không phải đen, không phải trắng)
    avg = (r + g + b) / 3
    return 0.55 < avg < 0.98 and abs(r - g) < 0.05 and abs(g - b) < 0.05


def _is_black_hairline(rect: fitz.Rect, fill: object) -> bool:
    """Đường kẻ dạng rect đen mỏng trong PDF gốc — không phải nền xám."""
    if not fill or not isinstance(fill, (tuple, list)):
        return False
    if float(fill[0]) > 0.15:
        return False
    return rect.width < 1.6 or rect.height < 1.6


def redraw_true_borders_and_form_cells(
    clean_pix: fitz.Pixmap,
    src_page: fitz.Page,
    page_rect: fitz.Rect,
    scale: float,
) -> fitz.Pixmap:
    """
    - Chỉ vẽ lại hairline đen (đường kẻ thật).
    - KHÔNG stroke nền xám thành ô; không thêm viền Pcs/Weight/SPX/Received from.
    - Ghi mặc định SPX + REGULATED AGENT.
    - Khôi phục nhãn Unique nếu bị thiếu.
    """
    tmp = fitz.open()
    page = tmp.new_page(width=page_rect.width, height=page_rect.height)
    page.insert_image(page_rect, stream=clean_pix.tobytes("png"))

    black = (0, 0, 0)
    drawn = 0

    for d in src_page.get_drawings():
        fill = d.get("fill")
        stroke = d.get("color")
        width = float(d.get("width") or 0.55)
        if width <= 0:
            width = 0.55
        for item in d.get("items", []):
            if item[0] != "re":
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    # bỏ nút IN xanh
                    if min(p1.x, p2.x) >= 445 and max(p1.y, p2.y) <= 170:
                        continue
                    if stroke and float(stroke[0]) < 0.2:
                        page.draw_line(p1, p2, color=black, width=max(width, 0.55))
                        drawn += 1
                continue
            r = item[1]
            # bỏ nút IN (xanh, góc trên phải) — giữ viền phải form x≈504
            if r.x0 >= 445 and r.y1 <= 170:
                continue
            # Bỏ nền xám — không tạo ô từ fill xám
            if _is_gray_fill(fill):
                continue
            if _is_black_hairline(r, fill):
                page.draw_rect(r, color=black, fill=black, width=0)
                drawn += 1
            elif stroke and float(stroke[0]) < 0.2:
                page.draw_rect(r, color=black, width=max(width, 0.55), fill=None)
                drawn += 1

    # Pcs / Weight / Security Status / Received from: KHÔNG vẽ viền ô thêm
    # (nền xám chỉ là nền; chỉ ghi mặc định SPX + REGULATED AGENT)
    page.insert_text(
        fitz.Point(28, 325),
        "SPX",
        fontsize=11,
        fontname="hebo",
        color=black,
    )
    page.insert_text(
        fitz.Point(138, 326),
        "REGULATED AGENT",
        fontsize=8,
        fontname="helv",
        color=black,
    )

    # --- Unique Consignment Identifier: khôi phục nhãn đủ chữ ---
    # Phủ trắng vùng nhãn rồi ghi lại đầy đủ (tránh chữ cụt "e Consignment…")
    page.draw_rect(fitz.Rect(246.5, 169.5, 400.0, 180.8), color=(1, 1, 1), fill=(1, 1, 1), width=0)
    page.insert_text(
        fitz.Point(247.0, 178.5),
        "Unique Consignment Identifier:",
        fontsize=8.5,
        fontname="helv",
        color=black,
    )

    out = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    tmp.close()
    print(f"  border strokes + form cells: {drawn}")
    return out


def embed_pixmap_png(page: fitz.Page, rect: fitz.Rect, pix: fitz.Pixmap) -> None:
    page.insert_image(rect, stream=pix.tobytes("png"))


def page_letter_to_clean(src: fitz.Document, page_index: int, out_doc: fitz.Document) -> None:
    rect = src[page_index].rect
    tmp = fitz.open()
    page = tmp.new_page(width=rect.width, height=rect.height)
    page.show_pdf_page(rect, src, page_index)
    wipe_white(page, LETTER_WIPES)
    pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
    pix = whitify_background_keep_lines(pix)
    tmp.close()
    new_page = out_doc.new_page(width=rect.width, height=rect.height)
    embed_pixmap_png(new_page, rect, pix)


def page_csd_to_clean(src: fitz.Document, page_index: int, out_doc: fitz.Document) -> None:
    rect = src[page_index].rect
    mat_scale = CSD_SCALE
    src_page = src[page_index]

    tmp = fitz.open()
    page = tmp.new_page(width=rect.width, height=rect.height)
    page.show_pdf_page(rect, src, page_index)

    n = redact_sample_data(page)
    print(f"  CSD redacts: {n}")
    wipe_white(page, [(446.0, 138.0, 505.0, 165.0), (446.0, 676.0, 505.0, 702.0)])

    pix = page.get_pixmap(matrix=fitz.Matrix(mat_scale, mat_scale), alpha=False)
    pix = whitify_background_keep_lines(pix)
    pix = redraw_true_borders_and_form_cells(pix, src_page, rect, mat_scale)
    tmp.close()

    new_page = out_doc.new_page(width=rect.width, height=rect.height)
    embed_pixmap_png(new_page, rect, pix)


def main() -> None:
    src_path = SRC if os.path.isfile(SRC) else SRC_FALLBACK
    if not os.path.isfile(src_path):
        raise SystemExit(f"Không tìm thấy nguồn EK: {SRC} hoặc {SRC_FALLBACK}")
    if src_path != SRC:
        os.makedirs(os.path.dirname(SRC), exist_ok=True)
        shutil.copy2(src_path, SRC)
        src_path = SRC

    src = fitz.open(src_path)
    out = fitz.open()
    page_letter_to_clean(src, 0, out)
    page_csd_to_clean(src, 2, out)
    src.close()

    out.set_metadata(
        {
            "title": "Emirates SkyCargo — blank CSD + Consignee Certification Letter",
            "author": "TECSOPS",
            "subject": "Blank EK — white bg, no sample, structural lines restored",
        }
    )
    out.save(OUT, garbage=4, deflate=True)
    print("wrote", OUT, "pages", out.page_count)

    for i, page in enumerate(out):
        pix = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4))
        path = rf"{PREVIEW}\_preview-ek-clean-p{i}.png"
        pix.save(path)
        print("preview", path)
    out.close()
    print("size", os.path.getsize(OUT))


if __name__ == "__main__":
    main()
