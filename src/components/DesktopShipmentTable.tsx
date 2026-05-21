import { useEffect, useMemo, useState } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { lookupCustomerCodeByName } from "../utils/customerDirectoryCore";
import { StatusSelect } from "./StatusBadge";
import { SummaryBar } from "./SummaryBar";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { InlineTextEdit } from "./InlineTextEdit";
import { formatYmdToFlightDateDdMon, parseBookingDateLoose } from "../utils/bookingDateParse";
import { focusShipmentGridCell } from "../utils/focusShipmentGrid";
import { InlineAwbEdit } from "./InlineAwbEdit";
import { InlineCutoffBlock } from "./InlineCutoffBlock";
import { MobileDimKgModal } from "./MobileDimKgModal";
import { CustomerShipmentDetailModal } from "./CustomerShipmentDetailModal";
import { statusRowBg, statusRowBorder } from "./statusStyles";
import { ShipmentRowActionsMenu } from "./ShipmentRowActionsMenu";
import {
  isScscWarehouse,
  warehouseLabel,
  warehouseSectionsForLayout,
  type WarehouseLayoutFilter,
} from "../constants/warehouses";
import { partitionShipmentsByWarehouse } from "../utils/partitionShipmentsByWarehouse";
import { formatShipmentDimWeightKg } from "../utils/volumetricDim";
import type { EcargoKhoScscPersistedMap } from "../utils/ecargoRegisterLocalStorage";
import type { EcargoSaveStatus } from "../hooks/useEcargoKhoScscRegister";
import type { EcargoJobRecord } from "../types/ecargoJob";
import {
  ECARGO_VEHICLE_MIN,
  EcargoKhoScscCenterModal,
  EcargoKhoScscTriggerButton,
} from "./EcargoKhoScscModal";
import { findCustomerEntry } from "../utils/mapBookingToScaleTicketFormData";
import { buildShipmentPatchForSavedConsignee } from "../utils/customerConsigneeShipmentPatch";
import type { UpsertCustomerVehicleParams } from "../utils/customerVehicleCore";
import { InlineCneeCell } from "./InlineCneeCell";
import { useWarehouseSectionCollapse } from "../hooks/useWarehouseSectionCollapse";

export type EcargoAutoRegisterOpts = {
  driverName?: string;
  driverId?: string;
  saveAsDefault?: boolean;
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
   * Khớp bộ lọc kho trên trang: khi chọn một kho cụ thể, chỉ hiển thị section kho đó (gọn màn hình).
   * `"ALL"` = hiện đủ 4 kho như trước.
   */
  warehouseLayoutFilter?: WarehouseLayoutFilter;
  /** Thêm dòng trống vào đúng kho (nút cạnh tiêu đề TCS / SCSC). */
  onAddBlankRow: (warehouse: Warehouse) => void;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  /** Ngày phiên đang xem (YYYY-MM-DD) — parse ngày bay eCargo theo năm trên OPS. */
  viewSessionYmd: string;
  ecargoMap: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange: (id: string, raw: string) => void;
  getEcargoSaveStatus: (id: string) => EcargoSaveStatus;
  getEcargoJob: (id: string) => EcargoJobRecord | undefined;
  refreshEcargoJob: (id: string) => void | Promise<void>;
  onEcargoAutoRegister: (row: Shipment, opts?: EcargoAutoRegisterOpts) => void | Promise<void>;
  onSaveCustomerVehicleForEcargo?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  isEcargoAutoRegistering: (id: string) => boolean;
}

const COL_HEADERS = [
  { key: "stt", label: "#", w: "w-8" },
  { key: "awb", label: "AWB / HAWB", w: "min-w-[9rem]" },
  { key: "flight", label: "CHUYẾN", w: "min-w-[5.5rem]" },
  { key: "cutoff", label: "CUTOFF", w: "min-w-[5.5rem]" },
  { key: "dest", label: "DST", w: "w-12" },
  { key: "pcs", label: "KIỆN", w: "w-12 text-right" },
  { key: "kg", label: "KG", w: "w-12 text-right" },
  { key: "dim", label: "DIM", w: "w-14 text-right" },
  { key: "customer", label: "KHÁCH", w: "min-w-[4.75rem] max-w-[6.5rem]" },
  { key: "cnee", label: "CNEE", w: "min-w-[6.5rem] max-w-[10rem]" },
  { key: "note", label: "NOTE", w: "min-w-[3.75rem] max-w-[7rem]" },
  { key: "status", label: "TT", w: "min-w-[6.5rem]" },
  { key: "actions", label: "", w: "min-w-[4.5rem]" },
] as const;

export function DesktopShipmentTable({
  rows,
  allRows,
  customerDirectory = [],
  globalAgents,
  scscWeighPrintSettings,
  saveScscWeighPrintSettings,
  warehouseLayoutFilter = "ALL",
  onAddBlankRow,
  onUpdate,
  onDelete,
  onPrint,
  viewSessionYmd,
  ecargoMap,
  onEcargoVehicleChange,
  getEcargoSaveStatus,
  getEcargoJob,
  refreshEcargoJob,
  onEcargoAutoRegister,
  onSaveCustomerVehicleForEcargo,
  isEcargoAutoRegistering,
}: Props) {
  const [dimModalRow, setDimModalRow] = useState<Shipment | null>(null);
  const [customerDetailRow, setCustomerDetailRow] = useState<Shipment | null>(null);
  const rowsByWarehouse = useMemo(() => partitionShipmentsByWarehouse(rows), [rows]);
  const warehouseSections = useMemo(
    () => warehouseSectionsForLayout(warehouseLayoutFilter),
    [warehouseLayoutFilter]
  );
  const warehouseCounts = useMemo(() => {
    const counts = {
      "TECS-TCS": 0,
      "TECS-SCSC": 0,
      "KHO-TCS": 0,
      "KHO-SCSC": 0,
    } as Record<Warehouse, number>;
    for (const wh of warehouseSections) {
      counts[wh] = rowsByWarehouse[wh].length;
    }
    return counts;
  }, [rowsByWarehouse, warehouseSections]);
  const { isCollapsed, toggle } = useWarehouseSectionCollapse(warehouseCounts);

  return (
    <>
    <div className="hidden md:block space-y-2">
      {warehouseSections.map((wh) => {
        const group = rowsByWarehouse[wh];
        const collapsed = isCollapsed(wh);

        return (
          <section key={wh} className="rounded-lg border border-black/[0.06] bg-white/50 dark:border-white/[0.08] dark:bg-ops-surface/40">
            <div className="flex flex-wrap items-center justify-between gap-1.5 px-2 py-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggle(wh)}
                  aria-expanded={!collapsed}
                  className="group inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  title={collapsed ? "Mở rộng kho" : "Thu gọn kho"}
                >
                  <svg
                    className={`h-3.5 w-3.5 shrink-0 text-apple-secondary transition-transform dark:text-ops-secondary ${
                      collapsed ? "" : "rotate-90"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  <h2 className="text-sm font-semibold tracking-tight text-apple-label dark:text-ops-label">
                    {warehouseLabel[wh]}
                  </h2>
                  <span className="rounded-full bg-apple-label px-1.5 py-0.5 text-[9px] font-semibold text-white tabular-nums dark:bg-ops-elevated">
                    {group.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void onAddBlankRow(wh)}
                  className="inline-flex items-center gap-0.5 rounded-md bg-apple-blue px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-apple-blue-hover active:scale-[0.98]"
                >
                  <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  + Booking
                </button>
              </div>
              {group.length > 0 ? <SummaryBar rows={rows} warehouse={wh} /> : null}
            </div>

            {!collapsed ? (
            <div
              className={`overflow-auto rounded-b-lg border-t border-black/[0.06] dark:border-white/[0.06] ${
                group.length > 6 ? "max-h-[min(78vh,720px)]" : ""
              }`}
            >
              <table className="w-full border-collapse text-left text-[11px] leading-tight">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-black/[0.08] bg-apple-bg shadow-[0_1px_0_rgba(0,0,0,0.06)] dark:border-white/[0.08] dark:bg-ops-elevated">
                    {COL_HEADERS.map((c) => {
                      const w =
                        c.key === "actions"
                          ? isScscWarehouse(wh)
                            ? "min-w-[6.5rem] w-[6.5rem]"
                            : "min-w-[4.5rem] w-[4.5rem]"
                          : c.w;
                      return (
                      <th
                        key={c.key}
                        className={`whitespace-nowrap border-r border-black/[0.06] px-1 py-1 text-[8px] font-semibold uppercase tracking-wide text-apple-secondary last:border-r-0 dark:border-white/[0.08] dark:text-zinc-400 ${w}`}
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
                      <td
                        colSpan={COL_HEADERS.length}
                        className="px-3 py-3 text-center text-[11px] ops-grid-placeholder"
                      >
                        Chưa có lô
                      </td>
                    </tr>
                  ) : (
                    <WarehouseGroupRows
                      group={group}
                      sectionWarehouse={wh}
                      viewSessionYmd={viewSessionYmd}
                      ecargoMap={ecargoMap}
                      onEcargoVehicleChange={onEcargoVehicleChange}
                      getEcargoSaveStatus={getEcargoSaveStatus}
                      getEcargoJob={getEcargoJob}
                      refreshEcargoJob={refreshEcargoJob}
                      onEcargoAutoRegister={onEcargoAutoRegister}
                      onSaveCustomerVehicleForEcargo={onSaveCustomerVehicleForEcargo}
                      isEcargoAutoRegistering={isEcargoAutoRegistering}
                      allRows={allRows}
                      customerDirectory={customerDirectory}
                      globalAgents={globalAgents}
                      scscWeighPrintSettings={scscWeighPrintSettings}
                      saveScscWeighPrintSettings={saveScscWeighPrintSettings}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      onPrint={onPrint}
                      onOpenDimModal={setDimModalRow}
                      onOpenCustomerDetail={setCustomerDetailRow}
                    />
                  )}
                </tbody>
              </table>
            </div>
            ) : null}
          </section>
        );
      })}
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
    <CustomerShipmentDetailModal
      open={customerDetailRow != null}
      shipment={
        customerDetailRow ? rows.find((r) => r.id === customerDetailRow.id) ?? customerDetailRow : null
      }
      directory={customerDirectory}
      viewSessionYmd={viewSessionYmd}
      onClose={() => setCustomerDetailRow(null)}
    />
    </>
  );
}

function WarehouseGroupRows({
  group,
  sectionWarehouse,
  viewSessionYmd,
  ecargoMap,
  onEcargoVehicleChange,
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
  onOpenCustomerDetail,
}: {
  group: Shipment[];
  sectionWarehouse: Warehouse;
  viewSessionYmd: string;
  ecargoMap: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange: (id: string, raw: string) => void;
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
  onOpenCustomerDetail: (s: Shipment) => void;
}) {
  const groupRowIds = group.map((r) => r.id);
  const [openEcargoRowId, setOpenEcargoRowId] = useState<string | null>(null);

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
          onOpenCustomerDetail={onOpenCustomerDetail}
          ecargoTableOpen={openEcargoRowId === row.id}
          onToggleEcargoTable={() => setOpenEcargoRowId((p) => (p === row.id ? null : row.id))}
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
  onOpenCustomerDetail,
  ecargoTableOpen,
  onToggleEcargoTable,
  onCloseEcargoTable,
}: {
  row: Shipment;
  sectionWarehouse: Warehouse;
  viewSessionYmd: string;
  ecargoMap: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange: (id: string, raw: string) => void;
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
  onOpenCustomerDetail: (s: Shipment) => void;
  ecargoTableOpen: boolean;
  onToggleEcargoTable: () => void;
  onCloseEcargoTable: () => void;
}) {
  const bg = statusRowBg[row.status];
  const border = statusRowBorder[row.status];
  const sessionYear = parseInt(row.sessionDate.slice(0, 4), 10) || new Date().getFullYear();
  const rowIdx = groupRowIds.indexOf(row.id);
  const hasNextRow = rowIdx >= 0 && rowIdx < groupRowIds.length - 1;
  const showEcargoKhoScsc = isScscWarehouse(row.warehouse) && sectionWarehouse === row.warehouse;
  const vehicleForEcargo = ecargoMap[row.id]?.vehicleInput ?? "";
  const ecargoJob = getEcargoJob(row.id);
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
      className={`border-b border-black/[0.06] transition-colors hover:brightness-[0.99] dark:border-white/[0.06] ${bg} ${border}`}
    >
      {/* # */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 text-center text-[10px] font-semibold tabular-nums text-apple-secondary dark:border-white/[0.06] dark:text-zinc-400">
        {row.stt}
      </td>
      {/* AWB + HAWB — nhập inline (thêm dòng từ « Nhập booking »). */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 align-top">
        <div className="flex min-w-[8.5rem] flex-col gap-0">
          <InlineAwbEdit
            rowId={row.id}
            value={row.awb}
            allRows={allRows}
            className="font-shipment-data text-[1.1rem] font-bold text-slate-900 dark:text-slate-50"
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
      <td className="border-r border-black/[0.06] px-1 py-0.5 align-top">
        <div className="flex min-w-[5.5rem] flex-col gap-0">
          <InlineTextEdit
            value={row.flight}
            placeholder="Chuyến"
            className="font-shipment-data text-[12px] font-semibold ops-grid-cell"
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
      {/* Cutoff (giờ + ngày) + ghi chú cutoff — nhập inline */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 align-top">
        <div className="flex min-w-[5.5rem] flex-col gap-0">
          <InlineCutoffBlock
            rowId={row.id}
            cutoffIso={row.cutoff}
            sessionYear={sessionYear}
            onCommit={(iso) => onUpdate(row.id, { cutoff: iso })}
            onEnterAfterCommit={() => focusShipmentGridCell(row.id, "cutoffNote")}
          />
          <div className="mt-0.5 border-t border-dashed border-black/[0.08] pt-0.5 dark:border-white/10">
            <InlineTextEdit
              value={row.cutoffNote ?? ""}
              placeholder="PER"
              className={
                row.cutoffNote?.trim()
                  ? "text-[10px] font-bold uppercase tracking-wide text-indigo-800 dark:text-indigo-200"
                  : "text-[9px] font-normal ops-grid-placeholder"
              }
              uppercase
              maxLength={32}
              gridNav={{ rowId: row.id, field: "cutoffNote" }}
              onCommit={(v) => onUpdate(row.id, { cutoffNote: v })}
              onEnterNavigateDown={() => focusShipmentGridCell(row.id, "dest")}
            />
          </div>
        </div>
      </td>
      {/* DEST */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 text-center">
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
      <td className="border-r border-black/[0.06] px-1 py-0.5 text-right">
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
      <td className="border-r border-black/[0.06] px-1 py-0.5 text-right">
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
      <td className="border-r border-black/[0.06] px-1 py-0.5 text-right align-top">
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
      <td className="border-r border-black/[0.06] px-1 py-0.5">
        <div className="flex min-w-0 items-stretch gap-0.5">
          <div className="min-w-0 flex-1">
            <InlineTextEdit
              value={row.customer}
              placeholder="Khách"
              className="text-[12px] font-semibold ops-grid-cell"
              maxLength={120}
              gridNav={{ rowId: row.id, field: "customer" }}
              onCommit={(v) => {
                const trimmed = v.trim();
                const code = lookupCustomerCodeByName(customerDirectory, trimmed);
                const customerId =
                  customerDirectory.find(
                    (e) =>
                      e.code.trim().toLowerCase() === code.trim().toLowerCase() ||
                      e.name.trim().toLowerCase() === trimmed.toLowerCase()
                  )?.id ?? "";
                const entry =
                  customerDirectory.find(
                    (e) =>
                      e.id === customerId ||
                      e.code.trim().toLowerCase() === code.trim().toLowerCase() ||
                      e.name.trim().toLowerCase() === trimmed.toLowerCase()
                  ) ?? undefined;
                const soleShipper =
                  entry?.savedShippers?.length === 1 ? entry.savedShippers[0] : undefined;
                const soleConsignee =
                  entry?.savedConsignees?.length === 1 ? entry.savedConsignees[0] : undefined;
                onUpdate(row.id, {
                  customer: trimmed,
                  customerCode: code,
                  customerId,
                  customerShipperId: soleShipper?.id ?? "",
                  shipperNamePrint: soleShipper?.shipperName?.trim() ?? "",
                  shipperAddressPrint: soleShipper?.shipperAddress ?? "",
                  shipperPhonePrint: soleShipper?.shipperPhone?.trim() ?? "",
                  shipperEmailPrint: soleShipper?.shipperEmail?.trim() ?? "",
                  taxCodePrint: soleShipper?.taxCode?.trim() ?? "",
                  ...buildShipmentPatchForSavedConsignee(soleConsignee),
                });
              }}
              onEnterNavigateDown={hasNextRow ? navDownSameField("customer") : undefined}
            />
          </div>
          <button
            type="button"
            title="Thông tin CNEE — sao chép"
            aria-label="Thông tin CNEE"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCustomerDetail(row);
            }}
            className="shrink-0 self-center rounded border border-black/[0.08] bg-white p-0.5 text-apple-blue hover:bg-apple-blue/10"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        </div>
      </td>
      {/* CNEE — chọn consignee + khối chữ bôi đen copy */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 align-top">
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
      {/* Note */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 align-top dark:border-white/[0.06]">
        <div className="flex min-w-0 items-start gap-0.5">
          <span
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 dark:text-zinc-400"
            title="Ghi chú"
            aria-hidden
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </span>
          <InlineTextEdit
            value={row.note ?? ""}
            placeholder="…"
            className="line-clamp-1 min-w-0 flex-1 text-left text-[10px] leading-snug ops-grid-cell-muted"
            maxLength={2000}
            gridNav={{ rowId: row.id, field: "note" }}
            onCommit={(v) => onUpdate(row.id, { note: v })}
            onEnterNavigateDown={hasNextRow ? navDownSameField("note") : undefined}
          />
        </div>
      </td>
      {/* Status */}
      <td className="border-r border-black/[0.06] px-1 py-1">
        <StatusSelect
          value={row.status}
          compact
          onChange={(s: ShipmentStatus) => onUpdate(row.id, { status: s })}
        />
      </td>
      {/* Actions — in nhãn + menu ⋮; eCargo (KHO SCSC) giữ ngoài */}
      <td className="px-0.5 py-0.5 align-middle">
        <div className="flex flex-nowrap items-center justify-end gap-0.5">
          <ShipmentRowActionsMenu
            row={row}
            customerDirectory={customerDirectory}
            globalAgents={globalAgents}
            scscWeighPrintSettings={scscWeighPrintSettings}
            saveScscWeighPrintSettings={saveScscWeighPrintSettings}
            onPrint={onPrint}
            onDelete={onDelete}
          />
          {showEcargoKhoScsc ? (
            <EcargoKhoScscTriggerButton
              rowId={row.id}
              open={ecargoTableOpen}
              hasVehicle={vehicleForEcargo.trim().length >= ECARGO_VEHICLE_MIN}
              job={ecargoJob}
              onClick={(e) => {
                e.stopPropagation();
                onToggleEcargoTable();
              }}
              className="h-7 shrink-0 gap-1 px-1.5 text-[10px] [&>span:last-child]:inline"
              title="eCargo — tự động đăng ký kho SCSC"
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
        viewSessionYmd={viewSessionYmd}
        saveStatus={getEcargoSaveStatus(row.id)}
        job={ecargoJob}
        autoRegistering={isEcargoAutoRegistering(row.id)}
        onVehicleChange={(raw) => onEcargoVehicleChange(row.id, raw)}
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
