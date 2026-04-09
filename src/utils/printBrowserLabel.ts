/**
 * window.print() tạm thời — đợi font hệ thống + một frame để giảm layout shift trước khi in.
 */
export async function printBrowserLabel(): Promise<void> {
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch {
    /* ignore */
  }
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  window.print();
}
