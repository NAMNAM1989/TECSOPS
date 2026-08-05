# eCargo VCT — OTP + QR flow (selectors)

Khảo sát form Create + pattern ASP.NET eCargo. Cập nhật khi SCSC đổi DOM.

## Form Create

| Field | Selector |
|-------|----------|
| Tạo phiếu | `input#btnCreate[type=submit]`, `input[value='Tạo phiếu']`, `button` text «Tạo phiếu» |
| Email OTP | `#txtEmail` |

## Extension 3 pha (v2.2.6+)

Background điều phối — sống qua reload ASP.NET sau «Tạo phiếu»:

1. `ECARGO_FILL_AND_CREATE` — điền form + bấm Tạo phiếu (content, ngắn)
2. Background — chờ ô OTP (`ECARGO_FIND_OTP_UI`) + `POST /api/ecargo/otp/wait`
3. `ECARGO_SUBMIT_OTP` — điền mã + bấm xác thực + bắt QR

Ops vẫn gửi `REGISTER_ECARGO_VCT` → background chạy 3 pha.

## Modal / bước OTP (sau Tạo phiếu)

Thử theo thứ tự (content-ecargo), **ưu tiên trong** `.modal.show` / `.bootbox` / `[role=dialog]`:

| Ý nghĩa | Selectors ứng viên |
|---------|-------------------|
| Ô OTP | `#txtOTP`, `#txtOtp`, `#txtOtpCode`, `input[name=OTP]`, `input[name=OtpCode]`, `input[placeholder*='OTP' i]` |
| Nút xác nhận | `#btnConfirmOTP`, `#btnVerifyOTP`, `#btnSubmitOTP`, label `/xác nhận\|xác thực\|verify\|đồng ý\|ok/i` — **loại** `#btnCreate` / «Tạo phiếu» |
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

- Phase create: bấm «Tạo phiếu» rồi trả về; nếu trang reload, background bắt kênh đứt và vẫn chờ OTP UI.
- OTP chỉ lấy qua `POST /api/ecargo/otp/wait` trên server (App Password không vào extension).
- Modal Ops: nút **Đăng ký eCargo** disabled khi `imapConfigured: false`; **Chỉ điền form** vẫn dùng được.
- Lỗi theo `phase`: `create` | `otp_ui` | `otp_mail` | `otp_submit` | `done`.
