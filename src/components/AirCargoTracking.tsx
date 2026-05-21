import { useCallback, useEffect, useMemo, useState, lazy, Suspense, startTransition } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import { initialShipments } from "../data/mockShipments";
import { loadRows } from "../utils/shipmentStorage";
import {
  addLocalDays,
  formatLocalSessionDate,
  parseSessionDateYmd,
  startOfLocalDay,
} from "../utils/sessionDate";
import { useShipmentSync } from "../hooks/useShipmentSync";
import { DesktopShipmentTable } from "./DesktopShipmentTable";
import { MobileShipmentCards, StickyMobileActions } from "./MobileShipmentCards";
import { MobileShipmentEditSheet } from "./MobileShipmentEditSheet";
const ShipmentBookingForm = lazy(() =>
  import("./ShipmentBookingForm").then((m) => ({ default: m.ShipmentBookingForm }))
);
import { CustomerDirectoryManager } from "./CustomerDirectoryManager";
import { downloadDayReportExcel } from "../utils/exportDayReportExcel";
import { fetchAppStateSnapshot } from "../utils/fetchAppStateRows";
import { filterShipmentsBySessionYmd } from "../utils/filterShipmentsBySessionYmd";
import { printDimReport } from "../utils/printDimReport";
import { downloadScscDimListExcel } from "../utils/exportScscDimListExcel";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";
import type { WarehouseLayoutFilter } from "../constants/warehouses";
import { blankShipmentDraft } from "../utils/blankShipment";
import { focusShipmentGridCell } from "../utils/focusShipmentGrid";
import { useEcargoKhoScscRegister } from "../hooks/useEcargoKhoScscRegister";
import { debugError } from "../utils/debugLog";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import { AirlineLabelSettingsModal } from "./AirlineLabelSettingsModal";
import { defaultGlobalAgentCatalog } from "../utils/globalAgentsCore";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import {
  clampScscWeighPrintSettings,
  defaultScscWeighPrintSettings,
} from "../printing/scscWeigh/scscWeighPrintSettingsCore";
import { setScscWeighPrintSettingsCache } from "../printing/scscWeigh/scscWeighPrintSettingsRuntime";
import {
  upsertCustomerVehicleInDirectory,
  type UpsertCustomerVehicleParams,
} from "../utils/customerVehicleCore";

interface AirCargoTrackingProps {
  onRequestPrint: (s: Shipment, airlineLabelOverrides?: AirlineLabelOverrides | null) => void;
}

const WAREHOUSE_FILTER_OPTIONS: { value: WarehouseLayoutFilter; label: string }[] = [
  { value: "ALL", label: "Tất cả kho" },
  { value: "TECS-TCS", label: "TECS-TCS" },
  { value: "TECS-SCSC", label: "TECS-SCSC" },
  { value: "KHO-TCS", label: "KHO TCS" },
  { value: "KHO-SCSC", label: "KHO SCSC" },
];

/** Cache haystack theo id để tránh build lại mỗi lần render. */
const haystackCache = new WeakMap<Shipment, string>();

function shipmentSearchHaystack(r: Shipment): string {
  if (haystackCache.has(r)) return haystackCache.get(r)!;
  const hay = [
    r.awb,
    r.hawb ?? "",
    r.flight,
    r.flightDate,
    r.customer,
    r.customerCode,
    r.dest,
    r.note,
    r.cutoffNote,
    r.status,
    r.warehouse,
    r.cutoff,
    r.pcs != null ? String(r.pcs) : "",
    r.kg != null ? String(r.kg) : "",
    r.dimWeightKg != null ? String(r.dimWeightKg) : "",
  ].map((x) => String(x ?? "").toLowerCase()).join(" ");
  haystackCache.set(r, hay);
  return hay;
}

function shipmentMatchesSearchQuery(r: Shipment, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const hay = shipmentSearchHaystack(r);
  return tokens.every((t) => hay.includes(t));
}

function formatWorkDateLabel(d: Date): string {
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

export function AirCargoTracking({ onRequestPrint }: AirCargoTrackingProps) {
  const fallback = useMemo(() => ({ rows: loadRows() ?? initialShipments }), []);

  const { status, state, mutate, socketConnected, subscribeEcargoJob } = useShipmentSync(fallback);
  const ecargoRegister = useEcargoKhoScscRegister(state, mutate, subscribeEcargoJob);

  const saveCustomerVehicleForEcargo = useCallback(
    async (params: UpsertCustomerVehicleParams) => {
      if (!state) return;
      const next = upsertCustomerVehicleInDirectory(state.customers, params);
      await mutate({ action: "SET_CUSTOMERS", customers: next });
    },
    [mutate, state]
  );
  const [selectedViewDate, setSelectedViewDate] = useState(() => startOfLocalDay(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [mobileEditShipment, setMobileEditShipment] = useState<Shipment | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("ALL");
  const [warehouseFilter, setWarehouseFilter] = useState<WarehouseLayoutFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [excelExporting, setExcelExporting] = useState(false);
  const [customerDirOpen, setCustomerDirOpen] = useState(false);
  const [airlineLabelSettingsOpen, setAirlineLabelSettingsOpen] = useState(false);
  const [airlineLabelSaving, setAirlineLabelSaving] = useState(false);

  const selectedYmd = formatLocalSessionDate(selectedViewDate);
  const todayYmd = formatLocalSessionDate(startOfLocalDay(new Date()));
  const isViewingToday = selectedYmd === todayYmd;

  const allRows = state?.rows ?? [];
  const viewRows = useMemo(
    () => filterShipmentsBySessionYmd(allRows, selectedYmd),
    [allRows, selectedYmd]
  );

  const filteredViewRows = useMemo(() => {
    return viewRows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== (statusFilter as ShipmentStatus)) return false;
      if (warehouseFilter !== "ALL" && r.warehouse !== warehouseFilter) return false;
      return shipmentMatchesSearchQuery(r, searchQuery);
    });
  }, [viewRows, statusFilter, warehouseFilter, searchQuery]);

  useEffect(() => {
    setStatusFilter("ALL");
    setWarehouseFilter("ALL");
    setSearchQuery("");
  }, [selectedYmd]);

  const clearViewFilters = useCallback(() => {
    setStatusFilter("ALL");
    setWarehouseFilter("ALL");
    setSearchQuery("");
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

  const scscWeighPrintSettings = state?.scscWeighPrintSettings ?? defaultScscWeighPrintSettings();

  useEffect(() => {
    if (state?.scscWeighPrintSettings) {
      setScscWeighPrintSettingsCache(state.scscWeighPrintSettings);
    }
  }, [state?.scscWeighPrintSettings]);

  const saveScscWeighPrintSettings = useCallback(
    async (settings: ScscWeighPrintSettings) => {
      const next = clampScscWeighPrintSettings(settings);
      setScscWeighPrintSettingsCache(next);
      await runMutate({ action: "SET_SCSC_WEIGH_PRINT_SETTINGS", settings: next });
    },
    [runMutate]
  );

  const onUpdate = useCallback(
    (id: string, patch: Partial<Shipment>) => {
      void runMutate({ action: "UPDATE", id, patch });
    },
    [runMutate]
  );

  const onDelete = useCallback(
    (id: string) => {
      void runMutate({ action: "DELETE", id });
    },
    [runMutate]
  );

  const onAdd = useCallback(
    (data: Omit<Shipment, "id" | "stt">) => {
      void runMutate({ action: "ADD", shipment: data });
    },
    [runMutate]
  );

  /** Desktop: thêm dòng trống đúng kho (nút đặt cạnh tiêu đề TCS / SCSC). */
  const addBlankRowForWarehouse = useCallback(
    async (warehouse: Warehouse) => {
      setMobileEditShipment(null);
      setShowForm(false);
      setStatusFilter("ALL");
      const prevIds = new Set((state?.rows ?? []).map((r) => r.id));
      const next = await runMutate({
        action: "ADD",
        shipment: blankShipmentDraft(selectedYmd, warehouse),
      });
      const added = next?.rows.find((r) => !prevIds.has(r.id));
      if (added) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => focusShipmentGridCell(added.id, "awb"));
        });
      }
    },
    [state?.rows, selectedYmd, runMutate]
  );

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

  /**
   * Xuất Excel: ưu tiên `GET /api/state` (đủ mọi lô ngày đó, khớp máy chủ), fallback state React khi offline.
   * Thứ tự dòng = thứ tự trong API/state (không sắp theo kho). Không lọc theo trạng thái UI.
   */
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

  const openMobileEdit = useCallback((s: Shipment) => {
    startTransition(() => {
      setShowForm(false);
      setMobileEditShipment(s);
    });
  }, []);

  const selected = filteredViewRows.find((r) => r.id === selectedId) ?? null;

  if (status === "loading" || !state) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-16 text-center text-apple-secondary">
        <p className="font-semibold text-apple-label">Đang tải dữ liệu…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-3 sm:px-4 lg:px-5">
      <header className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h1 className="text-lg font-semibold tracking-tight text-apple-label sm:text-xl">Hàng lên sân bay</h1>
            <span className="text-[11px] text-apple-secondary">
              <span className="font-semibold text-apple-label">{workDateLabel}</span>
              {daysWithData > 0 && (
                <span className="text-apple-tertiary">
                  {" "}
                  · {allRows.length} lô / {daysWithData} ngày
                </span>
              )}
            </span>
            {!isViewingToday && (
              <span
                className="rounded bg-amber-100/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950"
                title="Vẫn sửa / thêm lô được"
              >
                Ngày khác
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <SyncBadge status={status} socketConnected={socketConnected} />
            <StatInline label="Lô" value={filteredViewRows.length} />
            <StatInline label="Kiện" value={totalPcs} />
            <StatInline label="Kg" value={totalKg.toLocaleString()} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCustomerDirOpen(true)}
            className="inline-flex items-center rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-[11px] font-semibold text-apple-label shadow-sm hover:bg-black/[0.03]"
            title="Khách hàng và hồ sơ in"
          >
            Khách hàng
          </button>
          <button
            type="button"
            onClick={() => setAirlineLabelSettingsOpen(true)}
            className="inline-flex items-center rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-[11px] font-semibold text-apple-label shadow-sm hover:bg-black/[0.03]"
            title="Tên hãng trên tem"
          >
            Tên hãng
          </button>
          <button
            type="button"
            disabled={excelExporting}
            onClick={() => void onDownloadDayExcel()}
            className="inline-flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-[11px] font-semibold text-apple-label shadow-sm hover:bg-black/[0.03] disabled:cursor-wait disabled:opacity-60"
            title="Xuất Excel ngày"
          >
            <svg className="h-3.5 w-3.5 text-apple-blue" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Excel
          </button>
          <div className="inline-flex items-center rounded-lg border border-black/[0.08] bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={goPrevDay}
              className="rounded-md px-2 py-1 text-xs font-semibold text-apple-label hover:bg-black/[0.05]"
              aria-label="Ngày trước"
            >
              ‹
            </button>
            <input
              type="date"
              value={selectedYmd}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setSelectedViewDate(startOfLocalDay(parseSessionDateYmd(v)));
              }}
              className="w-[7.25rem] border-0 bg-transparent px-1 py-1 font-mono text-[11px] font-semibold text-apple-label focus:outline-none focus:ring-1 focus:ring-apple-blue/30"
            />
            <button
              type="button"
              onClick={goNextDay}
              className="rounded-md px-2 py-1 text-xs font-semibold text-apple-label hover:bg-black/[0.05]"
              aria-label="Ngày sau"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            disabled={isViewingToday}
            className="rounded-lg bg-apple-blue px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hôm nay
          </button>
        </div>
      </header>

      {viewRows.length > 0 && (
        <div className="mb-2 flex flex-col gap-2 rounded-xl border border-black/[0.08] bg-white/95 px-2 py-2 shadow-sm lg:flex-row lg:items-center">
          <StatusFilterBar compact dayRows={viewRows} value={statusFilter} onChange={setStatusFilter} />
          <div className="flex shrink-0 items-center gap-1.5 lg:w-56 xl:w-64">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm AWB, khách, đích…"
              autoComplete="off"
              spellCheck={false}
              className="h-8 min-w-0 flex-1 rounded-lg border border-black/[0.1] bg-[#f7f8fa] px-2.5 text-[11px] text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue/40 focus:outline-none focus:ring-1 focus:ring-apple-blue/25"
              aria-label="Tìm lô"
            />
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value as WarehouseLayoutFilter)}
              className="h-8 max-w-[7.5rem] shrink-0 rounded-lg border border-black/[0.1] bg-white px-1.5 text-[11px] font-semibold text-apple-label focus:border-apple-blue/40 focus:outline-none focus:ring-1 focus:ring-apple-blue/25"
              aria-label="Lọc kho"
            >
              {WAREHOUSE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {(statusFilter !== "ALL" || warehouseFilter !== "ALL" || searchQuery.trim()) && (
            <button
              type="button"
              onClick={clearViewFilters}
              className="shrink-0 self-start rounded-lg px-2 py-1 text-[10px] font-semibold text-apple-blue hover:bg-apple-blue/10 lg:self-center"
            >
              Xóa lọc
            </button>
          )}
        </div>
      )}

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
        globalAgents={state.globalAgents}
        scscWeighPrintSettings={scscWeighPrintSettings}
        saveScscWeighPrintSettings={saveScscWeighPrintSettings}
        warehouseLayoutFilter={warehouseFilter}
        onAddBlankRow={addBlankRowForWarehouse}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onPrint={requestPrintLabel}
        viewSessionYmd={selectedYmd}
        ecargoMap={ecargoRegister.map}
        onEcargoVehicleChange={ecargoRegister.setVehicle}
        getEcargoSaveStatus={ecargoRegister.getSaveStatus}
        getEcargoJob={ecargoRegister.getJob}
        refreshEcargoJob={ecargoRegister.refreshJob}
        onEcargoAutoRegister={(row, opts) => ecargoRegister.autoRegister(row, selectedYmd, opts)}
        onSaveCustomerVehicleForEcargo={saveCustomerVehicleForEcargo}
        isEcargoAutoRegistering={ecargoRegister.isAutoRegistering}
      />

      <MobileShipmentCards
        rows={filteredViewRows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpdate={onUpdate}
        onDelete={onDelete}
        customerDirectory={state.customers}
        warehouseLayoutFilter={warehouseFilter}
        viewSessionYmd={selectedYmd}
        ecargoMap={ecargoRegister.map}
        onEcargoVehicleChange={ecargoRegister.setVehicle}
        getEcargoSaveStatus={ecargoRegister.getSaveStatus}
        getEcargoJob={ecargoRegister.getJob}
        refreshEcargoJob={ecargoRegister.refreshJob}
        onEcargoAutoRegister={(row, opts) => ecargoRegister.autoRegister(row, selectedYmd, opts)}
        onSaveCustomerVehicleForEcargo={saveCustomerVehicleForEcargo}
        isEcargoAutoRegistering={ecargoRegister.isAutoRegistering}
      />

      <StickyMobileActions
        selected={selected}
        onDelete={() => selected && onDelete(selected.id)}
        onAdd={() => {
          startTransition(() => {
            setMobileEditShipment(null);
            setShowForm(true);
          });
        }}
        onQuickEdit={() => selected && openMobileEdit(selected)}
        onPrintDim={() => selected && printDimReport(selected)}
        onDownloadScscDimList={() => selected && downloadScscDimListExcel(selected)}
      />

      {showForm && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
              <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-apple-label shadow-apple-md">
                Đang mở form booking…
              </p>
            </div>
          }
        >
          <ShipmentBookingForm
            sessionDateYmd={selectedYmd}
            allRows={allRows}
            customerDirectory={state.customers}
            globalAgents={state.globalAgents ?? defaultGlobalAgentCatalog()}
            onAdd={onAdd}
            onClose={() => setShowForm(false)}
          />
        </Suspense>
      )}

      <MobileShipmentEditSheet
        open={mobileEditShipment != null}
        shipment={mobileEditShipment}
        sessionDateYmd={selectedYmd}
        customerDirectory={state.customers}
        globalAgents={state.globalAgents}
        ecargoMap={ecargoRegister.map}
        onEcargoVehicleChange={ecargoRegister.setVehicle}
        getEcargoSaveStatus={ecargoRegister.getSaveStatus}
        getEcargoJob={ecargoRegister.getJob}
        refreshEcargoJob={ecargoRegister.refreshJob}
        onEcargoAutoRegister={(row, opts) => ecargoRegister.autoRegister(row, selectedYmd, opts)}
        onSaveCustomerVehicleForEcargo={saveCustomerVehicleForEcargo}
        isEcargoAutoRegistering={ecargoRegister.isAutoRegistering}
        onClose={() => setMobileEditShipment(null)}
        onSave={(patch) => {
          if (mobileEditShipment) onUpdate(mobileEditShipment.id, patch);
          setMobileEditShipment(null);
        }}
      />

      <CustomerDirectoryManager
        open={customerDirOpen}
        initial={state.customers}
        globalAgentsInitial={state.globalAgents ?? defaultGlobalAgentCatalog()}
        scscWeighPrintSettingsInitial={
          state.scscWeighPrintSettings ?? defaultScscWeighPrintSettings()
        }
        onClose={() => setCustomerDirOpen(false)}
        onSave={async (payload) => {
          await mutate({ action: "SET_GLOBAL_AGENTS", catalog: payload.globalAgents });
          await mutate({ action: "SET_CUSTOMERS", customers: payload.customers });
          if (payload.scscWeighPrintSettings) {
            await mutate({
              action: "SET_SCSC_WEIGH_PRINT_SETTINGS",
              settings: payload.scscWeighPrintSettings,
            });
          }
        }}
      />

      <AirlineLabelSettingsModal
        open={airlineLabelSettingsOpen}
        onClose={() => setAirlineLabelSettingsOpen(false)}
        value={state.airlineLabelOverrides}
        saving={airlineLabelSaving}
        onSave={saveAirlineLabelOverrides}
      />
    </div>
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
    <span className="text-apple-secondary">
      {label}{" "}
      <span className="font-semibold tabular-nums text-apple-label">{value}</span>
    </span>
  );
}

