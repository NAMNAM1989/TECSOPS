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
  formatDeclarationKg,
  roundDeclarationKg,
  totalsForInvoice,
  type InvoiceLineItem,
} from "../types/invoiceItem";
import type { HqInvoiceSavePayload, InvoiceDeclaration } from "../types/invoiceDeclaration";
import type { InvoiceCatalog } from "../utils/invoiceCatalogCore";
import {
  addDeclaration,
  applyTemplateStructure,
  autoDistributeItemsToDeclarations,
  copyItemsToAllOtherDeclarations,
  copyItemsToDeclaration,
  redistributeTargetsEvenly,
  removeDeclaration,
  resolveInvoiceDeclarations,
  splitIntoDeclarations,
  updateDeclarationItems,
  updateDeclarationTargets,
  validateDeclarationTargets,
  validateDeclarationsLock,
} from "../utils/invoiceDeclarationCore";
import { buildInvoiceExportPayload } from "../export/builders/buildInvoiceExportPayload";
import {
  downloadShipmentInvoiceExcel,
  formatInvoiceFlightLine,
} from "../utils/exportShipmentInvoiceExcel";
import { downloadShipmentInvoicePdf } from "../utils/exportShipmentInvoicePdf";
import {
  downloadAllDeclarationsExcelZip,
  downloadAllDeclarationsPdfZip,
} from "../utils/exportShipmentInvoiceBulk";
import { InvoiceExportPreview } from "../export/preview/InvoiceExportPreview";
import { InvoiceLineGrid } from "./InvoiceLineGrid";
import { InvoiceCatalogEditor } from "./InvoiceCatalogEditor";
import { HqWorkspaceToolbar } from "./HqWorkspaceToolbar";
import { CustomsDeclarationIcon } from "./ShipmentInvoiceExportButton";
import { useInvoiceCatalog } from "../hooks/useInvoiceCatalog";
import { randomInvoiceLinesFromCatalog, countUniqueCatalogCategories } from "../utils/invoiceRandomPick";
import {
  balanceDeclarationLineItems,
  grossNetWeightBadge,
  resolveSheetBalanceTargets,
} from "../utils/invoiceQuantityBalance";
import { OPS } from "../styles/opsModalStyles";
import { A4_WIDTH_MM } from "../utils/printMmUnits";

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  invoiceCatalog?: InvoiceCatalog;
  onSave: (payload: HqInvoiceSavePayload) => void | Promise<void>;
  onSaveCatalog: (catalog: InvoiceCatalog) => void | Promise<void>;
  onClose: () => void;
};

function cloneDeclarations(list: InvoiceDeclaration[]): InvoiceDeclaration[] {
  return list.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it })) }));
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
      : `${label} ${actual}${unit} / mục tiêu ${expected}${unit}`,
  };
}

export function ShipmentInvoiceWorkspace({
  shipment,
  customerDirectory,
  invoiceCatalog,
  onSave,
  onSaveCatalog,
  onClose,
}: Props) {
  const [declarations, setDeclarations] = useState<InvoiceDeclaration[]>(() =>
    cloneDeclarations(resolveInvoiceDeclarations(shipment))
  );
  const [activeId, setActiveId] = useState(() => resolveInvoiceDeclarations(shipment)[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [catalogEditorKey, setCatalogEditorKey] = useState(0);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(() => new Set());
  const [copyTargetId, setCopyTargetId] = useState("");
  const [balanceNotice, setBalanceNotice] = useState<string | null>(null);
  const shipmentIdRef = useRef(shipment.id);
  const { staticItems, items: catalogItems, loading: catalogLoading } = useInvoiceCatalog(invoiceCatalog);

  const activeDeclaration = useMemo(
    () => declarations.find((d) => d.id === activeId) ?? declarations[0],
    [activeId, declarations]
  );

  const items = activeDeclaration?.items ?? [];
  const previewItems = useDeferredValue(items);
  const totals = useMemo(() => totalsForInvoice(items), [items]);
  const allTotals = useMemo(
    () =>
      declarations.reduce(
        (acc, d) => {
          const t = totalsForInvoice(d.items);
          acc.totalQuantity += t.totalQuantity;
          acc.totalGrossKg += t.totalGrossKg;
          return acc;
        },
        { totalQuantity: 0, totalGrossKg: 0 }
      ),
    [declarations]
  );

  const targetPcs = activeDeclaration?.targetPcs ?? shipment.pcs;
  const targetKg = activeDeclaration?.targetKg ?? shipment.kg;
  const displayFooterKg = useMemo(
    () => roundDeclarationKg(targetKg ?? totals.totalGrossKg),
    [targetKg, totals.totalGrossKg]
  );
  const cartonBadge = matchBadge("Kiện", targetPcs, totals.totalQuantity, " CTNS");
  const grossBadge = grossNetWeightBadge(roundDeclarationKg(targetKg), totals.totalGrossKg);
  const totalsLock = useMemo(
    () => validateDeclarationsLock(declarations, shipment.pcs, shipment.kg),
    [declarations, shipment.kg, shipment.pcs]
  );
  const showShipmentLock = declarations.length > 1 || shipment.pcs != null || shipment.kg != null;

  const exportPayloadPreview = useMemo(
    () =>
      buildInvoiceExportPayload(shipment, customerDirectory, {
        items: previewItems,
        declarationSeq: activeDeclaration?.seq ?? 1,
        totalDeclarations: declarations.length,
        footerPcs: targetPcs,
        footerKg: displayFooterKg,
      }),
    [
      activeDeclaration?.seq,
      customerDirectory,
      declarations.length,
      displayFooterKg,
      previewItems,
      shipment,
      targetPcs,
    ]
  );

  const invoicePreview = exportPayloadPreview.meta.invoiceNo;

  const targetsLock = useMemo(
    () => validateDeclarationTargets(declarations, shipment.pcs, shipment.kg),
    [declarations, shipment.kg, shipment.pcs]
  );
  const flightLine = useMemo(() => formatInvoiceFlightLine(shipment), [shipment]);

  useEffect(() => {
    if (shipment.id !== shipmentIdRef.current) {
      shipmentIdRef.current = shipment.id;
      const next = cloneDeclarations(resolveInvoiceDeclarations(shipment));
      setDeclarations(next);
      setActiveId(next[0]?.id ?? "");
      setSelectedLineIds(new Set());
      setDirty(false);
      return;
    }
    if (dirty) return;
    const next = cloneDeclarations(resolveInvoiceDeclarations(shipment));
    setDeclarations(next);
    setActiveId((cur) => (next.some((d) => d.id === cur) ? cur : next[0]?.id ?? ""));
  }, [dirty, shipment]);

  const markDirty = useCallback(() => setDirty(true), []);

  const activeDeclarationId = activeDeclaration?.id;

  const mutateActiveItems = useCallback(
    (updater: (items: InvoiceLineItem[]) => InvoiceLineItem[]) => {
      if (!activeDeclarationId) return;
      startTransition(() => {
        setDeclarations((prev) => {
          const decl = prev.find((d) => d.id === activeDeclarationId);
          if (!decl) return prev;
          return updateDeclarationItems(prev, activeDeclarationId, updater(decl.items));
        });
        markDirty();
      });
    },
    [activeDeclarationId, markDirty]
  );

  const selectTab = useCallback((id: string) => {
    setActiveId(id);
    setSelectedLineIds(new Set());
  }, []);

  const confirmExportIfMismatch = useCallback((): boolean => {
    const sheetKg = roundDeclarationKg(targetKg);
    if (sheetKg > 0 && totals.totalGrossKg >= sheetKg) {
      const ok = window.confirm(
        `Tổng KG hàng (${totals.totalGrossKg}) phải nhỏ hơn kg tờ (${sheetKg}) vì chưa tính bao bì. Vẫn xuất?`
      );
      if (!ok) return false;
    }
    if (totalsLock.pcsOk && totalsLock.kgOk && targetsLock.pcsOk && targetsLock.kgOk && grossBadge.ok) {
      return true;
    }
    return window.confirm(
      "Tổng kiện/kg chưa khớp mục tiêu hoặc lô hàng. Vẫn xuất invoice?"
    );
  }, [
    grossBadge.ok,
    targetKg,
    targetsLock.kgOk,
    targetsLock.pcsOk,
    totals.totalGrossKg,
    totalsLock.kgOk,
    totalsLock.pcsOk,
  ]);

  const addBlank = useCallback(() => {
    mutateActiveItems((rows) => [...rows, emptyInvoiceLineItem()]);
  }, [mutateActiveItems]);

  const insertAfter = useCallback(
    (afterLineId: string) => {
      mutateActiveItems((rows) => {
        const idx = rows.findIndex((it) => it.lineId === afterLineId);
        const next = [...rows];
        if (idx < 0) next.push(emptyInvoiceLineItem());
        else next.splice(idx + 1, 0, emptyInvoiceLineItem());
        return next;
      });
    },
    [mutateActiveItems]
  );

  const handleRandomPick = useCallback(() => {
    if (catalogItems.length === 0) {
      window.alert("Danh mục hàng trống — thêm mặt hàng trong «Sửa danh mục» trước.");
      return;
    }
    const maxPick = countUniqueCatalogCategories(catalogItems);
    const raw = window.prompt(
      `Chọn ngẫu nhiên bao nhiêu loại/mặt hàng? (1–${maxPick}, mỗi loại tối đa 1 dòng)`,
      String(Math.min(6, maxPick))
    );
    if (raw == null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > maxPick) {
      window.alert(`Nhập số từ 1 đến ${maxPick} (số loại hàng trong danh mục).`);
      return;
    }
    const picked = randomInvoiceLinesFromCatalog(catalogItems, n);
    const { targetKg: sheetKg } = resolveSheetBalanceTargets(activeDeclaration, shipment);
    const result =
      sheetKg > 0
        ? balanceDeclarationLineItems(picked, catalogItems, {
            targetKg: sheetKg,
          })
        : { ok: true as const, items: picked, message: "Đã thêm hàng — nhập kg tờ rồi bấm Cân SL/KG." };
    if (result.ok) {
      setBalanceNotice(result.message);
      mutateActiveItems((rows) => (rows.length === 0 ? result.items : [...rows, ...result.items]));
    } else {
      setBalanceNotice(result.message);
      mutateActiveItems((rows) => (rows.length === 0 ? picked : [...rows, ...picked]));
    }
  }, [activeDeclaration, catalogItems, mutateActiveItems, shipment]);

  const handleBalanceQuantities = useCallback(() => {
    if (!activeDeclarationId || !activeDeclaration) {
      setBalanceNotice("Không xác định được tờ khai đang mở.");
      return;
    }
    if (items.length === 0) {
      setBalanceNotice("Thêm ít nhất một dòng hàng trước.");
      return;
    }

    let { targetKg: sheetKg } = resolveSheetBalanceTargets(activeDeclaration, shipment);

    if (sheetKg <= 0) {
      const raw = window.prompt(
        "Nhập kg tờ khai để cân số lượng (vd. 100):",
        shipment.kg != null ? String(shipment.kg) : "100"
      );
      if (raw == null) return;
      sheetKg = roundDeclarationKg(Number(raw));
      if (sheetKg <= 0) {
        setBalanceNotice("Kg tờ không hợp lệ.");
        return;
      }
      setDeclarations((prev) =>
        updateDeclarationTargets(prev, activeDeclarationId, { targetKg: sheetKg })
      );
    }

    const result = balanceDeclarationLineItems(items, catalogItems, {
      targetKg: sheetKg,
    });

    setBalanceNotice(result.message);
    if (!result.ok) return;

    setDeclarations((prev) =>
      updateDeclarationItems(prev, activeDeclarationId, result.items)
    );
    markDirty();
  }, [
    activeDeclaration,
    activeDeclarationId,
    catalogItems,
    items,
    markDirty,
    shipment,
  ]);

  const updateItem = useCallback(
    (lineId: string, patch: Partial<InvoiceLineItem>) => {
      if (!activeDeclarationId) return;
      startTransition(() => {
        setDeclarations((prev) =>
          prev.map((d) =>
            d.id !== activeDeclarationId
              ? d
              : {
                  ...d,
                  items: d.items.map((it) => (it.lineId === lineId ? { ...it, ...patch } : it)),
                }
          )
        );
        markDirty();
      });
    },
    [activeDeclarationId, markDirty]
  );

  const removeItem = useCallback(
    (lineId: string) => {
      mutateActiveItems((rows) => rows.filter((it) => it.lineId !== lineId));
    },
    [mutateActiveItems]
  );

  const buildSavePayload = useCallback((): HqInvoiceSavePayload => {
    return {
      invoiceDeclarations: declarations,
      invoiceItems: declarations[0]?.items ?? [],
    };
  }, [declarations]);

  const saveAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const payload = buildSavePayload();
      await onSave(payload);
      setDirty(false);
    } finally {
      setBusy(false);
    }
  }, [buildSavePayload, busy, onSave]);

  const persistIfDirty = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    try {
      await onSave(buildSavePayload());
      setDirty(false);
      return true;
    } catch {
      window.alert("Không lưu được dữ liệu khai báo. Kiểm tra kết nối và thử lại.");
      return false;
    }
  }, [buildSavePayload, dirty, onSave]);

  /**
   * Auto-save: lưu im lặng sau 1.5s ngừng sửa (debounce). Người dùng không cần bấm
   * «Lưu» — dữ liệu khai báo luôn được giữ trên lô. Lỗi thì giữ `dirty` để thử lại
   * ở lần sửa kế hoặc khi đóng trang. Tạm dừng khi đang bận (xuất file / lưu tay).
   */
  const autoSaveRef = useRef<() => void>(() => {});
  autoSaveRef.current = () => {
    if (!dirty || busy) return;
    void (async () => {
      try {
        await onSave(buildSavePayload());
        setDirty(false);
      } catch {
        /* giữ dirty — sẽ lưu lại ở lần sửa kế hoặc khi đóng trang */
      }
    })();
  };
  useEffect(() => {
    if (!dirty || busy) return;
    const t = window.setTimeout(() => autoSaveRef.current(), 1500);
    return () => window.clearTimeout(t);
  }, [dirty, busy, declarations]);

  const exportOpts = useMemo(
    () => ({
      items,
      declarationSeq: activeDeclaration?.seq ?? 1,
      totalDeclarations: declarations.length,
      footerPcs: targetPcs,
      footerKg: displayFooterKg,
    }),
    [activeDeclaration?.seq, declarations.length, displayFooterKg, items, targetPcs]
  );

  const handleExportExcel = useCallback(async () => {
    if (busy) return;
    if (!confirmExportIfMismatch()) return;
    setBusy(true);
    try {
      if (dirty) {
        await onSave(buildSavePayload());
        setDirty(false);
      }
      await downloadShipmentInvoiceExcel(shipment, customerDirectory, exportOpts);
    } finally {
      setBusy(false);
    }
  }, [
    buildSavePayload,
    busy,
    confirmExportIfMismatch,
    customerDirectory,
    dirty,
    exportOpts,
    onSave,
    shipment,
  ]);

  const handleExportPdf = useCallback(async () => {
    if (busy) return;
    if (!confirmExportIfMismatch()) return;
    setBusy(true);
    try {
      if (dirty) {
        await onSave(buildSavePayload());
        setDirty(false);
      }
      await downloadShipmentInvoicePdf(shipment, customerDirectory, exportOpts);
    } finally {
      setBusy(false);
    }
  }, [
    buildSavePayload,
    busy,
    confirmExportIfMismatch,
    customerDirectory,
    dirty,
    exportOpts,
    onSave,
    shipment,
  ]);

  const handleFinish = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await persistIfDirty())) return;
      onClose();
    } finally {
      setBusy(false);
    }
  }, [busy, onClose, persistIfDirty]);

  const requestClose = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await persistIfDirty())) return;
    } finally {
      setBusy(false);
    }
    onClose();
  }, [busy, onClose, persistIfDirty]);

  const toggleLineSelect = useCallback((lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

  const toggleAllLines = useCallback(() => {
    setSelectedLineIds((prev) => {
      if (items.length > 0 && items.every((it) => prev.has(it.lineId))) return new Set();
      return new Set(items.map((it) => it.lineId));
    });
  }, [items]);

  const selectedLineIdList = useMemo(() => Array.from(selectedLineIds), [selectedLineIds]);

  const handleAutoDistribute = useCallback(() => {
    const templates =
      items.length > 0 ? items : declarations.find((d) => d.items.length > 0)?.items ?? [];
    if (templates.length === 0) {
      window.alert("Thêm ít nhất một dòng hàng trước khi chia tự động.");
      return;
    }
    if (declarations.length <= 1) {
      window.alert("Cần ít nhất 2 tờ (dùng «Chia lô» trước).");
      return;
    }
    const ok = window.confirm(
      `Chia ${templates.length} dòng mẫu theo tỷ lệ kiện/kg của ${declarations.length} tờ?`
    );
    if (!ok) return;
    setDeclarations(autoDistributeItemsToDeclarations(templates, declarations));
    setSelectedLineIds(new Set());
    markDirty();
  }, [declarations, items, markDirty]);

  const handleApplyTemplate = useCallback(
    (mode: "zero" | "scale") => {
      const sourceId = declarations[0]?.id;
      if (!sourceId) return;
      const sourceItems = declarations[0]?.items ?? [];
      if (sourceItems.length === 0) {
        window.alert("Tờ 1 chưa có dòng hàng mẫu.");
        return;
      }
      const msg =
        mode === "scale"
          ? "Nhân mẫu tờ 1 và chia số lượng theo target từng tờ?"
          : "Copy cấu trúc tờ 1 sang các tờ khác (số lượng = 0)?";
      if (!window.confirm(msg)) return;
      setDeclarations(applyTemplateStructure(declarations, sourceId, mode));
      setSelectedLineIds(new Set());
      markDirty();
    },
    [declarations, markDirty]
  );

  const handleCopyLines = useCallback(
    (mode: "append" | "replace", toAllOthers: boolean) => {
      if (!activeDeclaration) return;
      const lineIds = selectedLineIdList.length ? selectedLineIdList : items.map((it) => it.lineId);
      if (lineIds.length === 0) {
        window.alert("Chọn dòng hoặc để trống để copy cả tờ.");
        return;
      }
      if (toAllOthers) {
        setDeclarations(
          copyItemsToAllOtherDeclarations(declarations, activeDeclaration.id, lineIds, mode)
        );
      } else {
        const target = copyTargetId || declarations.find((d) => d.id !== activeDeclaration.id)?.id;
        if (!target) {
          window.alert("Chọn tờ đích.");
          return;
        }
        setDeclarations(
          copyItemsToDeclaration(declarations, activeDeclaration.id, target, lineIds, mode)
        );
      }
      setSelectedLineIds(new Set());
      markDirty();
    },
    [activeDeclaration, copyTargetId, declarations, items, markDirty, selectedLineIdList]
  );

  const handleExportAllExcel = useCallback(async () => {
    if (busy) return;
    if (!confirmExportIfMismatch()) return;
    setBusy(true);
    try {
      if (dirty) {
        await onSave(buildSavePayload());
        setDirty(false);
      }
      await downloadAllDeclarationsExcelZip(shipment, customerDirectory, declarations);
    } finally {
      setBusy(false);
    }
  }, [
    buildSavePayload,
    busy,
    confirmExportIfMismatch,
    customerDirectory,
    declarations,
    dirty,
    onSave,
    shipment,
  ]);

  const handleExportAllPdf = useCallback(async () => {
    if (busy) return;
    if (!confirmExportIfMismatch()) return;
    setBusy(true);
    try {
      if (dirty) {
        await onSave(buildSavePayload());
        setDirty(false);
      }
      await downloadAllDeclarationsPdfZip(shipment, customerDirectory, declarations);
    } finally {
      setBusy(false);
    }
  }, [
    buildSavePayload,
    busy,
    confirmExportIfMismatch,
    customerDirectory,
    declarations,
    dirty,
    onSave,
    shipment,
  ]);

  const handleSplit = useCallback(() => {
    const raw = window.prompt(
      `Chia lô ${shipment.pcs ?? "?"} kiện / ${shipment.kg ?? "?"} kg thành bao nhiêu tờ khai? (2–20)`,
      String(Math.min(5, Math.max(2, declarations.length)))
    );
    if (raw == null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 2 || n > 20) {
      window.alert("Nhập số từ 2 đến 20.");
      return;
    }
    const next = splitIntoDeclarations(n, items, shipment.pcs, shipment.kg);
    setDeclarations(next);
    setActiveId(next[0]?.id ?? "");
    setCopyTargetId(next[1]?.id ?? "");
    setSelectedLineIds(new Set());
    markDirty();
  }, [declarations.length, items, markDirty, shipment.kg, shipment.pcs]);

  const handleAddDeclaration = useCallback(() => {
    const next = addDeclaration(declarations);
    setDeclarations(next);
    setActiveId(next[next.length - 1]?.id ?? activeId);
    markDirty();
  }, [activeId, declarations, markDirty]);

  const handleRemoveDeclaration = useCallback(() => {
    if (!activeDeclaration || declarations.length <= 1) return;
    if (!window.confirm(`Xóa ${activeDeclaration.label}?`)) return;
    const next = removeDeclaration(declarations, activeDeclaration.id);
    setDeclarations(next);
    setActiveId(next[0]?.id ?? "");
    markDirty();
  }, [activeDeclaration, declarations, markDirty]);

  const handleTargetPcsChange = useCallback(
    (raw: string) => {
      if (!activeDeclaration) return;
      const n = raw.trim() === "" ? null : Number(raw);
      if (raw.trim() !== "" && (!Number.isFinite(n) || n! < 0)) return;
      setDeclarations((prev) =>
        updateDeclarationTargets(prev, activeDeclaration.id, { targetPcs: n })
      );
      markDirty();
    },
    [activeDeclaration, markDirty]
  );

  const handleTargetKgChange = useCallback(
    (raw: string) => {
      if (!activeDeclaration) return;
      const n = raw.trim() === "" ? null : Number(raw);
      if (raw.trim() !== "" && (!Number.isFinite(n) || n! < 0)) return;
      setDeclarations((prev) =>
        updateDeclarationTargets(prev, activeDeclaration.id, { targetKg: n })
      );
      markDirty();
    },
    [activeDeclaration, markDirty]
  );

  const handleRedistributeTargets = useCallback(() => {
    setDeclarations(redistributeTargetsEvenly(declarations, shipment.pcs, shipment.kg));
    markDirty();
  }, [declarations, markDirty, shipment.kg, shipment.pcs]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveAll();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        addBlank();
        return;
      }
      if (e.key === "Escape" && !catalogEditorOpen) {
        e.preventDefault();
        void requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addBlank, catalogEditorOpen, requestClose, saveAll]);

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
                Invoice No: <strong className="font-mono text-indigo-800 dark:text-indigo-200">{invoicePreview}</strong>
                {" · "}
                {flightLine || "—"} · {shipment.dest || "—"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:text-[11px]">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold tabular-nums ${
                    cartonBadge.ok
                      ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
                      : "bg-amber-500/12 text-amber-900 dark:text-amber-100"
                  }`}
                >
                  Kiện {totals.totalQuantity}
                  {targetPcs != null && targetPcs > 0 ? ` / ${targetPcs}` : ""} CTNS
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold tabular-nums ${
                    grossBadge.ok
                      ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
                      : "bg-amber-500/12 text-amber-900 dark:text-amber-100"
                  }`}
                >
                  Kg hàng {formatDeclarationKg(totals.totalGrossKg)}
                  {targetKg != null && targetKg > 0 ? ` / ${formatDeclarationKg(targetKg)} tờ` : ""}
                </span>
                {showShipmentLock ? (
                  <>
                    <span className="hidden h-3 w-px bg-black/15 dark:bg-white/15 sm:inline" />
                    <span
                      className={`rounded-md px-2 py-0.5 font-semibold tabular-nums ${
                        totalsLock.pcsOk
                          ? "text-emerald-800 dark:text-emerald-200"
                          : "text-red-700 dark:text-red-300"
                      }`}
                    >
                      Σ kiện {totalsLock.actualPcs}
                      {totalsLock.shipmentPcs != null ? `/${totalsLock.shipmentPcs}` : ""}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 font-semibold tabular-nums ${
                        totalsLock.kgOk
                          ? "text-emerald-800 dark:text-emerald-200"
                          : "text-red-700 dark:text-red-300"
                      }`}
                    >
                      Σ kg {formatDeclarationKg(totalsLock.actualKg)}
                      {totalsLock.shipmentKg != null ? `/${totalsLock.shipmentKg}` : ""}
                    </span>
                  </>
                ) : null}
                <span className={`rounded-md px-2 py-0.5 tabular-nums ${OPS.muted}`}>
                  {declarations.length > 1
                    ? `${declarations.length} tờ · ${allTotals.totalQuantity} CTNS · ${formatDeclarationKg(allTotals.totalGrossKg)} kg`
                    : `Lô ${shipment.pcs ?? "—"} CTNS · ${shipment.kg ?? "—"} kg`}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.04] dark:border-white/10 dark:hover:bg-white/[0.06]"
          >
            ← Quay lại
          </button>
        </div>

        <HqWorkspaceToolbar
          declarations={declarations}
          activeId={activeId}
          activeDeclaration={activeDeclaration}
          shipmentPcs={shipment.pcs}
          shipmentKg={shipment.kg}
          targetsLock={targetsLock}
          busy={busy}
          dirty={dirty}
          multiDecl={declarations.length > 1}
          showTargets={
            declarations.length > 1 || shipment.pcs != null || shipment.kg != null
          }
          onSelectTab={selectTab}
          onTargetPcsChange={handleTargetPcsChange}
          onTargetKgChange={handleTargetKgChange}
          onRedistributeTargets={handleRedistributeTargets}
          onAddBlank={addBlank}
          onRandomPick={handleRandomPick}
          onBalanceQuantities={handleBalanceQuantities}
          balanceNotice={balanceNotice}
          onOpenCatalog={() => {
            setCatalogEditorKey((k) => k + 1);
            setCatalogEditorOpen(true);
          }}
          onSave={() => void saveAll()}
          onExportExcel={() => void handleExportExcel()}
          onExportPdf={() => void handleExportPdf()}
          onExportAllExcel={
            declarations.length > 1 ? () => void handleExportAllExcel() : undefined
          }
          onExportAllPdf={
            declarations.length > 1 ? () => void handleExportAllPdf() : undefined
          }
          onFinish={() => void handleFinish()}
          onSplit={handleSplit}
          onAddDeclaration={handleAddDeclaration}
          onAutoDistribute={handleAutoDistribute}
          onApplyTemplate={handleApplyTemplate}
          onCopyLines={handleCopyLines}
          onRemoveDeclaration={handleRemoveDeclaration}
          copyTargetId={copyTargetId}
          onCopyTargetChange={setCopyTargetId}
        />
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-[1.05] flex-col overflow-hidden border-r border-black/10 dark:border-white/10">
          {catalogEditorOpen ? (
            catalogLoading ? (
              <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-xs text-apple-tertiary dark:text-slate-400">
                Đang tải danh mục hàng…
              </div>
            ) : (
              <InvoiceCatalogEditor
                key={catalogEditorKey}
                catalog={invoiceCatalog ?? { version: 1, items: [] }}
                staticFallbackItems={staticItems}
                onSave={onSaveCatalog}
                onClose={() => setCatalogEditorOpen(false)}
              />
            )
          ) : (
            <InvoiceLineGrid
              items={items}
              stateCatalog={invoiceCatalog}
              selectedLineIds={selectedLineIds}
              onToggleLineSelect={toggleLineSelect}
              onToggleAllLines={toggleAllLines}
              onPatch={updateItem}
              onRemove={removeItem}
              onAddBlank={addBlank}
              onInsertAfter={insertAfter}
            />
          )}
        </div>

        <aside
          className="flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-black/10 dark:border-white/10"
          style={{ width: `calc(${A4_WIDTH_MM}mm + 2.5rem)`, minWidth: `calc(${A4_WIDTH_MM}mm + 2.5rem)` }}
        >
          <InvoiceExportPreview exportPayload={exportPayloadPreview} />
        </aside>
      </div>

      <footer className={`shrink-0 border-t px-4 py-1.5 sm:px-5 ${OPS.footer}`}>
        <p className={`text-[11px] ${OPS.muted}`}>
          Tờ hiện tại: {totals.totalAmountUsd.toFixed(2)} USD · hàng {formatDeclarationKg(totals.totalGrossKg)} kg
          {targetKg != null && targetKg > 0
            ? ` / tờ ${formatDeclarationKg(targetKg)} kg (chênh ≈ bao bì)`
            : ""}
          {dirty ? (
            <span className="ml-1 font-semibold text-amber-700 dark:text-amber-300"> · Tự động lưu…</span>
          ) : (
            <span className="ml-1 font-semibold text-emerald-700 dark:text-emerald-300"> · Đã lưu</span>
          )}
        </p>
      </footer>
    </div>
  );
}
