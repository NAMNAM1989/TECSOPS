# TECSOPS — Chrome extension Điền ESID

Điền form **KHAI BÁO ESID** trên tab `tcs.com.vn` đã login của bạn. Ops chỉ gửi payload — **không** bấm HOÀN TẤT (bạn tự làm trên TCS).

## Cài (unpacked)

1. Mở Chrome → `chrome://extensions`
2. Bật **Developer mode** (góc trên bên phải)
3. **Load unpacked** → chọn đúng thư mục `chrome-extension` (có `manifest.json` bên trong), ví dụ `D:\TECSOPS\chrome-extension`
4. Thấy extension **TECSOPS — Điền ESID TCS** · bật (toggle xanh)
5. Bấm icon extension trên thanh Chrome → popup hiện «Sẵn sàng · v1.0.0…»

Mỗi máy nhập liệu cần cài extension. Railway không stream tab TCS của bạn.

### Kiểm tra tự động (dev)

```bash
npm run ext:verify
```

Script mở Chrome test profile, `Extensions.loadUnpacked`, PING background, và bridge Ops trên `http://127.0.0.1:5173`.

## Dùng

1. Login TCS trên Chrome (tab `https://www.tcs.com.vn/...`)
2. Mở Ops (localhost Vite hoặc URL Railway đã khai trong `manifest.json`)
3. Thanh TCS hiện badge **Ext OK**
4. Menu ⋮ lô TECS-TCS → **Điền**
5. Kiểm tra form trên tab TCS → bấm **HOÀN TẤT** trên TCS

## Ops qua IP LAN

Content script chỉ inject trên origin đã khai trong `manifest.json`. Nếu mở Ops bằng `http://192.168.x.x:5173`, thêm match vào `content_scripts` (block Ops) rồi **Reload** extension:

```json
"http://192.168.0.0/16:5173/*"
```

(Chrome không hỗ trợ CIDR trong matches — thêm đúng URL bạn dùng, ví dụ `http://192.168.1.50:5173/*`.)

## Đồng bộ locator

<<<<<<< HEAD
`content-tcs.js` load `locators.json` lúc điền (fallback cứng nếu fetch lỗi). File JSON nên khớp `tcs-awb-automation/app/browser/locators.py` → `esid_declare`. Khi TCS đổi DOM, cập nhật JSON (+ fallback trong content script nếu đổi field id).
=======
`content-tcs.js` load `locators.json` lúc điền (fallback cứng nếu fetch lỗi). `other_request` thử `otherRequest` rồi `shcOthReq`. JSON nên khớp `tcs-awb-automation/app/browser/locators.py` → `esid_declare`.
>>>>>>> origin/cursor/cleanup-wave4-esid-plate-primitives-976b

## Phạm vi MVP

- Điền text/id đã biết + mở tab KHAI BÁO
- Chọn chuyến bay: best-effort + warning nếu fail
- Không submit HOÀN TẤT
- Chưa publish Chrome Web Store
