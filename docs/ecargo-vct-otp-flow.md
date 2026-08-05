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

## Env IMAP

```
ECARGO_IMAP_HOST=imap.gmail.com
ECARGO_IMAP_PORT=993
ECARGO_IMAP_USER=
ECARGO_IMAP_PASS=
ECARGO_IMAP_MAILBOX=INBOX
```

## Ghi chú

- TECSOPS **không** auto Tạo phiếu nếu DOM còn `.field-validation-error` / `.text-danger` visible liên quan validation.
- OTP chỉ lấy qua `POST /api/ecargo/otp/wait` trên server (App Password không vào extension).
