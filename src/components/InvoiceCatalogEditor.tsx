import { useCallback, useMemo, useState } from "react";
import type { InvoiceCatalogItem } from "../types/invoiceItem";
import type { InvoiceCatalog } from "../utils/invoiceCatalogCore";
import {
  clampInvoiceCatalog,
  clampInvoiceCatalogItem,
  emptyInvoiceCatalogItem,
} from "../utils/invoiceCatalogCore";
import { groupCatalog } from "../hooks/useInvoiceCatalog";
import { OPS } from "../styles/opsModalStyles";

type Props = {
  catalog: InvoiceCatalog;
  staticFallbackItems: readonly InvoiceCatalogItem[];
  onSave: (catalog: InvoiceCatalog) => void | Promise<void>;
  onClose: () => void;
};

export function InvoiceCatalogEditor({ catalog, staticFallbackItems, onSave, onClose }: Props) {
  const baseItems = useMemo(() => {
    const persisted = clampInvoiceCatalog(catalog);
    if (persisted.items.length > 0) return persisted.items;
    return staticFallbackItems.map((it) => clampInvoiceCatalogItem(it));
  }, [catalog, staticFallbackItems]);

  const [draftItems, setDraftItems] = useState<InvoiceCatalogItem[]>(() => [...baseItems]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return draftItems;
    return draftItems.filter(
      (it) =>
        it.description.toLowerCase().includes(q) ||
        it.hsCode.toLowerCase().includes(q) ||
        (it.category ?? "").toLowerCase().includes(q)
    );
  }, [draftItems, query]);

  const groups = useMemo(() => groupCatalog(filtered), [filtered]);

  const updateItem = useCallback((id: string, patch: Partial<InvoiceCatalogItem>) => {
    setDraftItems((prev) =>
      prev.map((it) => (it.id === id ? clampInvoiceCatalogItem({ ...it, ...patch }) : it))
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const addItem = useCallback(() => {
    setDraftItems((prev) => [...prev, emptyInvoiceCatalogItem({ category: "KHÁC" })]);
  }, []);

  const handleSave = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({
        version: Math.max(1, (catalog.version ?? 1) + 1),
        items: draftItems.map((it) => clampInvoiceCatalogItem(it)),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }, [busy, catalog.version, draftItems, onClose, onSave]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${OPS.border}`}>
        <div>
          <p className={`text-xs font-semibold ${OPS.secondary}`}>Quản lý danh mục HQ</p>
          <p className={`text-[10px] ${OPS.muted}`}>{draftItems.length} mặt hàng · thêm/bớt tùy ý</p>
        </div>
        <button type="button" onClick={onClose} className={`text-xs ${OPS.muted} hover:underline`}>
          Đóng
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-black/5 px-3 py-2 dark:border-white/10">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Lọc danh mục…"
          className={`${OPS.input} min-w-[10rem] flex-1 text-xs`}
        />
        <button type="button" onClick={addItem} className={OPS.btnSmallAccent}>
          + Thêm mặt hàng
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 space-y-3">
        {groups.map(({ category, items }) => (
          <div key={category}>
            <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
              {category}
            </p>
            <div className="space-y-2">
              {items.map((it) => (
                <div
                  key={it.id}
                  className={`rounded-lg border p-2 ${OPS.border} bg-white/70 dark:bg-white/[0.03]`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <input
                      value={it.category}
                      onChange={(e) => updateItem(it.id, { category: e.target.value })}
                      placeholder="Nhóm"
                      className={`${OPS.input} max-w-[8rem] py-1 text-[10px] font-bold uppercase`}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="rounded px-1.5 py-0.5 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
                      Xóa
                    </button>
                  </div>
                  <textarea
                    value={it.description}
                    onChange={(e) => updateItem(it.id, { description: e.target.value })}
                    rows={2}
                    className={`${OPS.input} mb-1.5 w-full resize-y py-1 text-xs`}
                  />
                  <div className="grid grid-cols-4 gap-1">
                    <input
                      value={it.hsCode}
                      onChange={(e) => updateItem(it.id, { hsCode: e.target.value })}
                      placeholder="HS"
                      className={`${OPS.input} py-1 text-[10px]`}
                    />
                    <input
                      value={it.origin}
                      onChange={(e) => updateItem(it.id, { origin: e.target.value.toUpperCase() })}
                      placeholder="XX"
                      className={`${OPS.input} py-1 text-[10px]`}
                    />
                    <input
                      type="number"
                      value={it.unitPriceUsd}
                      onChange={(e) => updateItem(it.id, { unitPriceUsd: Number(e.target.value) || 0 })}
                      placeholder="$"
                      className={`${OPS.input} py-1 text-[10px] tabular-nums`}
                    />
                    <input
                      type="number"
                      value={it.kgPerUnit}
                      onChange={(e) => updateItem(it.id, { kgPerUnit: Number(e.target.value) || 0 })}
                      placeholder="kg"
                      className={`${OPS.input} py-1 text-[10px] tabular-nums`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={`flex shrink-0 justify-end gap-2 border-t px-3 py-2 ${OPS.footer}`}>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSave()}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Đang lưu…" : "Lưu danh mục"}
        </button>
      </div>
    </div>
  );
}
