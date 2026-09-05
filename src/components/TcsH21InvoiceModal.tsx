import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { TcsH21CatalogItem, TcsH21InvoiceDeclaration, TcsH21InvoiceLine, TcsH21StampId } from "../types/tcsH21Catalog";
import type { Shipment } from "../types/shipment";
import { isTcsH21Warehouse } from "../types/tcsH21Catalog";
import {
  fetchTcsH21Goods,
} from "../utils/tcsH21Api";
import {
  clampTcsH21InvoiceLines,
  invoiceLineFromCatalogItem,
  resolveH21UnitFactorKg,
} from "../../shared/tcsH21CatalogNormalize.mjs";
import {
  computeH21InvoiceFooter,
  generateRandomH21InvoiceLines,
} from "../../shared/scscH21InvoiceCore.mjs";
import {
  buildH21InvoiceForShipment,
  validateH21InvoiceForShipment,
} from "../utils/scscH21InvoiceResolve";
import {
  downloadTcsH21InvoiceExcel,
  printTcsH21InvoicePdf,
} from "../utils/exportTcsH21Invoice";
import { buildH21InvoiceNo } from "../../shared/scscH21InvoiceCore.mjs";
import { findCustomerEntry } from "../utils/customerBookingResolve";
import {
  labelForH21CargoFamily,
  resolveH21CargoFamilyForShipment,
  resolveShipmentGoodsTextForH21,
} from "../utils/scscH21InvoiceCargoFamily";
import type { H21CargoFamilyId } from "../utils/scscH21InvoiceCargoFamily";
import { countCatalogInH21Family, filterCatalogByH21Family } from "../../shared/scscH21InvoiceGroups.mjs";
import {
  createDeclSplit,
  declarationsReadyToSave,
  fingerprintH21Splits,
  hydrateSplitsFromShipment,
  normalizeLineCountDraft,
  parseAllocateKgFromDraft,
  parseLineCountFromDraft,
  roundH21Kg,
  sumAllocatedKg,
  type H21CargoFamilyMode,
  type H21DeclSplit,
} from "../utils/scscH21InvoiceSplits";
import { importH21GoodsListToInvoiceLines } from "../utils/scscH21GoodsListImport";
import { useOpsMobileOverlayLock } from "../hooks/useOpsMobileOverlayLock";
import { formatH21InvoiceCneeDisplay } from "../utils/h21InvoiceCneeFormat";
import { H21CargoFamilyKanban } from "./H21CargoFamilyKanban";
import { H21InvoiceLinesEditor } from "./H21InvoiceLinesEditor";
import { TcsH21InvoiceDeclTabs } from "./TcsH21InvoiceDeclTabs";
import { TcsH21InvoiceReview } from "./TcsH21InvoiceReview";
import { OPS } from "../styles/opsModalStyles";
import { Button, ConfirmDialog, SplitPane, useToast } from "../ui";

export type TcsH21InvoiceSavePayload = {
  invoiceItems: TcsH21InvoiceLine[];
  invoiceDeclarations: TcsH21InvoiceDeclaration[];
  h21DeclarationShipperId: string;
};

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  stamps: readonly TcsH21StampId[];
  onSave: (payload: TcsH21InvoiceSavePayload) => void | Promise<void>;
  onClose: () => void;
};

type MobilePane = "setup" | "review";
type CargoFamilyMode = H21CargoFamilyMode;

/** Full-screen invoice H21 — chọn shipper tờ khai + review + chỉnh dòng hàng. */
export function TcsH21InvoiceModal({
  shipment,
  customerDirectory,
  stamps,
  onSave,
  onClose,
}: Props) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<TcsH21CatalogItem[]>([]);
  const [shipperId, setShipperId] = useState(shipment.h21DeclarationShipperId?.trim() ?? "");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [splits, setSplits] = useState<H21DeclSplit[]>(() => hydrateSplitsFromShipment(shipment));
  const [activeSplitId, setActiveSplitId] = useState(() => splits[0]?.id ?? "");
  const [mobilePane, setMobilePane] = useState<MobilePane>("setup");
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    fingerprintH21Splits(
      hydrateSplitsFromShipment(shipment),
      shipment.h21DeclarationShipperId?.trim() ?? ""
    )
  );
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [removeSplitId, setRemoveSplitId] = useState<string | null>(null);
  const [importingList, setImportingList] = useState(false);
  const [pendingGoodsListFile, setPendingGoodsListFile] = useState<File | null>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const goodsListFileRef = useRef<HTMLInputElement>(null);

  const lotKg = shipment.kg ?? 0;
  const lotPcs = shipment.pcs ?? 0;

  const activeSplit = useMemo(
    () => splits.find((s) => s.id === activeSplitId) ?? splits[0],
    [splits, activeSplitId]
  );
  const lineCountDraft = activeSplit?.lineCountDraft ?? "15";
  const allocateKgDraft = activeSplit?.kgDraft ?? "";
  const cargoFamilyMode = activeSplit?.cargoFamilyMode ?? "auto";
  const lines = activeSplit?.lines ?? [];
  const invoiceSeq = Math.max(1, splits.findIndex((s) => s.id === activeSplit?.id) + 1);
  const invoiceSeqTotal = splits.length;

  const patchActiveSplit = (patch: Partial<H21DeclSplit>) => {
    const id = activeSplit?.id;
    if (!id) return;
    setSplits((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const setLineCountDraft = (v: string | ((prev: string) => string)) => {
    const next = typeof v === "function" ? v(lineCountDraft) : v;
    patchActiveSplit({ lineCountDraft: next });
  };
  const setCargoFamilyMode = (v: CargoFamilyMode) => patchActiveSplit({ cargoFamilyMode: v });
  const setLines = (
    v: TcsH21InvoiceLine[] | ((prev: TcsH21InvoiceLine[]) => TcsH21InvoiceLine[])
  ) => {
    const next = typeof v === "function" ? v(lines) : v;
    patchActiveSplit({ lines: next });
  };

  const lineCount = useMemo(
    () => parseLineCountFromDraft(lineCountDraft),
    [lineCountDraft]
  );
  const allocateKg = useMemo(
    () => parseAllocateKgFromDraft(allocateKgDraft, lotKg),
    [allocateKgDraft, lotKg]
  );

  const allocatedKgSum = useMemo(() => sumAllocatedKg(splits, lotKg), [splits, lotKg]);
  const remainLotKg = lotKg > 0 ? roundH21Kg(lotKg - allocatedKgSum) : 0;
  const filledSplitCount = useMemo(
    () => splits.filter((s) => s.lines.length > 0).length,
    [splits]
  );
  const isDirty = useMemo(
    () => fingerprintH21Splits(splits, shipperId) !== savedFingerprint,
    [splits, shipperId, savedFingerprint]
  );

  useOpsMobileOverlayLock(true);

  useEffect(() => {
    const next = hydrateSplitsFromShipment(shipment);
    const sid = shipment.h21DeclarationShipperId?.trim() ?? "";
    setSplits(next);
    setActiveSplitId(next[0]?.id ?? "");
    setShipperId(sid);
    setSavedFingerprint(fingerprintH21Splits(next, sid));
  }, [shipment.id]);

  useEffect(() => {
    setShipperId(shipment.h21DeclarationShipperId?.trim() ?? "");
  }, [shipment.h21DeclarationShipperId]);

  useEffect(() => {
    const el = tabsScrollRef.current?.querySelector<HTMLElement>(
      `[data-split-id="${activeSplitId}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activeSplitId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (closeConfirmOpen || removeSplitId) return;
        e.preventDefault();
        if (isDirty) setCloseConfirmOpen(true);
        else onClose();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const n = Number(e.key);
        if (n >= 1 && n <= 9 && n <= splits.length) {
          e.preventDefault();
          setActiveSplitId(splits[n - 1]!.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeConfirmOpen, removeSplitId, isDirty, onClose, splits]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (!isTcsH21Warehouse(shipment.warehouse)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const items = await fetchTcsH21Goods({ activeOnly: true });
        if (cancelled) return;
        setCatalog(items);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không tải catalog");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shipment.id, shipment.warehouse, toast]);

  const activeStamps = useMemo(
    () => stamps.filter((s) => s.active !== false),
    [stamps]
  );

  const customerEntry = useMemo(
    () => findCustomerEntry(shipment, customerDirectory),
    [shipment, customerDirectory]
  );

  const invoiceNo = useMemo(
    () =>
      buildH21InvoiceNo(shipment, customerEntry, {
        seq: invoiceSeq,
        total: invoiceSeqTotal,
      }),
    [shipment, customerEntry, invoiceSeq, invoiceSeqTotal]
  );

  const goodsTextForFamily = useMemo(
    () => resolveShipmentGoodsTextForH21(shipment, customerDirectory),
    [shipment, customerDirectory]
  );

  const detectedCargoFamily = useMemo(
    () => resolveH21CargoFamilyForShipment(shipment, customerDirectory),
    [shipment, customerDirectory]
  );

  const effectiveCargoFamily = useMemo(
    (): H21CargoFamilyId =>
      cargoFamilyMode === "auto" ? detectedCargoFamily : cargoFamilyMode,
    [cargoFamilyMode, detectedCargoFamily]
  );

  useEffect(() => {
    setCategoryFilter("");
  }, [effectiveCargoFamily]);

  const cargoFamilyCounts = useMemo(() => {
    const ids: H21CargoFamilyId[] = ["frozen", "fruit", "food", "garment", "general"];
    const counts: Partial<Record<H21CargoFamilyId, number>> = {};
    for (const id of ids) counts[id] = countCatalogInH21Family(catalog, id);
    return counts;
  }, [catalog]);

  const footer = useMemo(
    () => computeH21InvoiceFooter(shipment, lines, { declarationKg: allocateKg }),
    [shipment, lines, allocateKg]
  );

  const invoiceDoc = useMemo(
    () =>
      buildH21InvoiceForShipment({
        shipment,
        directory: customerDirectory,
        stamps,
        lines,
        shipperId,
        declarationKg: allocateKg,
        invoiceSeq,
        invoiceSeqTotal,
      }),
    [shipment, customerDirectory, stamps, lines, shipperId, allocateKg, invoiceSeq, invoiceSeqTotal]
  );

  const cneeDisplay = useMemo(
    () => formatH21InvoiceCneeDisplay(invoiceDoc.cnee),
    [invoiceDoc.cnee]
  );

  const validationErrors = useMemo(
    () =>
      validateH21InvoiceForShipment({
        shipment,
        directory: customerDirectory,
        stamps,
        lines,
        shipperId,
      }),
    [shipment, customerDirectory, stamps, lines, shipperId]
  );

  const familyCatalog = useMemo(() => {
    if (effectiveCargoFamily === "general") return catalog;
    return filterCatalogByH21Family(catalog, effectiveCargoFamily, 1) as TcsH21CatalogItem[];
  }, [catalog, effectiveCargoFamily]);

  const categories = useMemo(() => {
    const s = new Set(familyCatalog.map((c) => c.category).filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, "vi"));
  }, [familyCatalog]);

  const filteredCatalog = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return familyCatalog.filter((c) => {
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (!needle) return true;
      return (
        c.description.toLowerCase().includes(needle) ||
        c.category.toLowerCase().includes(needle) ||
        c.hsCode.includes(needle)
      );
    });
  }, [familyCatalog, q, categoryFilter]);

  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  const handleExport = useCallback(
    async (kind: "excel" | "pdf") => {
      if (validationErrors.length) {
        toast.error(validationErrors[0] ?? "Chưa đủ dữ liệu xuất invoice");
        return;
      }
      setExporting(true);
      try {
        if (kind === "excel") {
          await downloadTcsH21InvoiceExcel(invoiceDoc, shipment.awb);
          toast.success("Đã tải file Excel invoice");
        } else {
          const ok = printTcsH21InvoicePdf(invoiceDoc);
          if (ok) toast.success("Mở hộp thoại in — chọn Lưu PDF");
          else toast.error("Không mở được in PDF");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xuất invoice thất bại");
      } finally {
        setExporting(false);
      }
    },
    [validationErrors, invoiceDoc, shipment.awb, toast]
  );

  if (!isTcsH21Warehouse(shipment.warehouse)) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
        <div className="max-w-md rounded-2xl bg-ui-surface p-5 shadow-lg">
          <h2 className="text-base font-bold">Invoice H21 chỉ cho kho TCS</h2>
          <p className="mt-2 text-sm text-ui-text-muted">
            Lô này đang ở kho {shipment.warehouse}. Đổi kho sang TCS để dùng catalog H21.
          </p>
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const addFromCatalog = (item: TcsH21CatalogItem) => {
    const line = invoiceLineFromCatalogItem(item);
    if (!line) return;
    setLines((prev) => [...prev, line as TcsH21InvoiceLine]);
  };

  const patchLine = (id: string, patch: Partial<TcsH21InvoiceLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        const cat = next.catalogItemId ? catalogById.get(next.catalogItemId) : undefined;
        const factor = resolveH21UnitFactorKg({
          description: next.description,
          unitFactor: cat?.unitFactor ?? 0,
          qty1: next.quantity,
          qty2: next.weightKg,
        });
        if (patch.quantity != null && factor > 0 && patch.weightKg == null) {
          next.weightKg = Math.round((next.quantity || 0) * factor * 1000) / 1000;
        }
        if (patch.weightKg != null && patch.quantity == null && factor > 0) {
          next.quantity = Math.max(1, Math.round((next.weightKg || 0) / factor));
        }
        if (patch.amount != null) {
          next.amount = patch.amount;
        } else if (
          patch.quantity != null ||
          patch.unitPrice != null ||
          patch.weightKg != null
        ) {
          next.amount =
            Math.round((next.quantity || 0) * (next.unitPrice || 0) * 10000) / 10000;
        }
        return next;
      })
    );
  };

  const handleRandomGenerate = () => {
    const kg = allocateKg;
    if (kg == null || kg <= 0) {
      toast.error("Nhập KG tờ khai (> 0) trước khi tạo ngẫu nhiên");
      return;
    }
    const othersKg = roundH21Kg(
      splits
        .filter((s) => s.id !== activeSplit?.id)
        .reduce((sum, s) => sum + parseAllocateKgFromDraft(s.kgDraft, lotKg), 0)
    );
    if (lotKg > 0 && roundH21Kg(othersKg + kg) > lotKg) {
      toast.error(`Tổng KG các tờ khai không được vượt KG lô (${lotKg})`);
      return;
    }
    try {
      const generated = generateRandomH21InvoiceLines({
        catalog,
        lineCount,
        grossKg: kg,
        cargoFamily: effectiveCargoFamily,
      }) as TcsH21InvoiceLine[];
      setLines(generated);
      setLineCountDraft(String(generated.length));
      toast.success(
        `Đã tạo ${generated.length} dòng · ${invoiceNo || "INV"} · ${labelForH21CargoFamily(effectiveCargoFamily)} · ${kg} kg`
      );
      setMobilePane("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tạo ngẫu nhiên thất bại");
    }
  };

  const runGoodsListImport = async (file: File) => {
    const kg = allocateKg;
    if (kg == null || kg <= 0) {
      toast.error("Nhập KG tờ khai (> 0) trước khi upload list hàng");
      return;
    }
    if (!catalog.length) {
      toast.error("Catalog H21 chưa tải xong — thử lại sau");
      return;
    }
    setImportingList(true);
    try {
      const buf = await file.arrayBuffer();
      const result = await importH21GoodsListToInvoiceLines({
        buf,
        fileName: file.name,
        catalog,
        grossKg: kg,
        cargoFamily: effectiveCargoFamily,
      });
      setLines(result.lines);
      setLineCountDraft(String(result.lines.length));
      const miss = result.unmatched.length;
      toast.success(
        miss > 0
          ? `Khớp ${result.matches.length}/${result.queries.length} mặt hàng → ${result.lines.length} dòng · bỏ ${miss} không khớp`
          : `Khớp ${result.matches.length} mặt hàng → ${result.lines.length} dòng invoice`
      );
      setMobilePane("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload list hàng thất bại");
    } finally {
      setImportingList(false);
      if (goodsListFileRef.current) goodsListFileRef.current.value = "";
    }
  };

  const handleGoodsListFile = (file: File | null) => {
    if (!file) return;
    if (allocateKg <= 0) {
      toast.error("Nhập KG tờ khai (> 0) trước khi upload list hàng");
      if (goodsListFileRef.current) goodsListFileRef.current.value = "";
      return;
    }
    if (lines.length > 0) {
      setPendingGoodsListFile(file);
      return;
    }
    void runGoodsListImport(file);
  };

  const handleAddSplit = () => {
    const remain = remainLotKg;
    if (lotKg > 0 && remain <= 0) {
      toast.error("Hạ KG tờ khai hiện tại trước khi thêm tờ khai tiếp theo");
      return;
    }
    const next = createDeclSplit(remain > 0 ? String(remain) : "");
    setSplits((prev) => [...prev, next]);
    setActiveSplitId(next.id);
  };

  const handleRemoveSplit = (id: string) => {
    if (splits.length <= 1) return;
    const target = splits.find((s) => s.id === id);
    if (target && target.lines.length > 0) {
      setRemoveSplitId(id);
      return;
    }
    const next = splits.filter((s) => s.id !== id);
    setSplits(next);
    if (activeSplitId === id) setActiveSplitId(next[0]?.id ?? "");
  };

  const confirmRemoveSplit = () => {
    const id = removeSplitId;
    setRemoveSplitId(null);
    if (!id || splits.length <= 1) return;
    const next = splits.filter((s) => s.id !== id);
    setSplits(next);
    if (activeSplitId === id) setActiveSplitId(next[0]?.id ?? "");
  };

  const requestClose = () => {
    if (isDirty) setCloseConfirmOpen(true);
    else onClose();
  };

  const handleSave = async () => {
    if (!shipperId) {
      toast.error("Chọn shipper tờ khai trước khi lưu");
      return;
    }
    if (filledSplitCount === 0) {
      toast.error("Chưa có dòng hàng trên tờ khai nào — tạo ngẫu nhiên hoặc thêm từ catalog");
      return;
    }
    setSaving(true);
    try {
      const { declarations, skippedEmpty } = declarationsReadyToSave(splits, lotKg);
      if (!declarations.length) {
        toast.error("Chưa có tờ khai hợp lệ để lưu");
        setSaving(false);
        return;
      }
      const activeLines =
        (declarations.find((d) => d.id === activeSplit?.id)?.lines as
          | TcsH21InvoiceLine[]
          | undefined) ?? declarations[0]!.lines;
      await onSave({
        invoiceItems: clampTcsH21InvoiceLines(activeLines) as TcsH21InvoiceLine[],
        invoiceDeclarations: declarations,
        h21DeclarationShipperId: shipperId,
      });
      setSavedFingerprint(fingerprintH21Splits(splits, shipperId));
      toast.success(
        skippedEmpty > 0
          ? `Đã lưu ${declarations.length} tờ khai · bỏ qua ${skippedEmpty} tab trống · cửa sổ vẫn mở`
          : `Đã lưu ${declarations.length} tờ khai · cửa sổ vẫn mở để chỉnh tiếp`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu invoice thất bại");
    } finally {
      setSaving(false);
    }
  };

  const setupPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Shipper tờ khai */}
      <section className="shrink-0 border-b border-ui-border/80 bg-ui-surface px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-ui-navy">
            Shipper tờ khai
          </h3>
          {!shipperId ? (
            <span className="text-[10px] font-semibold text-amber-700">Bắt buộc chọn</span>
          ) : null}
        </div>
        {activeStamps.length === 0 ? (
          <p className="text-xs text-ui-text-muted">
            Chưa có shipper — thêm tại trang H21 (menu trái).
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {activeStamps.map((s) => {
              const selected = s.id === shipperId;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    selected
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-400/60"
                      : "border-ui-border/80 bg-ui-surface hover:border-indigo-300 hover:bg-indigo-50/40"
                  }`}
                  onClick={() => setShipperId(s.id)}
                >
                  <div className="line-clamp-2 text-xs font-bold text-ui-navy">{s.shipperName}</div>
                  {s.shipperAddress ? (
                    <div className="mt-0.5 line-clamp-2 text-[10px] text-ui-text-muted">
                      {s.shipperAddress}
                    </div>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-ui-text-muted">
                    {s.shipperPhone ? <span>{s.shipperPhone}</span> : null}
                    {s.stampId ? (
                      <span className="font-mono font-semibold text-indigo-700">{s.stampId}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* CNEE + meta */}
      <section className="grid shrink-0 gap-2 border-b border-ui-border/60 bg-ui-surface-muted/30 px-4 py-2 text-xs sm:grid-cols-2">
        <div>
          <div className="font-bold text-ui-text-muted">CNEE (INFO KH)</div>
          <div className="font-semibold">{cneeDisplay.nameLine || "— Chưa chọn CNEE"}</div>
          {cneeDisplay.addressLines.map((line) => (
            <div key={line} className="text-ui-text-muted">
              {line}
            </div>
          ))}
          {cneeDisplay.phoneLine ? (
            <div className="text-ui-text-muted">{cneeDisplay.phoneLine}</div>
          ) : null}
          {cneeDisplay.emailLine ? (
            <div className="text-ui-text-muted">{cneeDisplay.emailLine}</div>
          ) : null}
        </div>
        <div className="sm:text-right">
          <div>
            <span className="font-bold text-ui-text-muted">INV NO: </span>
            {invoiceNo || "—"}
            {invoiceSeqTotal > 1 ? (
              <span className="ml-1 text-indigo-700">
                ({invoiceSeq}/{invoiceSeqTotal})
              </span>
            ) : null}
          </div>
          <div>
            <span className="font-bold text-ui-text-muted">KG lô: </span>
            {lotKg || "—"} · Kiện: {lotPcs || "—"}
            {lotKg > 0 && allocatedKgSum > 0 && allocatedKgSum < lotKg ? (
              <span className="ml-1 text-indigo-700">
                (đã tách {allocatedKgSum}/{lotKg} kg)
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* Tabs tờ khai — chuyển nhanh, lưu không đóng */}
      <TcsH21InvoiceDeclTabs
        shipment={shipment}
        customerEntry={customerEntry}
        splits={splits}
        activeSplitId={activeSplit?.id}
        tabsScrollRef={tabsScrollRef}
        goodsListFileRef={goodsListFileRef}
        isDirty={isDirty}
        filledSplitCount={filledSplitCount}
        invoiceSeq={invoiceSeq}
        invoiceSeqTotal={invoiceSeqTotal}
        lotKg={lotKg}
        lotPcs={lotPcs}
        remainLotKg={remainLotKg}
        allocateKgDraft={allocateKgDraft}
        lineCountDraft={lineCountDraft}
        linesLength={lines.length}
        footer={footer}
        effectiveCargoFamily={effectiveCargoFamily}
        importingList={importingList}
        loading={loading}
        onSelectSplit={setActiveSplitId}
        onRemoveSplit={handleRemoveSplit}
        onAddSplit={handleAddSplit}
        onAllocateKgChange={(v) => {
          const id = activeSplit?.id;
          if (!id) return;
          setSplits((prev) => prev.map((x) => (x.id === id ? { ...x, kgDraft: v } : x)));
        }}
        onAllocateKgBlur={() => {
          const id = activeSplit?.id;
          if (!id) return;
          const n = parseAllocateKgFromDraft(allocateKgDraft, lotKg);
          if (n > 0) {
            setSplits((prev) =>
              prev.map((x) => (x.id === id ? { ...x, kgDraft: String(n) } : x))
            );
          }
        }}
        onLineCountChange={(v) => setLineCountDraft(v)}
        onLineCountBlur={() => setLineCountDraft(normalizeLineCountDraft(lineCountDraft))}
        onRandomGenerate={handleRandomGenerate}
        onGoodsListFile={(file) => void handleGoodsListFile(file)}
        onUploadListClick={() => goodsListFileRef.current?.click()}
      />

      <div className="shrink-0 border-b border-ui-border/60 px-4 py-2">
        <H21CargoFamilyKanban
          value={cargoFamilyMode}
          onChange={setCargoFamilyMode}
          detectedFamily={detectedCargoFamily}
          goodsText={goodsTextForFamily}
          counts={cargoFamilyCounts}
        />
      </div>

      {validationErrors.length > 0 ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900">
          {validationErrors.join(" · ")}
        </div>
      ) : null}

      {/* Catalog + lines */}
      <SplitPane
        surfaceId="h21_invoice_catalog_lines"
        breakpoint="md"
        defaultPrimary={46}
        minPrimary={28}
        maxPrimary={65}
        minSecondaryPx={260}
        className="min-h-0 flex-1 overflow-hidden"
        primaryClassName="border-b border-ui-border/60 md:border-b-0"
        secondaryClassName=""
        primary={
          <aside className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap gap-2 border-b border-black/[0.06] p-2">
              <input
                className={`${OPS.input} min-w-[100px] flex-1 text-xs`}
                placeholder="Tìm catalog…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select
                className={`${OPS.input} text-xs`}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">Tất cả</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? (
                <p className="p-2 text-xs text-ui-text-muted">Đang tải catalog…</p>
              ) : (
                filteredCatalog.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={OPS.pickItem}
                    onClick={() => addFromCatalog(item)}
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <div className="text-[10px] font-bold text-indigo-700">{item.category}</div>
                      <div className="line-clamp-2 text-xs font-medium">{item.description}</div>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-apple-blue">+</span>
                  </button>
                ))
              )}
            </div>
          </aside>
        }
        secondary={
          <H21InvoiceLinesEditor
            lines={lines}
            declarationKg={allocateKg}
            resolveUnitFactor={(line) => {
              const cat = line.catalogItemId
                ? catalogById.get(line.catalogItemId)
                : undefined;
              return resolveH21UnitFactorKg({
                description: line.description,
                unitFactor: cat?.unitFactor ?? 0,
                qty1: line.quantity,
                qty2: line.weightKg,
              });
            }}
            onPatch={(id, patch) => patchLine(id, patch)}
            onRemove={(id) => setLines((prev) => prev.filter((x) => x.id !== id))}
            onClearAll={() => setLines([])}
          />
        }
      />
    </div>
  );

  const reviewPane = (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-100/80">
      <div className="shrink-0 border-b border-ui-border/60 bg-ui-surface px-4 py-2">
        <h3 className="text-xs font-extrabold uppercase tracking-wide text-ui-navy">
          Xem trước invoice
        </h3>
        <p className="text-[10px] text-ui-text-muted">
          Cập nhật realtime khi đổi shipper hoặc dòng hàng
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <TcsH21InvoiceReview doc={invoiceDoc} />
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-ui-background"
      role="dialog"
      aria-modal="true"
      aria-label="Invoice H21 TCS"
      data-testid="tcs-h21-invoice-modal"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ui-border/90 bg-ui-surface px-4 py-3 shadow-ui-sm">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-extrabold text-ui-navy sm:text-base">
            Invoice H21 · Phi mậu dịch
            {isDirty ? (
              <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-amber-700">
                • chưa lưu
              </span>
            ) : null}
          </h2>
          <p className="text-[11px] text-ui-text-muted">
            AWB {shipment.awb || "—"} · {shipment.flight || "—"}/{shipment.flightDate || "—"}
          </p>
        </div>

        <div className="flex gap-1 lg:hidden">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              mobilePane === "setup"
                ? "bg-indigo-600 text-white"
                : "bg-ui-surface-muted text-ui-text"
            }`}
            onClick={() => setMobilePane("setup")}
          >
            Thiết lập
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              mobilePane === "review"
                ? "bg-indigo-600 text-white"
                : "bg-ui-surface-muted text-ui-text"
            }`}
            onClick={() => setMobilePane("review")}
          >
            Review
          </button>
        </div>

        <Button type="button" size="sm" disabled={saving || !isDirty} onClick={() => void handleSave()}>
          {saving
            ? "Đang lưu…"
            : filledSplitCount > 0
              ? `Lưu ${filledSplitCount} tờ khai`
              : "Lưu tờ khai"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={requestClose}>
          Đóng
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={exporting}
          onClick={() => void handleExport("excel")}
        >
          Excel
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={exporting}
          onClick={() => void handleExport("pdf")}
        >
          PDF
        </Button>
      </header>

      <SplitPane
        surfaceId="h21_invoice_main"
        enabled
        defaultPrimary={54}
        minPrimary={32}
        maxPrimary={72}
        minSecondaryPx={320}
        primaryClassName={
          mobilePane === "review" ? "hidden lg:flex" : "flex flex-1 lg:flex-none"
        }
        secondaryClassName={
          mobilePane === "setup" ? "hidden lg:flex" : "flex flex-1 lg:flex-none"
        }
        primary={setupPane}
        secondary={reviewPane}
      />

      <ConfirmDialog
        open={closeConfirmOpen}
        title="Đóng khi chưa lưu?"
        message="Có thay đổi chưa lưu trên tờ khai. Đóng sẽ mất các chỉnh sửa kể từ lần lưu gần nhất."
        confirmLabel="Đóng không lưu"
        cancelLabel="Tiếp tục sửa"
        danger
        onConfirm={() => {
          setCloseConfirmOpen(false);
          onClose();
        }}
        onCancel={() => setCloseConfirmOpen(false)}
      />
      <ConfirmDialog
        open={removeSplitId != null}
        title="Xóa tờ khai này?"
        message="Tờ khai đang có dòng hàng. Xóa sẽ mất dữ liệu tab đó (chưa lưu thì không còn trên DB)."
        confirmLabel="Xóa tờ khai"
        cancelLabel="Giữ lại"
        danger
        onConfirm={confirmRemoveSplit}
        onCancel={() => setRemoveSplitId(null)}
      />
      <ConfirmDialog
        open={pendingGoodsListFile != null}
        title="Thay dòng bằng list hàng?"
        message={`TK ${invoiceSeq} đang có ${lines.length} dòng. Upload list sẽ thay toàn bộ dòng hiện tại bằng mặt hàng khớp từ file.`}
        confirmLabel="Upload & thay"
        cancelLabel="Hủy"
        danger
        onConfirm={() => {
          const f = pendingGoodsListFile;
          setPendingGoodsListFile(null);
          if (f) void runGoodsListImport(f);
        }}
        onCancel={() => {
          setPendingGoodsListFile(null);
          if (goodsListFileRef.current) goodsListFileRef.current.value = "";
        }}
      />
    </div>
  );
}
