# Portal TCS online trên Railway (không máy kho)

Ops dùng **Playwright headless trong container Railway** qua same-origin `/tcs-agent`.
Không cần PC kho / `portal:worker`. Chrome Ext chỉ là fallback desktop tuỳ chọn.

## Kiến trúc

```
Phone / laptop → Ops (Railway HTTPS)
                 → /tcs-agent  (Express proxy)
                 → agent :8765 (TECS-TCS) + :8766 (TCS)
                 → Chromium headless + cookie volume
```

Policy mặc định `auto` = **desktop Ext → agent**; **phone agent-only** (Quét/PDF).

## Railway Variables (bắt buộc)

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | Postgres (đã có) |
| `TCS_USERNAME` / `TCS_PASSWORD` | Tài khoản portal kho TECS-TCS |
| `TCS_USERNAME_TCS` / `TCS_PASSWORD_TCS` | Tài khoản portal kho TCS |
| `TCS_AGENT_DUAL=1` | Bật agent thứ hai :8766 |
| `TCS_AGENT_PROXY=1` | Bật proxy `/tcs-agent` (Dockerfile đã set) |
| `TCS_HEADLESS=1` | Headless (Dockerfile đã set) |
| `TCS_CAPTCHA_OCR=1` | OCR CAPTCHA khi ĐN (Dockerfile đã set) |
| `TCS_AUTO_OPEN=1` | Mở session lúc boot |
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
3. **Phone:** không nút ĐN/Điền — agent tự session; **Quét** + menu ⋮ **Tải PDF**.
4. **PC:** ĐN Ext (nhìn được) → Quét / Điền / PDF; fallback agent nếu không có Ext.
5. **HOÀN TẤT** trên Ops (PC) khi agent/Ext đã điền form.

Quét agent dùng `POST /workspace/scan` (nhẹ — không prefetch PDF).

## CAPTCHA

- **PC + Chrome Ext (ưu tiên):** OCR **trong Ext** (ONNX / ddddocr `common.onnx`, offscreen MV3) — không cần agent/cloud để ĐN.
  - ZIP tải từ Ops phải **≥ ~60MB** (có `ocr/ort.min.js` + `ocr/common.onnx`). ZIP ~200KB = thiếu OCR (build cũ) → ĐN lỗi / CAPTCHA tay.
  - Local: `npm run ext:fetch-ocr` rồi load unpacked / `npm run ext:package`.
  - Ext TCS **≥1.5.1** / TECS-TCS **≥2.6.1** → Reload.
  - Fallback: agent localhost `/captcha/solve` → nhập tay trên tab TCS.
- **Phone / headless Railway:** vẫn phụ thuộc `TCS_CAPTCHA_OCR` + session volume (không có cửa sổ nhập tay).
- Nếu ĐN fail trên cloud: kiểm tra password Variables, OCR trong image, hoặc refresh volume profile.

## Local (dev)

- `npm run portal:start:both` hoặc `tcs:agent:real` — agent local headed.
- Policy `ext-only` nếu muốn chỉ Chrome Ext trên máy dev.
- OCR Ext: `npm run ext:fetch-ocr` rồi load unpacked.

## Máy kiểm soát — Playwright headed (nhìn thấy cửa sổ)

Giữ Ops trên Railway HTTPS; chạy Playwright **headed trên máy đó** qua cầu Chrome Ext (localhost).

1. `git pull` + `npm run ext:fetch-ocr` + Reload Ext đúng kho (TCS **1.5.0** / TECS-TCS **2.6.0**).
2. Trên máy kiểm soát: `npm run portal:headed:local` (mở Chromium headed `:8765` / `:8766`).
3. Mở Ops Railway **trên cùng Chrome** đã cài Ext.
4. Bật nút **PW local** trên thanh TCS.
5. **ĐN** → **Quét** / **Điền** — theo dõi cửa sổ Chromium trên máy này.

Tắt **PW local** để về agent cloud headless / Ext content-script như trước.

## Không dùng nữa

- `portal:worker` / `portal:start:warehouse` (deprecated).
- Mở Ops qua IP máy kho.
