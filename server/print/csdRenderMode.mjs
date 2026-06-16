/**
 * AWB Editor: in trên giấy trắng = vẽ cả form vector + dữ liệu.
 * Overlay scan chỉ khi meta yêu cầu (form hãng riêng).
 * @param {{ meta?: object; backgroundPath?: string | null }} bundle
 * @returns {"vector" | "overlay"}
 */
export function resolveCsdRenderMode(bundle) {
  const mode = String(bundle?.meta?.renderMode ?? "").toLowerCase();
  if (mode === "overlay" && bundle?.backgroundPath) return "overlay";
  if (mode === "overlay" && !bundle?.backgroundPath) return "vector";
  if (bundle?.backgroundPath && mode !== "vector") return "overlay";
  return "vector";
}
