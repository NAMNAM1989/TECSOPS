import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  emptyInvoiceLineItem,
  fromCatalogEntry,
  totalsForInvoice,
  type InvoiceCatalogItem,
  type InvoiceLineItem,
} from "../types/invoiceItem";
import type { InvoiceCatalog } from "../utils/invoiceCatalogCore";
import {
  buildInvoiceNumber,
  downloadShipmentInvoiceExcel,
  formatInvoiceFlightLine,
} from "../utils/exportShipmentInvoiceExcel";
import { downloadShipmentInvoicePdf } from "../utils/exportShipmentInvoicePdf";
import { ShipmentInvoiceItemPicker } from "./ShipmentInvoiceItemPicker";
import { ShipmentInvoiceSheetPreview } from "./ShipmentInvoiceSheetPreview";
import { InvoiceLineEditor } from "./InvoiceLineEditor";
import { InvoiceCatalogEditor } from "./InvoiceCatalogEditor";
import { CustomsDeclarationIcon } from "./ShipmentInvoiceExportButton";
import { useInvoiceCatalog } from "../hooks/useInvoiceCatalog";
import { OPS } from "../styles/opsModalStyles";

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  invoiceCatalog?: InvoiceCatalog;
  onSaveItems: (items: InvoiceLineItem[]) => void | Promise<void>;
  onSaveCatalog: (catalog: InvoiceCatalog) => void | Promise<void>;
  onClose: () => void;
};

function cloneItems(items: InvoiceLineItem[] | undefined): InvoiceLineItem[] {
  return (items ?? []).map((it) => ({ ...it }));
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

export function ShipmentInvoiceWorkspace({
  shipment,
  customerDirectory,
  invoiceCatalog,
  onSaveItems,
  onSaveCatalog,
  onClose,
}: Props) {
  const [items, setItems] = useState<InvoiceLineItem[]>(() => cloneItems(shipment.invoiceItems));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const initial = useRef<InvoiceLineItem[]>(cloneItems(shipment.invoiceItems));
  const shipmentIdRef = useRef(shipment.id);
  const { staticItems } = useInvoiceCatalog(invoiceCatalog);

  useEffect(() => {
    if (shipment.id !== shipmentIdRef.current) {
      shipmentIdRef.current = shipment.id;
      const next = cloneItems(shipment.invoiceItems);
      setItems(next);
      initial.current = next;
      setDirty(false);
      return;
    }
    if (dirty) return;
    const next = cloneItems(shipment.invoiceItems);
    setItems(next);
    initial.current = next;
  }, [shipment.id, shipment.invoiceItems, dirty]);

  const previewItems = useDeferredValue(items);
  const totals = useMemo(() => totalsForInvoice(items), [items]);
  const invoicePreview = useMemo(
    () => buildInvoiceNumber(shipment, customerDirectory),
    [shipment, customerDirectory]
  );
  const flightLine = useMemo(() => formatInvoiceFlightLine(shipment), [shipment]);

  const cartonBadge = matchBadge("Kiện", shipment.pcs, totals.totalQuantity, " CTNS");
  const grossBadge = matchBadge("KG", shipment.kg, totals.totalGrossKg, " KGM");

  const markDirty = useCallback(() => setDirty(true), []);

  const addBlank = useCallback(() => {
    startTransition(() => {
      setItems((prev) => [...prev, emptyInvoiceLineItem()]);
      markDirty();
    });
  }, [markDirty]);

  const addFromCatalog = useCallback(
    (entry: InvoiceCatalogItem) => {
      startTransition(() => {
        setItems((prev) => [...prev, fromCatalogEntry(entry)]);
        markDirty();
      });
    },
    [markDirty]
  );

  const updateItem = useCallback(
    (lineId: string, patch: Partial<InvoiceLineItem>) => {
      setItems((prev) => prev.map((it) => (it.lineId === lineId ? { ...it, ...patch } : it)));
      markDirty();
    },
    [markDirty]
  );

  const removeItem = useCallback(
    (lineId: string) => {
      startTransition(() => {
        setItems((prev) => prev.filter((it) => it.lineId !== lineId));
        markDirty();
      });
    },
    [markDirty]
  );

  const saveItems = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSaveItems(items);
      initial.current = cloneItems(items);
      setDirty(false);
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
        setDirty(false);
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
        setDirty(false);
      }
      await downloadShipmentInvoicePdf(shipment, customerDirectory, { items });
    } finally {
      setBusy(false);
    }
  }, [busy, customerDirectory, dirty, items, onSaveItems, shipment]);

  const handleFinish = useCallback(async () => {
    if (busy) return;
    if (dirty) {
      const ok = window.confirm("Lưu danh sách mặt hàng trước khi quay lại?");
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (dirty) {
        await onSaveItems(items);
        initial.current = cloneItems(items);
        setDirty(false);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }, [busy, dirty, items, onClose, onSaveItems]);

  const requestClose = useCallback(() => {
    if (dirty) {
      const ok = window.confirm("Bạn chưa lưu thay đổi. Quay lại bảng lô hàng?");
      if (!ok) return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !catalogEditorOpen) {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [catalogEditorOpen, requestClose]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className={`shrink-0 border-b px-4 py-2.5 sm:px-5 ${OPS.border}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-800 dark:bg-indigo-400/12 dark:text-indigo-200">
              <CustomsDeclarationIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className={`text-base font-semibold sm:text-lg ${OPS.title}`}>
                Khai báo hải quan · AWB {shipment.awb || "—"}
              </h1>
              <p className={`mt-0.5 text-xs ${OPS.muted}`}>
                {invoicePreview} · {flightLine || "—"} · {shipment.dest || "—"}
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
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.04] dark:border-white/10 dark:hover:bg-white/[0.06]"
          >
            ← Quay lại
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex h-[min(24vh,220px)] min-h-0 max-h-[32vh] shrink-0 flex-col overflow-hidden border-b border-black/10 lg:h-full lg:max-h-none lg:w-60 lg:border-b-0 lg:border-r dark:border-white/10">
          {catalogEditorOpen ? (
            <InvoiceCatalogEditor
              catalog={invoiceCatalog ?? { version: 1, items: [] }}
              staticFallbackItems={staticItems}
              onSave={onSaveCatalog}
              onClose={() => setCatalogEditorOpen(false)}
            />
          ) : (
            <ShipmentInvoiceItemPicker
              mode="pane"
              stateCatalog={invoiceCatalog}
              onPick={addFromCatalog}
              onManageCatalog={() => setCatalogEditorOpen(true)}
            />
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="flex min-h-[min(40vh,460px)] min-w-0 flex-1 flex-col border-b border-black/10 lg:min-h-0 lg:border-b-0 lg:border-r dark:border-white/10">
            <ShipmentInvoiceSheetPreview
              shipment={shipment}
              customerDirectory={customerDirectory}
              items={previewItems}
            />
          </div>

          <div className="flex min-h-0 w-full flex-col overflow-hidden lg:w-[min(38%,26rem)]">
            <div className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${OPS.border}`}>
              <p className={`text-xs font-semibold ${OPS.secondary}`}>
                Chỉnh dòng hàng — {items.length} dòng
              </p>
              <button type="button" onClick={addBlank} className={OPS.btnSmallAccent}>
                + Thêm dòng
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2 py-2">
              {items.length === 0 ? (
                <div className={`m-1 ${OPS.empty}`}>
                  Chọn mặt hàng từ danh mục bên trái hoặc thêm dòng tự nhập.
                </div>
              ) : (
                items.map((it, idx) => (
                  <InvoiceLineEditor
                    key={it.lineId}
                    index={idx}
                    item={it}
                    onPatch={updateItem}
                    onRemove={removeItem}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className={`shrink-0 border-t px-4 py-2.5 sm:px-5 ${OPS.footer}`}>
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
  );
}
