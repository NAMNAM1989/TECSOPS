# OCR CAPTCHA trong Ext (ONNX)

Offline OCR bằng `ddddocr` `common.onnx` + ONNX Runtime Web (offscreen MV3).

## Chuẩn bị asset

```bash
pip install ddddocr
npm install   # có onnxruntime-web
npm run ext:fetch-ocr
```

Sinh ra (gitignore binary lớn):

- `common.onnx` (~54MB)
- `ort.min.js` + `ort-wasm-simd-threaded.wasm`

Giữ trong repo: `offscreen.html`, `offscreen.js`, `charsets.json`.

## Dùng

Reload Ext unpacked → ĐN trên Ops. CAPTCHA được OCR trong Ext trước; fallback agent localhost rồi nhập tay.
