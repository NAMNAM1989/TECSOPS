import { useCallback, useEffect, useMemo, useRef, useState, startTransition, lazy, Suspense } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
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
import { downloadDayReportExcel } from "../utils/exportDayReportExcel";
import { downloadScscDimDayExcel } from "../utils/exportScscDimListExcel";
import { buildCargoDayReport } from "../utils/cargoDayReport";
import { copyCargoDayReportImage } from "../utils/cargoDayReportImage";
import { fetchAppStateSnapshot } from "../utils/fetchAppStateRows";
import {
  filterShipmentsBySessionYmd,
  filterShipmentsBySessionYmdRange,
} from "../utils/filterShipmentsBySessionYmd";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";
import { SmartSearchBar } from "./SmartSearchBar";
import { TcsPortalInlineBar } from "./TcsPortalInlineBar";
import { TcsPortalActionsProvider } from "./TcsPortalActionsContext";
import { useTcsPortalActions } from "../hooks/useTcsPortalActions";
import { WAREHOUSE_ORDER, isScscWarehouse, isTcsWarehouse, warehouseLabel } from "../constants/warehouses";
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
  KpiStat,
  PageSkeleton,
  SyncStatusPill,
  useToast,
  Wordmark,
} from "../ui";
import {
  countShipmentsByWarehouse,
  shipmentMatchesSearchQuery,
  type ShipmentSearchContext,
  type ShipmentSearchMatch,
} from "../utils/shipmentSearch";
import { DayExcelExportDialog } from "./DayExcelExportDialog";

const GoogleSheetImportModal = lazy(() =>
  import("./GoogleSheetImportModal").then((m) => ({ default: m.GoogleSheetImportModal }))
);
const AirlineLabelSettingsModal = lazy(() =>
  import("./AirlineLabelSettingsModal").then((m) => ({ default: m.AirlineLabelSettingsModal }))
);

type SyncApi = ReturnType<typeof useShipmentSync>;

interface AirCargoTrackingProps {
  sync: SyncApi;
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
  onNavigateCustomers,
  onPrefetchCustomers,
  onNavigateStats,
  onPrefetchStats,
  onRequestPrint,
}: AirCargoTrackingProps) {
  const { status, state, mutate, socketConnected, refreshState, applyRemoteState } = sync;
  const toast = useToast();

  const [selectedViewDate, setSelectedViewDate] = useState(() => startOfLocalDay(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileEditShipment, setMobileEditShipment] = useState<Shipment | null>(null);
  const [mobileEditInitialTab, setMobileEditInitialTab] = useState<"lot" | "notify" | "dim">("lot");
  const [mobileEditFocus, setMobileEditFocus] = useState<MobileEditFocus>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("ALL");
  const [activeWarehouse, setActiveWarehouse] = useState<Warehouse>("TECS-TCS");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedShipmentId, setHighlightedShipmentId] = useState<string | null>(null);
  const [excelExporting, setExcelExporting] = useState(false);
  const [scscDimExporting, setScscDimExporting] = useState(false);
  const [cargoReportCopying, setCargoReportCopying] = useState(false);
  const [sheetImportOpen, setSheetImportOpen] = useState(false);
  const [airlineLabelSettingsOpen, setAirlineLabelSettingsOpen] = useState(false);
  const [airlineLabelSaving, setAirlineLabelSaving] = useState(false);
  const [excelRangeOpen, setExcelRangeOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const selectedYmd = formatLocalSessionDate(selectedViewDate);
  const todayYmd = formatLocalSessionDate(startOfLocalDay(new Date()));
  const isViewingToday = selectedYmd === todayYmd;

  const allRows = state?.rows ?? [];
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

  const searchActive = searchQuery.trim().length > 0;

  const filteredViewRows = useMemo(() => {
    return statusFilteredRows.filter((r) =>
      shipmentMatchesSearchQuery(r, searchQuery, searchContext)
    );
  }, [statusFilteredRows, searchQuery, searchContext]);

  const searchHighlightWarehouses = useMemo((): Warehouse[] => {
    if (!searchActive) return [];
    const counts = countShipmentsByWarehouse(filteredViewRows);
    return WAREHOUSE_ORDER.filter((wh) => counts[wh] > 0);
  }, [searchActive, filteredViewRows]);

  useEffect(() => {
    setStatusFilter("ALL");
    setSearchQuery("");
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
      void refreshState();
    },
    [refreshState]
  );

  const clearViewFilters = useCallback(() => {
    setStatusFilter("ALL");
    setSearchQuery("");
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
    (id: string, patch: Partial<Shipment>) => {
      void runMutate({ action: "UPDATE", id, patch });
    },
    [runMutate]
  );

  const onMarkReceptionCompleted = useCallback(
    async (shipmentIds: string[]) => {
      for (const id of shipmentIds) {
        await runMutate({ action: "UPDATE", id, patch: { status: "RECEPTION_COMPLETED" } });
      }
    },
    [runMutate]
  );

  /** Sau Quét ESID: hiện các lô vừa gán HOÀN THÀNH TIẾP NHẬN trên bảng Ops */
  const onReceptionScanDone = useCallback(
    (info: { readyCount: number; updatedCount: number }) => {
      if (info.readyCount <= 0 && info.updatedCount <= 0) return;
      setStatusFilter("RECEPTION_COMPLETED");
      setSearchQuery("");
      setActiveWarehouse("TECS-TCS");
    },
    []
  );

  const tcsPortal = useTcsPortalActions({
    sessionYmd: selectedYmd,
    rows: viewRows,
    customerDirectory: state?.customers ?? [],
    onMarkReceptionCompleted,
    onReceptionScanDone,
    active: isTcsWarehouse(activeWarehouse),
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

  const totalPcs = filteredViewRows.reduce((s, r) => s + (r.pcs ?? 0), 0);
  const totalKg = filteredViewRows.reduce((s, r) => s + (r.kg ?? 0), 0);

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

  const selected = filteredViewRows.find((r) => r.id === selectedId) ?? null;

  if (status === "loading" || !state) {
    return <PageSkeleton variant="ops" />;
  }

  const onCopyCargoDayReport = useCallback(async () => {
    setCargoReportCopying(true);
    try {
      const model = buildCargoDayReport(viewRows, selectedYmd);
      const result = await copyCargoDayReportImage(model);
      if (!result.ok) {
        toast.error(result.reason, "Báo cáo hàng hóa");
        return;
      }
      if (result.mode === "clipboard") {
        toast.success(
          `Đã copy ảnh ${model.totalLots} lô — dán vào group chat.`,
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
  }, [selectedYmd, toast, viewRows]);

  const toolsProps = {
    showDimScsc: isScscWarehouse(activeWarehouse),
    excelExporting,
    scscDimExporting,
    cargoReportCopying,
    onNavigateCustomers,
    onPrefetchCustomers,
    onNavigateStats,
    onPrefetchStats,
    onOpenAirlineLabels: () => setAirlineLabelSettingsOpen(true),
    onOpenSheetImport: () => setSheetImportOpen(true),
    onDownloadDayExcel: () => setExcelRangeOpen(true),
    onDownloadScscDim: () => void onDownloadScscDimDay(),
    onCopyCargoDayReport: () => void onCopyCargoDayReport(),
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
      {...toolsProps}
      tcsPortalBar={
        isTcsWarehouse(activeWarehouse) ? <TcsPortalInlineBar compact tcs={tcsPortal} /> : null
      }
      filteredViewRows={filteredViewRows}
      viewRows={viewRows}
      onWarehouseChange={handleActiveWarehouseChange}
      searchHighlightWarehouses={searchHighlightWarehouses}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      statusFilteredRows={statusFilteredRows}
      searchContext={searchContext}
      searchInputRef={searchInputRef}
      onSelectSearchMatch={scrollToShipmentMatch}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      onClearFilters={clearViewFilters}
    />
  ) : (
    <header className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className="m-0 leading-none">
            <Wordmark size="md" />
          </h1>
          <span className="rounded-md bg-ui-surface px-2 py-0.5 text-[11px] font-semibold text-ui-text-muted ring-1 ring-ui-border">
            OPS
          </span>
          <span className="text-[11px] text-ui-text-muted">
            <span className="font-bold text-ui-text">{workDateLabel}</span>
            {daysWithData > 0 ? (
              <span>
                {" "}
                · {allRows.length} lô / {daysWithData} ngày
              </span>
            ) : null}
          </span>
          {!isViewingToday ? (
            <span
              className="rounded-md bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-950"
              title="Vẫn sửa / thêm lô được"
            >
              Ngày khác
            </span>
          ) : null}
        </div>
        <SyncStatusPill status={status} socketConnected={socketConnected} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          className="border-transparent bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400"
          disabled={cargoReportCopying || viewRows.length === 0}
          title="Coppy Ảnh bảng hàng hóa ngày phiên (dán group chat)"
          onClick={() => void onCopyCargoDayReport()}
        >
          {cargoReportCopying ? "…" : "Coppy Ảnh"}
        </Button>
        <OpsToolsMenu {...toolsProps} />
        <div className="min-w-0 flex-1 md:max-w-sm md:flex-none">
          <OpsDatePicker
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
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:pt-0.5">
              <KpiStat label="Lô" value={filteredViewRows.length} />
              <KpiStat label="Kiện" value={totalPcs} />
              <KpiStat label="Kg" value={formatKgTotal(totalKg)} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SmartSearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                searchableRows={statusFilteredRows}
                matchedRows={filteredViewRows}
                searchContext={searchContext}
                inputRef={searchInputRef}
                onSelectMatch={scrollToShipmentMatch}
              />
              {isTcsWarehouse(activeWarehouse) ? <TcsPortalInlineBar tcs={tcsPortal} /> : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <StatusFilterBar
              compact
              warehouse={activeWarehouse}
              dayRows={viewRows}
              value={statusFilter}
              onChange={setStatusFilter}
            />
            {statusFilter !== "ALL" || searchQuery.trim() ? (
              <button
                type="button"
                onClick={clearViewFilters}
                className="shrink-0 self-start rounded-full px-3 py-1 text-[10px] font-semibold text-ui-primary hover:bg-ui-primary/10 lg:ml-auto lg:self-center"
              >
                Xóa lọc
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );

  return (
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

      <DesktopShipmentTable
        rows={filteredViewRows}
        activeWarehouse={activeWarehouse}
        onWarehouseChange={handleActiveWarehouseChange}
        highlightedId={highlightedShipmentId}
        selectedId={selectedId}
        onSelectId={setSelectedId}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onOpenMobileEdit={openMobileEdit}
        onPrint={requestPrintLabel}
        status={status}
      />

      {isMobile && filteredViewRows.length > 0 ? (
        <>
          <MobileShipmentCards
            rows={filteredViewRows}
            activeWarehouse={activeWarehouse}
            onWarehouseChange={handleActiveWarehouseChange}
            highlightedId={highlightedShipmentId}
            selectedId={selectedId}
            onSelectId={setSelectedId}
            onOpenEdit={openMobileEdit}
            onPrint={requestPrintLabel}
            status={status}
          />
          <StickyMobileActions
            selectedId={selectedId}
            shipment={selected}
            onOpenEdit={openMobileEdit}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onPrint={requestPrintLabel}
          />
        </>
      ) : null}

      <Suspense fallback={null}>
        <GoogleSheetImportModal
          open={sheetImportOpen}
          onClose={() => setSheetImportOpen(false)}
          onImported={() => {
            setSheetImportOpen(false);
            void refreshState();
          }}
        />
        <AirlineLabelSettingsModal
          open={airlineLabelSettingsOpen}
          onClose={() => setAirlineLabelSettingsOpen(false)}
          initialValue={state?.airlineLabelOverrides}
          loading={airlineLabelSaving}
          onSave={saveAirlineLabelOverrides}
        />
        <DayExcelExportDialog
          open={excelRangeOpen}
          onClose={() => setExcelRangeOpen(false)}
          onExport={onDownloadDayExcelRange}
          disabled={excelExporting}
        />
      </Suspense>
    </AppShell>
    </TcsPortalActionsProvider>
  );
}

