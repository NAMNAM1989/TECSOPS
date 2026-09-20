/** Fold tiếng Việt cho so khớp tìm kiếm — giữ khoảng trắng giữa từ. */
export function foldSearchText(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** AWB / biển số: fold rồi bỏ mọi ký tự không chữ-số. */
export function compactSearchAlnum(raw: string): string {
  return foldSearchText(raw).replace(/[^a-z0-9]/g, "");
}
