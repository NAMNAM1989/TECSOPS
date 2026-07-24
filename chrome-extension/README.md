# TECSOPS — Chrome extension Điền ESID

> Extension mode v2: Chrome giữ một tab TCS được ghim để Login, Quét và Điền trực quan.
> Playwright workspace vẫn được giữ làm fallback và xử lý PDF trong giai đoạn chuyển tiếp.

Điền form **KHAI BÁO ESID** trên tab `tcs.com.vn` đã login của bạn. Ops chỉ gửi payload — **không** bấm HOÀN TẤT (bạn tự làm trên TCS).

## Cài (unpacked)

1. Mở Chrome → `chrome://extensions`
2. Bật **Developer mode** (góc trên bên phải)
3. **Load unpacked** → chọn đúng thư mục `chrome-extension` (có `manifest.json` bên trong), ví dụ `D:\TECSOPS\chrome-extension`
4. Thấy extension **TECSOPS — Điền ESID TCS** · bật (toggle xanh)
5. Bấm icon extension trên thanh Chrome → popup hiện «Sẵn sàng · v2.0.10…»

Mỗi máy nhập liệu cần cài extension. Railway không stream tab TCS của bạn.

### Kiểm tra tự động (dev)

```bash
npm run ext:verify
```

Script mở Chrome test profile, `Extensions.loadUnpacked`, PING background, và bridge Ops trên `http://127.0.0.1:5173`.

## Dùng

1. Mở Ops (localhost Vite hoặc URL Railway đã khai trong `manifest.json`)
2. Thanh TCS hiện badge **Ext OK**
3. Bấm **Đồng bộ TCS**, nhập user/password TCS một lần
4. Extension ghim tab TCS, OCR CAPTCHA qua Agent localhost và quét theo ngày
   - CAPTCHA PNG nền trong suốt được ghép lên nền trắng trước khi OCR
   - OCR đọc 6 biến thể ảnh; chỉ submit mã 5 ký tự khi số phiếu đạt ngưỡng
   - Kết quả yếu chỉ làm mới CAPTCHA, không tính là một lần thử đăng nhập
5. Menu ⋮ lô TECS-TCS → **Điền**
6. Kiểm tra form trên tab TCS → bấm **HOÀN TẤT** trên TCS

## Ops qua IP LAN

Content script chỉ inject trên origin đã khai trong `manifest.json`. Nếu mở Ops bằng `http://192.168.x.x:5173`, thêm match vào `content_scripts` (block Ops) rồi **Reload** extension:

```json
"http://192.168.0.0/16:5173/*"
```

(Chrome không hỗ trợ CIDR trong matches — thêm đúng URL bạn dùng, ví dụ `http://192.168.1.50:5173/*`.)

## Đồng bộ locator

`content-tcs.js` load `locators.json` lúc điền (fallback cứng nếu fetch lỗi). `other_request` thử `otherRequest` rồi `shcOthReq`. JSON nên khớp `tcs-awb-automation/app/browser/locators.py` → `esid_declare`. Khi TCS đổi DOM, cập nhật JSON (+ fallback trong content script nếu đổi field id).

## Phạm vi MVP

- Điền text/id đã biết + mở tab KHAI BÁO
- Chọn chuyến bay: best-effort + warning nếu fail
- Không submit HOÀN TẤT
- Chưa publish Chrome Web Store
