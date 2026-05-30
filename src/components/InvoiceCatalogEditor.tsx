import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InvoiceCatalogItem } from "../types/invoiceItem";
import type { InvoiceCatalog } from "../utils/invoiceCatalogCore";
import {
  clampInvoiceCatalog,
  clampInvoiceCatalogItem,
  emptyInvoiceCatalogItem,
} from "../utils/invoiceCatalogCore";
import {
  mergeCatalogDraftWithBase,
  mergeImportedCatalogItems,
  parseInvoiceCatalogExcelBuffer,
  validateCatalogItemsForSave,
} from "../utils/invoiceCatalogExcel";
import {
  CATALOG_EXCEL_COLUMNS,
  CATALOG_UPLOAD_TEMPLATE_PATH,
  downloadInvoiceCatalogExport,
  downloadInvoiceCatalogTemplate,
} from "../utils/exportInvoiceCatalogExcel";
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

type CatalogItemCardProps = {
  item: InvoiceCatalogItem;
  highlight?: boolean;
  onUpdate: (id: string, patch: Partial<InvoiceCatalogItem>) => void;
  onRemove: (id: string) => void;
};

function CatalogItemCard({ item, highlight, onUpdate, onRemove }: CatalogItemCardProps) {
  return (
    <div
      className={`rounded-lg border p-2 ${OPS.border} bg-white/70 dark:bg-white/[0.03] ${
        highlight ? "ring-2 ring-amber-400/80 shadow-sm shadow-amber-500/20" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <input
          value={item.category}
          onChange={(e) => onUpdate(item.id, { category: e.target.value })}
          placeholder="Nhóm"
          className={`${OPS.input} max-w-[8rem] py-1 text-[10px] font-bold uppercase`}
        />
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded px-1.5 py-0.5 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
        >
          Xóa
        </button>
      </div>
      <textarea
        value={item.description}
        onChange={(e) => onUpdate(item.id, { description: e.target.value })}
        rows={2}
        placeholder="Mô tả hàng (bắt buộc khi lưu)…"
        autoFocus={highlight}
        className={`${OPS.input} mb-1.5 w-full resize-y py-1 text-xs ${
          !item.description.trim() ? "ring-1 ring-amber-400/60" : ""
        }`}
      />
      <div className="grid grid-cols-4 gap-1">
        <input
          value={item.hsCode}
          onChange={(e) => onUpdate(item.id, { hsCode: e.target.value })}
          placeholder="HS"
          className={`${OPS.input} py-1 text-[10px]`}
        />
        <input
          value={item.origin}
          onChange={(e) => onUpdate(item.id, { origin: e.target.value.toUpperCase() })}
          placeholder="XX"
          className={`${OPS.input} py-1 text-[10px]`}
        />
        <LocaleNumberInput
          value={item.unitPriceUsd}
          maxDecimals={2}
          onCommit={(unitPriceUsd) => onUpdate(item.id, { unitPriceUsd: unitPriceUsd ?? 0 })}
          placeholder="$"
          className="py-1 text-[10px] tabular-nums"
        />
        <LocaleNumberInput
          value={item.kgPerUnit}
          maxDecimals={3}
          onCommit={(kgPerUnit) => onUpdate(item.id, { kgPerUnit: kgPerUnit ?? 0 })}
          placeholder="kg"
          className="py-1 text-[10px] tabular-nums"
        />
      </div>
    </div>
  );
}

function mergeDraftWithBase(
  prev: InvoiceCatalogItem[],
  baseItems: readonly InvoiceCatalogItem[]
): InvoiceCatalogItem[] {
  return mergeCatalogDraftWithBase(prev, baseItems);
}

export function InvoiceCatalogEditor({ catalog, staticFallbackItems, onSave, onClose }: Props) {
  const baseItems = useMemo(() => {
    const persisted = clampInvoiceCatalog(catalog);
    if (persisted.items.length > 0) return persisted.items;
    return staticFallbackItems.map((it) => clampInvoiceCatalogItem(it));
  }, [catalog, staticFallbackItems]);

  const [draftItems, setDraftItems] = useState<InvoiceCatalogItem[]>(() =>
    mergeDraftWithBase([], baseItems)
  );
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [importNotice, setImportNotice] = useState<ImportNotice | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [addNotice, setAddNotice] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userEditedRef = useRef(false);

  useEffect(() => {
    if (userEditedRef.current) return;
    setDraftItems((prev) => mergeDraftWithBase(prev, baseItems));
  }, [baseItems]);

  const pendingItems = useMemo(
    () => draftItems.filter((it) => !it.description.trim()),
    [draftItems]
  );

  const establishedFiltered = useMemo(() => {
    const established = draftItems.filter((it) => it.description.trim());
    const q = query.trim().toLowerCase();
    if (!q) return established;
    return established.filter(
      (it) =>
        it.description.toLowerCase().includes(q) ||
        it.hsCode.toLowerCase().includes(q) ||
        (it.category ?? "").toLowerCase().includes(q)
    );
  }, [draftItems, query]);

  const groups = useMemo(() => groupCatalog(establishedFiltered), [establishedFiltered]);
  const usingStaticSeed = clampInvoiceCatalog(catalog).items.length === 0 && staticFallbackItems.length > 0;

  const updateItem = useCallback((id: string, patch: Partial<InvoiceCatalogItem>) => {
    userEditedRef.current = true;
    setDraftItems((prev) =>
      prev.map((it) => (it.id === id ? clampInvoiceCatalogItem({ ...it, ...patch }) : it))
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    userEditedRef.current = true;
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
    if (highlightId === id) setHighlightId(null);
  }, [highlightId]);

  const addItem = useCallback(() => {
    userEditedRef.current = true;
    const item = emptyInvoiceCatalogItem({ category: "KHÁC" });
    setQuery("");
    setImportNotice(null);
    setImportError(null);
    setAddNotice(
      `Đã thêm mặt hàng #${draftItems.length + 1} — nhập mô tả ở khung vàng bên dưới, rồi «Lưu danh mục».`
    );
    setHighlightId(item.id);
    setDraftItems((prev) => [item, ...prev]);
  }, [draftItems.length]);

  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => setHighlightId(null), 6000);
    return () => window.clearTimeout(t);
  }, [highlightId]);

  const handleExcelPick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleExcelFile = useCallback(async (file: File | null) => {
    if (!file) return;
    userEditedRef.current = true;
    setImportError(null);
    setImportNotice(null);
    setAddNotice(null);
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
      if (merged.added === 0) {
        setImportError("Không có mặt hàng mới — tất cả mô tả trong file đã có trong danh mục.");
      } else {
        setAddNotice(`Excel đã thêm ${merged.added} mặt hàng mới vào danh sách (tổng ${merged.items.length}).`);
      }
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
      <div className={`flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 ${OPS.border}`}>
        <div>
          <p className={`text-xs font-semibold ${OPS.secondary}`}>Quản lý danh mục HQ</p>
          <p className={`text-[10px] ${OPS.muted}`}>
            <strong className="tabular-nums text-indigo-700 dark:text-indigo-200">{draftItems.length}</strong> mặt hàng
            {pendingItems.length > 0 ? ` · ${pendingItems.length} đang soạn` : ""}
            {usingStaticSeed ? " · bản mẫu — Lưu ghi lên server" : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} className={`text-xs ${OPS.muted} hover:underline`}>
          Đóng
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 border-b border-black/5 px-3 py-2 dark:border-white/10">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Lọc danh mục đã có…"
          className={`${OPS.input} min-w-[10rem] flex-1 text-xs`}
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            addItem();
          }}
          className={`${OPS.btnSmallAccent} shrink-0`}
        >
          + Thêm mặt hàng
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void downloadInvoiceCatalogTemplate()}
          className="shrink-0 rounded-full border border-indigo-500/35 px-3 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-500/10 disabled:opacity-50 dark:text-indigo-200"
        >
          ↓ Mẫu Excel
        </button>
        <button
          type="button"
          disabled={busy || draftItems.length === 0}
          onClick={() => void downloadInvoiceCatalogExport(draftItems)}
          className="shrink-0 rounded-full border border-slate-400/40 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-500/10 disabled:opacity-50 dark:text-slate-200"
        >
          ↓ Xuất danh mục
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleExcelPick}
          className="shrink-0 rounded-full border border-emerald-500/40 px-3 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-200"
        >
          ↑ Cập nhật Excel
        </button>
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="shrink-0 rounded-full border border-black/10 px-2.5 py-1 text-[10px] font-medium dark:border-white/15"
        >
          {showGuide ? "Ẩn hướng dẫn" : "Hướng dẫn"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void handleExcelFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {showGuide ? (
        <div className={`shrink-0 border-b px-3 py-2 text-[10px] leading-relaxed ${OPS.muted} ${OPS.border}`}>
          <p className="mb-1 font-semibold text-indigo-800 dark:text-indigo-200">Cập nhật danh mục — 2 cách</p>
          <ol className="mb-2 list-decimal space-y-0.5 pl-4">
            <li>
              <strong>Trên web:</strong> «+ Thêm mặt hàng» → điền mô tả ở khung vàng → «Lưu danh mục».
            </li>
            <li>
              <strong>Excel:</strong> «↓ Mẫu Excel» (hoặc{" "}
              <a
                href={CATALOG_UPLOAD_TEMPLATE_PATH}
                download="mau_danh_muc_hang_hq.xlsx"
                className="text-indigo-600 underline dark:text-indigo-300"
              >
                tải file mẫu
              </a>
              ) → thêm dòng mới sheet DATA → «↑ Cập nhật Excel» → «Lưu danh mục».
            </li>
          </ol>
          <p className="mb-1">Cột sheet DATA (dòng 1 = tiêu đề, dữ liệu từ dòng 2):</p>
          <div className="flex flex-wrap gap-1">
            {CATALOG_EXCEL_COLUMNS.map((c) => (
              <span
                key={c.col}
                className="rounded bg-black/[0.04] px-1.5 py-0.5 font-mono text-[9px] dark:bg-white/[0.06]"
                title={c.hint}
              >
                {c.col}={c.header}
              </span>
            ))}
          </div>
          <p className="mt-1.5">Mô tả (cột B) không được trùng mặt hàng đã có — hệ thống tự bỏ qua dòng trùng.</p>
        </div>
      ) : null}

      {(addNotice || importNotice || importError) && (
        <div
          className={`shrink-0 border-b px-3 py-2 text-[11px] ${
            importError
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
          }`}
        >
          {importError ? (
            importError
          ) : importNotice ? (
            <>
              Excel: thêm <strong>{importNotice.added}</strong> mặt hàng mới
              {importNotice.skippedDuplicate > 0
                ? ` · bỏ qua ${importNotice.skippedDuplicate} trùng mô tả`
                : ""}
              {importNotice.skippedEmpty > 0 ? ` · ${importNotice.skippedEmpty} dòng trống` : ""}
              {importNotice.truncated ? " · đạt giới hạn 500 mặt hàng" : ""}
              . Bấm «Lưu danh mục» để ghi server.
            </>
          ) : (
            addNotice
          )}
        </div>
      )}

      {pendingItems.length > 0 ? (
        <div className="shrink-0 max-h-[min(42vh,20rem)] overflow-y-auto border-b border-amber-300/60 bg-amber-50/90 px-2 py-2 dark:border-amber-500/30 dark:bg-amber-950/40">
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-100">
            Mới thêm / đang soạn ({pendingItems.length}) — hiển thị ngay tại đây
          </p>
          <div className="space-y-2">
            {pendingItems.map((it) => (
              <CatalogItemCard
                key={it.id}
                item={it}
                highlight={highlightId === it.id}
                onUpdate={updateItem}
                onRemove={removeItem}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 space-y-3">
        {groups.length === 0 && pendingItems.length === 0 ? (
          <p className={`px-2 py-8 text-center text-xs ${OPS.muted}`}>
            {query.trim()
              ? "Không khớp bộ lọc — xóa ô tìm hoặc bấm «+ Thêm mặt hàng»."
              : "Danh mục trống — thêm thủ công hoặc cập nhật từ file Excel."}
          </p>
        ) : groups.length === 0 ? (
          <p className={`px-2 py-4 text-center text-xs ${OPS.muted}`}>
            Không khớp bộ lọc trong danh mục đã có — xóa ô tìm để xem lại {draftItems.length - pendingItems.length} mặt hàng.
          </p>
        ) : (
          groups.map(({ category, items }) => (
            <section key={category}>
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
                {category}
              </p>
              <div className="space-y-2">
                {items.map((it) => (
                  <CatalogItemCard
                    key={it.id}
                    item={it}
                    onUpdate={updateItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            </section>
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
