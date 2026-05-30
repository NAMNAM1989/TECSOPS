import { useCallback, useMemo, useRef, useState } from "react";
import type { InvoiceCatalogItem } from "../types/invoiceItem";
import type { InvoiceCatalog } from "../utils/invoiceCatalogCore";
import {
  clampInvoiceCatalog,
  clampInvoiceCatalogItem,
  emptyInvoiceCatalogItem,
} from "../utils/invoiceCatalogCore";
import {
  mergeImportedCatalogItems,
  parseInvoiceCatalogExcelBuffer,
  validateCatalogItemsForSave,
} from "../utils/invoiceCatalogExcel";
import { groupCatalog } from "../hooks/useInvoiceCatalog";
import { LocaleNumberInput } from "./LocaleNumberInput";
import { OPS } from "../styles/opsModalStyles";

type Props = {
  catalog: InvoiceCatalog;
  staticFallbackItems: readonly InvoiceCatalogItem[];
  onSave: (catalog: InvoiceCatalog) => void | Promise<void>;
  onClose: () => void;
};

type ImportNotice = {
  added: number;
  skippedDuplicate: number;
  skippedEmpty: number;
  truncated: boolean;
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
  const [importNotice, setImportNotice] = useState<ImportNotice | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const usingStaticSeed = clampInvoiceCatalog(catalog).items.length === 0 && staticFallbackItems.length > 0;

  const updateItem = useCallback((id: string, patch: Partial<InvoiceCatalogItem>) => {
    setDraftItems((prev) =>
      prev.map((it) => (it.id === id ? clampInvoiceCatalogItem({ ...it, ...patch }) : it))
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const addItem = useCallback(() => {
    setQuery("");
    setImportNotice(null);
    setDraftItems((prev) => [...prev, emptyInvoiceCatalogItem({ category: "KHÁC" })]);
  }, []);

  const handleExcelPick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleExcelFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setImportError(null);
    setImportNotice(null);
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const imported = await parseInvoiceCatalogExcelBuffer(buffer);
      if (imported.length === 0) {
        setImportError("Không đọc được mặt hàng nào — kiểm tra cột B (mô tả) từ dòng 2.");
        return;
      }
      const merged = mergeImportedCatalogItems(draftItems, imported);
      setDraftItems(merged.items);
      setImportNotice({
        added: merged.added,
        skippedDuplicate: merged.skippedDuplicate,
        skippedEmpty: merged.skippedEmpty,
        truncated: merged.truncated,
      });
      setQuery("");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [draftItems]);

  const handleSave = useCallback(async () => {
    if (busy) return;
    const validation = validateCatalogItemsForSave(draftItems);
    if (!validation.ok) {
      window.alert(validation.message);
      return;
    }
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
          <p className={`text-[10px] ${OPS.muted}`}>
            {draftItems.length} mặt hàng
            {usingStaticSeed ? " · đang xem bản mẫu — Lưu sẽ ghi vào server" : ""}
          </p>
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
        <button
          type="button"
          disabled={busy}
          onClick={handleExcelPick}
          className="rounded-full border border-emerald-500/40 px-3 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-200"
        >
          ↑ Nhập Excel
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void handleExcelFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {(importNotice || importError) && (
        <div
          className={`border-b px-3 py-2 text-[11px] ${
            importError
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
          }`}
        >
          {importError ? (
            importError
          ) : importNotice ? (
            <>
              Đã thêm <strong>{importNotice.added}</strong> mặt hàng mới
              {importNotice.skippedDuplicate > 0
                ? ` · bỏ qua ${importNotice.skippedDuplicate} trùng mô tả`
                : ""}
              {importNotice.skippedEmpty > 0 ? ` · ${importNotice.skippedEmpty} dòng trống` : ""}
              {importNotice.truncated ? " · đạt giới hạn 500 mặt hàng" : ""}
              . Cột Excel: A=LOẠI, B=mô tả, C=HS, D=xuất xứ, E=qty, F=đv, G=USD, I=kg/đv.
            </>
          ) : null}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 space-y-3">
        {groups.length === 0 ? (
          <p className={`px-2 py-8 text-center text-xs ${OPS.muted}`}>
            {query.trim()
              ? "Không khớp bộ lọc — xóa ô tìm hoặc bấm «+ Thêm mặt hàng»."
              : "Danh mục trống — thêm thủ công hoặc nhập file Excel (data_invoice.xlsx)."}
          </p>
        ) : (
          groups.map(({ category, items }) => (
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
                      placeholder="Mô tả hàng (bắt buộc khi lưu)…"
                      className={`${OPS.input} mb-1.5 w-full resize-y py-1 text-xs ${
                        !it.description.trim() ? "ring-1 ring-amber-400/60" : ""
                      }`}
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
                      <LocaleNumberInput
                        value={it.unitPriceUsd}
                        maxDecimals={2}
                        onCommit={(unitPriceUsd) =>
                          updateItem(it.id, { unitPriceUsd: unitPriceUsd ?? 0 })
                        }
                        placeholder="$"
                        className="py-1 text-[10px] tabular-nums"
                      />
                      <LocaleNumberInput
                        value={it.kgPerUnit}
                        maxDecimals={3}
                        onCommit={(kgPerUnit) => updateItem(it.id, { kgPerUnit: kgPerUnit ?? 0 })}
                        placeholder="kg"
                        className="py-1 text-[10px] tabular-nums"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
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
