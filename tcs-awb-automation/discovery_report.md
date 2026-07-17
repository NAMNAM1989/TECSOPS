# Discovery Report — Cổng AWB TCS

Tạo lúc: 2026-07-17T20:37:08

Phạm vi: chỉ kho **TECS-TCS** (sidecar TECSOPS).

- Locators file: `D:\TECSOPS\tcs-awb-automation\discovery_artifacts\locators.json`
- Login locators confirmed: **True**
- AWB lookup locators confirmed: **False**

## Các bước đã quan sát

### login_page
- URL: `https://www.tcs.com.vn/AwbLogin`
- Title: TCS - A joint venture between Vietnam Airlines, SASCO and SATS
- Screenshot: `D:\TECSOPS\tcs-awb-automation\screenshots\live_login_page_203548.png`
- Số element ghi nhận: 56
- Downloads: 0

### after_login
- URL: `https://www.tcs.com.vn/Awb/Agent`
- Title: TCS - A joint venture between Vietnam Airlines, SASCO and SATS
- Screenshot: `D:\TECSOPS\tcs-awb-automation\screenshots\live_after_login_203708.png`
- Số element ghi nhận: 56
- Downloads: 0

## Login (đã quan sát)

- Form Ant Design `#basic`
- Username: `#basic_username`
- Password: `#basic_password`
- Captcha: `#basic_captchaCode` (user tự nhập)
- Submit: button `Đăng nhập`

## LOOKUP / DOWNLOAD

- Locators AWB **chưa confirmed**. Chạy full discovery sau khi login + tra AWB mẫu.

## An toàn

- Không lưu mật khẩu / cookie / token.
- REGISTER vẫn khóa cho đến phase sau.
