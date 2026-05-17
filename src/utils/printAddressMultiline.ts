/**
 * Địa chỉ in phiếu cân: giữ xuống dòng do người dùng nhập (Enter).
 * Chỉ gom khoảng trắng thừa trong từng dòng, không gộp các dòng.
 */

export function normalizePrintAddressMultiline(value: string, maxLines = 6): string {
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

/** In 2 ô địa chỉ: dòng 1 + dòng 2 theo Enter (tối đa 2 dòng). */
export function splitScscAddressTwoLines(address: string): { line1: string; line2: string } {
  const normalized = normalizePrintAddressMultiline(address, 2);
  const lines = normalized ? normalized.split("\n") : [];
  return {
    line1: lines[0] ?? "",
    line2: lines[1] ?? "",
  };
}

/** @deprecated dùng splitScscAddressTwoLines */
export const splitScscShipperAddressLines = splitScscAddressTwoLines;
