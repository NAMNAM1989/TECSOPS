import { useEffect } from "react";
import type { PastePlan } from "../utils/tablePasteMapper";
import { getFieldDisplayName } from "../utils/shipmentOutbox";

interface Props {
  plan: PastePlan;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PastePreviewModal({ plan, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-ui-border bg-ui-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between border-b border-ui-border/80 pb-3">
          <div>
            <h2 className="text-sm font-bold text-ui-navy">
              Dán dữ liệu từ Excel / Bảng tính
            </h2>
            <p className="mt-0.5 text-2xs text-ui-text-muted">
              Xem lại các thay đổi trước khi áp dụng vào {plan.affectedRowsCount} lô.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {plan.droppedRowsCount > 0 ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-2xs font-semibold text-amber-900">
            ⚠️ Bỏ qua {plan.droppedRowsCount} dòng thừa từ clipboard do vượt quá số dòng hiện có của kho.
          </div>
        ) : null}

        <div className="mt-3 flex-1 overflow-auto rounded-xl border border-ui-border/80">
          <table className="w-full text-left text-2xs">
            <thead className="sticky top-0 bg-ui-surface-muted font-bold text-ui-text-muted">
              <tr>
                <th className="px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">AWB</th>
                <th className="px-2 py-1.5">Nội dung thay đổi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border/60">
              {plan.previewRows.map((r) => (
                <tr key={r.rowId} className="hover:bg-ui-surface-muted/40">
                  <td className="px-2 py-1.5 font-bold text-ui-text-muted">{r.stt}</td>
                  <td className="px-2 py-1.5 font-mono font-semibold text-ui-awb">{r.awb || "—"}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(r.changes).map(([field, { before, after }]) => (
                        <span key={field} className="rounded bg-ui-primary/10 px-1.5 py-0.5 font-mono text-2xs text-ui-primary">
                          <span className="font-sans font-bold">{getFieldDisplayName(field)}: </span>
                          <span className="line-through opacity-70">{String(before ?? "—")}</span>
                          {" → "}
                          <span className="font-bold">{String(after ?? "—")}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-ui-border/80 pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-ui-border px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted"
          >
            Hủy bỏ (Esc)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-ui-primary px-4 py-1.5 text-xs font-bold text-white shadow-ui-sm hover:bg-ui-primary-hover"
          >
            Áp dụng {plan.affectedRowsCount} lô (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
