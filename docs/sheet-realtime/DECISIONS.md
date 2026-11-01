# Sheet realtime — các quyết định ở chỗ mơ hồ

Nguyên tắc chung: khi đề bài không nói rõ, chọn phương án **an toàn nhất cho dữ liệu Ops**, tức là không xoá, không ghi đè thao tác tay, và khi nghi ngờ thì bỏ qua (auto-sync sẽ bắt lại sau).

## 1. Ngữ cảnh khi parse dòng lẻ: bản chụp tab trong RAM

Parser `parseBookHangNgayGrid` cần ngữ cảnh: dòng tiêu đề khối (TCS ↔ SCSC, làm kho mặc định), header, và các dòng phía trên (để biết AWB nào trùng thì «dòng sau thua»). Một dòng lẻ do webhook gửi lên không có đủ những thông tin đó.

Mình không chọn cách «nhận webhook rồi tải lại cả tab qua gviz», vì ba lý do:
- gviz mất khoảng 1–2 giây và có thể trả dữ liệu cũ, nên không đạt mục tiêu phản hồi dưới 1 giây.
- Chỉ số dòng của gviz không trùng số dòng thật của Sheet (gviz có thể nuốt dòng header), nên không ghép được với `rowNumber` mà Apps Script gửi.

**Cách đã chọn:** server giữ một bản chụp tab trong RAM, đánh theo số dòng thật (`rowNumber`).
- `mode: "full"` (khi chèn/xoá dòng, hoặc lần đầu): Apps Script gửi cả tab, kèm dòng tiêu đề và header, theo lô ≤ 200 dòng. Lô 0 sẽ reset bản chụp.
- `mode: "rows"` (khi sửa ô): server ghép dòng mới vào bản chụp rồi parse **cả bản chụp** bằng parser cũ, nhưng chỉ áp những dòng vừa gửi.
- Chưa có bản chụp (server vừa restart, hoặc bản chụp quá 30 phút không cập nhật): server trả `needFullTab: true` và Apps Script tự gửi cả tab.

## 2. Webhook và auto-sync không sắp lại STT, không xoá lô

- Gọi lõi áp với `wantReorder: false` và `removeIds: []`. Nếu tự sắp lại STT mỗi 3 phút thì sẽ xoá mất thứ tự Ops vừa kéo tay trên web.
- Nút Đồng bộ thủ công vẫn sắp STT và xoá lô thừa (có xác nhận) như cũ.
- Hệ quả: lô mới thêm từ Sheet nằm cuối kho. Muốn khớp thứ tự với Sheet thì bấm Đồng bộ.

## 3. AWB chưa đủ 11 số thì chờ

Ở các luồng tự động, dòng có ô AWB 8–10 số (đang gõ dở hoặc gõ thiếu) bị skip với mã `awb_incomplete`, không tạo lô trống AWB. Nút Đồng bộ tay vẫn giữ hành vi cũ.

## 4. Khoá

- `withSheetApplyLock` (trong `server/sheets/sheetApply.mjs`) tuần tự hoá toàn bộ chuỗi đọc state → tính mutation → ghi, áp dụng cho cả apply tay, webhook và auto-sync. Khoá Postgres sẵn có chỉ bao phần ghi; khoá mới bổ sung, không thay thế nó.
- Auto-sync có thêm cờ `running` để hai vòng không chạy chồng nhau.
- Khoá này nằm trong process, nên giả định **một replica** — giống Socket.IO in-memory hiện có (`[socket] … single app replica`).

## 5. Ý nghĩa «Sheet: cập nhật lúc HH:mm:ss»

- Là lần gần nhất Sheet **thực sự làm đổi dữ liệu** trên web (ADD/UPDATE).
- Lần webhook hoặc auto-sync không có thay đổi gì thì không emit socket, đúng yêu cầu «không broadcast rỗng».
- Toast conflict (`awb_taken`, `sheet_duplicate`) được lọc trùng trong 10 phút, để auto-sync chạy mỗi 3 phút không bắn lại cùng một cảnh báo.

## 6. Suy ra năm từ tên tab

Tab chỉ có ngày và tháng («NGÀY 14 OCT»), nên server chọn năm (năm trước, năm nay hoặc năm sau) sao cho ngày đó gần **hôm nay giờ VN** nhất, lệch tối đa 200 ngày. Sau đó kiểm lại bằng `tabTitleMatchesSession`. Tab không phải tab ngày thì trả 200 với `ignored: "not_session_tab"`, không ghi gì.

## 7. Bảo mật webhook

- Thứ tự kiểm tra: thiếu env → **503**, rồi rate limit (60 request/phút/IP) → **429**, rồi body > 256 KB → **413**, rồi sai secret → **401**, rồi payload sai → **400**.
- Secret được băm SHA-256 trước khi so bằng `crypto.timingSafeEqual`, để hai buffer luôn cùng độ dài.
- Log chỉ ghi tên tab và số lượng; không ghi shipper, CNEE hay giá trị ô.

## 8. Lọc request trùng

Khoá lọc trùng là `tab + rowNumber + sha1(values)`, trong cửa sổ 5 giây. Khoá chỉ được ghi **sau khi xử lý thành công**, nên nếu request lỗi thì Apps Script retry vẫn đi qua.

## 9. Giá trị ô từ Apps Script

- Số giữ nguyên dạng thô (`String(v)`), để AWB nhập dạng số không bị biến thành `6.18E+10`. Cách này khớp với `cell.v` của gviz mà auto-sync đang dùng.
- Ô kiểu ngày/giờ lấy chữ hiển thị trên Sheet.
- So sánh field có chuẩn hoá (`patchFieldDiffers`), nên khác biệt nhỏ về định dạng giữa webhook và gviz không sinh UPDATE qua lại.

## 10. Không thêm dependency, không đổi schema

- Test HTTP dùng `node:http` + `fetch`, giống `server/httpMutationSmoke.test.mjs` (không thêm `supertest`).
- State Postgres trong test là store giả trong RAM; test không chạm DB hay URL production.
- Không cần bảng log: trạng thái realtime, bản chụp tab và bộ lọc trùng đều nằm in-memory. Mất khi restart cũng không sao, vì có cơ chế `needFullTab` và auto-sync.

## 11. Giao diện

- Desktop: `SheetSyncedBadge` nằm cạnh `SyncStatusPill`.
- Mobile: hàng trên cùng cao cố định 36px, nên trạng thái Sheet được đưa vào tooltip của pill đồng bộ để không vỡ layout.
- Không đụng bảng nhập liệu (Smooth Table / Part 0).

## 12. Mã skip `batch_duplicate`

Lõi áp kiểm «trùng AWB trong lần chọn» trước «trùng AWB trong Sheet». Hai mã này chỉ cùng xảy ra khi hai dòng Sheet có cùng AWB, nên webhook và auto-sync quy về `sheet_duplicate`. Endpoint `apply` cũ giữ nguyên lý do như trước.
