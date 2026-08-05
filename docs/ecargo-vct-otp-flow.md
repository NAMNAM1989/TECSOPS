# eCargo VCT — OTP + QR flow (selectors)

Khảo sát form Create + pattern ASP.NET eCargo. Cập nhật khi SCSC đổi DOM.

## Form Create

| Field | Selector |
|-------|----------|
| Tạo phiếu | `input#btnCreate[type=submit]`, `input[value='Tạo phiếu']`, `button` text «Tạo phiếu» |
| Email OTP | `#txtEmail` |

## Modal / bước OTP (sau Tạo phiếu)

Thử theo thứ tự (content-ecargo):

| Ý nghĩa | Selectors ứng viên |
|---------|-------------------|
| Ô OTP | `#txtOTP`, `#txtOtp`, `#txtOtpCode`, `input[name=OTP]`, `input[name=OtpCode]`, `input[placeholder*='OTP' i]` |
| Nút xác nhận | `#btnConfirmOTP`, `#btnVerifyOTP`, `#btnSubmitOTP`, `input[value*='Xác nhận']`, `button` chứa /Xác nhận\|Verify\|Xác thực/i |
| Modal | `.modal.show`, `#otpModal`, `.bootbox`, `[role=dialog]` chứa OTP |

## Email OTP

| Mục | Giá trị mặc định |
|-----|------------------|
| From chứa | `scsc`, `ecargo`, `noreply` |
| Subject chứa | `OTP`, `xác thực`, `verification`, `eCargo` |
| Regex mã | `/\b(\d{6})\b/` rồi `/OTP[:\s#-]*(\d{4,8})/i` |
| Cửa sổ thời gian | chỉ mail `internalDate >= sinceIso` |

## Sau OTP — QR / mã phiếu

| Ý nghĩa | Selectors ứng viên |
|---------|-------------------|
| Ảnh QR | `img[src*='qr' i]`, `img[id*='qr' i]`, `#imgQR`, `.qrcode img`, `canvas` |
| Mã phiếu | `#lblVctNo`, `#txtVctNo`, `.vct-code`, text khớp `/VCT[-\s]?[A-Z0-9]+/i` |

## Checklist cấu hình IMAP (Gmail App Password)

App Password **chỉ** đặt trên server — không nhập vào Ops UI / extension.

1. Gmail nhận OTP: bật **2-Step Verification**.
2. Google Account → Security → **App passwords** → tạo mật khẩu 16 ký tự.
3. Đặt biến môi trường (Railway **Service → Variables** hoặc local `.env` / `.env.local`):

```
ECARGO_IMAP_HOST=imap.gmail.com
ECARGO_IMAP_PORT=993
ECARGO_IMAP_USER=ops-ecargo@example.com
ECARGO_IMAP_PASS=xxxx-xxxx-xxxx-xxxx
ECARGO_IMAP_MAILBOX=INBOX
```

4. `ECARGO_IMAP_USER` = hộp thư nhận mail OTP eCargo.
5. Trong Ops → hồ sơ đại lý eCargo → **Email OTP** phải **trùng** mailbox đó.
6. Restart / Redeploy service sau khi set Variables.
7. Xác nhận:
   - `GET /api/ecargo/otp/status` → `imapConfigured: true`, `userHint` dạng `ops***@gmail.com`
   - Modal Đăng ký eCargo → badge **IMAP sẵn sàng** → nút **Kiểm tra mail OTP**
   - `POST /api/ecargo/otp/test` → `ok: true` (chỉ connect + mở mailbox, không đọc body)

Local: xem thêm [`.env.example`](../.env.example). Server nạp `.env` rồi `.env.local` qua `server/loadEnv.mjs`.

## API

| Method | Path | Ý nghĩa |
|--------|------|---------|
| GET | `/api/ecargo/otp/status` | `imapConfigured`, `host`, `mailbox`, `userHint` (mask) |
| POST | `/api/ecargo/otp/test` | Thử đăng nhập IMAP |
| POST | `/api/ecargo/otp/wait` | Poll OTP (body: `email`, `sinceIso`, `timeoutMs?`) |
| POST | `/api/ecargo/result-from-mail` | Fallback QR/mã từ mail xác nhận |

## Ghi chú

- REGISTER luôn bấm «Tạo phiếu» sau khi điền; chỉ dừng nếu **sau submit** còn `.field-validation-error` / summary lỗi thật (không chặn vì `.text-danger` nhãn trang).
- OTP chỉ lấy qua `POST /api/ecargo/otp/wait` trên server (App Password không vào extension).
- Modal Ops: nút **Đăng ký eCargo** disabled khi `imapConfigured: false`; **Chỉ điền form** vẫn dùng được.
