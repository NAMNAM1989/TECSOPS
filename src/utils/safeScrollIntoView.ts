/**
 * Cuộn tới phần tử một cách an toàn trên tất cả các thiết bị di động.
 * Đặc biệt tối ưu hóa cho các dòng máy Android như Vivo X200 (OriginOS)
 * vốn có thể gặp lỗi giật lag, treo render hoặc không cuộn khi dùng behavior: "smooth".
 */
export function safeScrollIntoView(
  el: HTMLElement | null,
  options: ScrollIntoViewOptions = { behavior: "smooth", block: "center" }
): void {
  if (!el) return;

  // Kiểm tra xem trình duyệt có phải là Android WebView / OriginOS hay không
  const ua = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  const isAndroid = ua.includes("android");
  const isVivo = ua.includes("vivo") || ua.includes("origin");

  // Fallback sang "auto" (cuộn lập tức) trên Android/Vivo để tránh giật lag và đơ giao diện
  const behavior = isAndroid || isVivo ? "auto" : options.behavior || "smooth";

  try {
    el.scrollIntoView({
      ...options,
      behavior,
    });
  } catch {
    // Fallback cuối cùng nếu trình duyệt không hỗ trợ các options nâng cao
    try {
      el.scrollIntoView(options.block === "start");
    } catch {
      /* ignore */
    }
  }
}
