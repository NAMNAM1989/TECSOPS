# TCS AWB Automation (sidecar TECSOPS)

Tự động hóa cổng `https://www.tcs.com.vn/AwbLogin` cho **kho TECS-TCS**.

### Quy trình ESID (Ops)

- **Quét ESID** (toolbar): lọc theo ngày phiên → cập nhật status Ops «Hoàn thành tiếp nhận». **Không** chặn Tải PDF.
- **Tải PDF ESID** (menu ⋮, **1 AWB**): tìm chỉ bằng ô **AWB# 8 số** → mở phiếu → IN → tải file PDF. Tự chạy hết, không xác nhận tay. (Đã bỏ «In ESID» — dùng PDF rồi in từ file.)

Ops (React) chọn lô → gửi job tới agent Playwright. Có 2 cách chạy:

- **Máy kho (khuyến nghị)**: Chrome **headed** (`TCS_HEADLESS=0`, mặc định khi `npm run dev` / `tcs:agent:real`) — sau **Điền** ESID, cửa sổ Chrome trên máy kho giữ form để kiểm tra tay, rồi HOÀN TẤT trên Chrome hoặc nút Ops. Ops LAN gọi qua proxy `/tcs-agent`.
- **Railway all-in-one**: Node + agent Chromium **headed trên Xvfb** + **noVNC** — Ops nút **TCS desktop** mở `/tcs-desktop` để click/gõ thật (không chỉ xem ảnh).

### Railway all-in-one (noVNC desktop + Playwright)

1 container = Node server + agent Python + Xvfb/x11vnc/noVNC. Ops mở từ máy bất kỳ → `/tcs-agent` (API) và `/tcs-desktop` (desktop Chrome).

Deploy:

1. `railway.toml` dùng `Dockerfile` (Node 20 + Playwright Chromium + xvfb/novnc). Deploy: `npm run railway:up` / `npm run deploy:ship`.
2. Railway **Variables**:
   - Bắt buộc login: `TCS_USERNAME`, `TCS_PASSWORD`.
   - Desktop: `TCS_VNC=1` (mặc định trong image), **`TCS_VNC_PASSWORD=<secret>`** (đổi mật khẩu; không commit).
   - Image mặc định: `TCS_HEADLESS=0`, `DISPLAY=:99`, `TCS_AUTO_OPEN=1`, `TCS_CAPTCHA_OCR=1`, `TCS_MOCK=0`.
   - Tắt desktop (nhẹ hơn, chỉ ảnh): `TCS_VNC=0` → agent headless.
3. Mount **Railway Volume** để giữ session/PDF qua redeploy:
   - `TCS_BROWSER_PROFILE=/app/tcs-awb-automation/browser_profile` (volume) — giữ cookie đã login.
   - `TCS_OUTPUT_DIR=/app/tcs-awb-automation/output` (volume) — giữ PDF.

**Dùng TCS desktop:** Ops → **TCS desktop** → nhập mật khẩu VNC (`TCS_VNC_PASSWORD`) → thao tác trên Chromium agent. Không mở tab `tcs.com.vn` trên máy bạn (session khác). Ảnh live («Xem ảnh») chỉ xem, không click được.

⚠️ **Rủi ro**: image nặng hơn (RAM); CAPTCHA/IP Railway; session mất nếu không mount volume; **không** để VNC không mật khẩu ra internet — luôn set `TCS_VNC_PASSWORD`.

### Máy khác trong LAN

1. Máy kho: `npm run dev` — **tự chạy** API + Vite + agent REAL **headed** (`:8765`). Tắt auto: `TCS_AGENT_AUTO=0`. Ép headless: `TCS_HEADLESS=1`.
2. Máy khác: mở Ops bằng **IP máy kho** (vd. `http://192.168.1.50:5173`), không dùng `127.0.0.1`.
3. Browser gọi same-origin `/tcs-agent` → Vite/Express proxy tới `127.0.0.1:8765` trên máy kho.
4. Sau **Điền**: nhìn **Chrome trên máy kho** (nút Ops «Hiện Chrome»), không mở tcs.com.vn trên máy bạn.
5. Nút **URL** trên thanh Cổng TCS: để trống = proxy; chỉ điền nếu dùng tunnel HTTPS.
6. Agent riêng (không qua `dev`): `npm run tcs:agent:real`.

## Cài đặt (máy kho Windows)

```powershell
cd tcs-awb-automation
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m playwright install chromium
```

## Chạy

```powershell
# Agent cho Ops (mock — an toàn, không cần login TCS)
python -m app.main agent --mock --dry-run

# Giao diện desktop
python -m app.main ui

# Discovery bắt buộc trước LOOKUP thật
python -m app.main discovery

# Template Excel
python -m app.main template
```

Ops: nút **Cổng TCS** (toolbar khi đang xem TECS-TCS) → Gửi agent (`http://127.0.0.1:8765`).

## Đăng nhập (session + OCR)

1. Copy `.env.example` → `.env`, điền `TCS_USERNAME` / `TCS_PASSWORD`.
2. `pip install -r requirements.txt` (có `ddddocr`).
3. Khi mở Chrome:
   - **Cách 1** (`TCS_PREFER_SESSION=1`): vào `/Awb/Agent` với profile cũ — còn cookie thì **không cần CAPTCHA**.
   - **Cách 2** (`TCS_CAPTCHA_OCR=1`): hết phiên → chụp ảnh CAPTCHA → OCR local → điền + Đăng nhập (thử lại tối đa `TCS_CAPTCHA_OCR_ATTEMPTS`).
   - OCR sai → fallback nhập tay trên Chrome.

## An toàn

- Mật khẩu chỉ trong `.env` local — không commit, không gửi lên Railway/Ops.
- OCR chạy **local** (không gửi ảnh CAPTCHA ra dịch vụ ngoài).
- LOOKUP/REGISTER thật cần locators confirmed.
- Chỉ nhận job `warehouse=TECS-TCS`.

## Test

```powershell
pytest
```
