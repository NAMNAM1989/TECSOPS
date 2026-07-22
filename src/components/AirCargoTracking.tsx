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
import { fetchAppStateSnapshot } from "../utils/fetchAppStateRows";
import { filterShipmentsBySessionYmd } from "../utils/filterShipmentsBySessionYmd";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";
import { SmartSearchBar } from "./SmartSearchBar";
import { TcsPortalInlineBar } from "./TcsPortalInlineBar";
import { TcsPortalActionsProvider } from "./TcsPortalActionsContext";
import { useTcsPortalActions } from "../hooks/useTcsPortalActions";
import { WAREHOUSE_ORDER, isScscWarehouse, isTcsWarehouse } from "../constants/warehouses";
import { NewBookingButton } from "./NewBookingButton";
import { DashboardToolbarButton } from "./DashboardToolbarButton";
import { OpsDatePicker } from "./OpsDatePicker";
import { OpsMobileStickyHeader } from "./OpsMobileStickyHeader";
import { firstWarehouseWithLots } from "../utils/warehouseMetrics";
import { blankShipmentDraft } from "../utils/blankShipment";
import { focusShipmentGridCell } from "../utils/focusShipmentGrid";
import { debugError } from "../utils/debugLog";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  countShipmentsByWarehouse,
  shipmentMatchesSearchQuery,
  type ShipmentSearchContext,
  type ShipmentSearchMatch,
} from "../utils/shipmentSearch";
import { syncBookGoogleSheet } from "../utils/googleSheetBookApi";
import type { SheetBookSyncResult } from "../types/googleSheetBook";

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
  onRequestPrint,
}: AirCargoTrackingProps) {
  const { status, state, mutate, socketConnected, refreshState, applyRemoteState } = sync;

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
  const [sheetImportOpen, setSheetImportOpen] = useState(false);
  const sheetSyncPrefetchRef = useRef<{ sessionYmd: string; promise: Promise<SheetBookSyncResult> } | null>(
    null
  );
  const [airlineLabelSettingsOpen, setAirlineLabelSettingsOpen] = useState(false);
  const [airlineLabelSaving, setAirlineLabelSaving] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const selectedYmd = formatLocalSessionDate(selectedViewDate);
  const todayYmd = formatLocalSessionDate(startOfLocalDay(new Date()));
  const isViewingToday = selectedYmd === todayYmd;

  const prefetchSheetImport = useCallback(() => {
    if (sheetSyncPrefetchRef.current?.sessionYmd === selectedYmd) return;
    sheetSyncPrefetchRef.current = {
      sessionYmd: selectedYmd,
      promise: syncBookGoogleSheet(selectedYmd).catch((e) => {
        if (sheetSyncPrefetchRef.current?.sessionYmd === selectedYmd) {
          sheetSyncPrefetchRef.current = null;
        }
        throw e;
      }),
    };
  }, [selectedYmd]);

  useEffect(() => {
    sheetSyncPrefetchRef.current = null;
  }, [selectedYmd]);

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
      return firstWarehouseWithLots(filteredViewRows);
    });
  }, [filteredViewRows]);

  const handleActiveWarehouseChange = useCallback(
    (wh: Warehouse) => {
      setActiveWarehouse(wh);
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
        window.alert(e instanceof Error ? e.message : "Không gửi được thay đổi lên máy chủ.");
        return null;
      }
    },
    [mutate]
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
    [onRequestPrint, state?.airlineLabelOverrides]
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

  const onDownloadDayExcel = useCallback(async () => {
    setExcelExporting(true);
    try {
      let rowsForExport = filterShipmentsBySessionYmd(allRows, selectedYmd);
      let customersForExport = state?.customers ?? [];
      const snap = await fetchAppStateSnapshot();
      if (snap) {
        rowsForExport = filterShipmentsBySessionYmd(snap.rows, selectedYmd);
        customersForExport = snap.customers;
      }
      await downloadDayReportExcel(rowsForExport, selectedYmd, customersForExport);
    } catch (e) {
      debugError("ui:excel-day", e);
      window.alert(e instanceof Error ? e.message : "Không tạo được file Excel.");
    } finally {
      setExcelExporting(false);
    }
  }, [allRows, selectedYmd, state]);

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
      window.alert(e instanceof Error ? e.message : "Không tạo được file DIM SCSC.");
    } finally {
      setScscDimExporting(false);
    }
  }, [allRows, selectedYmd]);

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
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-16 text-center text-apple-secondary">
        <p className="font-semibold text-apple-label">Đang tải dữ liệu…</p>
      </div>
    );
  }

  return (
    <TcsPortalActionsProvider value={tcsPortal}>
    <div className="mx-auto max-w-[1600px] px-3 py-2 sm:px-4 sm:py-3 lg:px-6">
      <div className="sticky top-0 z-40 -mx-3 mb-1.5 border-b border-slate-200/70 bg-[#E8EEF4]/85 px-3 pb-1 pt-1 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#070B14]/85 sm:-mx-4 sm:mb-3 sm:px-4 sm:pb-2.5 sm:pt-2.5 lg:-mx-6 lg:px-6">
      {isMobile ? (
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
          onPrefetchSheetImport={prefetchSheetImport}
          tcsPortalBar={
            isTcsWarehouse(activeWarehouse) ? (
              <TcsPortalInlineBar
                compact
                tcs={tcsPortal}
              />
            ) : null
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
        <>
      <header className="mb-2 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h1 className="text-xl font-extrabold tracking-tight text-dashboard-primary dark:text-dashboard-primary-dark sm:text-2xl">
              TECS<span className="text-teal-600 dark:text-teal-400">OPS</span>
            </h1>
            <span className="hidden text-[11px] font-medium text-dashboard-muted dark:text-dashboard-muted-dark sm:inline">
              Air cargo handling
            </span>
            <span className="text-[11px] text-dashboard-muted dark:text-dashboard-muted-dark">
              <span className="font-bold text-dashboard-primary dark:text-dashboard-primary-dark">{workDateLabel}</span>
              {daysWithData > 0 && (
                <span className="text-apple-tertiary">
                  {" "}
                  · {allRows.length} lô / {daysWithData} ngày
                </span>
              )}
            </span>
            {!isViewingToday && (
              <span
                className="rounded-md bg-amber-100/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-950"
                title="Vẫn sửa / thêm lô được"
              >
                Ngày khác
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <SyncBadge status={status} socketConnected={socketConnected} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            <NewBookingButton
              activeWarehouse={activeWarehouse}
              onAdd={(wh) => void addBlankRowForWarehouse(wh)}
            />
            <DashboardToolbarButton
              onClick={onNavigateCustomers}
              onMouseEnter={onPrefetchCustomers}
              onFocus={onPrefetchCustomers}
              title="Danh bạ khách, hồ sơ in"
            >
              Khách
            </DashboardToolbarButton>
            <DashboardToolbarButton onClick={() => setAirlineLabelSettingsOpen(true)} title="Tên hãng in trên tem nhãn">
              Tên hãng
            </DashboardToolbarButton>
            <DashboardToolbarButton
              onPointerDown={prefetchSheetImport}
              onMouseEnter={prefetchSheetImport}
              onFocus={prefetchSheetImport}
              onClick={() => setSheetImportOpen(true)}
              title="Nhập lô từ Google Sheet BOOK HẰNG NGÀY"
            >
              <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 7.5h9M12 3v9" />
              </svg>
              Sheet
            </DashboardToolbarButton>
            <DashboardToolbarButton
              disabled={excelExporting}
              onClick={() => void onDownloadDayExcel()}
              title="Xuất Excel ngày (mẫu Import Shipments)"
            >
              <svg className="h-3.5 w-3.5 text-apple-blue" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Excel
            </DashboardToolbarButton>
            {isScscWarehouse(activeWarehouse) ? (
              <DashboardToolbarButton
                disabled={scscDimExporting}
                onClick={() => void onDownloadScscDimDay()}
                title="Xuất LIST DIM SCSC (mọi lô đã nhập chi tiết DIM trong ngày)"
              >
                <svg className="h-3.5 w-3.5 text-violet-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10M8 7v10" />
                </svg>
                {scscDimExporting ? "DIM…" : "DIM SCSC"}
              </DashboardToolbarButton>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
            <div className="min-w-0 flex-1">
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
        </div>
      </header>

      {viewRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:pt-1.5">
              <StatInline label="Lô" value={filteredViewRows.length} />
              <StatInline label="Kiện" value={totalPcs} />
              <StatInline label="Kg" value={totalKg.toLocaleString()} />
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
              {isTcsWarehouse(activeWarehouse) ? (
                <TcsPortalInlineBar
                  tcs={tcsPortal}
                />
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <StatusFilterBar compact dayRows={viewRows} value={statusFilter} onChange={setStatusFilter} />
            {(statusFilter !== "ALL" || searchQuery.trim()) && (
              <button
                type="button"
                onClick={clearViewFilters}
                className="shrink-0 self-start rounded-full px-3 py-1 text-[10px] font-semibold text-apple-blue hover:bg-apple-blue/10 lg:ml-auto lg:self-center"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>
      )}
        </>
      )}
      </div>

      {viewRows.length > 0 && filteredViewRows.length === 0 && (
        <p className="mb-2 text-center text-xs text-apple-secondary">
          Không có lô khớp bộ lọc.{" "}
          <button type="button" onClick={clearViewFilters} className="font-semibold text-apple-blue hover:underline">
            Xóa lọc
          </button>
        </p>
      )}

      <DesktopShipmentTable
        rows={filteredViewRows}
        allRows={allRows}
        customerDirectory={state.customers}
        activeWarehouse={activeWarehouse}
        onActiveWarehouseChange={handleActiveWarehouseChange}
        metricRows={filteredViewRows}
        searchHighlightWarehouses={searchHighlightWarehouses}
        highlightedShipmentId={highlightedShipmentId}
        selectedRowId={selectedId}
        onSelectRow={setSelectedId}
        onAddBlankRow={(wh) => void addBlankRowForWarehouse(wh)}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onPrint={requestPrintLabel}
        viewSessionYmd={selectedYmd}
      />

      <MobileShipmentCards
        rows={filteredViewRows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpdate={onUpdate}
        onDelete={onDelete}
        customerDirectory={state.customers}
        activeWarehouse={activeWarehouse}
        searchActive={searchActive}
        pinnedOpenWarehouses={searchHighlightWarehouses}
        highlightedShipmentId={highlightedShipmentId}
        viewSessionYmd={selectedYmd}
        onAddBlankRow={(wh) => void addBlankRowForWarehouse(wh)}
        onQuickEdit={(row) => openMobileEdit(row)}
      />

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
        customerDirectory={state.customers}
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
            value={state.airlineLabelOverrides}
            saving={airlineLabelSaving}
            onSave={saveAirlineLabelOverrides}
          />
        ) : null}
        {sheetImportOpen ? (
          <GoogleSheetImportModal
            open={sheetImportOpen}
            sessionYmd={selectedYmd}
            sheetSyncPrefetchRef={sheetSyncPrefetchRef}
            onClose={() => setSheetImportOpen(false)}
            onApplied={(count, serverState) => {
              if (serverState) {
                if (!applyRemoteState(serverState, { force: true })) void refreshState();
              } else if (count > 0) {
                void refreshState();
              }
              if (count > 0) {
                window.alert(`Đã nhập ${count} lô từ Google Sheet.`);
              }
              setSheetImportOpen(false);
            }}
          />
        ) : null}
      </Suspense>
    </div>
    </TcsPortalActionsProvider>
  );
}

function SyncBadge({
  status,
  socketConnected,
}: {
  status: "live" | "degraded" | "offline";
  socketConnected: boolean;
}) {
  if (status === "offline") {
    return (
      <span
        className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-semibold text-apple-secondary"
        title="Không kết nối máy chủ — dữ liệu chỉ lưu trên trình duyệt này"
      >
        Chỉ máy này
      </span>
    );
  }
  if (status === "degraded" || !socketConnected) {
    return (
      <span
        className="rounded-full bg-amber-100/90 px-2 py-0.5 text-[10px] font-semibold text-amber-950 ring-1 ring-amber-200/80"
        title="Máy chủ OK nhưng kênh realtime đang ngắt — thay đổi vẫn gửi được; F5 nếu không thấy cập nhật từ người khác"
      >
        Đồng bộ hạn chế
      </span>
    );
  }
  return (
    <span
      className="rounded-full bg-emerald-100/90 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-200/80"
      title="Đang nhận cập nhật tức thì từ các máy khác"
    >
      Realtime
    </span>
  );
}

function StatInline({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex min-w-[3.5rem] flex-col items-center rounded-xl border border-black/[0.06] bg-white/95 px-2.5 py-1 shadow-dashboard-card dark:border-white/[0.08] dark:bg-dashboard-surface-dark/95">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-dashboard-muted dark:text-dashboard-muted-dark">
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums leading-tight text-dashboard-primary dark:text-dashboard-primary-dark">
        {value}
      </span>
    </span>
  );
}
