"""OCR CAPTCHA local (ddddocr) — dùng khi ảnh chữ rõ, không méo mạnh."""
from __future__ import annotations

import base64
import re
from pathlib import Path
from typing import Any

_OCR = None


def _get_ocr():
    global _OCR
    if _OCR is None:
        import ddddocr

        _OCR = ddddocr.DdddOcr(show_ad=False)
    return _OCR


def normalize_captcha_text(raw: str) -> str:
    """Giữ chữ/số; TCS CAPTCHA phân biệt hoa/thường — chuẩn hóa UPPER."""
    s = (raw or "").strip()
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"[^A-Za-z0-9]", "", s)
    return s.upper()


def ocr_image_bytes(data: bytes) -> str:
    if not data:
        return ""
    # Phóng to ảnh nhỏ (100x27) giúp OCR ổn định hơn
    try:
        from io import BytesIO

        from PIL import Image

        img = Image.open(BytesIO(data)).convert("RGB")
        w, h = img.size
        if w < 200 or h < 50:
            img = img.resize((max(w * 3, 300), max(h * 3, 80)), Image.Resampling.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()
    except Exception:
        pass
    text = _get_ocr().classification(data)
    return normalize_captcha_text(str(text or ""))


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
            ".anticon-reload",
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
    """Đọc CAPTCHA từ DOM → OCR → text UPPER."""
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
