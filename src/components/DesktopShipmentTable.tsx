import { useEffect, useMemo, useState } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { StatusSelect } from "./StatusBadge";
import { WarehouseGridPicker } from "./WarehouseGridPicker";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { InlineTextEdit } from "./InlineTextEdit";
import { InlineCustomerEdit } from "./InlineCustomerEdit";
import { formatYmdToFlightDateDdMon, parseBookingDateLoose } from "../utils/bookingDateParse";
import { focusShipmentGridCell } from "../utils/focusShipmentGrid";
import { InlineAwbEdit } from "./InlineAwbEdit";
import { MobileDimKgModal } from "./MobileDimKgModal";
import { statusRowAccent, statusRowBg, statusRowSelected, flightNumberAccent } from "./statusStyles";
import { ShipmentRowActionsMenu } from "./ShipmentRowActionsMenu";
import {
  SCSC_GOODS_DESCRIPTION_PRINT_MAX,
  SCSC_OTHER_REQUIREMENTS_PRINT_MAX,
} from "../utils/scscPrintContent";
import {
  isScscWarehouse,
  warehouseLabel,
} from "../constants/warehouses";
import { formatShipmentDimWeightKg } from "../utils/volumetricDim";
import type { EcargoKhoScscPersistedMap } from "../utils/ecargoRegisterLocalStorage";
import type { EcargoSaveStatus } from "../hooks/useEcargoKhoScscRegister";
import type { EcargoJobRecord } from "../types/ecargoJob";
import {
  ECARGO_VEHICLE_MIN,
  EcargoKhoScscCenterModal,
  EcargoKhoScscTriggerButton,
} from "./EcargoKhoScscModal";
import { EcargoRowNotice } from "./EcargoRowNotice";
import { isEcargoJobRunning, isEcargoJobTerminal } from "../types/ecargoJob";
import { findCustomerEntry } from "../utils/mapBookingToScaleTicketFormData";
import { buildShipmentPatchForSavedConsignee } from "../utils/customerConsigneeShipmentPatch";
import type { UpsertCustomerVehicleParams } from "../utils/customerVehicleCore";
import { resolveEcargoVehiclePrefill, vehicleDisplayLabel } from "../utils/customerVehicleCore";
import { InlineCneeCell } from "./InlineCneeCell";

import type { EcargoVehicleType } from "../utils/ecargoWarehousePlan";

export type EcargoAutoRegisterOpts = {
  driverName?: string;
  driverId?: string;
  saveAsDefault?: boolean;
  arrivalDate?: string;
  arrivalTimeSlot?: string;
  vehicleType?: EcargoVehicleType;
};

interface Props {
  rows: Shipment[];
  /** Toàn bộ lô (kiểm tra trùng AWB khi sửa inline). */
  allRows: Shipment[];
  /** Danh bạ khách — dùng để đồng bộ mã khi sửa tên ô lưới. */
  customerDirectory?: readonly CustomerDirectoryEntry[];
  globalAgents?: import("../types/globalAgents").GlobalAgentCatalog;
  scscWeighPrintSettings?: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings;
  saveScscWeighPrintSettings?: (
    settings: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings
  ) => void | Promise<void>;
  /**
   * Kho đang active — chỉ render bảng chi tiết cho kho này.
   */
  activeWarehouse: Warehouse;
  onActiveWarehouseChange: (wh: Warehouse) => void;
  /** Lô dùng tính metric trên thẻ kho (trước lọc kho / sau lọc trạng thái). */
  metricRows: Shipment[];
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  /** Ngày phiên đang xem (YYYY-MM-DD) — parse ngày bay eCargo theo năm trên OPS. */
  viewSessionYmd: string;
  ecargoMap: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange: (id: string, raw: string) => void;
  onEcargoDriverChange?: (id: string, driverName: string, driverId: string) => void;
  onEcargoWarehouseChange?: (id: string, arrivalDate: string, arrivalTimeSlot: string) => void;
  onEcargoVehicleTypeChange?: (id: string, vehicleType: string) => void;
  onApplyEcargoPrefill?: (row: Shipment) => void;
  getEcargoSaveStatus: (id: string) => EcargoSaveStatus;
  getEcargoJob: (id: string) => EcargoJobRecord | undefined;
  refreshEcargoJob: (id: string) => void | Promise<void>;
  onEcargoAutoRegister: (row: Shipment, opts?: EcargoAutoRegisterOpts) => void | Promise<void>;
  onSaveCustomerVehicleForEcargo?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  isEcargoAutoRegistering: (id: string) => boolean;
  /** Mở panel eCargo từ toast «Xem QR». */
  openEcargoRequestId?: string | null;
  onEcargoRequestHandled?: () => void;
  /** Kho có kết quả tìm kiếm — highlight trên grid. */
  searchHighlightWarehouses?: readonly Warehouse[];
  /** Nhấp kết quả tìm kiếm — nháy dòng tương ứng. */
  highlightedShipmentId?: string | null;
  selectedRowId?: string | null;
  onSelectRow?: (id: string | null) => void;
  onAddBlankRow?: (warehouse: Warehouse) => void;
}

const COL_HEADERS = [
  { key: "stt", label: "#", w: "w-8" },
  { key: "awb", label: "AWB / HAWB", w: "min-w-[9rem]" },
  { key: "flight", label: "CHUYẾN", w: "min-w-[5.5rem]" },
  { key: "dest", label: "DST", w: "w-12" },
  { key: "pcs", label: "KIỆN", w: "w-12 text-right" },
  { key: "kg", label: "KG", w: "w-12 text-right" },
  { key: "dim", label: "DIM", w: "w-14 text-right" },
  { key: "customer", label: "KHÁCH", w: "min-w-[4.75rem] max-w-[7rem]" },
  { key: "cnee", label: "CNEE", w: "min-w-[4.5rem] max-w-[8.5rem]" },
  { key: "note", label: "TÊN HÀNG", w: "min-w-[4.5rem] max-w-[7.5rem]" },
  { key: "status", label: "TT", w: "min-w-[7rem]" },
  { key: "actions", label: "", w: "min-w-[5.5rem]" },
] as const;

export function DesktopShipmentTable({
  rows,
  allRows,
  customerDirectory = [],
  globalAgents,
  scscWeighPrintSettings,
  saveScscWeighPrintSettings,
  activeWarehouse,
  onActiveWarehouseChange,
  metricRows,
  onUpdate,
  onDelete,
  onPrint,
  viewSessionYmd,
  ecargoMap,
  onEcargoVehicleChange,
  onEcargoDriverChange,
  onEcargoWarehouseChange,
  onEcargoVehicleTypeChange,
  onApplyEcargoPrefill,
  getEcargoSaveStatus,
  getEcargoJob,
  refreshEcargoJob,
  onEcargoAutoRegister,
  onSaveCustomerVehicleForEcargo,
  isEcargoAutoRegistering,
  openEcargoRequestId = null,
  onEcargoRequestHandled,
  searchHighlightWarehouses = [],
  highlightedShipmentId = null,
  selectedRowId = null,
  onSelectRow,
  onAddBlankRow,
}: Props) {
  const [dimModalRow, setDimModalRow] = useState<Shipment | null>(null);
  const group = useMemo(
    () => rows.filter((r) => r.warehouse === activeWarehouse),
    [rows, activeWarehouse]
  );

  return (
    <>
    <div className="hidden md:block space-y-4">
      <WarehouseGridPicker
        rows={metricRows}
        active={activeWarehouse}
        onSelect={onActiveWarehouseChange}
        onAddRow={onAddBlankRow}
        highlightWarehouses={searchHighlightWarehouses}
      />

      <section
        id={`warehouse-section-${activeWarehouse}`}
        className="overflow-hidden rounded-2xl bg-white shadow-dashboard-card transition-opacity duration-200 dark:bg-dashboard-surface-dark"
      >
        <div className="flex items-center justify-between gap-2 border-b border-black/[0.04] px-3 py-2 dark:border-white/[0.06]">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-dashboard-primary dark:text-dashboard-primary-dark">
              {warehouseLabel[activeWarehouse]}
            </h2>
            <p className="text-[10px] text-dashboard-muted dark:text-dashboard-muted-dark">
              {group.length} lô · cuộn để xem thêm
            </p>
          </div>
          {onAddBlankRow ? (
            <button
              type="button"
              onClick={() => onAddBlankRow(activeWarehouse)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-apple-blue px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-apple-blue-hover active:scale-[0.98]"
              title={`Thêm lô vào ${warehouseLabel[activeWarehouse]} (N)`}
            >
              + Booking
            </button>
          ) : null}
        </div>
        <div
          className={`overflow-auto px-2 py-2 ${
            group.length > 6 ? "max-h-[min(78vh,720px)]" : ""
          }`}
        >
          <table className="w-full border-separate border-spacing-x-0 border-spacing-y-1.5 text-left text-[11px] leading-tight">
            <thead className="sticky top-0 z-10">
              <tr className="bg-dashboard-canvas/95 backdrop-blur-sm dark:bg-dashboard-canvas-dark/95">
                {COL_HEADERS.map((c) => {
                  const w =
                    c.key === "actions"
                      ? isScscWarehouse(activeWarehouse)
                        ? "min-w-[6.75rem] w-[6.75rem]"
                        : "min-w-[5.5rem] w-[5.5rem]"
                      : c.w;
                  return (
                    <th
                      key={c.key}
                      className={`whitespace-nowrap px-1.5 py-1.5 text-[8px] font-semibold uppercase tracking-wide text-dashboard-muted dark:text-dashboard-muted-dark ${w}`}
                    >
                      {c.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {group.length === 0 ? (
                <tr>
                  <td colSpan={COL_HEADERS.length} className="px-3 py-6 text-center">
                    <button
                      type="button"
                      onClick={() => onAddBlankRow?.(activeWarehouse)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-apple-blue px-4 py-2 text-[11px] font-semibold text-white shadow-sm hover:bg-apple-blue-hover active:scale-[0.98]"
                    >
                      + Booking · {warehouseLabel[activeWarehouse]}
                    </button>
                  </td>
                </tr>
              ) : (
                <WarehouseGroupRows
                  group={group}
                  sectionWarehouse={activeWarehouse}
                  viewSessionYmd={viewSessionYmd}
                  ecargoMap={ecargoMap}
                  onEcargoVehicleChange={onEcargoVehicleChange}
                  onEcargoDriverChange={onEcargoDriverChange}
                  onEcargoWarehouseChange={onEcargoWarehouseChange}
                  onEcargoVehicleTypeChange={onEcargoVehicleTypeChange}
                  onApplyEcargoPrefill={onApplyEcargoPrefill}
                  getEcargoSaveStatus={getEcargoSaveStatus}
                  getEcargoJob={getEcargoJob}
                  refreshEcargoJob={refreshEcargoJob}
                  onEcargoAutoRegister={onEcargoAutoRegister}
                  onSaveCustomerVehicleForEcargo={onSaveCustomerVehicleForEcargo}
                  isEcargoAutoRegistering={isEcargoAutoRegistering}
                  highlightedShipmentId={highlightedShipmentId}
                  selectedRowId={selectedRowId}
                  onSelectRow={onSelectRow}
                  allRows={allRows}
                  customerDirectory={customerDirectory}
                  globalAgents={globalAgents}
                  scscWeighPrintSettings={scscWeighPrintSettings}
                  saveScscWeighPrintSettings={saveScscWeighPrintSettings}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onPrint={onPrint}
                  onOpenDimModal={setDimModalRow}
                  openEcargoRequestId={openEcargoRequestId}
                  onEcargoRequestHandled={onEcargoRequestHandled}
                />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
    {dimModalRow ? (
      <MobileDimKgModal
        key={dimModalRow.id}
        row={dimModalRow}
        onClose={() => setDimModalRow(null)}
        onSave={(payload) => {
          onUpdate(dimModalRow.id, payload);
          setDimModalRow(null);
        }}
      />
    ) : null}
    </>
  );
}

function WarehouseGroupRows({
  group,
  sectionWarehouse,
  viewSessionYmd,
  ecargoMap,
  onEcargoVehicleChange,
  onEcargoDriverChange,
  onEcargoWarehouseChange,
  onEcargoVehicleTypeChange,
  onApplyEcargoPrefill,
  getEcargoSaveStatus,
  getEcargoJob,
  refreshEcargoJob,
  onEcargoAutoRegister,
  onSaveCustomerVehicleForEcargo,
  isEcargoAutoRegistering,
  allRows,
  customerDirectory,
  globalAgents,
  scscWeighPrintSettings,
  saveScscWeighPrintSettings,
  onUpdate,
  onDelete,
  onPrint,
  onOpenDimModal,
  highlightedShipmentId = null,
  selectedRowId = null,
  onSelectRow,
  openEcargoRequestId = null,
  onEcargoRequestHandled,
}: {
  group: Shipment[];
  sectionWarehouse: Warehouse;
  viewSessionYmd: string;
  ecargoMap: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange: (id: string, raw: string) => void;
  onEcargoDriverChange?: (id: string, driverName: string, driverId: string) => void;
  onEcargoWarehouseChange?: (id: string, arrivalDate: string, arrivalTimeSlot: string) => void;
  onEcargoVehicleTypeChange?: (id: string, vehicleType: string) => void;
  onApplyEcargoPrefill?: (row: Shipment) => void;
  getEcargoSaveStatus: (id: string) => EcargoSaveStatus;
  getEcargoJob: (id: string) => EcargoJobRecord | undefined;
  refreshEcargoJob: (id: string) => void | Promise<void>;
  onEcargoAutoRegister: (row: Shipment, opts?: EcargoAutoRegisterOpts) => void | Promise<void>;
  onSaveCustomerVehicleForEcargo?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  isEcargoAutoRegistering: (id: string) => boolean;
  allRows: Shipment[];
  customerDirectory: readonly CustomerDirectoryEntry[];
  globalAgents?: import("../types/globalAgents").GlobalAgentCatalog;
  scscWeighPrintSettings?: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings;
  saveScscWeighPrintSettings?: (
    settings: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings
  ) => void | Promise<void>;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onOpenDimModal: (s: Shipment) => void;
  highlightedShipmentId?: string | null;
  selectedRowId?: string | null;
  onSelectRow?: (id: string | null) => void;
  openEcargoRequestId?: string | null;
  onEcargoRequestHandled?: () => void;
}) {
  const groupRowIds = group.map((r) => r.id);
  const [openEcargoRowId, setOpenEcargoRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!openEcargoRequestId) return;
    const row = group.find((r) => r.id === openEcargoRequestId && isScscWarehouse(r.warehouse));
    if (!row) {
      onEcargoRequestHandled?.();
      return;
    }
    onApplyEcargoPrefill?.(row);
    setOpenEcargoRowId(openEcargoRequestId);
    onEcargoRequestHandled?.();
  }, [group, onApplyEcargoPrefill, onEcargoRequestHandled, openEcargoRequestId]);

  useEffect(() => {
    if (!openEcargoRowId) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const panel = document.querySelector(`[data-ecargo-panel="${openEcargoRowId}"]`);
      const trig = document.querySelector(`[data-ecargo-trigger="${openEcargoRowId}"]`);
      if (panel?.contains(t) || trig?.contains(t)) return;
      setOpenEcargoRowId(null);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [openEcargoRowId]);

  return (
    <>
      {group.map((row) => (
        <ShipmentRow
          key={row.id}
          row={row}
          sectionWarehouse={sectionWarehouse}
          viewSessionYmd={viewSessionYmd}
          ecargoMap={ecargoMap}
          onEcargoVehicleChange={onEcargoVehicleChange}
          onEcargoDriverChange={onEcargoDriverChange}
          onEcargoWarehouseChange={onEcargoWarehouseChange}
          onEcargoVehicleTypeChange={onEcargoVehicleTypeChange}
          getEcargoSaveStatus={getEcargoSaveStatus}
          getEcargoJob={getEcargoJob}
          refreshEcargoJob={refreshEcargoJob}
          onEcargoAutoRegister={onEcargoAutoRegister}
          onSaveCustomerVehicleForEcargo={onSaveCustomerVehicleForEcargo}
          isEcargoAutoRegistering={isEcargoAutoRegistering}
          groupRowIds={groupRowIds}
          allRows={allRows}
          customerDirectory={customerDirectory}
          globalAgents={globalAgents}
          scscWeighPrintSettings={scscWeighPrintSettings}
          saveScscWeighPrintSettings={saveScscWeighPrintSettings}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onPrint={onPrint}
          onOpenDimModal={onOpenDimModal}
          highlighted={highlightedShipmentId === row.id}
          selected={selectedRowId === row.id}
          onSelectRow={onSelectRow}
          ecargoTableOpen={openEcargoRowId === row.id}
          onToggleEcargoTable={() => {
            const opening = openEcargoRowId !== row.id;
            setOpenEcargoRowId((p) => (p === row.id ? null : row.id));
            if (opening) onApplyEcargoPrefill?.(row);
          }}
          onCloseEcargoTable={() => setOpenEcargoRowId((p) => (p === row.id ? null : p))}
        />
      ))}
    </>
  );
}

function ShipmentRow({
  row,
  sectionWarehouse,
  viewSessionYmd,
  ecargoMap,
  onEcargoVehicleChange,
  onEcargoDriverChange,
  onEcargoWarehouseChange,
  onEcargoVehicleTypeChange,
  getEcargoSaveStatus,
  getEcargoJob,
  refreshEcargoJob,
  onEcargoAutoRegister,
  onSaveCustomerVehicleForEcargo,
  isEcargoAutoRegistering,
  groupRowIds,
  allRows,
  customerDirectory,
  globalAgents,
  scscWeighPrintSettings,
  saveScscWeighPrintSettings,
  onUpdate,
  onDelete,
  onPrint,
  onOpenDimModal,
  ecargoTableOpen,
  onToggleEcargoTable,
  onCloseEcargoTable,
  highlighted = false,
  selected = false,
  onSelectRow,
}: {
  row: Shipment;
  sectionWarehouse: Warehouse;
  viewSessionYmd: string;
  ecargoMap: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange: (id: string, raw: string) => void;
  onEcargoDriverChange?: (id: string, driverName: string, driverId: string) => void;
  onEcargoWarehouseChange?: (id: string, arrivalDate: string, arrivalTimeSlot: string) => void;
  onEcargoVehicleTypeChange?: (id: string, vehicleType: string) => void;
  getEcargoSaveStatus: (id: string) => EcargoSaveStatus;
  getEcargoJob: (id: string) => EcargoJobRecord | undefined;
  refreshEcargoJob: (id: string) => void | Promise<void>;
  onEcargoAutoRegister: (row: Shipment, opts?: EcargoAutoRegisterOpts) => void | Promise<void>;
  onSaveCustomerVehicleForEcargo?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  isEcargoAutoRegistering: (id: string) => boolean;
  groupRowIds: string[];
  allRows: Shipment[];
  customerDirectory: readonly CustomerDirectoryEntry[];
  globalAgents?: import("../types/globalAgents").GlobalAgentCatalog;
  scscWeighPrintSettings?: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings;
  saveScscWeighPrintSettings?: (
    settings: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings
  ) => void | Promise<void>;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onOpenDimModal: (s: Shipment) => void;
  ecargoTableOpen: boolean;
  onToggleEcargoTable: () => void;
  onCloseEcargoTable: () => void;
  highlighted?: boolean;
  selected?: boolean;
  onSelectRow?: (id: string | null) => void;
}) {
  const bg = statusRowBg[row.status];
  const accent = statusRowAccent[row.status];
  const cell = (part: "first" | "mid" | "last", extra = "") => {
    const round = part === "first" ? "rounded-l-[6px]" : part === "last" ? "rounded-r-[6px]" : "";
    const accentCls = part === "first" ? accent : "";
    const hl = highlighted ? "ring-1 ring-inset ring-apple-blue/45" : "";
    const surface = selected ? statusRowSelected : bg;
    return `${surface} ${accentCls} ${round} ${hl} border-0 px-1 py-0.5 shadow-dashboard-card ${extra}`.trim();
  };
  const sessionYear = parseInt(row.sessionDate.slice(0, 4), 10) || new Date().getFullYear();
  const rowIdx = groupRowIds.indexOf(row.id);
  const hasNextRow = rowIdx >= 0 && rowIdx < groupRowIds.length - 1;
  const showEcargoKhoScsc = isScscWarehouse(row.warehouse) && sectionWarehouse === row.warehouse;
  const ecargoLine = ecargoMap[row.id];
  const vehicleForEcargo = ecargoLine?.vehicleInput ?? "";
  const ecargoJob = getEcargoJob(row.id);
  const ecargoPrefill = useMemo(
    () =>
      resolveEcargoVehiclePrefill(row, customerDirectory, vehicleForEcargo, {
        driverName: ecargoLine?.driverName,
        driverId: ecargoLine?.driverId,
      }),
    [customerDirectory, ecargoLine?.driverId, ecargoLine?.driverName, row, vehicleForEcargo]
  );
  const effectiveEcargoVehicle = vehicleForEcargo.trim() || ecargoPrefill.vehicleInput;
  const ecargoReady = effectiveEcargoVehicle.trim().length >= ECARGO_VEHICLE_MIN;
  const ecargoButtonTitle = ecargoReady
    ? `eCargo · ${effectiveEcargoVehicle}${ecargoPrefill.driverName ? ` · ${ecargoPrefill.driverName}` : ""}`
    : ecargoPrefill.defaultVehicle
      ? `eCargo — xe mặc định: ${vehicleDisplayLabel(ecargoPrefill.defaultVehicle)}`
      : ecargoPrefill.customer
        ? "eCargo — chưa có biển số trên lô (kiểm tra hồ sơ khách)"
        : "eCargo — đăng ký kho SCSC";
  const customerEntry = findCustomerEntry(row, customerDirectory);
  const savedConsigneeOptions = customerEntry?.savedConsignees ?? [];
  useEffect(() => {
    if (!ecargoTableOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseEcargoTable();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [ecargoTableOpen, onCloseEcargoTable]);

  const navDownSameField = (field: string) => () => {
    if (!hasNextRow) return;
    const nextId = groupRowIds[rowIdx + 1];
    focusShipmentGridCell(nextId, field);
  };

  const onFlightDateCommit = (t: string) => {
    const ymd = parseBookingDateLoose(t, sessionYear);
    if (!ymd) {
      window.alert("Ngày bay không hợp lệ (ví dụ 15APR hoặc 15/04/2026).");
      return;
    }
    onUpdate(row.id, { flightDate: formatYmdToFlightDateDdMon(ymd) });
  };

  const onFlightDateEnterDown = () => {
    if (hasNextRow) focusShipmentGridCell(groupRowIds[rowIdx + 1], "flight");
    else focusShipmentGridCell(row.id, "dest");
  };

  return (
    <>
    <tr
      id={`shipment-row-${row.id}`}
      onClick={() => onSelectRow?.(row.id)}
      className="group/row cursor-pointer transition-all hover:brightness-[0.99]"
    >
      {/* # */}
      <td className={cell("first", "text-center text-[10px] font-semibold tabular-nums text-apple-secondary dark:text-zinc-400")}>
        {row.stt}
      </td>
      {/* AWB + HAWB — nhập inline (thêm dòng từ « Nhập booking »). */}
      <td className={cell("mid", "align-top")}>
        <div className="flex min-w-[8.5rem] flex-col gap-0">
          <InlineAwbEdit
            rowId={row.id}
            value={row.awb}
            allRows={allRows}
            className="font-shipment-data text-[1.2rem] font-bold leading-tight text-dashboard-primary dark:text-dashboard-primary-dark"
            onCommit={(awb) => onUpdate(row.id, { awb })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "hawb")}
          />
          <InlineTextEdit
            value={row.hawb ?? ""}
            placeholder="HAWB"
            className="font-shipment-data text-[9px] font-semibold ops-grid-cell-muted"
            maxLength={32}
            gridNav={{ rowId: row.id, field: "hawb" }}
            onCommit={(v) => onUpdate(row.id, { hawb: v.slice(0, 32) })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "flight")}
          />
        </div>
      </td>
      {/* Flight — 2 dòng: chuyến + ngày, Enter xuống ô kế */}
      <td className={cell("mid", "align-top")}>
        <div className="flex min-w-[5.5rem] flex-col gap-0">
          <InlineTextEdit
            value={row.flight}
            placeholder="Chuyến"
            className={`font-shipment-data text-[12px] font-bold ${flightNumberAccent} ops-grid-cell`}
            uppercase
            maxLength={12}
            gridNav={{ rowId: row.id, field: "flight" }}
            onCommit={(v) => onUpdate(row.id, { flight: v })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "flightDate")}
          />
          <InlineTextEdit
            value={row.flightDate}
            placeholder="15APR"
            className="font-shipment-data text-[9px] font-medium ops-grid-cell-muted"
            uppercase
            maxLength={16}
            gridNav={{ rowId: row.id, field: "flightDate" }}
            onCommit={onFlightDateCommit}
            onEnterNavigateDown={onFlightDateEnterDown}
          />
        </div>
      </td>
      {/* DEST */}
      <td className={cell("mid", "text-center")}>
        <InlineTextEdit
          value={row.dest}
          placeholder="DEST"
          className="font-shipment-data text-center text-[12px] font-semibold ops-grid-cell"
          uppercase
          maxLength={3}
          gridNav={{ rowId: row.id, field: "dest" }}
          onCommit={(v) => onUpdate(row.id, { dest: v.slice(0, 3) })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("dest") : undefined}
        />
      </td>
      {/* PCS — inline edit */}
      <td className={cell("mid", "text-right")}>
        <InlineNumberEdit
          value={row.pcs}
          variant="grid"
          className="font-shipment-data text-[12px] font-bold tabular-nums dark:text-zinc-100"
          gridNav={{ rowId: row.id, field: "pcs" }}
          onCommit={(v) => onUpdate(row.id, { pcs: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("pcs") : undefined}
        />
      </td>
      {/* KG — inline edit */}
      <td className={cell("mid", "text-right")}>
        <InlineNumberEdit
          value={row.kg}
          variant="grid"
          className="font-shipment-data text-[12px] font-bold tabular-nums dark:text-zinc-100"
          gridNav={{ rowId: row.id, field: "kg" }}
          onCommit={(v) => onUpdate(row.id, { kg: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("kg") : undefined}
        />
      </td>
      {/* DIM kg — khi đã có D×R×C: chỉ hiển thị + modal (tránh sửa nhanh làm mất dimLines → mất in DIM) */}
      <td className={cell("mid", "text-right align-top")}>
        <div className="flex flex-col items-end gap-0">
          {(row.dimLines?.length ?? 0) > 0 ? (
            <span className="font-mono text-[10px] font-semibold tabular-nums ops-grid-cell">
              {formatShipmentDimWeightKg(row.flight, row.dimWeightKg)}
            </span>
          ) : (
            <InlineNumberEdit
              value={row.dimWeightKg}
              placeholder="—"
              className="font-mono text-[11px] font-semibold tabular-nums dark:text-zinc-100"
              gridNav={{ rowId: row.id, field: "dimKg" }}
              onCommit={(v) =>
                onUpdate(row.id, { dimWeightKg: v, dimLines: null, dimDivisor: null })
              }
              onEnterNavigateDown={hasNextRow ? navDownSameField("dimKg") : undefined}
            />
          )}
          <button
            type="button"
            aria-label="Nhập DIM D×R×C"
            title="D×R×C"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDimModal(row);
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-apple-blue/35 bg-apple-blue/8 text-apple-blue hover:bg-apple-blue/15"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </td>
      {/* Customer */}
      <td className={cell("mid")}>
        <InlineCustomerEdit
          value={row.customer}
          customerId={row.customerId}
          customerDirectory={customerDirectory}
          globalAgents={globalAgents}
          placeholder="Khách"
          className="min-w-0 text-[12px] font-semibold ops-grid-cell"
          maxLength={120}
          gridNav={{ rowId: row.id, field: "customer" }}
          onCommit={(patch) => onUpdate(row.id, patch)}
          onEnterNavigateDown={hasNextRow ? navDownSameField("customer") : undefined}
          onTabNavigateNext={() =>
            focusShipmentGridCell(
              row.id,
              isScscWarehouse(row.warehouse) ? "goodsDescriptionPrint" : "note"
            )
          }
        />
      </td>
      {/* CNEE — gọn: chọn + tên + ℹ */}
      <td className={cell("mid", "align-middle")}>
        <InlineCneeCell
          shipment={row}
          customerDirectory={customerDirectory}
          value={row.customerConsigneeId?.trim() ?? ""}
          options={savedConsigneeOptions}
          sessionYmdFallback={viewSessionYmd}
          onChange={(consigneeId) => {
            const sc = savedConsigneeOptions.find((x) => x.id === consigneeId);
            onUpdate(row.id, buildShipmentPatchForSavedConsignee(sc));
          }}
        />
      </td>
      {/* Tên hàng in — 2 dòng: tên hàng + YC khác in */}
      <td className={cell("mid", "align-top")}>
        {isScscWarehouse(row.warehouse) ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            <InlineTextEdit
              value={row.goodsDescriptionPrint ?? ""}
              placeholder="Tên hàng in"
              className="line-clamp-2 min-w-0 text-left text-[10px] leading-snug text-violet-800 dark:text-violet-200"
              maxLength={SCSC_GOODS_DESCRIPTION_PRINT_MAX}
              gridNav={{ rowId: row.id, field: "goodsDescriptionPrint" }}
              onCommit={(v) => onUpdate(row.id, { goodsDescriptionPrint: v })}
              onEnterNavigateDown={() => focusShipmentGridCell(row.id, "otherRequirementsPrint")}
            />
            <InlineTextEdit
              value={row.otherRequirementsPrint ?? ""}
              placeholder="YC khác in"
              className="line-clamp-2 min-w-0 text-left text-[9px] leading-snug text-violet-700/90 dark:text-violet-300/90"
              maxLength={SCSC_OTHER_REQUIREMENTS_PRINT_MAX}
              gridNav={{ rowId: row.id, field: "otherRequirementsPrint" }}
              onCommit={(v) => onUpdate(row.id, { otherRequirementsPrint: v })}
              onEnterNavigateDown={() => focusShipmentGridCell(row.id, "note")}
            />
          </div>
        ) : null}
      </td>
      {/* TT — ghi chú + trạng thái */}
      <td className={cell("mid", "py-1 align-top")}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <InlineTextEdit
            value={row.note ?? ""}
            placeholder="Ghi chú"
            className="line-clamp-2 min-w-0 text-left text-[10px] leading-snug ops-grid-cell-muted"
            maxLength={2000}
            gridNav={{ rowId: row.id, field: "note" }}
            onCommit={(v) => onUpdate(row.id, { note: v })}
            onEnterNavigateDown={hasNextRow ? navDownSameField("note") : undefined}
          />
          <StatusSelect
            value={row.status}
            compact
            onChange={(s: ShipmentStatus) => onUpdate(row.id, { status: s })}
          />
        </div>
      </td>
      {/* Actions — in nhãn + menu ⋮; eCargo (KHO SCSC) giữ ngoài */}
      <td className={cell("last", "overflow-visible py-0.5 align-middle")}>
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex max-w-full flex-nowrap items-center justify-end gap-0.5">
            {showEcargoKhoScsc ? (
              <EcargoKhoScscTriggerButton
                variant="icon"
                rowId={row.id}
                open={ecargoTableOpen}
                hasVehicle={ecargoReady}
                job={ecargoJob}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleEcargoTable();
                }}
                title={ecargoButtonTitle}
              />
            ) : null}
            <ShipmentRowActionsMenu
              row={row}
              customerDirectory={customerDirectory}
              globalAgents={globalAgents}
              scscWeighPrintSettings={scscWeighPrintSettings}
              saveScscWeighPrintSettings={saveScscWeighPrintSettings}
              onPrint={onPrint}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
          </div>
          {showEcargoKhoScsc &&
          ecargoJob &&
          (isEcargoJobRunning(ecargoJob.status) || isEcargoJobTerminal(ecargoJob.status)) ? (
            <EcargoRowNotice
              job={ecargoJob}
              awb={row.awb}
              compact
              className="min-w-0 max-w-[4.75rem] text-right"
            />
          ) : null}
        </div>
      </td>
    </tr>
    {showEcargoKhoScsc && ecargoTableOpen ? (
      <EcargoKhoScscCenterModal
        rowId={row.id}
        row={row}
        customerDirectory={customerDirectory}
        vehicleForEcargo={vehicleForEcargo}
        driverNameForEcargo={ecargoLine?.driverName ?? ""}
        driverIdForEcargo={ecargoLine?.driverId ?? ""}
        arrivalDateForEcargo={ecargoLine?.arrivalDate ?? ""}
        arrivalTimeSlotForEcargo={ecargoLine?.arrivalTimeSlot ?? ""}
        vehicleTypeForEcargo={ecargoLine?.vehicleType ?? ""}
        viewSessionYmd={viewSessionYmd}
        saveStatus={getEcargoSaveStatus(row.id)}
        job={ecargoJob}
        autoRegistering={isEcargoAutoRegistering(row.id)}
        onVehicleChange={(raw) => onEcargoVehicleChange(row.id, raw)}
        onDriverChange={(name, id) => onEcargoDriverChange?.(row.id, name, id)}
        onWarehouseArrivalChange={(date, slot) => onEcargoWarehouseChange?.(row.id, date, slot)}
        onVehicleTypeChange={(type) => onEcargoVehicleTypeChange?.(row.id, type)}
        onAutoRegister={async (opts) => {
          await onEcargoAutoRegister(row, opts);
        }}
        onSaveVehicleAsDefault={onSaveCustomerVehicleForEcargo}
        onRefreshJob={() => void refreshEcargoJob(row.id)}
        onClose={onCloseEcargoTable}
      />
    ) : null}
    </>
  );
}
