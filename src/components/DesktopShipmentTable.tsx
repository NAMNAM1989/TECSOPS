import { memo, useMemo, useState } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { StatusSelect } from "./StatusBadge";
import { WarehouseGridPicker } from "./WarehouseGridPicker";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { InlineTextEdit } from "./InlineTextEdit";
import { InlineCustomerEdit } from "./InlineCustomerEdit";
import { OpsRowNoteControl } from "./OpsRowNoteControl";
import {
  formatYmdToFlightDateDdMon,
  parseBookingDateLoose,
} from "../utils/bookingDateParse";
import { focusShipmentGridCell } from "../utils/focusShipmentGrid";
import { InlineAwbEdit } from "./InlineAwbEdit";
import { MobileDimKgModal } from "./MobileDimKgModal";
import {
  statusRowAccent,
  statusRowBg,
  statusRowSelected,
  flightNumberAccent,
} from "./statusStyles";
import { ShipmentRowActionsMenu } from "./ShipmentRowActionsMenu";
import { normalizeWarehouse, warehouseLabel } from "../constants/warehouses";
import { formatShipmentDimWeightDisplay } from "../utils/volumetricDim";
import { InlineCustomerInfoCell } from "./InlineCustomerInfoCell";
import { CneeDetailPopover } from "./CneeDetailPopover";
import { VehicleTypeMissingBadge } from "./VehicleTypeMissingBadge";
import { useIsMobile } from "../hooks/useIsMobile";
import type { EcargoVctResult } from "../utils/ecargoVctResultsStore";
import {
  validateInlineDimWeightKg,
  validateInlineKg,
  validateInlinePcs,
} from "../utils/inlineShipmentFieldValidation";
import { useToast } from "../ui";

interface Props {
  rows: Shipment[];
  allRows: Shipment[];
  customerDirectory?: readonly CustomerDirectoryEntry[];
  activeWarehouse: Warehouse;
  onActiveWarehouseChange: (wh: Warehouse) => void;
  metricRows: Shipment[];
  onUpdate: (id: string, patch: Partial<Shipment>) => void | Promise<boolean | void>;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  viewSessionYmd: string;
  searchHighlightWarehouses?: readonly Warehouse[];
  highlightedShipmentId?: string | null;
  selectedRowId?: string | null;
  onSelectRow?: (id: string | null) => void;
  onAddBlankRow?: (warehouse: Warehouse) => void;
  /** Kết quả eCargo VCT theo shipmentId */
  ecargoVctById?: Record<string, EcargoVctResult>;
  onUpdateCustomers?: (
    customers: CustomerDirectoryEntry[]
  ) => Promise<boolean | void>;
}

type ColHeader = { key: string; label: string; w: string; title?: string };

/** ~200px — đủ đọc tên Shipper/CNEE, vẫn gọn cạnh STATUS. */
const INFO_KH_W = "w-[12.5rem] max-w-[12.5rem]";
/** Vừa đủ nội dung thật — không truncate AWB/chuyến; KHÁCH tối đa 2 dòng. */
const AWB_W = "w-[9rem] max-w-[9rem]";
const FLIGHT_W = "w-[5rem] max-w-[5rem]";
const CUSTOMER_W = "w-[6.5rem] max-w-[6.5rem]";

const COL_HEADERS: ColHeader[] = [
  { key: "stt", label: "#", w: "w-9" },
  { key: "awb", label: "AWB / HAWB", w: `${AWB_W} sticky left-0 z-[1]` },
  { key: "flight", label: "CHUYẾN", w: FLIGHT_W },
  { key: "dest", label: "DST", w: "w-14 text-center" },
  { key: "pcs", label: "KIỆN", w: "w-14 text-right" },
  { key: "kg", label: "KG", w: "w-14 text-right" },
  { key: "dim", label: "DIM", w: "w-16 text-right" },
  { key: "customer", label: "KHÁCH", w: CUSTOMER_W },
  {
    key: "customerInfo",
    label: "INFO KH",
    /** Cố định bề rộng — tránh <select> option dài kéo cột. */
    w: INFO_KH_W,
    title: "Shipper · CNEE · Tên hàng · CNEE in ấn",
  },
  {
    key: "status",
    label: "STATUS",
    w: "min-w-[6.5rem] max-w-[7.5rem]",
    title: "Trạng thái lô",
  },
  { key: "actions", label: "", w: "min-w-[6.5rem]", title: "Ghi chú & thao tác" },
];

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
  ecargoVctById,
  onUpdateCustomers,
}: Props) {
  const isMobile = useIsMobile();
  const [dimModalRow, setDimModalRow] = useState<Shipment | null>(null);
  const group = useMemo(
    () =>
      rows
        .filter((r) => normalizeWarehouse(r.warehouse) === activeWarehouse)
        .sort((a, b) => (a.stt ?? 0) - (b.stt ?? 0) || a.id.localeCompare(b.id)),
    [rows, activeWarehouse],
  );
  const groupRowIds = useMemo(() => group.map((r) => r.id), [group]);

  return (
    <>
      <div className={isMobile ? "hidden" : "hidden md:block space-y-1.5"}>
        <WarehouseGridPicker
          rows={metricRows}
          active={activeWarehouse}
          onSelect={onActiveWarehouseChange}
          onAddRow={onAddBlankRow}
          highlightWarehouses={searchHighlightWarehouses}
        />

        <section
          id={`warehouse-section-${activeWarehouse}`}
          className="overflow-hidden rounded-xl border border-ui-border bg-ui-surface shadow-ui-sm"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ui-border px-2.5 py-1.5">
            <div className="min-w-0">
              <h2 className="text-[13px] font-bold leading-tight text-ui-text">
                {warehouseLabel[activeWarehouse]}
                <span className="ml-1.5 text-[11px] font-semibold text-ui-text-muted">
                  · {group.length} lô
                </span>
              </h2>
            </div>
          </div>
          <div
            className={`overflow-auto px-1.5 py-1.5 ${
              group.length > 4 ? "max-h-[min(82vh,820px)]" : ""
            }`}
          >
            <table className="w-full border-separate border-spacing-x-0 border-spacing-y-0.5 text-left text-[13px] leading-snug">
              <thead className="sticky top-0 z-20">
                <tr className="bg-ui-background">
                  {COL_HEADERS.map((c) => (
                    <th
                      key={c.key}
                      title={c.title}
                      className={`box-border px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ui-text-muted ${
                        c.key === "customerInfo" || c.key === "status"
                          ? "truncate"
                          : "whitespace-nowrap"
                      } ${c.w} ${c.key === "awb" ? "bg-ui-background" : ""}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COL_HEADERS.length}
                      className="px-3 py-8 text-center"
                    >
                      <button
                        type="button"
                        onClick={() => onAddBlankRow?.(activeWarehouse)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ui-primary px-4 py-2 text-[13px] font-bold text-white shadow-ui-sm hover:bg-ui-primary-hover"
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
                      onUpdateCustomers={onUpdateCustomers}
                      onDelete={onDelete}
                      onPrint={onPrint}
                      onOpenDimModal={setDimModalRow}
                      ecargoVct={ecargoVctById?.[row.id]}
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
          customerDirectory={customerDirectory}
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
  onUpdateCustomers,
  onDelete,
  onPrint,
  onOpenDimModal,
  ecargoVct,
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
  onUpdate: (id: string, patch: Partial<Shipment>) => void | Promise<boolean | void>;
  onUpdateCustomers?: (
    customers: CustomerDirectoryEntry[]
  ) => Promise<boolean | void>;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onOpenDimModal: (s: Shipment) => void;
  ecargoVct?: EcargoVctResult;
}) {
  const toast = useToast();
  const bg = statusRowBg;
  const accent = statusRowAccent[row.status];
  const cell = (part: "first" | "mid" | "last" | "awb", extra = "") => {
    const round =
      part === "first" ? "rounded-l-xl" : part === "last" ? "rounded-r-xl" : "";
    const accentCls = part === "first" ? accent : "";
    const hl = highlighted ? "ring-2 ring-inset ring-ui-primary/45" : "";
    const surface = selected ? statusRowSelected : bg;
    const stickyAwb =
      part === "awb"
        ? "sticky left-0 z-[1] shadow-[2px_0_0_rgba(15,23,42,0.06)]"
        : "";
    return `${surface} ${accentCls} ${round} ${hl} ${stickyAwb} border-y border-ui-border/70 ${
      part === "first" ? "border-l border-ui-border/70" : ""
    } ${part === "last" ? "border-r border-ui-border/70" : ""} px-1.5 py-1 ${extra}`.trim();
  };

  const hasNextRow = rowIdx < groupRowIds.length - 1;
  const sessionYear =
    parseInt((viewSessionYmd || row.sessionDate || "").slice(0, 4), 10) ||
    new Date().getFullYear();

  const navDownSameField = (field: string) => () => {
    if (!hasNextRow) return;
    focusShipmentGridCell(groupRowIds[rowIdx + 1], field);
  };

  const onFlightDateCommit = (t: string) => {
    const ymd = parseBookingDateLoose(t, sessionYear);
    if (!ymd) {
      toast.warning(
        "Ngày bay không hợp lệ (ví dụ 15APR hoặc 15/04/2026).",
        "Ngày bay"
      );
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
      className={`group/row cursor-pointer ${selected ? "relative z-[1]" : ""}`}
    >
      <td
        className={cell(
          "first",
          "text-center font-shipment-data text-[11px] font-semibold tabular-nums text-ui-text-muted",
        )}
      >
        {row.stt}
      </td>
      <td className={cell("awb", `box-border ${AWB_W} align-top`)}>
        <div className="flex w-full flex-col gap-0">
          <InlineAwbEdit
            rowId={row.id}
            value={row.awb}
            allRows={allRows}
            className="font-shipment-data text-[14px] font-bold leading-tight tracking-tight"
            onCommit={(awb) => onUpdate(row.id, { awb })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "hawb")}
          />
          <InlineTextEdit
            value={row.hawb ?? ""}
            placeholder="HAWB"
            title={row.hawb?.trim() ? `HAWB: ${row.hawb}` : undefined}
            className="font-shipment-data text-[11px] font-semibold ops-grid-cell-muted"
            maxLength={32}
            gridNav={{ rowId: row.id, field: "hawb" }}
            onCommit={(v) => onUpdate(row.id, { hawb: v.slice(0, 32) })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "flight")}
          />
          {row.warehouse === "SCSC" && ecargoVct?.status === "done" ? (
            <span
              className="mt-0.5 inline-flex w-fit rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800"
              title={ecargoVct.vctCode || "eCargo OK"}
            >
              eCargo {ecargoVct.vctCode ? ecargoVct.vctCode.slice(0, 12) : "OK"}
            </span>
          ) : row.warehouse === "SCSC" && ecargoVct?.status === "error" ? (
            <span className="mt-0.5 inline-flex w-fit rounded bg-rose-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-800">
              eCargo lỗi
            </span>
          ) : row.warehouse === "SCSC" &&
            (ecargoVct?.status === "otp" || ecargoVct?.status === "pending") ? (
            <span className="mt-0.5 inline-flex w-fit rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900">
              eCargo…
            </span>
          ) : null}
        </div>
      </td>
      <td className={cell("mid", `box-border ${FLIGHT_W} align-top`)}>
        <div className="flex w-full flex-col gap-0">
          <InlineTextEdit
            value={row.flight}
            placeholder="Chuyến"
            title={row.flight?.trim() ? `Chuyến: ${row.flight}` : undefined}
            className={`font-shipment-data text-[13px] font-bold ${flightNumberAccent} ops-grid-cell`}
            uppercase
            maxLength={12}
            gridNav={{ rowId: row.id, field: "flight" }}
            onCommit={(v) => onUpdate(row.id, { flight: v })}
            onEnterNavigateDown={() =>
              focusShipmentGridCell(row.id, "flightDate")
            }
          />
          <InlineTextEdit
            value={row.flightDate}
            placeholder="15APR"
            title={row.flightDate?.trim() ? `Ngày: ${row.flightDate}` : undefined}
            className="font-shipment-data text-[11px] font-medium ops-grid-cell-muted"
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
          className="font-shipment-data text-center text-[13px] font-semibold ops-grid-cell"
          uppercase
          maxLength={3}
          gridNav={{ rowId: row.id, field: "dest" }}
          onCommit={(v) => onUpdate(row.id, { dest: v.slice(0, 3) })}
          onEnterNavigateDown={
            hasNextRow ? navDownSameField("dest") : undefined
          }
        />
      </td>
      <td className={cell("mid", "text-right")}>
        <InlineNumberEdit
          value={row.pcs}
          variant="grid"
          title="Click để sửa số kiện"
          className="font-shipment-data text-right text-[13px] font-bold tabular-nums text-ui-text"
          gridNav={{ rowId: row.id, field: "pcs" }}
          validate={validateInlinePcs}
          onCommit={(v) => onUpdate(row.id, { pcs: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("pcs") : undefined}
        />
      </td>
      <td className={cell("mid", "text-right")}>
        <InlineNumberEdit
          value={row.kg}
          variant="grid"
          title="Click để sửa kg"
          className="font-shipment-data text-right text-[13px] font-bold tabular-nums text-ui-text"
          gridNav={{ rowId: row.id, field: "kg" }}
          validate={validateInlineKg}
          onCommit={(v) => onUpdate(row.id, { kg: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("kg") : undefined}
        />
      </td>
      <td className={cell("mid", "text-right align-top")}>
        <div className="flex flex-col items-end gap-0.5">
          {(row.dimLines?.length ?? 0) > 0 ? (
            <span className="font-shipment-data text-[12px] font-semibold tabular-nums ops-grid-cell">
              {formatShipmentDimWeightDisplay(row)}
            </span>
          ) : (
            <InlineNumberEdit
              value={row.dimWeightKg}
              placeholder="—"
              title="Click để sửa DIM kg"
              className="font-shipment-data text-right text-[12px] font-semibold tabular-nums text-ui-text"
              gridNav={{ rowId: row.id, field: "dimKg" }}
              validate={validateInlineDimWeightKg}
              onCommit={(v) =>
                onUpdate(row.id, {
                  dimWeightKg: v,
                  dimLines: null,
                  dimDivisor: null,
                })
              }
              onEnterNavigateDown={
                hasNextRow ? navDownSameField("dimKg") : undefined
              }
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ui-primary/35 bg-ui-primary/8 text-ui-primary hover:bg-ui-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </button>
        </div>
      </td>
      <td className={cell("mid", `box-border ${CUSTOMER_W} align-top`)}>
        <div className="flex w-full items-start gap-0.5">
          <div className="min-w-0 flex-1">
            <InlineCustomerEdit
              value={row.customer}
              customerId={row.customerId}
              profileSelection={row}
              customerDirectory={customerDirectory}
              placeholder="Khách"
              className="min-w-0 whitespace-normal break-words text-[12px] font-semibold leading-snug line-clamp-2 ops-grid-cell"
              maxLength={120}
              gridNav={{ rowId: row.id, field: "customer" }}
              onCommit={(patch) => onUpdate(row.id, patch)}
              onEnterNavigateDown={
                hasNextRow ? navDownSameField("customer") : undefined
              }
              onTabNavigateNext={() => focusShipmentGridCell(row.id, "note")}
            />
          </div>
          {onUpdateCustomers ? (
            <VehicleTypeMissingBadge
              shipment={row}
              customerDirectory={customerDirectory}
              onUpdateCustomers={onUpdateCustomers}
            />
          ) : null}
          <CneeDetailPopover
            shipment={row}
            customerDirectory={customerDirectory}
            sessionYmdFallback={viewSessionYmd}
            className="mt-0.5 shrink-0"
          />
        </div>
      </td>
      <td
        className={cell(
          "mid",
          `box-border ${INFO_KH_W} align-middle overflow-hidden`,
        )}
      >
        <div className="min-w-0 w-full max-w-[12.5rem] overflow-hidden">
          <InlineCustomerInfoCell
            shipment={row}
            customerDirectory={customerDirectory}
            sessionYmdFallback={viewSessionYmd}
            onUpdate={(patch) => onUpdate(row.id, patch)}
          />
        </div>
      </td>
      <td className={cell("mid", "align-middle")}>
        <StatusSelect
          value={row.status}
          warehouse={row.warehouse}
          compact
          onChange={(s: ShipmentStatus) => onUpdate(row.id, { status: s })}
        />
      </td>
      <td className={cell("last", "overflow-visible py-0.5 align-middle")}>
        <div className="flex items-center justify-end gap-0.5">
          <OpsRowNoteControl
            rowId={row.id}
            value={row.note ?? ""}
            onCommit={(v) => onUpdate(row.id, { note: v })}
          />
          <ShipmentRowActionsMenu
            row={row}
            customerDirectory={customerDirectory}
            onPrint={onPrint}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        </div>
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
