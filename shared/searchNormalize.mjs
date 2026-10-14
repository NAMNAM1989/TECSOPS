/**
 * Chuẩn hoá chuỗi tìm kiếm — dùng chung client + server.
 */

export function foldSearchText(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function compactSearchAlnum(raw) {
  return foldSearchText(raw).replace(/[^a-z0-9]/g, "");
}

/** Haystack lô lưu Postgres `search_norm` — khớp fold phía client. */
export function buildLotSearchNorm(s) {
  const parts = [
    s.awb,
    s.hawb,
    s.flight,
    s.flightDate,
    s.customer,
    s.customerCode,
    s.dest,
    s.note,
    s.cutoffNote,
    s.shipperNamePrint,
    s.consigneeNamePrint,
    s.goodsDescriptionPrint,
    s.notifyNamePrint,
    s.warehouse,
    compactSearchAlnum(s.awb),
    compactSearchAlnum(s.hawb),
  ];
  return parts.map((x) => foldSearchText(String(x ?? ""))).filter(Boolean).join(" ");
}
