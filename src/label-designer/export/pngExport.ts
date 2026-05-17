/** Xuất PNG từ vùng canvas (fallback: in browser nếu không có stage ref). */
export async function exportStagePng(container: HTMLElement | null): Promise<void> {
  if (!container) return;
  const canvas = container.querySelector("canvas");
  if (!canvas) {
    window.alert("Không tìm thấy canvas để xuất PNG.");
    return;
  }
  try {
    const url = (canvas as HTMLCanvasElement).toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `label-${Date.now()}.png`;
    a.click();
  } catch {
    window.alert("Trình duyệt chặn xuất PNG.");
  }
}
