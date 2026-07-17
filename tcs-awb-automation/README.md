# TCS AWB Automation (sidecar TECSOPS)

Tự động hóa cổng `https://www.tcs.com.vn/AwbLogin` cho **kho TECS-TCS**.

Ops (React) chọn lô → gửi job tới agent localhost trên máy kho. Agent giữ Chrome persistent + in PDF. **Không** chạy browser trên Railway.

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
