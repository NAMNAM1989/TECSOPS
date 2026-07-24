"""OCR CAPTCHA local (ddddocr) — dùng khi ảnh chữ rõ, không méo mạnh."""
from __future__ import annotations

import base64
import re
import threading
from collections import Counter
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

_OCR = None
_OCR_LOCK = threading.Lock()


@dataclass(frozen=True)
class CaptchaOcrResult:
    """Kết quả OCR đã qua kiểm tra để tránh submit CAPTCHA đoán mò."""

    text: str
    confidence: float
    candidates: tuple[tuple[str, int], ...]
    samples: int
    accepted: bool

    @property
    def error(self) -> str:
        if self.accepted:
            return ""
        if not self.candidates:
            return "OCR_EMPTY"
        return "OCR_LOW_CONFIDENCE"


def _get_ocr():
    global _OCR
    if _OCR is None:
        import ddddocr

        _OCR = ddddocr.DdddOcr(show_ad=False)
    return _OCR


def normalize_captcha_text(raw: str) -> str:
    """Giữ chữ/số và chuẩn hóa theo bộ ký tự CAPTCHA TCS (A-Z, 0-9)."""
    s = (raw or "").strip()
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"[^A-Za-z0-9]", "", s)
    return s.upper()


def _encode_png(image: Any) -> bytes:
    buf = BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def _captcha_variants(data: bytes) -> list[bytes]:
    """
    TCS trả PNG RGBA nền trong suốt, chữ đen. ``convert("RGB")`` trực tiếp sẽ
    biến cả nền lẫn chữ thành đen và làm mất CAPTCHA. Luôn ghép lên nền trắng
    trước, sau đó tạo vài biến thể ít phá nét để bỏ phiếu OCR.
    """
    from PIL import Image, ImageOps

    source = Image.open(BytesIO(data))
    if source.mode in {"RGBA", "LA"} or "transparency" in source.info:
        rgba = source.convert("RGBA")
        canvas = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        canvas.alpha_composite(rgba)
        rgb = canvas.convert("RGB")
    else:
        rgb = source.convert("RGB")

    gray = ImageOps.autocontrast(ImageOps.grayscale(rgb))
    variants = [rgb, gray]
    resampling = getattr(Image, "Resampling", Image)
    for scale in (2, 3):
        size = (rgb.width * scale, rgb.height * scale)
        variants.append(rgb.resize(size, resampling.LANCZOS))
        variants.append(gray.resize(size, resampling.LANCZOS))
    return [_encode_png(image) for image in variants]


def ocr_image_bytes_detailed(
    data: bytes,
    *,
    expected_length: int = 5,
    min_confidence: float = 0.60,
) -> CaptchaOcrResult:
    """OCR nhiều biến thể và chỉ chấp nhận kết quả có đồng thuận đủ mạnh."""
    if not data:
        return CaptchaOcrResult("", 0.0, (), 0, False)

    try:
        variants = _captcha_variants(data)
    except Exception:
        # Fallback cho định dạng ảnh lạ; vẫn không bỏ qua bước bỏ phiếu/độ dài.
        variants = [data]

    readings: list[str] = []
    ocr = _get_ocr()
    # DdddOcr dùng chung trong HTTP server đa luồng, nên serialize inference.
    with _OCR_LOCK:
        for variant in variants:
            try:
                text = normalize_captcha_text(str(ocr.classification(variant) or ""))
            except Exception:
                text = ""
            if text:
                readings.append(text)

    counts = Counter(readings)
    ranked = tuple(sorted(counts.items(), key=lambda item: (-item[1], item[0])))
    if not ranked:
        return CaptchaOcrResult("", 0.0, (), len(variants), False)

    best_text, best_votes = ranked[0]
    confidence = best_votes / max(1, len(readings))
    accepted = (
        (expected_length <= 0 or len(best_text) == expected_length)
        and confidence >= min_confidence
    )
    return CaptchaOcrResult(
        best_text if accepted else "",
        round(confidence, 4),
        ranked,
        len(variants),
        accepted,
    )


def ocr_image_bytes(data: bytes) -> str:
    """API tương thích cũ: chỉ trả text khi kết quả đã đủ tin cậy."""
    return ocr_image_bytes_detailed(data).text


def find_captcha_image_locator(page: Any):
    """Tìm ảnh CAPTCHA gần ô #basic_captchaCode (ưu tiên data:image)."""
    # Ưu tiên ảnh base64 cạnh input captcha
    try:
        loc = page.locator(".ant-form-item:has(#basic_captchaCode) img[src^='data:image']")
        if loc.count() > 0 and loc.first.is_visible():
            return loc.first
    except Exception:
        pass
    candidates = [
        ".ant-form-item:has(#basic_captchaCode) img",
        "#basic_captchaCode ~ img",
        'img[src^="data:image"]',
        'img[src*="captcha" i]',
        "form#basic img[src^='data:image']",
    ]
    for sel in candidates:
        try:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                # Bỏ logo lớn
                box = loc.first.bounding_box()
                if box and box.get("width", 0) > 200:
                    continue
                return loc.first
        except Exception:
            continue
    try:
        handle = page.evaluate_handle(
            """() => {
              const input = document.querySelector('#basic_captchaCode');
              if (!input) return null;
              const root = input.closest('.ant-form-item') || input.parentElement || document;
              const imgs = [...root.querySelectorAll('img')];
              const dataImg = imgs.find(i => (i.getAttribute('src')||'').startsWith('data:image'));
              return dataImg || imgs[0] || null;
            }"""
        )
        el = handle.as_element()
        if el:
            return el
    except Exception:
        pass
    return None


def _bytes_from_data_uri(src: str) -> bytes | None:
    if not src or not src.startswith("data:image"):
        return None
    try:
        _, b64 = src.split(",", 1)
        return base64.b64decode(b64)
    except Exception:
        return None


def capture_captcha_image(page: Any, save_path: Path | None = None) -> bytes:
    """Lấy bytes PNG CAPTCHA — ưu tiên decode data:URI, fallback screenshot."""
    # 1) data:image từ DOM (sắc nét hơn screenshot)
    try:
        src = page.evaluate(
            """() => {
              const input = document.querySelector('#basic_captchaCode');
              const root = input && (input.closest('.ant-form-item') || input.parentElement);
              const img = root && root.querySelector('img[src^="data:image"]');
              return img ? img.getAttribute('src') : null;
            }"""
        )
        data = _bytes_from_data_uri(src or "")
        if data:
            if save_path is not None:
                save_path.parent.mkdir(parents=True, exist_ok=True)
                save_path.write_bytes(data)
            return data
    except Exception:
        pass

    target = find_captcha_image_locator(page)
    if target is None:
        raise RuntimeError("Không tìm thấy ảnh CAPTCHA trên trang login")
    if save_path is not None:
        save_path.parent.mkdir(parents=True, exist_ok=True)
        if hasattr(target, "screenshot"):
            target.screenshot(path=str(save_path))
        else:
            target.screenshot(path=str(save_path))
        return save_path.read_bytes()
    if hasattr(target, "screenshot"):
        return target.screenshot(type="png")
    return target.screenshot(type="png")


def refresh_captcha_via_reload_icon(page: Any) -> bool:
    """Click nút làm mới CAPTCHA (icon xoay cạnh ảnh)."""
    try:
        # Ant Design: span/role=img cạnh captcha, hoặc button reload
        root = page.locator(".ant-form-item:has(#basic_captchaCode)")
        for sel in (
            "span[aria-label='reload']",
            "span[aria-label='sync']",
            "span[aria-label='redo']",
            ".anticon-reload",
            ".anticon-sync",
            "svg[data-icon='reload']",
            "svg[data-icon='sync']",
            "span.anticon",
            "button",
        ):
            loc = root.locator(sel)
            if loc.count() > 0:
                loc.last.click(timeout=2000)
                page.wait_for_timeout(700)
                return True
    except Exception:
        pass
    # fallback: click ảnh
    img = find_captcha_image_locator(page)
    if img is not None:
        try:
            img.click(timeout=2000)
            page.wait_for_timeout(700)
            return True
        except Exception:
            pass
    return False


def solve_captcha_from_page(page: Any, *, debug_dir: Path | None = None) -> str:
    """Đọc CAPTCHA từ DOM → OCR đồng thuận → text đã kiểm tra."""
    save = None
    if debug_dir is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)
        from datetime import datetime

        save = debug_dir / f"captcha_{datetime.now().strftime('%H%M%S_%f')}.png"
    data = capture_captcha_image(page, save)
    text = ocr_image_bytes(data)
    if not text:
        raise RuntimeError("OCR không đọc được CAPTCHA")
    return text
