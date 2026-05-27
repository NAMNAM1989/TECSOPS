import { useMemo, useState } from "react";
import type { InvoiceCatalogItem } from "../types/invoiceItem";
import type { InvoiceCatalog } from "../utils/invoiceCatalogCore";
import { groupCatalog, useInvoiceCatalog } from "../hooks/useInvoiceCatalog";
import { OPS } from "../styles/opsModalStyles";

type Props = {
  onPick: (item: InvoiceCatalogItem) => void;
  onClose?: () => void;
  /** `pane` = nhúng trong trang map (không bọc dialog). */
  mode?: "dialog" | "pane";
  stateCatalog?: InvoiceCatalog;
  onManageCatalog?: () => void;
};

export function ShipmentInvoiceItemPicker({
  onPick,
  onClose,
  mode = "dialog",
  stateCatalog,
  onManageCatalog,
}: Props) {
  const { items, loading, error, usingStaticFallback } = useInvoiceCatalog(stateCatalog);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("ALL");

  const groups = useMemo(() => groupCatalog(items), [items]);
  const categories = useMemo(() => ["ALL", ...groups.map((g) => g.category)], [groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((it) => {
        if (category !== "ALL" && (it.category || "KHÁC") !== category) return false;
        if (!q) return true;
        return (
          it.description.toLowerCase().includes(q) ||
          it.hsCode.toLowerCase().includes(q) ||
          (it.category ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, mode === "pane" ? 120 : 200);
  }, [items, query, category, mode]);

  const list = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={`flex flex-col gap-1.5 ${mode === "pane" ? "px-2 pt-2" : "border-b border-black/10 px-3 py-2 dark:border-white/10"}`}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tên, HS, nhóm…"
          className={`${OPS.input} w-full text-xs`}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={`${OPS.input} w-full text-xs`}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === "ALL" ? "Tất cả nhóm" : c}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-scroll overscroll-contain">
        {loading ? (
          <p className="p-3 text-xs text-slate-500">Đang tải catalog…</p>
        ) : error ? (
          <p className="p-3 text-xs text-red-600">Lỗi: {error}</p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">Không có mặt hàng khớp.</p>
        ) : (
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {filtered.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onPick(it)}
                  className="flex w-full flex-col gap-0.5 px-2 py-1.5 text-left transition-colors hover:bg-indigo-500/[0.06] dark:hover:bg-indigo-400/10"
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
                      {it.category || "KHÁC"}
                    </span>
                    <span className="shrink-0 text-[9px] tabular-nums text-slate-500">
                      {it.unitPriceUsd} USD · {it.kgPerUnit} kg
                    </span>
                  </span>
                  <span className="line-clamp-2 text-[11px] font-medium leading-snug text-apple-label dark:text-slate-200">
                    {it.description}
                  </span>
                  <span className="text-[9px] text-slate-500">
                    HS {it.hsCode} · mẫu {it.sampleQuantity} {it.unit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  if (mode === "pane") {
    return (
      <div className="flex h-full min-h-0 max-h-full flex-col overflow-hidden">
        <div className="border-b border-black/10 px-2 py-1.5 dark:border-white/10">
          <div className="flex items-start justify-between gap-1">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
                Danh mục hàng HQ
              </p>
              <p className="text-[9px] text-slate-500">
                Bấm để thêm · {items.length} mặt hàng
                {usingStaticFallback ? " (mặc định)" : ""}
              </p>
            </div>
            {onManageCatalog ? (
              <button
                type="button"
                onClick={onManageCatalog}
                className="shrink-0 rounded-md border border-indigo-500/25 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-800 hover:bg-indigo-500/10 dark:text-indigo-200"
              >
                Sửa DM
              </button>
            ) : null}
          </div>
        </div>
        {list}
      </div>
    );
  }

  return (
    <div className="flex h-full max-h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-ops-elevated">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-2 dark:border-white/10">
        <h3 className="text-sm font-semibold">Chọn mặt hàng</h3>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Đóng
          </button>
        ) : null}
      </div>
      {list}
    </div>
  );
}
