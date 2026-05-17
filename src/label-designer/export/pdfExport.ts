/**
 * Xuất PDF qua hộp thoại in trình duyệt (không thêm thư viện PDF).
 * Người dùng chọn "Save as PDF" trong Chrome/Edge.
 */
export function printTemplateAsPdf(htmlHost: HTMLElement): void {
  const w = window.open("", "_blank");
  if (!w) {
    window.alert("Cho phép popup để xuất PDF.");
    return;
  }
  w.document.write(`<!DOCTYPE html><html><head><title>PDF</title>
<style>@page{margin:0}body{margin:0}</style></head><body>${htmlHost.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
