# OCR CAPTCHA trong Ext (ONNX)

Offline OCR bằng `ddddocr` `common.onnx` + ONNX Runtime Web (offscreen MV3).

## Chuẩn bị asset

Không commit `common.onnx` (~54MB). Lấy lúc build:

```bash
# Local: Python + ddddocr (cùng pin Docker) hoặc script tự tải wheel PyPI
pip install ddddocr==1.5.6
npm install   # có onnxruntime-web
npm run ext:fetch-ocr
```

Hoặc set `EXT_OCR_ONNX_URL` trỏ tới GitHub Release asset / URL file onnx.

Docker/Railway: stage Python `pip download ddddocr==1.5.6 --no-deps` → extract `common.onnx` → Node `ext:fetch-ocr` (skip nếu đã có file) → `prebuild` đóng ZIP.

Sinh ra (gitignore binary lớn):

- `common.onnx` (~54MB)
- `ort.min.js` + `ort-wasm-simd-threaded.wasm`

Giữ trong repo: `offscreen.html`, `offscreen.js`, `charsets.json`.

## Dùng

Reload Ext unpacked → Đăng Nhập TCS trên Ops. CAPTCHA OCR trong Ext (offscreen ONNX). ZIP tải từ Ops phải có đủ `ocr/common.onnx` (~60MB+).
