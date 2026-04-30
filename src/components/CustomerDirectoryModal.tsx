import { useEffect, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { assertCustomerDirectoryValid } from "../utils/customerDirectoryCore";

function newDirectoryRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type Props = {
  open: boolean;
  initial: readonly CustomerDirectoryEntry[];
  onClose: () => void;
  onSave: (next: CustomerDirectoryEntry[]) => Promise<void>;
};

export function CustomerDirectoryModal({ open, initial, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CustomerDirectoryEntry[]>([]);
  const [saving, setSaving] = useState(false);

  /** Chỉ phụ thuộc `open`: khi mở modal nạp `initial` một lần — không theo `initial` (ref đổi mỗi sync) để tránh ghi đè bản nháp đang gõ. */
  useEffect(() => {
    if (!open) return;
    setDraft(initial.map((e) => ({ ...e })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function addRow() {
    setDraft((d) => [...d, { id: newDirectoryRowId(), code: "", name: "" }]);
  }

  function removeRow(id: string) {
    setDraft((d) => d.filter((x) => x.id !== id));
  }

  function updateRow(id: string, patch: Partial<Pick<CustomerDirectoryEntry, "code" | "name">>) {
    setDraft((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function handleSave() {
    try {
      assertCustomerDirectoryValid(draft);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Danh sách không hợp lệ.");
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Không lưu được.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/25 p-3 backdrop-blur-xl sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-dir-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-[28px] border border-black/[0.08] bg-white shadow-apple-md">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <div>
            <h2 id="customer-dir-title" className="text-[19px] font-semibold tracking-tight text-apple-label">
              Danh sách khách hàng
            </h2>
            <p className="mt-1 text-xs text-apple-secondary">
              Mỗi khách một mã duy nhất — lưu vào máy chủ (Redis) cùng dữ liệu lô hàng.
            </p>
          </div>
          <button
            type="button"
            tabIndex={-1}
            onClick={onClose}
            className="rounded-full p-2 text-apple-tertiary hover:bg-black/[0.05] hover:text-apple-label"
            aria-label="Đóng"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[min(60vh,520px)] overflow-auto px-5 py-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/[0.08] text-left text-[11px] font-semibold uppercase tracking-wide text-apple-secondary">
                <th className="py-2 pr-2">Mã</th>
                <th className="py-2 pr-2">Tên khách hàng</th>
                <th className="w-10 py-2" />
              </tr>
            </thead>
            <tbody>
              {draft.map((row) => (
                <tr key={row.id} className="border-b border-black/[0.05]">
                  <td className="py-2 pr-2 align-middle">
                    <input
                      value={row.code}
                      onChange={(e) => updateRow(row.id, { code: e.target.value })}
                      className="w-full rounded-xl border border-black/[0.08] px-2.5 py-2 font-mono text-xs font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                      placeholder="VD: KH01"
                      autoComplete="off"
                    />
                  </td>
                  <td className="py-2 pr-2 align-middle">
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(row.id, { name: e.target.value })}
                      className="w-full rounded-xl border border-black/[0.08] px-2.5 py-2 text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                      placeholder="Tên hiển thị"
                      autoComplete="off"
                    />
                  </td>
                  <td className="py-2 align-middle">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {draft.length === 0 ? (
            <p className="mt-4 text-center text-sm text-apple-tertiary">Chưa có dòng nào — bấm «Thêm dòng».</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-black/[0.06] px-5 py-4">
          <button
            type="button"
            onClick={addRow}
            className="rounded-full border border-black/[0.12] bg-white px-4 py-2.5 text-sm font-semibold text-apple-label hover:bg-black/[0.03]"
          >
            Thêm dòng
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="flex-1 rounded-full bg-apple-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-apple-blue-hover disabled:cursor-wait disabled:opacity-70"
          >
            {saving ? "Đang lưu…" : "Lưu danh sách"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black/[0.12] bg-white px-5 py-2.5 text-sm font-semibold text-apple-label hover:bg-black/[0.03]"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
