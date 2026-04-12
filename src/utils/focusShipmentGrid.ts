/** Focus ô bảng desktop có `data-grid-row` / `data-grid-field` (nhập kiểu Excel). */
export function focusShipmentGridCell(rowId: string, field: string) {
  requestAnimationFrame(() => {
    const r = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(rowId) : rowId;
    const f = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(field) : field;
    const el = document.querySelector(`[data-grid-row="${r}"][data-grid-field="${f}"]`) as HTMLElement | null;
    el?.focus();
  });
}
