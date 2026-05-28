import { memo, useCallback, useMemo } from "react";
import type { InvoiceCatalogItem } from "../types/invoiceItem";
import {
  invoiceLineAmountUsd,
  invoiceLineGrossWeightKg,
  formatDeclarationKg,
  type InvoiceLineItem,
} from "../types/invoiceItem";
import type { InvoiceCatalog } from "../utils/invoiceCatalogCore";
import { useInvoiceCatalog } from "../hooks/useInvoiceCatalog";
import { SearchCombobox, type ComboboxOption } from "./SearchCombobox";
import { LocaleNumberInput } from "./LocaleNumberInput";
import { OPS } from "../styles/opsModalStyles";

const ORIGIN_OPTIONS = ["VN", "CN", "US", "KR", "JP", "TH", "TW", "MY", "ID"] as const;
const ORIGIN_COMBO_OPTIONS = ORIGIN_OPTIONS.map((o) => ({ value: o, label: o }));

function normalizeCategory(value: string | undefined): string {
  return (value || "").trim().toUpperCase();
}

function catalogOptionsForCategory(
  catalogItems: readonly InvoiceCatalogItem[],
  category: string | undefined,
): ComboboxOption[] {
  const cat = normalizeCategory(category);
  const filtered = cat
    ? catalogItems.filter((it) => normalizeCategory(it.category || "KHÁC") === cat)
    : catalogItems;
  return filtered.map((it) => ({
    value: it.id || `desc:${it.description}`,
    label: it.description,
    hint: `${it.category || "KHÁC"} · HS ${it.hsCode} · ${it.unitPriceUsd} USD`,
  }));
}

type GridRowProps = {
  index: number;
  item: InvoiceLineItem;
  selected: boolean;
  catalogItems: readonly InvoiceCatalogItem[];
  onToggleSelect: (lineId: string) => void;
  categoryOptions: ComboboxOption[];
  hsOptions: ComboboxOption[];
  unitOptions: ComboboxOption[];
  catalogByKey: Map<string, InvoiceCatalogItem>;
  onPatch: (lineId: string, patch: Partial<InvoiceLineItem>) => void;
  onRemove: (lineId: string) => void;
  onInsertAfter: (lineId: string) => void;
};

const GridRow = memo(function GridRow({
  index,
  item,
  selected,
  onToggleSelect,
  categoryOptions,
  catalogItems,
  hsOptions,
  unitOptions,
  catalogByKey,
  onPatch,
  onRemove,
  onInsertAfter,
}: GridRowProps) {
  const amount = invoiceLineAmountUsd(item);
  const gross = invoiceLineGrossWeightKg(item);
  const descriptionOptions = useMemo(
    () => catalogOptionsForCategory(catalogItems, item.category),
    [catalogItems, item.category],
  );

  const applyCatalog = useCallback(
    (entry: InvoiceCatalogItem) => {
      onPatch(item.lineId, {
        catalogId: entry.id,
        category: entry.category,
        description: entry.description,
        hsCode: entry.hsCode,
        origin: entry.origin || "VN",
        unit: entry.unit,
        unitPriceUsd: entry.unitPriceUsd,
        kgPerUnit: entry.kgPerUnit,
        quantity: entry.sampleQuantity || item.quantity,
      });
    },
    [item.lineId, item.quantity, onPatch]
  );

  return (
    <tr className={`group border-b border-black/[0.06] hover:bg-indigo-500/[0.03] dark:border-white/[0.06] ${selected ? "bg-indigo-500/[0.06]" : ""}`}>
      <td className="px-1 py-0.5 text-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(item.lineId)}
          className="h-3 w-3 rounded border-black/20"
          aria-label={`Chọn dòng ${index + 1}`}
        />
      </td>
      <td className="px-1 py-0.5 text-center text-[10px] tabular-nums text-slate-500">{index + 1}</td>
      <td className="px-0.5 py-0.5 min-w-[5rem]">
        <SearchCombobox
          value={item.category ?? ""}
          commitMode="blur"
          onChange={(v) => onPatch(item.lineId, { category: v.trim().toUpperCase() })}
          options={categoryOptions}
          placeholder="LOẠI"
          inputClassName="uppercase font-semibold text-[10px]"
        />
      </td>
      <td className="px-0.5 py-0.5 min-w-[14rem]">
        <SearchCombobox
          value={item.description}
          commitMode="blur"
          onChange={(v) => onPatch(item.lineId, { description: v })}
          options={descriptionOptions}
          placeholder="Mô tả hàng…"
          onPickOption={(opt) => {
            const entry =
              catalogByKey.get(opt.value) ??
              catalogByKey.get(`desc:${opt.label}`) ??
              catalogByKey.get(`desc:${opt.value}`);
            if (entry) applyCatalog(entry);
          }}
        />
      </td>
      <td className="px-0.5 py-0.5 w-[5.5rem]">
        <SearchCombobox
          value={item.hsCode}
          onChange={(v) => onPatch(item.lineId, { hsCode: v.replace(/\D/g, "").slice(0, 12) })}
          options={hsOptions}
          placeholder="HS"
          inputClassName="font-mono"
        />
      </td>
      <td className="px-0.5 py-0.5 w-[3rem]">
        <SearchCombobox
          value={item.origin}
          onChange={(v) => onPatch(item.lineId, { origin: v.toUpperCase().slice(0, 8) })}
          options={ORIGIN_COMBO_OPTIONS}
          placeholder="XX"
          inputClassName="font-mono uppercase text-center"
        />
      </td>
      <td className="px-0.5 py-0.5 w-[4rem]">
        <LocaleNumberInput
          integer
          value={item.quantity}
          onCommit={(quantity) => onPatch(item.lineId, { quantity: quantity ?? 0 })}
          className="w-full py-1 text-right text-[11px] tabular-nums"
        />
      </td>
      <td className="px-0.5 py-0.5 w-[4rem]">
        <SearchCombobox
          value={item.unit}
          onChange={(v) => onPatch(item.lineId, { unit: v.toUpperCase().slice(0, 16) })}
          options={unitOptions}
          placeholder="ĐVT"
          inputClassName="uppercase text-center"
        />
      </td>
      <td className="px-0.5 py-0.5 w-[4.5rem]">
        <LocaleNumberInput
          value={item.unitPriceUsd}
          maxDecimals={2}
          onCommit={(unitPriceUsd) => onPatch(item.lineId, { unitPriceUsd: unitPriceUsd ?? 0 })}
          className="w-full py-1 text-right text-[11px] tabular-nums"
        />
      </td>
      <td className="px-1 py-0.5 text-right text-[11px] tabular-nums text-slate-700 dark:text-slate-300">
        {amount.toFixed(2)}
      </td>
      <td className="px-0.5 py-0.5 w-[4rem]">
        <LocaleNumberInput
          value={item.kgPerUnit}
          maxDecimals={3}
          onCommit={(kgPerUnit) => onPatch(item.lineId, { kgPerUnit: kgPerUnit ?? 0 })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onInsertAfter(item.lineId);
            }
          }}
          className="w-full py-1 text-right text-[11px] tabular-nums"
        />
      </td>
      <td className="px-1 py-0.5 text-right text-[11px] tabular-nums text-slate-700 dark:text-slate-300">
        {formatDeclarationKg(gross)}
      </td>
      <td className="px-0.5 py-0.5 w-14 text-center">
        <div className="flex items-center justify-center gap-0.5">
          <button
            type="button"
            onClick={() => onInsertAfter(item.lineId)}
            className="rounded px-1 text-[11px] font-bold text-indigo-600 opacity-70 hover:bg-indigo-50 hover:opacity-100 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
            aria-label={`Thêm dòng sau ${index + 1}`}
            title="Thêm dòng ngay bên dưới"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.lineId)}
            className="rounded px-1 text-sm text-red-500 opacity-60 hover:bg-red-50 hover:opacity-100 dark:hover:bg-red-900/30"
            aria-label="Xóa dòng"
          >
            ×
          </button>
        </div>
      </td>
    </tr>
  );
});

type Props = {
  items: InvoiceLineItem[];
  stateCatalog?: InvoiceCatalog;
  selectedLineIds?: ReadonlySet<string>;
  onToggleLineSelect?: (lineId: string) => void;
  onToggleAllLines?: () => void;
  onPatch: (lineId: string, patch: Partial<InvoiceLineItem>) => void;
  onRemove: (lineId: string) => void;
  onAddBlank: () => void;
  onInsertAfter?: (lineId: string) => void;
};

export function InvoiceLineGrid({
  items,
  stateCatalog,
  selectedLineIds,
  onToggleLineSelect,
  onToggleAllLines,
  onPatch,
  onRemove,
  onAddBlank,
  onInsertAfter,
}: Props) {
  const { items: catalogItems } = useInvoiceCatalog(stateCatalog);

  const catalogByKey = useMemo(() => {
    const map = new Map<string, InvoiceCatalogItem>();
    for (const it of catalogItems) {
      if (it.id) map.set(it.id, it);
      map.set(`desc:${it.description}`, it);
    }
    return map;
  }, [catalogItems]);

  const categoryOptions = useMemo((): ComboboxOption[] => {
    const set = new Set<string>();
    for (const it of catalogItems) {
      const c = (it.category || "KHÁC").trim();
      if (c) set.add(c);
    }
    for (const row of items) {
      const c = (row.category || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((c) => ({ value: c, label: c }));
  }, [catalogItems, items]);

  const hsOptions = useMemo((): ComboboxOption[] => {
    const map = new Map<string, string>();
    for (const it of catalogItems) {
      if (it.hsCode) map.set(it.hsCode, it.description.slice(0, 40));
    }
    for (const row of items) {
      if (row.hsCode) map.set(row.hsCode, row.description.slice(0, 40));
    }
    return Array.from(map.entries()).map(([value, hint]) => ({ value, label: value, hint }));
  }, [catalogItems, items]);

  const unitOptions = useMemo((): ComboboxOption[] => {
    const set = new Set<string>(["PCE", "BAG", "CTN", "SET", "PKG", "BOX"]);
    for (const it of catalogItems) if (it.unit) set.add(it.unit);
    for (const row of items) if (row.unit) set.add(row.unit);
    return Array.from(set)
      .sort()
      .map((u) => ({ value: u, label: u }));
  }, [catalogItems, items]);

  const allSelected = items.length > 0 && items.every((it) => selectedLineIds?.has(it.lineId));
  const someSelected = (selectedLineIds?.size ?? 0) > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-2 py-1.5 ${OPS.border}`}>
        <p className={`text-[11px] font-semibold ${OPS.secondary}`}>
          Bảng hàng HQ · {items.length} dòng
          {someSelected ? ` · ${selectedLineIds!.size} đã chọn` : ""}
          {" · "}
          <span className={`font-normal ${OPS.muted}`}>Ctrl+S lưu · Ctrl+Enter thêm dòng · Enter ở kg/đv → dòng mới</span>
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-100/95 text-[9px] font-bold uppercase tracking-wide text-slate-600 backdrop-blur-sm dark:bg-slate-800/95 dark:text-slate-300">
            <tr>
              <th className="w-7 px-1 py-1.5 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAllLines?.()}
                  disabled={!onToggleAllLines || items.length === 0}
                  className="h-3 w-3 rounded border-black/20"
                  aria-label="Chọn tất cả"
                />
              </th>
              <th className="px-1 py-1.5 w-8 text-center">#</th>
              <th className="px-1 py-1.5">Loại</th>
              <th className="px-1 py-1.5">Mô tả hàng</th>
              <th className="px-1 py-1.5">HS</th>
              <th className="px-1 py-1.5">XX</th>
              <th className="px-1 py-1.5 text-right">SL</th>
              <th className="px-1 py-1.5">ĐVT</th>
              <th className="px-1 py-1.5 text-right">Đ.giá $</th>
              <th className="px-1 py-1.5 text-right">Tiền $</th>
              <th className="px-1 py-1.5 text-right">kg/đv</th>
              <th className="px-1 py-1.5 text-right">KG</th>
              <th className="w-14 px-1 py-1.5 text-center">+ / ×</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={13} className={`px-3 py-8 text-center text-xs ${OPS.muted}`}>
                  Bấm + Dòng hoặc gõ tìm mô tả hàng (gợi ý như Google từ danh mục).
                </td>
              </tr>
            ) : (
              items.map((it, idx) => (
                <GridRow
                  key={it.lineId}
                  index={idx}
                  item={it}
                  selected={selectedLineIds?.has(it.lineId) ?? false}
                  onToggleSelect={(id) => onToggleLineSelect?.(id)}
                  categoryOptions={categoryOptions}
                  catalogItems={catalogItems}
                  hsOptions={hsOptions}
                  unitOptions={unitOptions}
                  catalogByKey={catalogByKey}
                  onPatch={onPatch}
                  onRemove={onRemove}
                  onInsertAfter={onInsertAfter ?? onAddBlank}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
