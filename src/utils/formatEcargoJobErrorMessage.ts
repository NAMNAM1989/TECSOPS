/** Rút gọn thông báo lỗi worker eCargo cho UI. */
export function formatEcargoJobErrorMessage(raw: string | undefined): string {
  let msg = String(raw ?? "").trim();
  msg = msg.replace(/^page\.evaluate:\s*Error:\s*/i, "").replace(/^Error:\s*/i, "");
  msg = msg.replace(/\s*[·•]\s*\(\*\)\s*(\(\*\)\s*)+$/g, "").trim();
  if (!msg) return "Tự động đăng ký thất bại — dùng sao chép mẫu bên dưới.";

  if (/Executable doesn't exist|playwright install/i.test(msg)) {
    return "Worker chưa có trình duyệt Chromium — trên máy dev chạy: npx playwright install chromium (Railway: đã có trong build).";
  }
  if (/eCargo worker cần Redis|REDIS_URL/i.test(msg)) {
    return "Worker eCargo chưa sẵn sàng — thiếu Redis (REDIS_URL) trên server.";
  }
  if (/Hết thời gian chờ email QR/i.test(msg)) {
    return "Đã xác thực nhưng chưa nhận email QR (Phiếu đăng ký hàng vào kho) — kiểm tra Gmail hoặc thử lại sau vài phút.";
  }
  if (/Có email xác thực trên Gmail nhưng không khớp lô/i.test(msg)) {
    return msg;
  }
  if (/Hết thời gian chờ email/i.test(msg)) {
    return "Không nhận được email xác thực từ ecargo@scsc.vn trong thời gian chờ — thử lại hoặc dùng sao chép thủ công.";
  }
  if (/Không tìm thấy.*Xác Thực|Không bấm được nút Xác Thực|Trang xác thực báo lỗi/i.test(msg)) {
    return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
  }
  if (/ECARGO_GMAIL_APP_PASSWORD/i.test(msg)) {
    return "Thiếu mật khẩu Gmail App trên server (ECARGO_GMAIL_APP_PASSWORD).";
  }
  if (/Gmail từ chối đăng nhập|AUTHENTICATIONFAILED|Invalid credentials/i.test(msg)) {
    return "App Password Gmail sai hoặc hết hạn — tạo mật khẩu ứng dụng mới (16 ký tự, không dấu cách), cập nhật ECARGO_GMAIL_APP_PASSWORD trên Railway hoặc .env.local rồi khởi động lại server.";
  }
  if (/^Command failed$/i.test(msg)) {
    return "Không đọc được Gmail — kiểm tra App Password (ECARGO_GMAIL_APP_PASSWORD) và khởi động lại server.";
  }
  if (/Ngày CB không|cut-off|Thời gian hàng vào/i.test(msg)) {
    return "Ngày bay hoặc khung giờ vào kho không hợp lệ trên eCargo — kiểm tra ngày bay/chuyến/cutoff hoặc thử đăng ký lại.";
  }
  if (/Không tìm thấy nút Xác Thực/i.test(msg)) {
    return "Không bấm được nút Xác thực trên trang eCargo — thử lại hoặc mở link trong email thủ công.";
  }
  if (/Job eCargo bị gián đoạn/i.test(msg)) {
    return msg;
  }
  if (/Chưa có AWB|Chưa lưu được AWB|Modal AWB không đóng/i.test(msg)) {
    return "Không lưu được AWB trên eCargo — thử đăng ký lại; nếu vẫn lỗi kiểm tra MAWB/chuyến/ngày bay hoặc dùng sao chép thủ công.";
  }

  return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
}
