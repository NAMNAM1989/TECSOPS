# ESID declare — tối ưu (2026-07-21)

## Luồng điền hiện tại (đã triển khai)

1. Text ops: AWB / pcs (thiếu→0) / HAWB phụ (mặc định 0) / loại hàng  
2. CHỌN CHUYẾN BAY (hot-path bỏ modal nếu flight+ngày đã đúng)  
3. Dest + payment **một lần** (cache nhãn Chuyển khoản)  
4. Party Shipper/Agent/CNEE (combobox master)  
5. Người khai cố định  

Response có `timings`: `ops_text_ms`, `flight_ms`, `selects_ms`, `party_ms`, `total_ms`.

## Nút thắt còn lại (TCS / hệ thống)

| Hạng mục | Nguyên nhân | Hướng tiếp |
|----------|-------------|------------|
| Modal chuyến bay | API lịch + 2 popup Ok/Đồng ý | Không bỏ được; chỉ hot-path khi form đã đúng |
| Party combobox | Ant Select master search | Cache ID khách TCS nếu có; hoặc điền address trước, name sau |
| Nhiều agent process | `npm run dev` auto-spawn + restart thủ công | Chỉ 1 process venv trên :8765 |
| Session Chrome | Mở/đóng profile chậm | Giữ session mở giữa các lần Điền |

## Đã cắt

- Không chọn payment trước rồi lại sau modal  
- Sleep cố định → `wait_for` dropdown/bảng  
- Cache `_PAYMENT_LABEL_CACHE`  
- Hot-path `choose_flight`  
