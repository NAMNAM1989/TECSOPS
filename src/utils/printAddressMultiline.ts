/**
 * Địa chỉ in phiếu cân: giữ xuống dòng do người dùng nhập (Enter).
 * Chỉ gom khoảng trắng thừa trong từng dòng, không gộp các dòng.
 */

export function normalizePrintAddressMultiline(value: string, maxLines = 6): string {
  if (value == null || typeof value !== "string") return "";
  const lines = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);

  return lines.slice(0, maxLines).join("\n");
}

/**
 * Ưu tiên địa chỉ có xuống dòng (danh bạ mới) khi lô chỉ còn snapshot một dòng cũ.
 */
export function resolvePrintAddressForShipment(opts: {
  bookingPrint?: string;
  directoryPrint?: string;
  maxLines?: number;
}): string {
  const maxLines = opts.maxLines ?? 6;
  const booking = opts.bookingPrint ?? "";
  const directory = opts.directoryPrint ?? "";
  const bookingHasBreak = /\r?\n/.test(booking);
  const directoryHasBreak = /\r?\n/.test(directory);
  const bookingHasText = booking.trim().length > 0;

  let raw: string;
  if (bookingHasBreak) raw = booking;
  else if (directoryHasBreak) raw = directory;
  else if (bookingHasText) raw = booking;
  else raw = directory;

  return normalizePrintAddressMultiline(raw, maxLines).slice(0, 300);
}
