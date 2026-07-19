# TCS AWB Automation (sidecar TECSOPS)

Tự động hóa cổng `https://www.tcs.com.vn/AwbLogin` cho **kho TECS-TCS**.

### Quy trình ESID (Ops)

- **Quét ESID** (toolbar): lọc theo ngày phiên → cập nhật status Ops «Hoàn thành tiếp nhận». **Không** chặn Tải PDF.
- **Tải PDF ESID** (menu ⋮, **1 AWB**): tìm chỉ bằng ô **AWB# 8 số** → mở phiếu → IN → tải file PDF. Tự chạy hết, không xác nhận tay. (Đã bỏ «In ESID» — dùng PDF rồi in từ file.)

Ops (React) chọn lô → gửi job tới agent Playwright. Có 2 cách chạy:

- **Máy kho (khuyến nghị)**: Chrome persistent + login TCS ổn định (session/OCR). Ops LAN/tunnel gọi qua proxy `/tcs-agent`.
- **Railway all-in-one**: đóng gói Node + agent Playwright (Chromium headless) chung 1 container — Ops mở từ **mọi máy** qua Railway. Xem cảnh báo bên dưới.

### Railway all-in-one (Playwright headless trên cloud)

1 container = Node server + agent Python. Ops mở từ máy bất kỳ → proxy `/tcs-agent` (Express) → agent `127.0.0.1:8765` trong container.

Deploy:

1. `railway.toml` đã dùng `Dockerfile` (Node 20 + Playwright Chromium). Deploy như thường: `npm run railway:up`.
2. Railway **Variables** (bắt buộc để tự login): `TCS_USERNAME`, `TCS_PASSWORD`. Ảnh đã set sẵn `TCS_HEADLESS=1 TCS_AUTO_OPEN=1 TCS_CAPTCHA_OCR=1 TCS_MOCK=0`.
3. Mount **Railway Volume** để giữ session/PDF qua redeploy:
   - `TCS_BROWSER_PROFILE=/app/tcs-awb-automation/browser_profile` (volume) — giữ cookie đã login.
   - `TCS_OUTPUT_DIR=/app/tcs-awb-automation/output` (volume) — giữ PDF.

⚠️ **Rủi ro khi chạy trên Railway** (đã thống nhất chấp nhận): CAPTCHA phải dựa hoàn toàn vào OCR (không có người nhập tay); IP máy chủ ở nước ngoài có thể bị TCS chặn/đòi xác minh; session mất mỗi lần redeploy nếu **không** mount volume. Nếu login chập chờn → quay lại chạy agent trên máy kho (proxy vẫn giữ nguyên).

### Máy khác trong LAN

1. Máy kho: `npm run dev` — **tự chạy** API + Vite + agent REAL (`:8765`). Tắt auto: `TCS_AGENT_AUTO=0`.
2. Máy khác: mở Ops bằng **IP máy kho** (vd. `http://192.168.1.50:5173`), không dùng `127.0.0.1`.
3. Browser gọi same-origin `/tcs-agent` → Vite/Express proxy tới `127.0.0.1:8765` trên máy kho.
4. Nút **URL** trên thanh Cổng TCS: để trống = proxy; chỉ điền nếu dùng tunnel HTTPS.
5. Agent riêng (không qua `dev`): `npm run tcs:agent:real`.

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
