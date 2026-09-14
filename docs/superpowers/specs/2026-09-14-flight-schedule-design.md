# Thiết kế tra cứu giờ bay–đáp dự kiến

## 1. Mục tiêu và phạm vi

TECSOPS tự động tra lịch trình dự kiến khi một lô có đủ:

- số chuyến bay (`Shipment.flight`);
- ngày bay (`Shipment.flightDate`);
- ngày phiên (`Shipment.sessionDate`) để xác định năm.

Kết quả cần hiển thị giờ khởi hành và giờ đến của chính chặng bay mang số hiệu đó. Sân bay đi mặc định là `SGN`. Trường `Shipment.dest` là đích cuối của hàng hóa và không được dùng để xác định chặng bay.

Ví dụ: lô có `flight = TK163`, `flightDate = 15SEP`, `dest = AMS` thì lịch trình cần tìm là chuyến `TK163` khởi hành từ SGN và sân bay đến do nguồn lịch bay trả về; không giả định sân bay đến là AMS.

Phạm vi giai đoạn đầu chỉ gồm lịch dự kiến. Không theo dõi vị trí, ETA động, giờ cất/hạ cánh thực tế hoặc hành trình nối chuyến.

## 2. Nguồn dữ liệu

### Nguồn chính

Sử dụng gói miễn phí của SkyLink API. Endpoint Flight Status theo số chuyến trả cả giờ khởi hành và giờ đến dự kiến. Backend chỉ chấp nhận kết quả khi:

1. số chuyến sau chuẩn hóa khớp chính xác;
2. sân bay đi là SGN;
3. ngày khởi hành do nhà cung cấp trả về khớp ngày bay đã suy ra.

Không dùng endpoint bảng khởi hành để lấy giờ đáp vì tài liệu SkyLink v3.1 chỉ công bố giờ khởi hành, sân bay đối diện và trạng thái; không công bố giờ đến trong cùng bản ghi.

### Giới hạn và điều kiện phát hành

- Flight Status không nhận tham số ngày. Với chuyến chưa thuộc ngày hiện tại của nhà cung cấp, kết quả có thể là một lượt bay khác. TECSOPS phải từ chối kết quả sai ngày và chuyển sang trạng thái chờ.
- Gói miễn phí được dùng theo quota hiện hành của nhà cung cấp. Hệ thống đặt ngưỡng nội bộ thấp hơn quota để tránh phát sinh phí.
- Trước khi bật production phải kiểm tra lại điều khoản sử dụng thương mại, attribution và quota tại thời điểm đăng ký.
- Không scrape website Flightradar24 hoặc website hãng bay.
- Flightradar24 không nằm trong giai đoạn này vì API chính thức không cung cấp lịch bay tương lai.

### Cổng thay thế

Tích hợp qua interface `FlightScheduleProvider`, không gọi SkyLink trực tiếp từ route hoặc UI. Nếu độ phủ SGN không đạt yêu cầu, có thể thay bằng AeroDataBox hoặc Cirium mà không đổi hợp đồng API nội bộ hay giao diện.

## 3. Chuẩn hóa khóa tra cứu

Khóa lịch trình:

`SGN|<FLIGHT_NORMALIZED>|<YYYY-MM-DD>`

Quy tắc:

- bỏ khoảng trắng và dấu nối không có ý nghĩa trong số chuyến;
- chuyển thành chữ hoa;
- giữ số 0 trong phần số hiệu vì `JX0712` và `JX712` không được tự động coi là một nếu chưa có bảng alias được kiểm chứng;
- dùng `flightDateToYmd(flightDate, sessionDate)` hiện có để chuyển `DDMMM` thành `YYYY-MM-DD`;
- dữ liệu ngày không hợp lệ không được gọi API.

Các AWB cùng khóa dùng chung một bản ghi lịch trình.

## 4. Kiến trúc

### 4.1 Thành phần server

1. `flightScheduleNormalize`: chuẩn hóa số chuyến, ngày và response.
2. `SkyLinkFlightScheduleProvider`: gọi API với timeout, kiểm tra schema và ánh xạ dữ liệu.
3. `flightScheduleRepository`: đọc/ghi cache Postgres.
4. `flightScheduleService`: chống gọi trùng, áp quota, negative cache và chính sách retry.
5. Route xác thực `GET /api/flight-schedules?sessionDate=YYYY-MM-DD`: lấy các chuyến duy nhất trong phiên, trả kết quả cache và tra các khóa đủ điều kiện.

Khóa SkyLink chỉ nằm trong biến môi trường Railway `SKYLINK_API_KEY`. Trình duyệt không được gọi nhà cung cấp trực tiếp.

### 4.2 Thành phần client

Client tải lịch sau khi state của ngày đang xem đã sẵn sàng. Dữ liệu lịch là tài nguyên dùng chung, không ghi lặp vào từng `Shipment`.

Khi người dùng thêm hoặc sửa `flight`/`flightDate`, client làm mới danh sách lịch của phiên. Sheet sync cũng đi qua cùng luồng sau khi state mới được áp dụng.

Không chặn thao tác lưu lô trong lúc chờ API lịch bay.

## 5. Mô hình dữ liệu cache

Tạo bảng `flight_schedule_cache` độc lập:

- `cache_key` text primary key;
- `provider` text;
- `origin_iata` text;
- `flight_number` text;
- `flight_date` date;
- `destination_iata` text null;
- `destination_name` text null;
- `departure_local_date` date null;
- `departure_local_time` time null;
- `arrival_local_date` date null;
- `arrival_local_time` time null;
- `status` text: `FOUND`, `PENDING`, `NOT_FOUND`, `ERROR`;
- `fetched_at` timestamptz null;
- `retry_after` timestamptz null;
- `expires_at` timestamptz;
- `failure_code` text null.

Giữ ngày và giờ local của từng sân bay đúng như nhà cung cấp công bố. Không gắn sai offset UTC khi response không cung cấp timezone chuẩn. Dấu `+1` được tính bằng chênh lệch giữa ngày đến local và ngày đi local.

Không lưu toàn bộ raw response. Cache thành công tối đa 48 giờ; cache lỗi/ngày chưa tới dùng TTL ngắn theo chính sách retry.

## 6. Luồng tra cứu

1. Lấy các cặp `flight + flightDate` duy nhất trong ngày phiên.
2. Chuẩn hóa và loại dữ liệu không hợp lệ.
3. Trả ngay các kết quả `FOUND` còn hạn.
4. Với khóa chưa có, service kiểm tra ngày bay và quota.
5. Chỉ gọi Flight Status khi ngày bay là ngày hiện tại theo `Asia/Ho_Chi_Minh`.
6. Giới hạn một request/giây và tối đa hai tác vụ chờ trong process.
7. Xác thực chặt số chuyến, SGN và ngày khởi hành.
8. Nếu khớp, lưu `FOUND`; nếu response thuộc ngày khác, lưu `PENDING`, không hiển thị giờ.
9. Nếu chuyến tương lai, không gọi API; lưu `PENDING` đến đầu ngày bay.
10. Nếu hết quota hoặc nhà cung cấp lỗi, trả trạng thái rõ ràng và giữ chức năng quản lý lô hoạt động bình thường.

Các promise đang chạy được dedupe theo `cache_key` trong từng process; unique key Postgres ngăn bản ghi trùng sau restart.

## 7. Quản lý quota miễn phí

Tạo bộ đếm usage theo tháng trong Postgres hoặc ghi nhận từ mỗi lần provider thực sự được gọi. Thiết lập:

- hard cap mặc định: 900 request/tháng, cấu hình bằng environment;
- không tự gọi vượt hard cap;
- không polling định kỳ;
- không gọi lại khi chỉ có AWB/pcs/kg/status thay đổi;
- negative cache tối thiểu 6 giờ cho `NOT_FOUND`;
- mỗi số chuyến/ngày chỉ gọi một lần thành công.

Nếu số chuyến duy nhất vượt khả năng gói miễn phí, UI tiếp tục cho phép nhập tay; không tự động chuyển sang gói trả phí.

## 8. API nội bộ

Response theo khóa lịch, ví dụ:

```json
{
  "schedules": {
    "SGN|TK163|2026-09-15": {
      "status": "FOUND",
      "flight": "TK163",
      "origin": "SGN",
      "destination": "IST",
      "departure": { "date": "2026-09-15", "time": "22:05" },
      "arrival": { "date": "2026-09-16", "time": "05:15" },
      "source": "skylink",
      "fetchedAt": "2026-09-15T00:03:10Z"
    }
  },
  "quota": {
    "available": true
  }
}
```

Không trả API key, raw provider payload hoặc thông tin billing.

## 9. Hiển thị

Trên desktop và mobile, lịch xuất hiện cạnh thông tin chuyến bay:

`TK163 · SGN 22:05 → IST 05:15 (+1)`

Trạng thái thay thế:

- `Đang tra lịch`;
- `Sẽ tra vào ngày bay`;
- `Chưa có lịch`;
- `Không tra được lịch`;
- `Đã hết lượt tra miễn phí`.

Giờ phải có nhãn hoặc tooltip “Giờ địa phương”. Giá trị nhập tay, nếu bổ sung trong giai đoạn sau, phải được đánh dấu `Thủ công` và không bị API ghi đè ngầm.

## 10. Xử lý lỗi và an toàn

- timeout kết nối và tổng thời gian request phải hữu hạn;
- retry tối đa một lần cho lỗi mạng/5xx, có jitter; không retry 4xx;
- validate JSON trước khi lưu;
- log mã lỗi, latency và cache key, không log khóa API;
- route dùng auth hiện có và rate limit;
- lỗi nhà cung cấp không làm lỗi mutation hoặc Sheet sync;
- không suy đoán giờ đến từ khoảng cách hoặc `Shipment.dest`;
- không hiển thị dữ liệu khi ngày trả về không khớp.

## 11. Kiểm thử

### Unit

- chuẩn hóa các số hiệu như `TK 163`, `JX0712`;
- chuyển `DDMMM + sessionDate` thành ngày đầy đủ;
- từ chối ngày, origin hoặc flight không khớp;
- tính dấu `+1`;
- TTL, negative cache, quota cap và dedupe;
- parser chịu được field thiếu nhưng không tạo dữ liệu giả.

### Server integration

- API key không xuất hiện trong response/log;
- nhiều AWB cùng chuyến chỉ tạo một provider call;
- mutation không bị chặn khi provider lỗi;
- restart vẫn dùng cache Postgres;
- hết quota trả trạng thái có kiểm soát.

### UI

- desktop/mobile hiển thị cùng một lịch;
- các trạng thái loading/pending/not-found/error rõ ràng;
- lịch không dùng `Shipment.dest`;
- thay flight/date làm mất lịch cũ và tra khóa mới.

### Pilot bắt buộc

Trước khi triển khai rộng, thử tối thiểu 20 số chuyến SGN đại diện cho các hãng và chuyến cargo thực tế của TECSOPS. Đối chiếu với lịch chính thức của hãng/sân bay:

- tỷ lệ tìm thấy cả giờ đi và giờ đến tối thiểu 90%;
- không có trường hợp ghép sai ngày hoặc sai chặng;
- giờ hiển thị đúng dạng local và đúng ngày `+1`.

Nếu không đạt, không bật tự động; giữ adapter và đánh giá AeroDataBox/Cirium.

## 12. Tiêu chí hoàn thành

- Có `flight + flightDate` hợp lệ thì lịch được tra không đồng bộ và dùng chung cho mọi AWB cùng chuyến.
- Chỉ chấp nhận chặng khởi hành SGN và đúng ngày.
- Hiển thị đủ giờ đi, sân bay đến, giờ đến và dấu đổi ngày.
- Không dùng `dest` hàng hóa để suy ra sân bay đáp.
- Không vượt hard cap miễn phí và không phát sinh phí tự động.
- App vẫn hoạt động bình thường khi provider không khả dụng.

