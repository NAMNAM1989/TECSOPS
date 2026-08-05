# eCargo VCT — OTP + QR flow (selectors)

Khảo sát form Create + pattern ASP.NET eCargo. Cập nhật khi SCSC đổi DOM.

## Form Create

| Field | Selector |
|-------|----------|
| Tạo phiếu | `input#btnCreate[type=submit]`, `input[value='Tạo phiếu']`, `button` text «Tạo phiếu» |
| Email OTP | `#txtEmail` |

## Extension — xác thực qua mail (v2.2.7+)

Luồng thật của SCSC (không phải OTP 6 số trên form Create):

1. `ECARGO_FILL_AND_CREATE` — điền + Tạo phiếu
2. Background — `POST /api/ecargo/otp/wait` lấy **mã alphanumeric** + **URL** từ link «đây» trong mail
3. Mở URL trên tab eCargo
4. `ECARGO_CONFIRM_VERIFY` — đảm bảo ô «Mã xác thực» + bấm nút **Xác Thực** → hoàn thành

Mail mẫu: subject `[eCargo] Mã xác thực phiếu… số 80ZWUGWM`, body `Mã xác thực : QSSMB88636480ZWUGWM`, link «Bấm vào đây để tiến hành xác thực.»

## Trang xác thực (sau khi mở link mail)

| Ý nghĩa | Selectors ứng viên |
|---------|-------------------|
| Ô mã | `input` gần label «Mã xác thực», hoặc `name/id/placeholder` chứa mã/code/token |
| Nút | button/input text `/xác thực/i` (không phải «Tạo phiếu») |
| Thành công | body text `/hoàn thành xác thực\|đã xác thực\|thành công/i` |

## Email xác thực

| Mục | Giá trị mặc định |
|-----|------------------|
| From | `ecargo@scsc.vn` / chứa `scsc`, `ecargo` |
| Subject | `Mã xác thực phiếu đăng ký hàng vào kho số …` |
| Mã | `/Mã xác thực\s*:\s*([A-Z0-9]{10,48})/i` (VD `QSSMB88636480ZWUGWM`) |
| Link | `href` tới `ecargo.scsc.vn` (anchor «đây») |
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

- Phase create: bấm «Tạo phiếu» rồi trả về; nếu trang reload, background bắt kênh đứt rồi đọc mail.
- Mail xác thực lấy qua `POST /api/ecargo/otp/wait` (trả `code` + `verifyUrl`) — App Password chỉ trên server.
- Không chờ modal OTP trên form Create; mở link «đây» rồi bấm **Xác Thực**.
- Modal Ops: nút **Đăng ký eCargo** disabled khi `imapConfigured: false`; **Chỉ điền form** vẫn dùng được.
- Lỗi theo `phase`: `create` | `otp_mail` | `otp_submit` | `done`.
