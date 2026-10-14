# Apps Script — đồng bộ Sheet «BOOK HẰNG NGÀY» lên TECSOPS realtime

Khi nhân viên sửa Sheet, script gửi các dòng vừa sửa lên `POST /api/sheets/book/webhook`.
Web TECSOPS cập nhật sau khoảng 1–3 giây, không cần bấm nút **Đồng bộ**. Nút Đồng bộ cũ vẫn dùng được như trước.

## Chuẩn bị

1. Trên Railway đã đặt env `SHEET_WEBHOOK_SECRET`, xem phần env trong `docs/sheet-realtime/REPORT.md`. Nếu chưa đặt, endpoint trả 503 (đang tắt).
2. Biết domain production của TECSOPS, ví dụ `https://tecsops.up.railway.app`.

## Các bước cài

1. Mở Sheet **BOOK HẰNG NGÀY** bằng tài khoản có quyền chỉnh sửa.
2. Vào menu **Extensions → Apps Script** (Tiện ích mở rộng → Apps Script).
3. Xoá nội dung `Code.gs` mặc định, dán toàn bộ nội dung file `tools/apps-script/Code.gs` trong repo, rồi bấm **Save** (💾).
4. Bấm biểu tượng bánh răng **Project Settings** → kéo xuống **Script properties** → **Add script property**, rồi thêm 2 property:
   | Property | Giá trị |
   |---|---|
   | `WEBHOOK_URL` | `https://<domain-tecsops>/api/sheets/book/webhook` |
   | `SHEET_SECRET` | đúng chuỗi đã đặt cho `SHEET_WEBHOOK_SECRET` trên Railway |

   Bấm **Save script properties**. Không dán secret vào code.
5. Quay lại **Editor**, chọn hàm `setup` trên thanh công cụ rồi bấm **Run**.
   - Lần đầu Google sẽ hỏi quyền: chọn tài khoản → **Advanced** → **Go to … (unsafe)** → **Allow**. Script cần quyền đọc Sheet, gọi URL ngoài và tạo trigger.
   - Log hiện «Đã cài trigger» là xong.
6. Kiểm tra: mở một tab ngày (vd. «NGÀY 14 OCT»), chọn một dòng có AWB. Trong Apps Script chọn hàm `testPush` → **Run** → xem **Execution log**: kết quả có `ok: true`, `applied`, `skipped`.
7. Vào **Triggers** (biểu tượng đồng hồ) để xác nhận có 2 trigger: `onEditInstallable` (On edit) và `onChangeInstallable` (On change).

## Script làm gì

| Sự kiện | Hành vi |
|---|---|
| Sửa ô / dán đè nhiều dòng | Gom các dòng bị sửa, đợi ~2 giây (gõ nhanh chỉ gửi 1 lần), đọc A:L rồi gửi `mode: "rows"`. Bỏ dòng trống, dòng tiêu đề khối, header. |
| Chèn / xoá dòng, sắp xếp, dán cấu trúc | Gửi lại **cả tab** (`mode: "full"`) theo lô ≤ 200 dòng. |
| Server vừa khởi động lại (chưa có bản chụp tab) | Server trả `needFullTab: true`, script tự gửi cả tab. |
| Lỗi mạng / 5xx | Thử lại 3 lần (1 s, 2 s, 4 s). Vẫn lỗi thì ghi vào sheet ẩn `_sync_log`. |

- Chỉ gửi tab có tên dạng ngày (`NGÀY 14 OCT`, `14OCT`…). Tab bắt đầu bằng `_` bị bỏ qua.
- Server **không bao giờ tự xoá lô**: xoá dòng trên Sheet không xoá lô trên web. Muốn xoá thì dùng nút Đồng bộ (mục «lô thừa») như trước.
- AWB chưa đủ 11 số thì server chờ, chưa tạo lô.
- AWB trùng trong Sheet (dòng sau thua), hoặc AWB đã có ở phiên khác: bị bỏ qua và web hiện toast cảnh báo.

## Hàm dùng tay

- `testPush()`: gửi thử dòng đang chọn.
- `pushActiveTab()`: gửi lại cả tab đang mở, khi nghi web lệch với Sheet.
- `setup()`: chạy lại khi muốn cài lại trigger. Hàm tự xoá trigger cũ nên không bị trùng.

## Xem lỗi

Sheet `_sync_log` bị ẩn: vào menu **View → Hidden sheets → _sync_log**. Các cột: thời gian, tab, dòng, mã lỗi, chi tiết.

| Mã | Ý nghĩa | Cách xử lý |
|---|---|---|
| 401 | Sai `SHEET_SECRET` | So lại với `SHEET_WEBHOOK_SECRET` trên Railway |
| 503 | Server chưa bật webhook | Đặt `SHEET_WEBHOOK_SECRET` trên Railway rồi redeploy |
| 400 | Sai Sheet / payload | Kiểm tra script đang gắn đúng file BOOK HẰNG NGÀY |
| 429 | Gửi quá 60 request/phút | Thường tự hết; auto-sync phía server sẽ bắt lại |
| -1 | Lỗi mạng / URL sai | Kiểm tra `WEBHOOK_URL` |

Nếu webhook lỡ một lần thì cũng không sao: khi bật `SHEET_AUTO_SYNC=1`, server tự đọc lại tab hôm nay và ngày mai mỗi 3 phút.

## Gỡ

Vào **Triggers**, xoá 2 trigger. Hoặc xoá env `SHEET_WEBHOOK_SECRET` trên Railway: endpoint sẽ trả 503 và web dừng nhận dữ liệu từ script.
