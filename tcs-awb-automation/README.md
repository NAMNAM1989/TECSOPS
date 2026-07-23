# TCS AWB Automation (sidecar TECSOPS)

Tự động hóa cổng `https://www.tcs.com.vn/AwbLogin` cho **kho TECS-TCS**.

### Quy trình ESID (Ops)

- **Đồng bộ TCS** (toolbar): mở/reuse persistent session → chỉ login khi cần → quét lại ngày phiên → cache AWB/trang → cập nhật status Ops «Hoàn thành tiếp nhận».
- Workspace giữ hai page cùng cookie: **Danh sách** cho Quét/PDF và **Khai báo** cho Điền/HOÀN TẤT.
- **Tải PDF ESID** (menu ⋮, **1 AWB**): ưu tiên mở thẳng dòng từ cache ngày; cache stale mới fallback tìm **AWB# 8 số** → IN → tải PDF.

**Điền ESID (đường ưu tiên trên máy người dùng):** Chrome extension v2 giữ tab TCS được ghim,
Đồng bộ TCS và Điền trực quan. Nếu extension không sẵn sàng, Ops fallback về page Khai báo
trong Playwright workspace. PDF hiện vẫn dùng cache của Playwright trong giai đoạn chuyển tiếp.

Agent Playwright dùng chung cho **Login / Quét / Điền / HOÀN TẤT / PDF**:

- **Máy kho**: Chrome **headed** (`TCS_HEADLESS=0`) — toàn bộ workspace. Ops LAN qua proxy `/tcs-agent`.
- **Railway all-in-one**: agent **headless** cho toàn bộ workspace. noVNC tùy chọn (`TCS_VNC=1`, chậm).

### Railway all-in-one (Playwright headless + noVNC tùy chọn)

1 container = Node server + agent Python. Ops → `/tcs-agent` (API). Desktop `/tcs-desktop` chỉ khi `TCS_VNC=1`.

Deploy:

1. `railway.toml` dùng `Dockerfile`. Deploy: `npm run railway:up` / `npm run deploy:ship`.
2. Railway **Variables**:
   - Bắt buộc login: `TCS_USERNAME`, `TCS_PASSWORD`.
   - Mặc định image: `TCS_VNC=0`, `TCS_HEADLESS=1`, `TCS_AUTO_OPEN=1`, `TCS_CAPTCHA_OCR=1`, `TCS_MOCK=0`.
   - Bật desktop (dự phòng): `TCS_VNC=1`, `TCS_HEADLESS=0`, `DISPLAY=:99`. `TCS_VNC_PASSWORD` tùy chọn.
3. Mount **Railway Volume**:
   - `TCS_BROWSER_PROFILE=/app/tcs-awb-automation/browser_profile` — giữ cookie.
   - `TCS_OUTPUT_DIR=/app/tcs-awb-automation/output` — giữ PDF.

**Nhập liệu Điền:** Ops **Đồng bộ TCS** → **Điền** → kiểm tra → **HOÀN TẤT**. Tất cả dùng cùng agent session. Nút **Sửa tay** chỉ khi `TCS_VNC=1`.

⚠️ **Rủi ro**: CAPTCHA/IP Railway; session mất nếu không mount volume; `TCS_VNC=1` tốn RAM và chậm hơn.

### Máy khác trong LAN

1. Máy kho: `npm run dev` — **tự chạy** API + Vite + agent REAL **headed** (`:8765`). Tắt auto: `TCS_AGENT_AUTO=0`. Ép headless: `TCS_HEADLESS=1`.
2. Máy khác: mở Ops bằng **IP máy kho** (vd. `http://192.168.1.50:5173`), không dùng `127.0.0.1`.
3. Browser gọi same-origin `/tcs-agent` → Vite/Express proxy tới `127.0.0.1:8765` trên máy kho.
4. Sau **Điền**: form nằm trên page Khai báo cùng workspace → HOÀN TẤT trên Ops hoặc Chrome máy kho.
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
   - **Cách 2** (`TCS_CAPTCHA_OCR=1`): hết phiên → lấy ảnh CAPTCHA gốc → ghép nền trong suốt lên nền trắng → OCR nhiều biến thể → chỉ điền + Đăng nhập khi kết quả 5 ký tự đạt đồng thuận (thử submit tối đa `TCS_CAPTCHA_OCR_ATTEMPTS`).
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
