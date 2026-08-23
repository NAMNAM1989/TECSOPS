# Portal TCS — Ext PC kho (chính) · Railway agent (fallback)

## Mô hình bắt buộc

**Bấm trên Ops (web) → Chrome Ext trên PC kho thực thi** (`chrome-extension-tcs` / `chrome-extension-scsc`).

Không dùng Playwright trong container Railway / dual-agent / web automation server-side để thay Ext khi làm việc tại kho.

```
Ops UI (click)
  → postMessage content-ops.js
  → Ext background trên PC kho
  → tab tcs.com.vn / ecargo.scsc.vn
```

Handshake: `docs/ops-ext-protocol.md` (`EXT_READY` / job / result / error).  
Chip **Ext · offline|sẵn sàng|đã login** trên bar Ops.

## Railway agent — chỉ fallback

Same-origin `/tcs-agent` + `TCS_AGENT_*` + volume `browser_profile` giữ cho:

- Điện thoại (không có Ext)
- Khi **tắt** «Trực quan» có chủ đích
- Policy `agent-only` (QA / sự cố)

Không xây tính năng mới phụ thuộc agent server.

## Kiến trúc

```
PC kho + Ext  → Ops postMessage → Ext (đường chính)

Phone / fallback → Ops → /tcs-agent → Playwright :8765/:8766 (phụ)
```

Policy mặc định: «Trực quan» bật → desktop **chỉ Ext** (kể cả khi Ext offline — UI báo cài, không lặng lẽ headless).

Chrome Ext chuẩn: **TCS + SCSC** (`docs/ops-ext-protocol.md`). Không còn gói TECS-TCS.

## Railway Variables (bắt buộc)

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | Postgres (đã có) |
| `TCS_USERNAME` / `TCS_PASSWORD` | Tài khoản portal kho TECS-TCS |
| `TCS_USERNAME_TCS` / `TCS_PASSWORD_TCS` | Tài khoản portal kho TCS |
| `TCS_AGENT_DUAL=0` | Mặc định tắt. Chỉ `1` mới spawn agent :8766 — không tự bật vì có user/pass TCS |
| `TCS_AGENT_ENABLED=1` | Mặc định bật HTTP agent. `0` = không spawn Python; `/tcs-agent` trả `AGENT_OFF` |
| `TCS_AGENT_PROXY=1` | Bật proxy `/tcs-agent` (Dockerfile đã set) |
| `TCS_HEADLESS=1` | Headless (Dockerfile đã set) |
| `TCS_CAPTCHA_OCR=1` | OCR CAPTCHA khi Đăng Nhập TCS (Dockerfile đã set) |
| `TCS_AUTO_OPEN=0` | Mặc định tắt. Không mở Chromium lúc boot — chỉ khi Đăng Nhập TCS / Quét / `POST /session/open` |
| `TCS_PREFER_SESSION=1` | Ưu tiên cookie trong profile |
| `TCS_PDF_CACHE_TTL_S` | TTL tái dùng PDF (mặc định 28800 = 8h) |
| `TCS_PDF_PREFETCH_N` | Prefetch sau Quét (mặc định **0** = tắt) |
| `TCS_DOCS_RETENTION_S` | Prune docs già hơn N giây (mặc định 172800 = 48h) |
| `TCS_PRUNE_ON_START` | Prune docs lúc boot agent (mặc định 1) |

## Volumes (giữ session sau redeploy)

Một volume app mount:

`/app/tcs-awb-automation/browser_profile`

| Subdir | Env |
|---|---|
| `…/browser_profile/hub` | `TCS_BROWSER_PROFILE` |
| `…/browser_profile/tcs` | `TCS_BROWSER_PROFILE_TCS` |
| `…/browser_profile/output` | `TCS_OUTPUT_DIR` |

Script thiết lập: `node scripts/railway-setup-online-portal.mjs`

Region khuyến nghị: `asia-southeast1`.

## Quy trình dùng trên điện thoại / máy bất kỳ

1. Mở Ops bằng URL Railway (không dùng `127.0.0.1`).
2. Chọn kho TECS-TCS hoặc TCS + ngày phiên.
3. **Phone:** bấm «Đăng Nhập TCS» / **Quét** qua agent cloud (không có Ext trên điện thoại); menu ⋮ **Tải PDF**. Không Điền ESID trên phone.
4. **PC:** «Đăng Nhập TCS» → Ext trên máy kho thực thi. «Trực quan» bật (mặc định) → không fallback Railway khi Ext offline. Tắt «Trực quan» nếu muốn agent.
5. **HOÀN TẤT** trên Ops (PC) khi agent/Ext đã điền form.

Quét agent dùng `POST /workspace/scan` (nhẹ — không prefetch PDF).

## CAPTCHA

- **PC + Chrome Ext (ưu tiên):** OCR **trong Ext** (ONNX / ddddocr `common.onnx`, offscreen MV3) — không cần agent/cloud để Đăng Nhập TCS.
  - ZIP tải từ Ops phải **≥ ~60MB** (có `ocr/ort.min.js` + `ocr/common.onnx`). ZIP ~200KB = thiếu OCR (build cũ) → Đăng Nhập TCS lỗi / CAPTCHA tay.
  - Local: `npm run ext:fetch-ocr` rồi load unpacked / `npm run ext:package`.
  - Ext TCS **≥1.5.1** + Ext SCSC → Reload.
  - Fallback: agent localhost `/captcha/solve` → nhập tay trên tab TCS.
- **Phone / headless Railway:** vẫn phụ thuộc `TCS_CAPTCHA_OCR` + session volume (không có cửa sổ nhập tay).
- Nếu Đăng Nhập TCS fail trên cloud: kiểm tra password Variables, OCR trong image, hoặc refresh volume profile.

## Local (dev)

- `npm run portal:start:both` hoặc `tcs:agent:real` — agent local headed.
- Policy `ext-only` nếu muốn chỉ Chrome Ext trên máy dev.
- OCR Ext: `npm run ext:fetch-ocr` rồi load unpacked.

## Máy kiểm soát — Playwright headed (nhìn thấy cửa sổ)

Giữ Ops trên Railway HTTPS; chạy Playwright **headed trên máy đó** qua cầu Chrome Ext (localhost).

1. `git pull` + `npm run ext:fetch-ocr` + Reload Ext TCS + Ext SCSC.
2. Trên máy kiểm soát: `npm run portal:headed:local` (mở Chromium headed `:8765` / `:8766`).
3. Mở Ops Railway **trên cùng Chrome** đã cài Ext.
4. Bật nút **PW local** trên thanh TCS.
5. **Đăng Nhập TCS** → **Quét** / **Điền** — theo dõi cửa sổ Chromium trên máy này.

Tắt **PW local** để về agent cloud headless / Ext content-script như trước.

## Không dùng nữa

- `portal:worker` / `portal:start:warehouse` / `portal-worker.mjs` — đã xóa (A3).
- Gemini AI (`GEMINI_*`) và nhập lô Google Sheet — đã xóa (A3). Railway có thể xóa `GEMINI_*`.
- Mở Ops qua IP máy kho.
