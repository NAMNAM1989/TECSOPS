import { memo, useMemo, useState } from "react";
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
import { isScscWarehouse, warehouseLabel } from "../constants/warehouses";
import { formatShipmentDimWeightKg } from "../utils/volumetricDim";
import { findCustomerEntry } from "../utils/customerBookingResolve";
import { buildShipmentPatchForSavedConsignee } from "../utils/customerConsigneeShipmentPatch";
import { InlineCneeCell } from "./InlineCneeCell";
import { useIsMobile } from "../hooks/useIsMobile";

interface Props {
  rows: Shipment[];
  allRows: Shipment[];
  customerDirectory?: readonly CustomerDirectoryEntry[];
  activeWarehouse: Warehouse;
  onActiveWarehouseChange: (wh: Warehouse) => void;
  metricRows: Shipment[];
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  viewSessionYmd: string;
  searchHighlightWarehouses?: readonly Warehouse[];
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
  activeWarehouse,
  onActiveWarehouseChange,
  metricRows,
  searchHighlightWarehouses,
  highlightedShipmentId,
  selectedRowId,
  onSelectRow,
  onAddBlankRow,
  onUpdate,
  onDelete,
  onPrint,
  viewSessionYmd,
}: Props) {
  const isMobile = useIsMobile();
  const [dimModalRow, setDimModalRow] = useState<Shipment | null>(null);
  const group = useMemo(
    () => rows.filter((r) => r.warehouse === activeWarehouse),
    [rows, activeWarehouse]
  );
  const groupRowIds = useMemo(() => group.map((r) => r.id), [group]);

  return (
    <>
      <div className={isMobile ? "hidden" : "hidden md:block space-y-4"}>
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
                  {COL_HEADERS.map((c) => (
                    <th
                      key={c.key}
                      className={`whitespace-nowrap px-1.5 py-1.5 text-[8px] font-semibold uppercase tracking-wide text-dashboard-muted dark:text-dashboard-muted-dark ${c.w}`}
                    >
                      {c.label}
                    </th>
                  ))}
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
                  group.map((row, rowIdx) => (
                    <ShipmentTableRow
                      key={row.id}
                      row={row}
                      rowIdx={rowIdx}
                      groupRowIds={groupRowIds}
                      viewSessionYmd={viewSessionYmd}
                      highlighted={highlightedShipmentId === row.id}
                      selected={selectedRowId === row.id}
                      onSelectRow={onSelectRow}
                      allRows={allRows}
                      customerDirectory={customerDirectory}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      onPrint={onPrint}
                      onOpenDimModal={setDimModalRow}
                    />
                  ))
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

function ShipmentTableRowImpl({
  row,
  rowIdx,
  groupRowIds,
  viewSessionYmd,
  highlighted = false,
  selected = false,
  onSelectRow,
  allRows,
  customerDirectory,
  onUpdate,
  onDelete,
  onPrint,
  onOpenDimModal,
}: {
  row: Shipment;
  rowIdx: number;
  groupRowIds: string[];
  viewSessionYmd: string;
  highlighted?: boolean;
  selected?: boolean;
  onSelectRow?: (id: string | null) => void;
  allRows: Shipment[];
  customerDirectory: readonly CustomerDirectoryEntry[];
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onOpenDimModal: (s: Shipment) => void;
}) {
  const bg = statusRowBg[row.status];
  const accent = statusRowAccent[row.status];
  const cell = (part: "first" | "mid" | "last", extra = "") => {
    const round = part === "first" ? "rounded-l-2xl" : part === "last" ? "rounded-r-2xl" : "";
    const accentCls = part === "first" ? accent : "";
    const hl = highlighted ? "ring-2 ring-inset ring-apple-blue/50 dark:ring-sky-400/40" : "";
    const surface = selected ? statusRowSelected : bg;
    return `${surface} ${accentCls} ${round} ${hl} border-y border-black/[0.02] dark:border-white/[0.04] ${
      part === "first" ? "border-l border-black/[0.02] dark:border-white/[0.04]" : ""
    } ${part === "last" ? "border-r border-black/[0.02] dark:border-white/[0.04]" : ""} px-2.5 py-1.5 transition-all duration-200 group-hover/row:shadow-apple-sm ${extra}`.trim();
  };

  const hasNextRow = rowIdx < groupRowIds.length - 1;
  const sessionYear = parseInt((viewSessionYmd || row.sessionDate || "").slice(0, 4), 10) || new Date().getFullYear();

  const customerEntry = findCustomerEntry(row, customerDirectory);
  const savedConsigneeOptions = customerEntry?.savedConsignees ?? [];

  const navDownSameField = (field: string) => () => {
    if (!hasNextRow) return;
    focusShipmentGridCell(groupRowIds[rowIdx + 1], field);
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
    <tr
      id={`shipment-row-${row.id}`}
      onClick={() => onSelectRow?.(row.id)}
      className={`group/row cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
        selected ? "scale-[1.002]" : ""
      }`}
    >
      <td className={cell("first", "text-center text-[10px] font-semibold tabular-nums text-apple-secondary dark:text-zinc-400")}>
        {row.stt}
      </td>
      <td className={cell("mid", "align-top")}>
        <div className="flex min-w-[8.5rem] flex-col gap-0">
          <InlineAwbEdit
            rowId={row.id}
            value={row.awb}
            allRows={allRows}
            className="font-shipment-data text-[1.2rem] font-bold leading-tight"
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
      <td className={cell("mid")}>
        <InlineCustomerEdit
          value={row.customer}
          customerId={row.customerId}
          profileSelection={row}
          customerDirectory={customerDirectory}
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
      <td className={cell("last", "overflow-visible py-0.5 align-middle")}>
        <ShipmentRowActionsMenu
          row={row}
          customerDirectory={customerDirectory}
          onPrint={onPrint}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      </td>
    </tr>
  );
}

const ShipmentTableRow = memo(ShipmentTableRowImpl, (prev, next) => {
  return (
    prev.row === next.row &&
    prev.rowIdx === next.rowIdx &&
    prev.highlighted === next.highlighted &&
    prev.selected === next.selected &&
    prev.viewSessionYmd === next.viewSessionYmd &&
    prev.customerDirectory === next.customerDirectory &&
    prev.allRows === next.allRows &&
    prev.groupRowIds === next.groupRowIds
  );
});
