import { useCallback, useEffect, useMemo, useRef, useState, startTransition, lazy, Suspense } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  addLocalDays,
  formatLocalSessionDate,
  parseSessionDateYmd,
  startOfLocalDay,
} from "../utils/sessionDate";
import type { useShipmentSync } from "../hooks/useShipmentSync";
import { DesktopShipmentTable } from "./DesktopShipmentTable";
import { MobileShipmentCards, StickyMobileActions } from "./MobileShipmentCards";
import { MobileShipmentEditSheet, type MobileEditFocus } from "./MobileShipmentEditSheet";
import { buildCargoDayReport } from "../utils/cargoDayReport";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { fetchAppStateSnapshot } from "../utils/fetchAppStateRows";
import {
  filterShipmentsBySessionYmd,
  filterShipmentsBySessionYmdRange,
} from "../utils/filterShipmentsBySessionYmd";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";
import { SmartSearchBar } from "./SmartSearchBar";
import { TcsPortalInlineBar } from "./TcsPortalInlineBar";
import { EcargoScscInlineBar, EcargoScscProvider } from "./EcargoScscInlineBar";
import { ChromeExtensionsDownloadMenu } from "./ChromeExtensionsDownloadMenu";
import { TcsPortalActionsProvider } from "./TcsPortalActionsContext";
import { useTcsPortalActions } from "../hooks/useTcsPortalActions";
import {
  WAREHOUSE_ORDER,
  isEcargoScscWarehouse,
  isScscWarehouse,
  isTcsWarehouse,
  isTecsHub,
  warehouseLabel,
} from "../constants/warehouses";
import { asTcsPortalWarehouse } from "../utils/tcsPortalJob";
import {
  probeInlineTcsAgent,
  shouldPreferRemotePortal,
} from "../utils/inlineTcsAgent";
import { NewBookingButton } from "./NewBookingButton";
import { OpsDatePicker } from "./OpsDatePicker";
import { OpsMobileStickyHeader } from "./OpsMobileStickyHeader";
import { OpsSheetImportButton } from "./OpsSheetImportButton";
import { OpsToolsMenu } from "./OpsToolsMenu";
import { firstWarehouseWithLots } from "../utils/warehouseMetrics";
import { statusOrderForFilter } from "../utils/shipmentWorkflowStatus";
import { blankShipmentDraft } from "../utils/blankShipment";
import { focusShipmentGridCell } from "../utils/focusShipmentGrid";
import { debugError } from "../utils/debugLog";
import { formatKgTotal } from "../utils/formatKgTotal";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  AppShell,
  Banner,
  Button,
  EmptyState,
  PageSkeleton,
  SyncStatusPill,
  useToast,
  Wordmark,
} from "../ui";
import {
  countShipmentsByWarehouse,
  normalizeFlightDateToken,
  shipmentMatchesSearchQuery,
  type ShipmentSearchContext,
  type ShipmentSearchMatch,
} from "../utils/shipmentSearch";
import { DayExcelExportDialog } from "./DayExcelExportDialog";
import { trackAiEvent } from "../utils/aiOpsClient";
import type {
  AiBookingDraft,
  AiDimDraft,
  AiProfileDraft,
} from "./AiOpsWorkbenchModal";
import { awbDigitsKey } from "../utils/awbFormat";
import { totalDimKgFromLines } from "../utils/volumetricDim";

const GoogleSheetImportModal = lazy(() =>
  import("./GoogleSheetImportModal").then((m) => ({ default: m.GoogleSheetImportModal }))
);
const AirlineLabelSettingsModal = lazy(() =>
  import("./AirlineLabelSettingsModal").then((m) => ({ default: m.AirlineLabelSettingsModal }))
);
const AiImprovementReportModal = lazy(() =>
  import("./AiImprovementReportModal").then((m) => ({ default: m.AiImprovementReportModal }))
);
const AiOpsWorkbenchModal = lazy(() =>
  import("./AiOpsWorkbenchModal").then((m) => ({ default: m.AiOpsWorkbenchModal }))
);

type SyncApi = ReturnType<typeof useShipmentSync>;

const EMPTY_SHIPMENT_ROWS: Shipment[] = [];
const EMPTY_CUSTOMERS_DIR: CustomerDirectoryEntry[] = [];

interface AirCargoTrackingProps {
  sync: SyncApi;
  onSessionDateChange?: (ymd: string) => void;
  onNavigateCustomers: () => void;
  onPrefetchCustomers?: () => void;
  onNavigateStats?: () => void;
  onPrefetchStats?: () => void;
  onRequestPrint: (s: Shipment, airlineLabelOverrides?: AirlineLabelOverrides | null) => void;
}

function formatWorkDateLabel(d: Date): string {
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

export function AirCargoTracking({
  sync,
  onSessionDateChange,
  onNavigateCustomers,
  onPrefetchCustomers,
  onNavigateStats,
  onPrefetchStats,
  onRequestPrint,
}: AirCargoTrackingProps) {
  const { status, state, mutate, mutateBatch, socketConnected, refreshState, applyRemoteState } =
    sync;
  const toast = useToast();

  const [selectedViewDate, setSelectedViewDate] = useState(() => startOfLocalDay(new Date()));
  const selectedYmd = formatLocalSessionDate(selectedViewDate);

  useEffect(() => {
    onSessionDateChange?.(selectedYmd);
  }, [selectedYmd, onSessionDateChange]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileEditShipment, setMobileEditShipment] = useState<Shipment | null>(null);
  const [mobileEditInitialTab, setMobileEditInitialTab] = useState<"lot" | "notify" | "dim">("lot");
  const [mobileEditFocus, setMobileEditFocus] = useState<MobileEditFocus>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("ALL");
  const [activeWarehouse, setActiveWarehouse] = useState<Warehouse>("TECS-TCS");
  const [searchQuery, setSearchQuery] = useState("");
  /** Ngày bay (DDMMM) — tách khỏi ô gõ, kết hợp AND với searchQuery. */
  const [flightDateFilter, setFlightDateFilter] = useState("");
  const [highlightedShipmentId, setHighlightedShipmentId] = useState<string | null>(null);
  const [excelExporting, setExcelExporting] = useState(false);
  const [scscDimExporting, setScscDimExporting] = useState(false);
  const [cargoReportCopying, setCargoReportCopying] = useState(false);
  const [sheetImportOpen, setSheetImportOpen] = useState(false);
  const [airlineLabelSettingsOpen, setAirlineLabelSettingsOpen] = useState(false);
  const [airlineLabelSaving, setAirlineLabelSaving] = useState(false);
  const [excelRangeOpen, setExcelRangeOpen] = useState(false);
  const [aiImproveOpen, setAiImproveOpen] = useState(false);
  const [aiWorkbenchOpen, setAiWorkbenchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  /** null = chưa probe; true = /tcs-agent OK (Railway/local all-in-one). */
  const [inlineAgentOk, setInlineAgentOk] = useState<boolean | null>(null);

  const todayYmd = formatLocalSessionDate(startOfLocalDay(new Date()));
  const isViewingToday = selectedYmd === todayYmd;

  const allRows = state?.rows ?? EMPTY_SHIPMENT_ROWS;
  const viewRows = useMemo(
    () => filterShipmentsBySessionYmd(allRows, selectedYmd),
    [allRows, selectedYmd]
  );

  const searchContext = useMemo(
    (): ShipmentSearchContext => ({
      customers: state?.customers ?? [],
    }),
    [state?.customers]
  );

  const statusFilteredRows = useMemo(() => {
    return viewRows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== (statusFilter as ShipmentStatus)) return false;
      return true;
    });
  }, [viewRows, statusFilter]);

  const searchActive =
    searchQuery.trim().length > 0 || Boolean(flightDateFilter);

  const filteredViewRows = useMemo(() => {
    return statusFilteredRows.filter((r) => {
      if (flightDateFilter) {
        const fd = normalizeFlightDateToken(r.flightDate || "");
        if (fd !== flightDateFilter) return false;
      }
      return shipmentMatchesSearchQuery(r, searchQuery, searchContext);
    });
  }, [statusFilteredRows, searchQuery, flightDateFilter, searchContext]);

  const searchHighlightWarehouses = useMemo((): Warehouse[] => {
    if (!searchActive) return [];
    const counts = countShipmentsByWarehouse(filteredViewRows);
    return WAREHOUSE_ORDER.filter((wh) => counts[wh] > 0);
  }, [searchActive, filteredViewRows]);

  useEffect(() => {
    setStatusFilter("ALL");
    setSearchQuery("");
    setFlightDateFilter("");
    setHighlightedShipmentId(null);
    setActiveWarehouse("TECS-TCS");
  }, [selectedYmd]);

  useEffect(() => {
    setActiveWarehouse((prev) => {
      const hasInActive = filteredViewRows.some((r) => r.warehouse === prev);
      if (hasInActive) return prev;
      // Giữ kho đang chọn khi ngày/lọc trống (vd. SCSC chưa có lô) —
      // không ép về TCS, để vẫn bấm Sheet / Booking trên đúng trang kho.
      if (filteredViewRows.length === 0) return prev;
      return firstWarehouseWithLots(filteredViewRows);
    });
  }, [filteredViewRows]);

  const handleActiveWarehouseChange = useCallback(
    (wh: Warehouse) => {
      trackAiEvent("ops.quick_filter.change", { kind: "warehouse", value: wh });
      setActiveWarehouse(wh);
      setStatusFilter((prev) => {
        if (prev === "ALL") return prev;
        const allowed = statusOrderForFilter(wh);
        return allowed.includes(prev as ShipmentStatus) ? prev : "ALL";
      });
      // Socket đang live thì state đã realtime — chỉ kéo lại khi mất socket.
      if (!socketConnected) void refreshState();
    },
    [refreshState, socketConnected]
  );

  const clearViewFilters = useCallback(() => {
    setStatusFilter("ALL");
    setSearchQuery("");
    setFlightDateFilter("");
    setHighlightedShipmentId(null);
  }, []);

  const scrollToShipmentMatch = useCallback((match: ShipmentSearchMatch) => {
    const { shipment } = match;
    setActiveWarehouse(shipment.warehouse);
    setHighlightedShipmentId(shipment.id);
    setSelectedId(shipment.id);
    window.setTimeout(() => {
      document.getElementById(`warehouse-section-${shipment.warehouse}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      const rowEl =
        document.getElementById(`shipment-row-${shipment.id}`) ??
        document.getElementById(`mobile-shipment-${shipment.id}`);
      rowEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    window.setTimeout(() => setHighlightedShipmentId(null), 2400);
  }, []);

  const daysWithData = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) s.add((r.sessionDate || "").trim());
    return s.size;
  }, [allRows]);

  useEffect(() => {
    setSelectedId((s) => (s && filteredViewRows.some((r) => r.id === s) ? s : null));
  }, [filteredViewRows]);

  const runMutate = useCallback(
    async (cmd: Parameters<typeof mutate>[0]) => {
      try {
        return await mutate(cmd);
      } catch (e) {
        debugError("ui:mutate", e);
        toast.error(e instanceof Error ? e.message : "Không gửi được thay đổi lên máy chủ.", "Đồng bộ thất bại");
        return null;
      }
    },
    [mutate, toast]
  );

  const onUpdate = useCallback(
    async (id: string, patch: Partial<Shipment>) => {
      const fields = Object.keys(patch);
      if (fields.length === 0) return true;
      trackAiEvent("ops.inline_edit.start", { fields });
      const result = await runMutate({ action: "UPDATE", id, patch });
      if (result) {
        trackAiEvent("ops.inline_edit.ok", { fields });
        return true;
      }
      trackAiEvent("ops.inline_edit.fail", { fields });
      return false;
    },
    [runMutate]
  );

  const onUpdateCustomers = useCallback(
    async (customers: CustomerDirectoryEntry[]) => {
      const result = await runMutate({ action: "SET_CUSTOMERS", customers });
      return Boolean(result);
    },
    [runMutate]
  );

  const onMarkReceptionCompleted = useCallback(
    async (shipmentIds: string[]) => {
      if (shipmentIds.length === 0) return;
      try {
        await mutateBatch(
          shipmentIds.map((id) => ({
            action: "UPDATE" as const,
            id,
            patch: { status: "RECEPTION_COMPLETED" as const },
          }))
        );
      } catch (e) {
        debugError("ui:mutate-batch", e);
        toast.error(
          e instanceof Error ? e.message : "Không gửi được thay đổi lên máy chủ.",
          "Đồng bộ thất bại"
        );
      }
    },
    [mutateBatch, toast]
  );

  /** Sau Quét ESID: hiện các lô vừa gán HOÀN THÀNH TIẾP NHẬN trên bảng Ops */
  const onReceptionScanDone = useCallback(
    (info: { readyCount: number; updatedCount: number }) => {
      if (info.readyCount <= 0 && info.updatedCount <= 0) return;
      setStatusFilter("RECEPTION_COMPLETED");
      setSearchQuery("");
      setFlightDateFilter("");
      // Giữ kho đang thao tác (TECS-TCS hoặc TCS) — không nhảy sang kho kia.
    },
    []
  );

  const portalWh = asTcsPortalWarehouse(activeWarehouse);

  useEffect(() => {
    if (!isTcsWarehouse(activeWarehouse) || !portalWh) {
      setInlineAgentOk(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const probe = await probeInlineTcsAgent(portalWh);
      if (!cancelled) setInlineAgentOk(probe.ok);
    };
    void run();
    const timer = window.setInterval(() => void run(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeWarehouse, portalWh]);

  const tcsPortal = useTcsPortalActions({
    sessionYmd: selectedYmd,
    rows: viewRows,
    customerDirectory: state?.customers ?? EMPTY_CUSTOMERS_DIR,
    onMarkReceptionCompleted,
    onReceptionScanDone,
    active: isTcsWarehouse(activeWarehouse),
    portalWarehouse: activeWarehouse,
    /**
     * Phone: remote worker chỉ khi không có agent nội bộ (Railway/local).
     * Có /tcs-agent → đường nóng same-origin (nhanh, không poll PC).
     */
    preferRemotePortal: shouldPreferRemotePortal(isMobile, inlineAgentOk),
    isMobile,
  });

  const onDelete = useCallback(
    (id: string) => {
      void runMutate({ action: "DELETE", id });
    },
    [runMutate]
  );

  const addBlankRowForWarehouse = useCallback(
    async (warehouse: Warehouse) => {
      setStatusFilter("ALL");
      setActiveWarehouse(warehouse);
      const prevIds = new Set((state?.rows ?? []).map((r) => r.id));
      const next = await runMutate({
        action: "ADD",
        shipment: blankShipmentDraft(selectedYmd, warehouse),
      });
      const added = next?.rows.find((r) => !prevIds.has(r.id));
      if (added) {
        const onMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
        if (onMobile) {
          setSelectedId(added.id);
          setMobileEditInitialTab("lot");
          setMobileEditFocus("awb");
          setMobileEditShipment(added);
          window.setTimeout(() => {
            document.getElementById(`mobile-shipment-${added.id}`)?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }, 80);
        } else {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => focusShipmentGridCell(added.id, "awb"));
          });
        }
      }
    },
    [state?.rows, selectedYmd, runMutate]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (e.key === "/" || e.key === "f" || e.key === "F") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        void addBlankRowForWarehouse(activeWarehouse);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeWarehouse, addBlankRowForWarehouse]);

  const requestPrintLabel = useCallback(
    (s: Shipment) => {
      onRequestPrint(s, state?.airlineLabelOverrides);
    },
    // Chỉ [onRequestPrint]: state đổi liên tục qua Socket — đưa airlineLabelOverrides vào deps gây loop (#310).
    // Đọc overrides qua closure tại lúc gọi in.
    [onRequestPrint]
  );

  const saveAirlineLabelOverrides = async (next: AirlineLabelOverrides) => {
    setAirlineLabelSaving(true);
    try {
      const out = await runMutate({ action: "SET_AIRLINE_LABEL_OVERRIDES", overrides: next });
      if (out) setAirlineLabelSettingsOpen(false);
    } finally {
      setAirlineLabelSaving(false);
    }
  };

  const { totalPcs, totalKg } = useMemo(() => {
    let pcs = 0;
    let kg = 0;
    for (const r of filteredViewRows) {
      pcs += r.pcs ?? 0;
      kg += r.kg ?? 0;
    }
    return { totalPcs: pcs, totalKg: kg };
  }, [filteredViewRows]);

  const workDateLabel = useMemo(() => formatWorkDateLabel(selectedViewDate), [selectedViewDate]);

  const goPrevDay = () => setSelectedViewDate((d) => startOfLocalDay(addLocalDays(d, -1)));
  const goNextDay = () => setSelectedViewDate((d) => startOfLocalDay(addLocalDays(d, 1)));
  const goToday = () => setSelectedViewDate(startOfLocalDay(new Date()));

  const onDownloadDayExcelRange = useCallback(
    async (fromYmd: string, toYmd: string) => {
      setExcelExporting(true);
      try {
        let sourceRows = allRows;
        let customersForExport = state?.customers ?? [];
        const snap = await fetchAppStateSnapshot();
        if (snap) {
          sourceRows = snap.rows;
          customersForExport = snap.customers;
        }
        const rowsForExport = filterShipmentsBySessionYmdRange(
          sourceRows,
          fromYmd,
          toYmd
        );
        // Tải theo nhu cầu: ExcelJS + code dựng sheet không cần nằm trong chunk Ops.
        const { downloadDayReportExcel } = await import("../utils/exportDayReportExcel");
        const n = await downloadDayReportExcel(
          rowsForExport,
          fromYmd,
          customersForExport,
          toYmd
        );
        toast.success(`Đã xuất ${n} lô.`, "Xuất Excel");
        setExcelRangeOpen(false);
      } catch (e) {
        debugError("ui:excel-day", e);
        toast.error(
          e instanceof Error ? e.message : "Không tạo được file Excel.",
          "Xuất Excel"
        );
      } finally {
        setExcelExporting(false);
      }
    },
    [allRows, state, toast]
  );

  const onDownloadScscDimDay = useCallback(async () => {
    setScscDimExporting(true);
    try {
      let rows = filterShipmentsBySessionYmd(allRows, selectedYmd).filter((r) =>
        isScscWarehouse(r.warehouse)
      );
      const snap = await fetchAppStateSnapshot();
      if (snap) {
        rows = filterShipmentsBySessionYmd(snap.rows, selectedYmd).filter((r) =>
          isScscWarehouse(r.warehouse)
        );
      }
      const { downloadScscDimDayExcel } = await import("../utils/exportScscDimListExcel");
      await downloadScscDimDayExcel(rows, selectedYmd);
    } catch (e) {
      debugError("ui:excel-scsc-dim-day", e);
      toast.error(e instanceof Error ? e.message : "Không tạo được file DIM SCSC.", "Xuất DIM SCSC");
    } finally {
      setScscDimExporting(false);
    }
  }, [allRows, selectedYmd, toast]);

  const openMobileEdit = useCallback(
    (s: Shipment, opts?: { tab?: "lot" | "notify" | "dim"; focus?: MobileEditFocus }) => {
      startTransition(() => {
        setMobileEditInitialTab(opts?.tab ?? "lot");
        setMobileEditFocus(opts?.focus ?? null);
        setMobileEditShipment(s);
      });
    },
    []
  );

  const onCopyCargoDayReport = useCallback(
    async (kind: CargoDayReportCopyKind = "vantage") => {
      setCargoReportCopying(true);
      try {
        const model = buildCargoDayReport(
          viewRows,
          selectedYmd,
          state?.customers ?? EMPTY_CUSTOMERS_DIR,
        );
        const { copyCargoDayReportImage } = await import("../utils/cargoDayReportImage");
        const result = await copyCargoDayReportImage(model, {
          kind,
          activeWarehouse,
        });
        if (!result.ok) {
          toast.error(result.reason, "Báo cáo hàng hóa");
          return;
        }
        if (result.mode === "clipboard") {
          toast.success(
            `Đã copy ảnh ${result.label} · ${result.totalLots} lô — dán vào group chat.`,
            "Báo cáo hàng hóa",
          );
        } else {
          toast.success(
            `Trình duyệt chặn clipboard — đã tải ${result.filename}. Đính kèm vào chat.`,
            "Báo cáo hàng hóa",
          );
        }
      } catch (e) {
        debugError("ui:cargo-day-report", e);
        toast.error(
          e instanceof Error ? e.message : "Không copy được ảnh báo cáo.",
          "Báo cáo hàng hóa",
        );
      } finally {
        setCargoReportCopying(false);
      }
    },
    [activeWarehouse, selectedYmd, state?.customers, toast, viewRows],
  );

  const selected = filteredViewRows.find((r) => r.id === selectedId) ?? null;

  const createAiBooking = useCallback(
    async (draft: AiBookingDraft) => {
      if (awbDigitsKey(draft.awb).length !== 11) {
        throw new Error("AWB phải đủ 11 số trước khi tạo booking AI.");
      }
      const warehouse = draft.warehouse || activeWarehouse;
      await mutate({
        action: "ADD",
        shipment: {
          ...blankShipmentDraft(selectedYmd, warehouse),
          awb: draft.awb,
          hawb: draft.hawb,
          flight: draft.flight,
          flightDate: draft.flightDate,
          cutoff: draft.cutoff,
          dest: draft.dest,
          pcs: draft.pcs,
          kg: draft.kg,
          customer: draft.customer,
          note: draft.note,
        },
      });
      toast.success("Đã tạo đúng 1 booking từ draft AI.");
    },
    [activeWarehouse, mutate, selectedYmd, toast],
  );

  const saveAiProfile = useCallback(
    async (draft: AiProfileDraft) => {
      const code = String(draft.code || "").trim().toUpperCase();
      const name = String(draft.name || "").trim();
      if (!/^[A-Z]{2,5}$/.test(code)) {
        throw new Error("Customer Code AI phải gồm 2–5 chữ A–Z.");
      }
      if (!name) throw new Error("Draft AI thiếu tên khách.");
      const customers = state?.customers ?? [];
      if (customers.some((customer) => customer.code.trim().toUpperCase() === code)) {
        throw new Error(`Customer Code ${code} đã tồn tại.`);
      }
      const id = crypto.randomUUID();
      const shipperName = String(draft.shipper?.name || "").trim();
      const consigneeName = String(draft.consignee?.name || "").trim();
      const goodsDescription = String(draft.goodsDescription || "").trim();
      const customer: CustomerDirectoryEntry = {
        id,
        code,
        name,
        taxCode: draft.taxCode,
        address: draft.address,
        phone: draft.phone,
        email: draft.email,
        savedShippers: shipperName
          ? [{
              id: `${id}-shipper-1`,
              label: shipperName,
              shipperName,
              shipperAddress: String(draft.shipper?.address || ""),
              shipperPhone: String(draft.shipper?.phone || ""),
              shipperEmail: String(draft.shipper?.email || ""),
              taxCode: String(draft.shipper?.taxCode || ""),
            }]
          : [],
        savedConsignees: consigneeName
          ? [{
              id: `${id}-consignee-1`,
              label: consigneeName,
              consigneeName,
              consigneeAddress: String(draft.consignee?.address || ""),
              consigneePhone: String(draft.consignee?.phone || ""),
              consigneeEmail: String(draft.consignee?.email || ""),
              notifyName: "",
            }]
          : [],
        savedGoods: goodsDescription
          ? [{ id: `${id}-goods-1`, label: goodsDescription, goodsDescription }]
          : [],
        savedVehicles: [],
        savedDimTemplates: [],
        parties: [],
      };
      await mutate({ action: "SET_CUSTOMERS", customers: [...customers, customer] });
      toast.success(`Đã lưu khách ${code} từ draft AI.`);
    },
    [mutate, state?.customers, toast],
  );

  const applyAiDim = useCallback(
    async (draft: AiDimDraft) => {
      if (!selected) throw new Error("Hãy chọn lô trước khi áp dụng DIM.");
      if (!draft.lines.length) throw new Error("Draft DIM không có dòng hợp lệ.");
      const dimWeightKg = totalDimKgFromLines(draft.lines, draft.divisor);
      await mutate({
        action: "UPDATE",
        id: selected.id,
        patch: {
          dimLines: draft.lines,
          dimDivisor: draft.divisor,
          dimWeightKg,
        },
      });
      toast.success("Đã áp dụng DIM AI sau bước xác nhận.");
    },
    [mutate, selected, toast],
  );

  const applyAiEsidDraft = useCallback(
    async (draft: string) => {
      if (!selected) throw new Error("Hãy chọn lô trước khi áp dụng draft eSID.");
      const value = draft.trim();
      if (!value) throw new Error("Draft eSID đang trống.");
      await mutate({
        action: "UPDATE",
        id: selected.id,
        patch: { otherRequirementsPrint: value },
      });
      toast.success("Đã lưu draft Other Request vào lô; hãy kiểm tra trước khi Fill.");
    },
    [mutate, selected, toast],
  );

  // Phải gọi hook trước mọi early return — nếu không, loading → live sẽ React #310.
  const scscShipmentsForEcargo = useMemo(
    () => filteredViewRows.filter((r) => isEcargoScscWarehouse(r.warehouse)),
    [filteredViewRows],
  );

  if (status === "loading" || !state) {
    return <PageSkeleton variant="ops" />;
  }

  const toolsProps = {
    showDimScsc: isScscWarehouse(activeWarehouse),
    excelExporting,
    scscDimExporting,
    onNavigateCustomers,
    onPrefetchCustomers,
    onNavigateStats,
    onPrefetchStats,
    onOpenAirlineLabels: () => setAirlineLabelSettingsOpen(true),
    onDownloadDayExcel: () => setExcelRangeOpen(true),
    onDownloadScscDim: () => void onDownloadScscDimDay(),
    onOpenAiImprove: () => setAiImproveOpen(true),
    onOpenAiWorkbench: () => setAiWorkbenchOpen(true),
  };

  const chrome = isMobile ? (
    <OpsMobileStickyHeader
      selectedYmd={selectedYmd}
      onDateChange={(v) => setSelectedViewDate(startOfLocalDay(parseSessionDateYmd(v)))}
      onPrevDay={goPrevDay}
      onNextDay={goNextDay}
      onToday={goToday}
      isViewingToday={isViewingToday}
      syncStatus={status}
      socketConnected={socketConnected}
      activeWarehouse={activeWarehouse}
      onAddBooking={(wh) => void addBlankRowForWarehouse(wh)}
      onOpenSheetImport={() => setSheetImportOpen(true)}
      onCopyCargoDayReport={(kind) => void onCopyCargoDayReport(kind ?? "vantage")}
      cargoReportCopying={cargoReportCopying}
      {...toolsProps}
      tcsPortalBar={
        isTcsWarehouse(activeWarehouse) ? (
          <TcsPortalInlineBar compact isMobile tcs={tcsPortal} />
        ) : null
      }
      ecargoBar={
        isEcargoScscWarehouse(activeWarehouse) ? (
          <EcargoScscInlineBar compact preferredShipmentId={selectedId} />
        ) : null
      }
      filteredViewRows={filteredViewRows}
      viewRows={viewRows}
      onWarehouseChange={handleActiveWarehouseChange}
      searchHighlightWarehouses={searchHighlightWarehouses}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      flightDateFilter={flightDateFilter}
      onFlightDateChange={setFlightDateFilter}
      statusFilteredRows={statusFilteredRows}
      searchContext={searchContext}
      searchInputRef={searchInputRef}
      onSelectSearchMatch={scrollToShipmentMatch}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      onClearFilters={clearViewFilters}
    />
  ) : (
    <header className="space-y-1">
      {/* Hàng 1: brand + CTA + báo cáo ảnh + ngày — gộp để giảm chiều cao */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <h1 className="m-0 leading-none">
          <Wordmark size="sm" />
        </h1>
        <span className="rounded bg-ui-surface px-1.5 py-px text-[10px] font-semibold text-ui-text-muted ring-1 ring-ui-border">
          OPS
        </span>
        <span className="text-[10px] text-ui-text-muted">
          <span className="font-bold text-ui-text">{workDateLabel}</span>
          {daysWithData > 0 ? (
            <span>
              {" "}
              · {allRows.length}/{daysWithData}d
            </span>
          ) : null}
        </span>
        {!isViewingToday ? (
          <span
            className="rounded bg-amber-100 px-1.5 py-px text-[8px] font-bold uppercase text-amber-950"
            title="Vẫn sửa / thêm lô được"
          >
            Ngày khác
          </span>
        ) : null}
        <SyncStatusPill status={status} socketConnected={socketConnected} compact />
        <span className="mx-0.5 hidden h-4 w-px bg-ui-border sm:inline-block" aria-hidden />
        <NewBookingButton
          activeWarehouse={activeWarehouse}
          onAdd={(wh) => void addBlankRowForWarehouse(wh)}
        />
        <OpsSheetImportButton onOpenSheetImport={() => setSheetImportOpen(true)} />
        {onNavigateStats ? (
          <Button
            variant="secondary"
            size="sm"
            title="Thống kê Lô · Kg · DIM · Chargeable"
            onClick={onNavigateStats}
            onMouseEnter={onPrefetchStats}
            onFocus={onPrefetchStats}
          >
            Thống kê
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          className="border-transparent bg-emerald-600 px-2 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400"
          disabled={
            cargoReportCopying ||
            !viewRows.some((r) => isTecsHub(r.warehouse))
          }
          title="Vantage — kho TECS, ẩn cột khách hàng"
          onClick={() => void onCopyCargoDayReport("vantage")}
        >
          {cargoReportCopying ? "…" : "Vantage"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="border-transparent bg-teal-700 px-2 text-white hover:bg-teal-800 focus-visible:ring-teal-400"
          disabled={
            cargoReportCopying ||
            !viewRows.some((r) => isTecsHub(r.warehouse))
          }
          title="Tecs — kho TECS · Short Code + Kiện/Kg"
          onClick={() => void onCopyCargoDayReport("tecs")}
        >
          {cargoReportCopying ? "…" : "Tecs"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="border-transparent bg-sky-600 px-2 text-white hover:bg-sky-700 focus-visible:ring-sky-400"
          disabled={
            cargoReportCopying ||
            !viewRows.some((r) => r.warehouse === "TCS")
          }
          title="TCS — chỉ kho TCS"
          onClick={() => void onCopyCargoDayReport("tcs")}
        >
          {cargoReportCopying ? "…" : "TCS"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="border-transparent bg-violet-600 px-2 text-white hover:bg-violet-700 focus-visible:ring-violet-400"
          disabled={
            cargoReportCopying ||
            !viewRows.some((r) => r.warehouse === "SCSC")
          }
          title="SCSC — chỉ kho SCSC"
          onClick={() => void onCopyCargoDayReport("scsc")}
        >
          {cargoReportCopying ? "…" : "SCSC"}
        </Button>
        <ChromeExtensionsDownloadMenu />
        <OpsToolsMenu {...toolsProps} />
        <div className="ml-auto min-w-0 shrink-0">
          <OpsDatePicker
            compact
            value={selectedYmd}
            onChange={(v) => setSelectedViewDate(startOfLocalDay(parseSessionDateYmd(v)))}
            onPrev={goPrevDay}
            onNext={goNextDay}
            onToday={goToday}
            isViewingToday={isViewingToday}
          />
        </div>
      </div>

      {viewRows.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <span
            className="inline-flex shrink-0 items-baseline gap-x-1.5 font-mono text-[11px] tabular-nums text-ui-text"
            title="Lô · Kiện · Kg (sau lọc)"
          >
            <span>
              <span className="text-[9px] font-semibold text-ui-text-muted">Lô</span>{" "}
              <span className="font-bold">{filteredViewRows.length}</span>
            </span>
            <span className="text-ui-border">·</span>
            <span>
              <span className="text-[9px] font-semibold text-ui-text-muted">Kiện</span>{" "}
              <span className="font-bold">{totalPcs}</span>
            </span>
            <span className="text-ui-border">·</span>
            <span>
              <span className="text-[9px] font-semibold text-ui-text-muted">Kg</span>{" "}
              <span className="font-bold">{formatKgTotal(totalKg)}</span>
            </span>
          </span>
          <SmartSearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            flightDateFilter={flightDateFilter}
            onFlightDateChange={setFlightDateFilter}
            searchableRows={statusFilteredRows}
            matchedRows={filteredViewRows}
            searchContext={searchContext}
            inputRef={searchInputRef}
            onSelectMatch={scrollToShipmentMatch}
            inlineFacets
          />
          <StatusFilterBar
            compact
            dense
            hideEmpty
            warehouse={activeWarehouse}
            dayRows={viewRows}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          {statusFilter !== "ALL" || searchQuery.trim() || flightDateFilter ? (
            <button
              type="button"
              onClick={clearViewFilters}
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-ui-primary hover:bg-ui-primary/10"
            >
              Xóa
            </button>
          ) : null}
          {isTcsWarehouse(activeWarehouse) ? (
            <div className="min-w-0 shrink-0">
              <TcsPortalInlineBar compact isMobile={false} tcs={tcsPortal} />
            </div>
          ) : null}
          {isEcargoScscWarehouse(activeWarehouse) ? (
            <div className="min-w-0 shrink-0">
              <EcargoScscInlineBar compact preferredShipmentId={selectedId} />
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );

  return (
    <EcargoScscProvider
      shipments={scscShipmentsForEcargo}
      customers={state?.customers ?? []}
    >
    <TcsPortalActionsProvider value={tcsPortal}>
    <AppShell chrome={chrome}>
      {status === "offline" ? (
        <div className="mb-2">
          <Banner tone="warning" title="Chỉ máy này">
            Không kết nối máy chủ. Thay đổi vẫn lưu trên trình duyệt; sẽ đồng bộ khi có mạng lại.
          </Banner>
        </div>
      ) : null}

      {viewRows.length === 0 ? (
        <div className="mb-3">
          <EmptyState
            title="Chưa có lô trong ngày này"
            description="Tạo booking mới hoặc bấm «Nhập Sheet» để kéo từ Google Sheet."
            actionLabel="+ Booking"
            onAction={() => void addBlankRowForWarehouse(activeWarehouse)}
          />
        </div>
      ) : null}

      {viewRows.length > 0 && filteredViewRows.length === 0 ? (
        <p className="mb-2 text-center text-xs text-ui-text-muted">
          Không có lô khớp bộ lọc.{" "}
          <button type="button" onClick={clearViewFilters} className="font-semibold text-ui-primary hover:underline">
            Xóa lọc
          </button>
        </p>
      ) : null}

      {/* Chỉ dựng một cây bảng — trước đây cả hai cùng mount và chỉ ẩn bằng CSS. */}
      {isMobile ? (
        <MobileShipmentCards
          rows={filteredViewRows}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onPrint={requestPrintLabel}
          customerDirectory={state?.customers ?? EMPTY_CUSTOMERS_DIR}
          activeWarehouse={activeWarehouse}
          searchActive={searchActive}
          pinnedOpenWarehouses={searchHighlightWarehouses}
          highlightedShipmentId={highlightedShipmentId}
          viewSessionYmd={selectedYmd}
          onAddBlankRow={(wh) => void addBlankRowForWarehouse(wh)}
          onQuickEdit={(row) => openMobileEdit(row)}
        />
      ) : (
        <DesktopShipmentTable
          rows={filteredViewRows}
          allRows={allRows}
          customerDirectory={state?.customers ?? EMPTY_CUSTOMERS_DIR}
          activeWarehouse={activeWarehouse}
          onActiveWarehouseChange={handleActiveWarehouseChange}
          metricRows={filteredViewRows}
          searchHighlightWarehouses={searchHighlightWarehouses}
          highlightedShipmentId={highlightedShipmentId}
          selectedRowId={selectedId}
          onSelectRow={setSelectedId}
          onAddBlankRow={(wh) => void addBlankRowForWarehouse(wh)}
          onUpdate={onUpdate}
          onUpdateCustomers={onUpdateCustomers}
          onDelete={onDelete}
          onPrint={requestPrintLabel}
          viewSessionYmd={selectedYmd}
          ecargoVctById={state?.ecargoVctResultsStore?.byShipmentId}
        />
      )}

      <StickyMobileActions
        selected={selected}
        activeWarehouse={activeWarehouse}
        onDelete={() => selected && onDelete(selected.id)}
        onAdd={() => void addBlankRowForWarehouse(activeWarehouse)}
        onQuickEdit={() => selected && openMobileEdit(selected)}
      />

      <MobileShipmentEditSheet
        open={mobileEditShipment != null}
        shipment={mobileEditShipment}
        initialTab={mobileEditInitialTab}
        focusField={mobileEditFocus}
        sessionDateYmd={selectedYmd}
        customerDirectory={state?.customers ?? EMPTY_CUSTOMERS_DIR}
        onClose={() => {
          setMobileEditShipment(null);
          setMobileEditFocus(null);
        }}
        onSave={(patch) => {
          if (mobileEditShipment) onUpdate(mobileEditShipment.id, patch);
          setMobileEditShipment(null);
        }}
      />

      <Suspense fallback={null}>
        {airlineLabelSettingsOpen ? (
          <AirlineLabelSettingsModal
            open={airlineLabelSettingsOpen}
            onClose={() => setAirlineLabelSettingsOpen(false)}
            value={state?.airlineLabelOverrides}
            flightSamples={allRows.map((r) => r.flight)}
            saving={airlineLabelSaving}
            onSave={saveAirlineLabelOverrides}
          />
        ) : null}
        {sheetImportOpen ? (
          <GoogleSheetImportModal
            open={sheetImportOpen}
            sessionYmd={selectedYmd}
            activeWarehouse={activeWarehouse}
            onClose={() => setSheetImportOpen(false)}
            onApplied={(count, serverState, meta) => {
              const removedN = meta?.removedCount ?? 0;
              const reorderedN = meta?.reorderedCount ?? 0;
              if (serverState) {
                if (!applyRemoteState(serverState, { force: true })) void refreshState();
              } else if (count > 0 || removedN > 0 || reorderedN > 0) {
                void refreshState();
              }
              if (meta?.preferredWarehouse) {
                setActiveWarehouse(meta.preferredWarehouse);
              }
              const errN = meta?.errorCount ?? 0;
              if ((count > 0 || removedN > 0 || reorderedN > 0) && errN === 0) {
                const parts = WAREHOUSE_ORDER.map((wh) => {
                  const n = meta?.appliedByWarehouse?.[wh] ?? 0;
                  return n > 0 ? `${warehouseLabel[wh]} ${n}` : null;
                }).filter(Boolean);
                const detail = parts.length ? ` (${parts.join(" · ")})` : "";
                const removeHint = removedN > 0 ? ` · xóa ${removedN} lô thừa` : "";
                const orderHint = reorderedN > 0 ? ` · STT ${reorderedN} lô theo Sheet` : "";
                toast.success(
                  count > 0
                    ? `Đã đồng bộ ${count} lô từ Google Sheet${detail}${removeHint}${orderHint}.`
                    : removedN > 0
                      ? `Đã xóa ${removedN} lô không còn trên Sheet${orderHint}.`
                      : `Đã sắp ${reorderedN} lô theo thứ tự Sheet.`,
                  "Nhập Sheet"
                );
                setSheetImportOpen(false);
              } else if (count > 0 && errN > 0) {
                toast.warning(
                  `Nhập ${count} lô · ${errN} lỗi. Xem chi tiết trong modal.`,
                  "Nhập một phần"
                );
              }
            }}
          />
        ) : null}
      </Suspense>

      <DayExcelExportDialog
        open={excelRangeOpen}
        defaultYmd={selectedYmd}
        exporting={excelExporting}
        onClose={() => setExcelRangeOpen(false)}
        onExport={(from, to) => void onDownloadDayExcelRange(from, to)}
      />

      <Suspense fallback={null}>
        {aiImproveOpen ? (
          <AiImprovementReportModal
            open={aiImproveOpen}
            onClose={() => setAiImproveOpen(false)}
          />
        ) : null}
        {aiWorkbenchOpen ? (
          <AiOpsWorkbenchModal
            open
            sessionDate={selectedYmd}
            selectedShipment={selected}
            onClose={() => setAiWorkbenchOpen(false)}
            onCreateBooking={createAiBooking}
            onSaveProfile={saveAiProfile}
            onApplyDim={applyAiDim}
            onApplyEsidDraft={applyAiEsidDraft}
          />
        ) : null}
      </Suspense>
    </AppShell>
    </TcsPortalActionsProvider>
    </EcargoScscProvider>
  );
}
