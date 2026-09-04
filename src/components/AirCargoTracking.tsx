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
import { buildCargoDayReport } from "../utils/cargoDayReport";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import type { MobileEditFocus } from "./MobileShipmentEditSheet";
import { fetchAppStateSnapshot } from "../utils/fetchAppStateRows";
import { resolveOpsLotSyncedAtMs } from "../utils/dbSyncedAt";
import {
  filterShipmentsBySessionYmd,
  filterShipmentsBySessionYmdRange,
} from "../utils/filterShipmentsBySessionYmd";
import { type StatusFilterValue } from "./StatusFilterBar";
import {
  WAREHOUSE_ORDER,
  isScscWarehouse,
  warehouseLabel,
} from "../constants/warehouses";
import { OpsDesktopCommandBar } from "./OpsDesktopCommandBar";
import { OpsMobileStickyHeader } from "./OpsMobileStickyHeader";
import { firstWarehouseWithLots } from "../utils/warehouseMetrics";
import { statusOrderForFilter } from "../utils/shipmentWorkflowStatus";
import { blankShipmentDraft } from "../utils/blankShipment";
import { focusShipmentGridCell } from "../utils/focusShipmentGrid";
import { debugError } from "../utils/debugLog";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  AppShell,
  Banner,
  EmptyState,
  PageSkeleton,
  useToast,
} from "../ui";
import {
  countShipmentsByWarehouse,
  normalizeFlightDateToken,
  shipmentMatchesSearchQuery,
  type ShipmentSearchContext,
  type ShipmentSearchMatch,
} from "../utils/shipmentSearch";
import { DayExcelExportDialog } from "./DayExcelExportDialog";
import type { ScscH21StampId } from "../types/scscH21Catalog";
import { isScscH21Warehouse } from "../types/scscH21Catalog";
import type { TcsH21StampId } from "../types/tcsH21Catalog";
import { isTcsH21Warehouse } from "../types/tcsH21Catalog";
import { fetchScscH21Stamps } from "../utils/scscH21Api";
import { fetchTcsH21Stamps } from "../utils/tcsH21Api";

const GoogleSheetImportModal = lazy(() =>
  import("./GoogleSheetImportModal").then((m) => ({ default: m.GoogleSheetImportModal }))
);
const DesktopShipmentTable = lazy(() =>
  import("./DesktopShipmentTable").then((m) => ({ default: m.DesktopShipmentTable }))
);
const MobileShipmentCards = lazy(() =>
  import("./MobileShipmentCards").then((m) => ({ default: m.MobileShipmentCards }))
);
const OpsMobileBookingFab = lazy(() =>
  import("./MobileShipmentCards").then((m) => ({ default: m.OpsMobileBookingFab }))
);
const MobileShipmentEditSheet = lazy(() =>
  import("./MobileShipmentEditSheet").then((m) => ({ default: m.MobileShipmentEditSheet }))
);
const ScscH21InvoiceModal = lazy(() =>
  import("./ScscH21InvoiceModal").then((m) => ({ default: m.ScscH21InvoiceModal }))
);
const TcsH21InvoiceModal = lazy(() =>
  import("./TcsH21InvoiceModal").then((m) => ({ default: m.TcsH21InvoiceModal }))
);

type SyncApi = ReturnType<typeof useShipmentSync>;

const EMPTY_SHIPMENT_ROWS: Shipment[] = [];
const EMPTY_CUSTOMERS_DIR: CustomerDirectoryEntry[] = [];

interface AirCargoTrackingProps {
  sync: SyncApi;
  onSessionDateChange?: (ymd: string) => void;
  onRequestPrint: (s: Shipment, airlineLabelOverrides?: AirlineLabelOverrides | null) => void;
  /** Mobile BottomNav — đăng ký API copy ảnh báo cáo. */
  onCargoCopyApiChange?: (
    api: {
      viewRows: readonly Shipment[];
      copying: boolean;
      onCopy: (kind: CargoDayReportCopyKind) => void;
    } | null,
  ) => void;
}

export function AirCargoTracking({
  sync,
  onSessionDateChange,
  onRequestPrint,
  onCargoCopyApiChange,
}: AirCargoTrackingProps) {
  const {
    status,
    state,
    mutate,
    socketConnected,
    pendingOfflineCount,
    refreshState,
    applyRemoteState,
  } = sync;
  const toast = useToast();
  const [syncRefreshing, setSyncRefreshing] = useState(false);

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
  const [excelRangeOpen, setExcelRangeOpen] = useState(false);
  const [invoiceShipment, setInvoiceShipment] = useState<Shipment | null>(null);
  const [h21Stamps, setH21Stamps] = useState<readonly (ScscH21StampId | TcsH21StampId)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const todayYmd = formatLocalSessionDate(startOfLocalDay(new Date()));
  const isViewingToday = selectedYmd === todayYmd;

  const allRows = state?.rows ?? EMPTY_SHIPMENT_ROWS;
  const viewRows = useMemo(
    () => filterShipmentsBySessionYmd(allRows, selectedYmd),
    [allRows, selectedYmd]
  );

  /** max(lots.synced_at) kho đang xem + ngày phiên; fallback max theo kho. Không dùng customers / lastSyncAt. */
  const lotSyncedAt = useMemo(() => {
    const warehouseLots = viewRows.filter((r) => r.warehouse === activeWarehouse);
    return resolveOpsLotSyncedAtMs({
      lots: warehouseLots,
      warehouse: activeWarehouse,
      sessionDate: selectedYmd,
      warehouseMaxSyncedAt: state?.syncMeta?.lotsMaxSyncedAtByWarehouse?.[activeWarehouse],
    });
  }, [viewRows, activeWarehouse, selectedYmd, state?.syncMeta?.lotsMaxSyncedAtByWarehouse]);

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
      const result = await runMutate({ action: "UPDATE", id, patch });
      return Boolean(result);
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

  useEffect(() => {
    const loadScsc = isScscH21Warehouse(activeWarehouse) || isScscWarehouse(activeWarehouse);
    const loadTcs = isTcsH21Warehouse(activeWarehouse);
    if (!loadScsc && !loadTcs) return;
    let cancelled = false;
    const fetchStamps = loadTcs ? fetchTcsH21Stamps : fetchScscH21Stamps;
    void fetchStamps()
      .then((items) => {
        if (!cancelled) setH21Stamps(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeWarehouse]);

  const openInvoiceH21 = useCallback((s: Shipment) => {
    setInvoiceShipment(s);
    const fetchStamps = isTcsH21Warehouse(s.warehouse)
      ? fetchTcsH21Stamps
      : fetchScscH21Stamps;
    // Invoice cần base64 con dấu — xin list đầy đủ một lần khi mở modal.
    void fetchStamps({ includeSeal: true })
      .then(setH21Stamps)
      .catch(() => {});
  }, []);

  const saveInvoiceH21 = useCallback(
    async (payload: {
      invoiceItems: NonNullable<Shipment["invoiceItems"]>;
      invoiceDeclarations: NonNullable<Shipment["invoiceDeclarations"]>;
      h21DeclarationShipperId: string;
    }) => {
      if (!invoiceShipment) return;
      await onUpdate(invoiceShipment.id, {
        invoiceItems: payload.invoiceItems,
        invoiceDeclarations: payload.invoiceDeclarations,
        h21DeclarationShipperId: payload.h21DeclarationShipperId,
      });
    },
    [invoiceShipment, onUpdate]
  );

  const goPrevDay = () => setSelectedViewDate((d) => startOfLocalDay(addLocalDays(d, -1)));
  const goNextDay = () => setSelectedViewDate((d) => startOfLocalDay(addLocalDays(d, 1)));
  const goToday = () => setSelectedViewDate(startOfLocalDay(new Date()));

  const onDownloadDayExcelRange = useCallback(
    async (fromYmd: string, toYmd: string) => {
      setExcelExporting(true);
      try {
        let sourceRows = allRows;
        let customersForExport = state?.customers ?? [];
        // Cùng ngày phiên đã sync — đủ dữ liệu, khỏi tải full snapshot.
        const sameSyncedDay =
          fromYmd === toYmd &&
          fromYmd === selectedYmd &&
          Array.isArray(state?.customers);
        if (!sameSyncedDay) {
          const snap = await fetchAppStateSnapshot();
          if (snap) {
            sourceRows = snap.rows;
            customersForExport = snap.customers;
          }
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
    [allRows, selectedYmd, state, toast]
  );

  const onDownloadScscDimDay = useCallback(async () => {
    setScscDimExporting(true);
    try {
      // Ngày phiên đã sync trong `allRows` — không cần GET full=1.
      const rows = filterShipmentsBySessionYmd(allRows, selectedYmd).filter((r) =>
        isScscWarehouse(r.warehouse)
      );
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

  useEffect(() => {
    if (!onCargoCopyApiChange) return;
    onCargoCopyApiChange({
      viewRows,
      copying: cargoReportCopying,
      onCopy: (kind) => {
        void onCopyCargoDayReport(kind);
      },
    });
    return () => onCargoCopyApiChange(null);
  }, [cargoReportCopying, onCargoCopyApiChange, onCopyCargoDayReport, viewRows]);

  if (status === "loading" || !state) {
    return <PageSkeleton variant="ops" />;
  }

  const toolsProps = {
    excelExporting,
    onDownloadDayExcel: () => setExcelRangeOpen(true),
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
      lotSyncedAt={lotSyncedAt}
      pendingOfflineCount={pendingOfflineCount ?? 0}
      syncRefreshing={syncRefreshing}
      onSyncRefresh={async () => {
        setSyncRefreshing(true);
        try {
          await refreshState();
          toast.success("Đã làm mới dữ liệu", "Đồng bộ");
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Không làm mới được.",
            "Đồng bộ thất bại"
          );
        } finally {
          setSyncRefreshing(false);
        }
      }}
      activeWarehouse={activeWarehouse}
      onOpenSheetImport={() => setSheetImportOpen(true)}
      onCopyCargoDayReport={(kind) => void onCopyCargoDayReport(kind ?? "vantage")}
      cargoReportCopying={cargoReportCopying}
      {...toolsProps}
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
    <OpsDesktopCommandBar
      selectedYmd={selectedYmd}
      onDateChange={(v) => setSelectedViewDate(startOfLocalDay(parseSessionDateYmd(v)))}
      onPrevDay={goPrevDay}
      onNextDay={goNextDay}
      onToday={goToday}
      isViewingToday={isViewingToday}
      syncStatus={status}
      socketConnected={socketConnected}
      daysWithData={daysWithData}
      totalLots={allRows.length}
      activeWarehouse={activeWarehouse}
      onAddBooking={(wh) => void addBlankRowForWarehouse(wh)}
      onOpenSheetImport={() => setSheetImportOpen(true)}
      viewRows={viewRows}
      cargoReportCopying={cargoReportCopying}
      onCopyCargoDayReport={(kind) => void onCopyCargoDayReport(kind)}
      toolsProps={toolsProps}
      filteredViewRows={filteredViewRows}
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
  );

  return (
    <AppShell chrome={chrome}>
      {status === "offline" ? (
        <div className="mb-2 md:block hidden">
          <Banner tone="warning" title="Chỉ máy này">
            Không kết nối máy chủ. Thay đổi vẫn lưu trên trình duyệt; sẽ đồng bộ khi có mạng lại.
          </Banner>
        </div>
      ) : null}

      {viewRows.length === 0 ? (
        <div className="mb-3">
          <EmptyState
            title="Chưa có lô trong ngày này"
            description="Tạo booking mới hoặc bấm «Sync» để kéo từ Google Sheet."
            actionLabel="+ Booking"
            onAction={() => void addBlankRowForWarehouse(activeWarehouse)}
          />
          <div className="mt-2 flex justify-center md:hidden">
            <button
              type="button"
              className="text-[13px] font-bold text-emerald-700 underline-offset-2 hover:underline"
              onClick={() => setSheetImportOpen(true)}
            >
              Sync
            </button>
          </div>
        </div>
      ) : null}

      {viewRows.length > 0 && filteredViewRows.length === 0 ? (
        <div className="mb-3">
          <EmptyState
            title="Không có lô khớp bộ lọc"
            description="Thử xóa lọc trạng thái, ngày bay hoặc từ khóa tìm kiếm."
            actionLabel="Xóa lọc"
            onAction={clearViewFilters}
          />
        </div>
      ) : null}

      {/* Chỉ dựng một cây bảng — trước đây cả hai cùng mount và chỉ ẩn bằng CSS. */}
      {isMobile ? (
        <Suspense fallback={<PageSkeleton variant="ops" />}>
          <MobileShipmentCards
            rows={filteredViewRows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onPrint={requestPrintLabel}
            onInvoice={openInvoiceH21}
            customerDirectory={state?.customers ?? EMPTY_CUSTOMERS_DIR}
            activeWarehouse={activeWarehouse}
            searchActive={searchActive}
            pinnedOpenWarehouses={searchHighlightWarehouses}
            highlightedShipmentId={highlightedShipmentId}
            viewSessionYmd={selectedYmd}
            onAddBlankRow={(wh) => void addBlankRowForWarehouse(wh)}
            onQuickEdit={(row) => openMobileEdit(row)}
            onDownloadScscDim={() => void onDownloadScscDimDay()}
            scscDimExporting={scscDimExporting}
          />
        </Suspense>
      ) : (
        <Suspense fallback={<PageSkeleton variant="ops" />}>
          <DesktopShipmentTable
            rows={filteredViewRows}
            allRows={allRows}
            customerDirectory={state?.customers ?? EMPTY_CUSTOMERS_DIR}
            activeWarehouse={activeWarehouse}
            highlightedShipmentId={highlightedShipmentId}
            selectedRowId={selectedId}
            onSelectRow={setSelectedId}
            onAddBlankRow={(wh) => void addBlankRowForWarehouse(wh)}
            onDownloadScscDim={() => void onDownloadScscDimDay()}
            scscDimExporting={scscDimExporting}
            onUpdate={onUpdate}
            onUpdateCustomers={onUpdateCustomers}
            onDelete={onDelete}
            onPrint={requestPrintLabel}
            onInvoice={openInvoiceH21}
            h21Stamps={h21Stamps}
            viewSessionYmd={selectedYmd}
          />
        </Suspense>
      )}

      {isMobile ? (
        <Suspense fallback={null}>
          <OpsMobileBookingFab
            activeWarehouse={activeWarehouse}
            hidden={mobileEditShipment != null}
            onAdd={() => void addBlankRowForWarehouse(activeWarehouse)}
          />
        </Suspense>
      ) : null}

      {isMobile ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}

      <Suspense fallback={null}>
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
                  "Sync",
                );
                setSheetImportOpen(false);
              } else if (count > 0 && errN > 0) {
                toast.warning(
                  `Nhập ${count} lô · ${errN} lỗi. Xem chi tiết trong modal.`,
                  "Nhập một phần",
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

      {invoiceShipment ? (
        <Suspense fallback={null}>
          {isTcsH21Warehouse(invoiceShipment.warehouse) ? (
            <TcsH21InvoiceModal
              shipment={
                allRows.find((r) => r.id === invoiceShipment.id) ?? invoiceShipment
              }
              customerDirectory={state?.customers ?? EMPTY_CUSTOMERS_DIR}
              stamps={h21Stamps as readonly TcsH21StampId[]}
              onSave={saveInvoiceH21}
              onClose={() => setInvoiceShipment(null)}
            />
          ) : (
            <ScscH21InvoiceModal
              shipment={
                allRows.find((r) => r.id === invoiceShipment.id) ?? invoiceShipment
              }
              customerDirectory={state?.customers ?? EMPTY_CUSTOMERS_DIR}
              stamps={h21Stamps as readonly ScscH21StampId[]}
              onSave={saveInvoiceH21}
              onClose={() => setInvoiceShipment(null)}
            />
          )}
        </Suspense>
      ) : null}
    </AppShell>
  );
}
