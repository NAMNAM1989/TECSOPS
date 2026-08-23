# Portal TCS / SCSC — Ext trên PC kho

## Mô hình bắt buộc

**Bấm trên Ops (web) → Chrome Ext trên PC kho thực thi** (`chrome-extension-tcs` / `chrome-extension-scsc`).

Không dùng Playwright trong container Railway / dual-agent / Python `tcs-awb-automation`.

```
Ops UI (click)
  → postMessage content-ops.js
  → Ext background trên PC kho
  → tab tcs.com.vn / ecargo.scsc.vn
```

Handshake: `docs/ops-ext-protocol.md` (`EXT_READY` / job / result / error).  
Chip **Ext · offline|sẵn sàng|đã login** trên bar Ops.

Mã kho dữ liệu **TECS-TCS** và **TCS** cùng Ext TCS (`tecsops-tcs-direct-ext`).  
Mã **SCSC** dùng Ext SCSC. Không đổi mã trong DB / `warehouses.ts`.

Điện thoại: không Đăng Nhập TCS / Quét / Điền — UI báo **«cần Ext trên PC»**.

## Railway — image lean Node

Dockerfile chỉ cài Node + build Vite. `start-fullstack` chỉ chạy `server/index.mjs`.

`/tcs-agent/*` trả **410 AGENT_GONE** (stub, tránh 500 / HTML SPA).

## Railway Variables (bắt buộc cho app)

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | Postgres (đã có) |
| `TECSOPS_APP_TOKEN` | Auth web/API (xem `.env.example`) |

eCargo OTP (Ext SCSC): `ECARGO_IMAP_*` nếu còn dùng IMAP trên server.

## Follow-up ops (không làm trong PR A3) — @Railways

Gỡ trên Railway service sau khi merge:

- Biến `TCS_AGENT_*` (`TCS_AGENT_DUAL`, `TCS_AGENT_ENABLED`, `TCS_AGENT_PROXY`, `TCS_AGENT_URL`, `TCS_AGENT_URL_TCS`, …)
- `TCS_USERNAME` / `TCS_PASSWORD` / `TCS_USERNAME_TCS` / `TCS_PASSWORD_TCS` (chỉ dùng cho agent đã gỡ; credential Đăng Nhập TCS nhập trên form Ext)
- `TCS_BROWSER_PROFILE*` / `TCS_OUTPUT_DIR` / `TCS_HEADLESS` / `TCS_CAPTCHA_OCR` / `TCS_AUTO_OPEN` / `TCS_PREFER_SESSION`
- Volume `browser_profile` (`/app/tcs-awb-automation/browser_profile`)

Không xóa Postgres / `DATABASE_URL`.

## CAPTCHA

- **PC + Chrome Ext:** OCR **trong Ext** (ONNX / ddddocr `common.onnx`, offscreen MV3).
  - ZIP tải từ Ops phải **≥ ~60MB** (có `ocr/ort.min.js` + `ocr/common.onnx`).
  - Local: `npm run ext:fetch-ocr` rồi load unpacked / `npm run ext:package`.
  - Ext TCS **≥1.5.1** + Ext SCSC → Reload.

## Local (dev)

- `npm run dev` — Node API + Vite. Không spawn Python.
- Policy mặc định Ext-only. Cài Ext TCS + SCSC trên Chrome cùng profile với Ops.
- OCR Ext: `npm run ext:fetch-ocr` rồi load unpacked.

## Không dùng nữa

- `tcs-awb-automation/` + `npm run tcs:agent*` + `portal:start:*` + `portal:headed:local`
- `scripts/railway-setup-online-portal.mjs`
- Playwright headed local / PW local toggle
- `portal:worker` / `portal-worker.mjs` (đã xóa trước)
- Gemini AI / nhập lô Google Sheet (đã xóa trước)
