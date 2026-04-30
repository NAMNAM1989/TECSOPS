import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ShipmentBookingForm } from "./ShipmentBookingForm";
import { CustomerDirectoryModal } from "./CustomerDirectoryModal";
import { downloadDayReportExcel } from "../utils/exportDayReportExcel";
import { fetchAppStateSnapshot } from "../utils/fetchAppStateRows";
import { filterShipmentsBySessionYmd } from "../utils/filterShipmentsBySessionYmd";
import { printDimReport } from "../utils/printDimReport";
import { downloadScscDimListExcel } from "../utils/exportScscDimListExcel";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";
import { blankShipmentDraft } from "../utils/blankShipment";
import { focusShipmentGridCell } from "../utils/focusShipmentGrid";

interface AirCargoTrackingProps {
  onRequestPrint: (s: Shipment) => void;
}

type WarehouseFilterValue = Warehouse | "ALL";

const WAREHOUSE_FILTER_OPTIONS: { value: WarehouseFilterValue; label: string }[] = [
  { value: "ALL", label: "Tất cả kho" },
  { value: "TECS-TCS", label: "TECS-TCS" },
  { value: "TECS-SCSC", label: "TECS-SCSC" },
  { value: "KHO-TCS", label: "KHO TCS" },
  { value: "KHO-SCSC", label: "KHO SCSC" },
];

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

  const { status, state, mutate, socketConnected } = useShipmentSync(fallback);
  const [selectedViewDate, setSelectedViewDate] = useState(() => startOfLocalDay(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("ALL");
  const [warehouseFilter, setWarehouseFilter] = useState<WarehouseFilterValue>("ALL");
  const [customerFilter, setCustomerFilter] = useState("");
  const [excelExporting, setExcelExporting] = useState(false);
  const [customerDirOpen, setCustomerDirOpen] = useState(false);

  const selectedYmd = formatLocalSessionDate(selectedViewDate);
  const todayYmd = formatLocalSessionDate(startOfLocalDay(new Date()));
  const isViewingToday = selectedYmd === todayYmd;

  const allRows = state?.rows ?? [];
  const viewRows = useMemo(
    () => filterShipmentsBySessionYmd(allRows, selectedYmd),
    [allRows, selectedYmd]
  );

  const filteredViewRows = useMemo(() => {
    const customerNeedle = customerFilter.trim().toLowerCase();
    return viewRows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== (statusFilter as ShipmentStatus)) return false;
      if (warehouseFilter !== "ALL" && r.warehouse !== warehouseFilter) return false;
      if (!customerNeedle) return true;
      return (
        r.customer.trim().toLowerCase().includes(customerNeedle) ||
        r.customerCode.trim().toLowerCase().includes(customerNeedle)
      );
    });
  }, [viewRows, statusFilter, warehouseFilter, customerFilter]);

  useEffect(() => {
    setStatusFilter("ALL");
    setWarehouseFilter("ALL");
    setCustomerFilter("");
  }, [selectedYmd]);

  const clearViewFilters = useCallback(() => {
    setStatusFilter("ALL");
    setWarehouseFilter("ALL");
    setCustomerFilter("");
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
        console.error(e);
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
      setEditingShipment(null);
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
      console.error(e);
      window.alert(e instanceof Error ? e.message : "Không tạo được file Excel.");
    } finally {
      setExcelExporting(false);
    }
  }, [allRows, selectedYmd, state]);

  const openEdit = useCallback((s: Shipment) => {
    setShowForm(false);
    setSelectedId(null);
    setEditingShipment(s);
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
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-apple-label sm:text-[1.75rem] sm:leading-tight">
              Hàng lên sân bay
            </h1>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-apple-secondary">
              Bảng theo ngày — chọn ngày để xem hoặc nhập. Mỗi ngày một phiên; dữ liệu các ngày trước vẫn được lưu.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCustomerDirOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3.5 py-2 text-xs font-semibold text-apple-label shadow-apple transition-colors hover:bg-black/[0.03]"
                title="Quản lý mã và tên khách hàng (lưu trên máy chủ)"
              >
                Danh sách khách hàng
              </button>
              <button
                type="button"
                disabled={excelExporting}
                onClick={() => void onDownloadDayExcel()}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3.5 py-2 text-xs font-semibold text-apple-label shadow-apple transition-colors hover:bg-black/[0.03] disabled:cursor-wait disabled:opacity-60"
                title="Download day report — all warehouses (Excel)"
              >
                <svg className="h-4 w-4 shrink-0 text-apple-blue" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                DOWNLOAD EXCEL
              </button>
              <div className="inline-flex items-center gap-0.5 rounded-full border border-black/[0.08] bg-white p-0.5 shadow-apple">
                <button
                  type="button"
                  onClick={goPrevDay}
                  className="rounded-full px-3 py-2 text-sm font-semibold text-apple-label hover:bg-black/[0.05]"
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
                  className="rounded-full border-0 bg-transparent px-2 py-1.5 font-mono text-sm font-semibold text-apple-label focus:outline-none focus:ring-2 focus:ring-apple-blue/25"
                />
                <button
                  type="button"
                  onClick={goNextDay}
                  className="rounded-full px-3 py-2 text-sm font-semibold text-apple-label hover:bg-black/[0.05]"
                  aria-label="Ngày sau"
                >
                  ›
                </button>
              </div>
              <button
                type="button"
                onClick={goToday}
                disabled={isViewingToday}
                className="rounded-full bg-apple-blue px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:bg-apple-tertiary disabled:text-white/80"
              >
                Hôm nay
              </button>
              {!isViewingToday && (
                <span className="rounded-full bg-amber-100/90 px-3 py-1.5 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/80">
                  Đang xem ngày khác — vẫn sửa / thêm lô được
                </span>
              )}
            </div>
            <p className="mt-3 text-sm text-apple-secondary">
              Đang xem{" "}
              <span className="font-semibold text-apple-label">{workDateLabel}</span>
              {daysWithData > 0 && (
                <span className="text-apple-tertiary">
                  {" "}
                  · {allRows.length} lô / {daysWithData} ngày có dữ liệu
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SyncBadge status={status} socketConnected={socketConnected} />
            <StatPill label="Lô" value={filteredViewRows.length} />
            <StatPill label="Kiện" value={totalPcs} />
            <StatPill label="Kg" value={totalKg.toLocaleString()} />
          </div>
        </div>

      </header>

      <StatusFilterBar dayRows={viewRows} value={statusFilter} onChange={setStatusFilter} />

      {viewRows.length > 0 && (
        <div className="mb-6 rounded-2xl border border-black/[0.08] bg-white/90 p-3 shadow-apple backdrop-blur-sm sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-apple-secondary">Lọc kho / khách hàng</p>
            {(warehouseFilter !== "ALL" || customerFilter.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setWarehouseFilter("ALL");
                  setCustomerFilter("");
                }}
                className="rounded-full border border-black/[0.1] bg-black/[0.04] px-2.5 py-1 text-[10px] font-semibold text-apple-label hover:bg-black/[0.07]"
              >
                Xóa lọc kho/khách
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-wrap gap-2">
              {WAREHOUSE_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWarehouseFilter(opt.value)}
                  className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
                    warehouseFilter === opt.value
                      ? "border-apple-blue/40 bg-apple-blue/10 text-apple-label shadow-[0_0_0_2px_rgba(0,122,255,0.18)]"
                      : "border-black/[0.08] bg-white/80 text-apple-secondary hover:border-black/[0.12] hover:bg-black/[0.03]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <label className="relative min-w-0 flex-1 lg:max-w-md">
              <span className="sr-only">Lọc khách hàng</span>
              <input
                type="search"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                placeholder="Lọc khách hàng hoặc mã KH..."
                className="w-full rounded-full border border-black/[0.08] bg-white px-4 py-2.5 pr-10 text-sm font-medium text-apple-label shadow-inner outline-none transition focus:border-apple-blue/40 focus:ring-2 focus:ring-apple-blue/15"
              />
              {customerFilter && (
                <button
                  type="button"
                  onClick={() => setCustomerFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-bold text-apple-tertiary hover:bg-black/[0.05] hover:text-apple-label"
                  aria-label="Xóa lọc khách hàng"
                >
                  ×
                </button>
              )}
            </label>
          </div>
        </div>
      )}

      {viewRows.length === 0 && (
        <div className="mb-8 rounded-apple-lg border border-dashed border-black/[0.12] bg-white/60 px-5 py-12 text-center shadow-apple backdrop-blur-sm">
          <p className="text-[17px] font-semibold text-apple-label">
            {isViewingToday ? "Hôm nay chưa có lô" : "Không có lô cho ngày này"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-apple-secondary">
            {isViewingToday ? (
              <>
                Trên máy tính, bấm <span className="font-semibold text-apple-blue">Nhập booking</span> cạnh tên kho ở
                bảng bên dưới (TECS-TCS, TECS-SCSC, KHO TCS, KHO SCSC); điện thoại dùng nút dưới cùng (form đầy đủ).
              </>
            ) : (
              <>
                Bạn có thể bấm <span className="font-semibold text-apple-blue">Nhập booking</span> cạnh tên kho trên bảng
                (máy tính) cho ngày đang xem, hoặc đổi ngày.
              </>
            )}
          </p>
        </div>
      )}

      {viewRows.length > 0 && filteredViewRows.length === 0 && (
        <div className="mb-8 rounded-apple-lg border border-dashed border-amber-200/80 bg-amber-50/50 px-5 py-10 text-center shadow-apple backdrop-blur-sm">
          <p className="text-[17px] font-semibold text-apple-label">Không có lô nào khớp bộ lọc</p>
          <p className="mt-2 text-sm text-apple-secondary">Thử đổi trạng thái, kho, hoặc nội dung lọc khách hàng.</p>
          <button
            type="button"
            onClick={clearViewFilters}
            className="mt-4 rounded-full bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-apple-blue-hover"
          >
            Xóa tất cả bộ lọc
          </button>
        </div>
      )}

      <DesktopShipmentTable
        rows={filteredViewRows}
        allRows={allRows}
        customerDirectory={state.customers}
        onAddBlankRow={addBlankRowForWarehouse}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onPrint={onRequestPrint}
        onEdit={openEdit}
      />

      <MobileShipmentCards
        rows={filteredViewRows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onPrint={onRequestPrint}
        onEdit={openEdit}
      />

      <StickyMobileActions
        selected={selected}
        onDelete={() => selected && onDelete(selected.id)}
        onPrint={() => selected && onRequestPrint(selected)}
        onAdd={() => {
          setEditingShipment(null);
          setShowForm(true);
        }}
        onEdit={() => selected && openEdit(selected)}
        onPrintDim={() => selected && printDimReport(selected)}
        onDownloadScscDimList={() => selected && downloadScscDimListExcel(selected)}
      />

      {showForm && (
        <ShipmentBookingForm
          sessionDateYmd={selectedYmd}
          allRows={allRows}
          customerDirectory={state.customers}
          onAdd={onAdd}
          onClose={() => setShowForm(false)}
        />
      )}

      {editingShipment && (
        <ShipmentBookingForm
          mode="edit"
          sessionDateYmd={editingShipment.sessionDate}
          allRows={allRows}
          customerDirectory={state.customers}
          shipment={editingShipment}
          onSave={(patch) => onUpdate(editingShipment.id, patch)}
          onClose={() => setEditingShipment(null)}
        />
      )}

      <CustomerDirectoryModal
        open={customerDirOpen}
        initial={state.customers}
        onClose={() => setCustomerDirOpen(false)}
        onSave={async (next) => {
          await mutate({ action: "SET_CUSTOMERS", customers: next });
        }}
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
        className="rounded-full bg-black/[0.06] px-3 py-1.5 text-[11px] font-semibold text-apple-secondary"
        title="Không kết nối máy chủ — dữ liệu chỉ lưu trên trình duyệt này"
      >
        Chỉ máy này
      </span>
    );
  }
  if (status === "degraded" || !socketConnected) {
    return (
      <span
        className="rounded-full bg-amber-100/90 px-3 py-1.5 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/80"
        title="Máy chủ OK nhưng kênh realtime đang ngắt — thay đổi vẫn gửi được; F5 nếu không thấy cập nhật từ người khác"
      >
        Đồng bộ hạn chế
      </span>
    );
  }
  return (
    <span
      className="rounded-full bg-emerald-100/90 px-3 py-1.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/80"
      title="Đang nhận cập nhật tức thì từ các máy khác"
    >
      Realtime
    </span>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/90 px-3 py-2 text-sm shadow-apple backdrop-blur-sm">
      <span className="text-apple-secondary">{label}</span>{" "}
      <span className="font-semibold tabular-nums text-apple-label">{value}</span>
    </div>
  );
}

