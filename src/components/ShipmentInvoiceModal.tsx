import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  emptyInvoiceLineItem,
  fromCatalogEntry,
  invoiceLineAmountUsd,
  invoiceLineGrossWeightKg,
  totalsForInvoice,
  type InvoiceCatalogItem,
  type InvoiceLineItem,
} from "../types/invoiceItem";
import {
  buildInvoiceNumber,
  downloadShipmentInvoiceExcel,
} from "../utils/exportShipmentInvoiceExcel";
import { downloadShipmentInvoicePdf } from "../utils/exportShipmentInvoicePdf";
import { ShipmentInvoiceItemPicker } from "./ShipmentInvoiceItemPicker";
import { ShipmentInvoiceSheetPreview } from "./ShipmentInvoiceSheetPreview";
import { OPS } from "../styles/opsModalStyles";

type Props = {
  open: boolean;
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  onClose: () => void;
  onSaveItems: (items: InvoiceLineItem[]) => void | Promise<void>;
};

function cloneItems(items: InvoiceLineItem[] | undefined): InvoiceLineItem[] {
  return (items ?? []).map((it) => ({ ...it }));
}

function safeNumber(v: string, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function matchBadge(
  label: string,
  expected: number | null,
  actual: number,
  unit: string
): { ok: boolean; text: string } {
  if (expected == null || expected <= 0) {
    return { ok: true, text: `${label}: —` };
  }
  const ok = Math.abs(expected - actual) < 1e-3;
  return {
    ok,
    text: ok
      ? `${label} khớp (${actual}${unit})`
      : `${label} ${actual}${unit} / lô ${expected}${unit}`,
  };
}

export function ShipmentInvoiceModal({
  open,
  shipment,
  customerDirectory,
  onClose,
  onSaveItems,
}: Props) {
  const [items, setItems] = useState<InvoiceLineItem[]>(() => cloneItems(shipment.invoiceItems));
  const [busy, setBusy] = useState(false);
  const initial = useRef<InvoiceLineItem[]>(cloneItems(shipment.invoiceItems));

  useEffect(() => {
    if (open) {
      setItems(cloneItems(shipment.invoiceItems));
      initial.current = cloneItems(shipment.invoiceItems);
    }
  }, [open, shipment.invoiceItems]);

  const dirty = useMemo(
    () => JSON.stringify(items) !== JSON.stringify(initial.current),
    [items]
  );

  const totals = useMemo(() => totalsForInvoice(items), [items]);
  const invoicePreview = useMemo(
    () => buildInvoiceNumber(shipment, customerDirectory),
    [shipment, customerDirectory]
  );

  const cartonBadge = matchBadge("Kiện", shipment.pcs, totals.totalQuantity, " CTNS");
  const grossBadge = matchBadge("KG", shipment.kg, totals.totalGrossKg, " KGM");

  const addBlank = useCallback(() => {
    setItems((prev) => [...prev, emptyInvoiceLineItem()]);
  }, []);

  const addFromCatalog = useCallback((entry: InvoiceCatalogItem) => {
    setItems((prev) => [...prev, fromCatalogEntry(entry)]);
  }, []);

  const updateItem = useCallback((lineId: string, patch: Partial<InvoiceLineItem>) => {
    setItems((prev) => prev.map((it) => (it.lineId === lineId ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((it) => it.lineId !== lineId));
  }, []);

  const saveItems = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSaveItems(items);
      initial.current = cloneItems(items);
    } finally {
      setBusy(false);
    }
  }, [busy, items, onSaveItems]);

  const handleExportExcel = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (dirty) {
        await onSaveItems(items);
        initial.current = cloneItems(items);
      }
      await downloadShipmentInvoiceExcel(shipment, customerDirectory, { items });
    } finally {
      setBusy(false);
    }
  }, [busy, customerDirectory, dirty, items, onSaveItems, shipment]);

  const handleExportPdf = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (dirty) {
        await onSaveItems(items);
        initial.current = cloneItems(items);
      }
      await downloadShipmentInvoicePdf(shipment, customerDirectory, { items });
    } finally {
      setBusy(false);
    }
  }, [busy, customerDirectory, dirty, items, onSaveItems, shipment]);

  /** Chỉ đóng sau khi người dùng bấm Hoàn tất (có lưu nếu còn thay đổi). */
  const handleFinish = useCallback(async () => {
    if (busy) return;
    if (dirty) {
      const ok = window.confirm("Lưu danh sách mặt hàng trước khi đóng?");
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (dirty) {
        await onSaveItems(items);
        initial.current = cloneItems(items);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }, [busy, dirty, items, onClose, onSaveItems]);

  const requestClose = useCallback(() => {
    if (dirty) {
      const ok = window.confirm("Bạn chưa lưu thay đổi. Đóng bảng map?");
      if (!ok) return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const prevDataset = document.body.dataset.invoiceModalOpen;
    document.body.style.overflow = "hidden";
    document.body.dataset.invoiceModalOpen = "1";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      if (prevDataset === undefined) {
        delete document.body.dataset.invoiceModalOpen;
      } else {
        document.body.dataset.invoiceModalOpen = prevDataset;
      }
      window.removeEventListener("keydown", onKey);
    };
  }, [open, requestClose]);

  if (!open || typeof document === "undefined") return null;

  const stopScrollChain = (e: WheelEvent) => {
    e.stopPropagation();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bảng map khai báo hải quan"
      className="fixed inset-0 z-[720] flex items-stretch justify-center overflow-hidden bg-black/60 p-2 sm:p-3"
      onWheel={stopScrollChain}
    >
      <div
        className={`isolate mx-auto flex h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] w-full max-w-[min(98vw,110rem)] min-h-0 flex-col overflow-hidden rounded-2xl border shadow-2xl contain-layout ${OPS.modal} ${OPS.border}`}
        onClick={(e) => e.stopPropagation()}
        onWheel={stopScrollChain}
      >
        <header className={`shrink-0 border-b px-4 py-2.5 ${OPS.border}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className={`text-base font-semibold ${OPS.title}`}>
                Khai báo hải quan · AWB {shipment.awb || "—"}
              </h2>
              <p className={`mt-0.5 text-xs ${OPS.muted}`}>
                {invoicePreview} · {shipment.flight || "—"} · {shipment.dest || "—"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    cartonBadge.ok
                      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                      : "bg-amber-500/15 text-amber-900 dark:text-amber-100"
                  }`}
                >
                  {cartonBadge.text}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    grossBadge.ok
                      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                      : "bg-amber-500/15 text-amber-900 dark:text-amber-100"
                  }`}
                >
                  {grossBadge.text}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${OPS.muted}`}>
                  Lô: {shipment.pcs ?? "—"} CTNS · {shipment.kg ?? "—"} KGM
                </span>
              </div>
            </div>
            <p className={`max-w-xs text-[11px] leading-snug ${OPS.muted}`}>
              Nhập liệu tại đây — bấm ngoài nền không đóng. Khi xong, bấm{" "}
              <strong className="font-semibold text-indigo-700 dark:text-indigo-300">Hoàn tất</strong>.
            </p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="flex h-[min(22vh,200px)] min-h-0 max-h-[30vh] shrink-0 flex-col overflow-hidden border-b border-black/10 lg:h-full lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r dark:border-white/10">
            <ShipmentInvoiceItemPicker mode="pane" onPick={addFromCatalog} />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <div className="flex min-h-[min(42vh,480px)] min-w-0 flex-1 flex-col border-b border-black/10 lg:min-h-0 lg:border-b-0 lg:border-r dark:border-white/10">
              <ShipmentInvoiceSheetPreview
                shipment={shipment}
                customerDirectory={customerDirectory}
                items={items}
              />
            </div>

            <div className="flex min-h-0 w-full flex-col overflow-hidden lg:w-[min(42%,28rem)]">
            <div className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${OPS.border}`}>
              <p className={`text-xs font-semibold ${OPS.secondary}`}>
                Chỉnh dòng hàng — {items.length} dòng
              </p>
              <button type="button" onClick={addBlank} className={OPS.btnSmallAccent}>
                + Dòng tự nhập
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-scroll overflow-x-auto overscroll-contain px-2 py-2">
              {items.length === 0 ? (
                <div className={`m-1 ${OPS.empty}`}>
                  Chọn mặt hàng từ catalog bên trái hoặc thêm dòng tự nhập. Chưa có dòng thì bảng hàng trên
                  invoice để trống khi xuất.
                </div>
              ) : (
                <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-xs">
                  <thead className={OPS.tableHead}>
                    <tr>
                      <th className="w-8 px-1.5 py-1.5">#</th>
                      <th className="min-w-[12rem] px-1.5 py-1.5">Mô tả hàng</th>
                      <th className="w-24 px-1.5 py-1.5">HS</th>
                      <th className="w-12 px-1.5 py-1.5">Ori</th>
                      <th className="w-14 px-1.5 py-1.5 text-right">Kiện</th>
                      <th className="w-12 px-1.5 py-1.5">Đv</th>
                      <th className="w-16 px-1.5 py-1.5 text-right">USD</th>
                      <th className="w-14 px-1.5 py-1.5 text-right">kg/đv</th>
                      <th className="w-20 px-1.5 py-1.5 text-right">T.kg · USD</th>
                      <th className="w-9 px-1.5 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr
                        key={it.lineId}
                        className={`border-b align-middle ${OPS.border} bg-transparent even:bg-black/[0.02] dark:even:bg-white/[0.02]`}
                      >
                        <td className="px-1.5 py-1 text-slate-500">{idx + 1}</td>
                        <td className="px-1.5 py-1">
                          <input
                            value={it.description}
                            onChange={(e) => updateItem(it.lineId, { description: e.target.value })}
                            className={`${OPS.input} w-full py-1.5 text-xs`}
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            value={it.hsCode}
                            onChange={(e) => updateItem(it.lineId, { hsCode: e.target.value })}
                            className={`${OPS.input} w-full py-1.5 text-xs`}
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            value={it.origin}
                            onChange={(e) =>
                              updateItem(it.lineId, { origin: e.target.value.toUpperCase() })
                            }
                            className={`${OPS.input} w-full py-1.5 text-xs`}
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            type="number"
                            value={it.quantity}
                            onChange={(e) =>
                              updateItem(it.lineId, { quantity: safeNumber(e.target.value) })
                            }
                            className={`${OPS.input} w-full py-1.5 text-right text-xs tabular-nums`}
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            value={it.unit}
                            onChange={(e) =>
                              updateItem(it.lineId, { unit: e.target.value.toUpperCase() })
                            }
                            className={`${OPS.input} w-full py-1.5 text-xs`}
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            type="number"
                            step="0.01"
                            value={it.unitPriceUsd}
                            onChange={(e) =>
                              updateItem(it.lineId, { unitPriceUsd: safeNumber(e.target.value) })
                            }
                            className={`${OPS.input} w-full py-1.5 text-right text-xs tabular-nums`}
                          />
                        </td>
                        <td className="px-1.5 py-1">
                          <input
                            type="number"
                            step="0.01"
                            value={it.kgPerUnit}
                            onChange={(e) =>
                              updateItem(it.lineId, { kgPerUnit: safeNumber(e.target.value) })
                            }
                            className={`${OPS.input} w-full py-1.5 text-right text-xs tabular-nums`}
                          />
                        </td>
                        <td className="px-1.5 py-1 text-right text-[11px] tabular-nums text-slate-500">
                          {invoiceLineGrossWeightKg(it).toFixed(1)}
                          <span className="mx-0.5 opacity-40">·</span>
                          {invoiceLineAmountUsd(it).toFixed(1)}
                        </td>
                        <td className="px-1.5 py-1 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(it.lineId)}
                            className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                            aria-label="Xóa dòng"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            </div>
          </div>
        </div>

        <footer className={`shrink-0 border-t px-4 py-2.5 ${OPS.footer}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-[11px] ${OPS.muted}`}>
              Tổng bảng: {totals.totalAmountUsd.toFixed(2)} USD · {totals.totalGrossKg.toFixed(1)} kg
              {" · "}
              Footer lô: {shipment.pcs ?? 0} CTNS · {shipment.kg ?? 0} KGM
              {dirty ? (
                <span className="ml-1 font-semibold text-amber-700 dark:text-amber-300"> · Chưa lưu</span>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void saveItems()}
                disabled={busy || !dirty}
                className={`${OPS.btnSmallAccent} disabled:opacity-50`}
              >
                Lưu nháp
              </button>
              <button
                type="button"
                onClick={() => void handleExportExcel()}
                disabled={busy}
                className="rounded-full border border-emerald-600/50 bg-emerald-600/10 px-4 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-600/20 disabled:opacity-50 dark:text-emerald-200"
              >
                {busy ? "Đang xuất…" : "Xuất Excel"}
              </button>
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={busy}
                className="rounded-full border border-sky-600/50 bg-sky-600/10 px-4 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-600/20 disabled:opacity-50 dark:text-sky-200"
              >
                {busy ? "Đang xuất…" : "Xuất PDF"}
              </button>
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={busy}
                className="rounded-full bg-indigo-600 px-5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
