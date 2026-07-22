import { useState } from "react";
import { OPS, opsInput } from "../../styles/opsModalStyles";

type Props = {
  open: boolean;
  customerName: string;
  customerCode: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Xác nhận xóa khách — gõ đúng mã KH để kích hoạt nút xóa. */
export function CustomerDeleteConfirmModal({
  open,
  customerName,
  customerCode,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState("");
  const codeNeedle = (customerCode || customerName).trim().toUpperCase();
  const canDelete = codeNeedle.length > 0 && typed.trim().toUpperCase() === codeNeedle;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-customer-title"
    >
      <div className={`w-full max-w-md rounded-2xl border border-red-200 p-5 shadow-2xl dark:border-red-500/40 ${OPS.modal}`}>
        <h3 id="delete-customer-title" className="text-lg font-semibold text-red-800 dark:text-red-300">
          Xóa khách hàng?
        </h3>
        <p className={`mt-2 text-sm ${OPS.secondary}`}>
          Hành động này xóa toàn bộ Shipper, CNEE và tên hàng của{" "}
          <strong className={OPS.title}>{customerName || "khách chưa đặt tên"}</strong>. Không thể hoàn tác.
        </p>
        <label className={`mt-4 block text-xs font-semibold ${OPS.title}`}>
          Gõ mã khách <span className="font-mono text-red-700">{codeNeedle || "—"}</span> để xác nhận
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            className={`mt-1.5 w-full font-mono text-sm uppercase border-red-200 bg-red-50/50 focus:border-red-400 focus:ring-red-200 dark:border-red-500/40 dark:bg-red-500/10 dark:text-slate-100 ${opsInput}`}
            placeholder={codeNeedle || "MÃ KH"}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setTyped("");
              onCancel();
            }}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${OPS.tabIdle}`}
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!canDelete}
            onClick={() => {
              onConfirm();
              setTyped("");
            }}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Xóa vĩnh viễn
          </button>
        </div>
      </div>
    </div>
  );
}
