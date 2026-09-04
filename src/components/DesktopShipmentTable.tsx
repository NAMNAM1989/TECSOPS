import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { findAwbDigitsConflict } from "../utils/awbUnique";
import { StatusSelect } from "./StatusBadge";
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
import { LazyMobileDimKgModal } from "./LazyMobileDimKgModal";
import {
  statusRowAccent,
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
import {
  validateInlineDimWeightKg,
  validateInlineKg,
  validateInlinePcs,
} from "../utils/inlineShipmentFieldValidation";
import { useToast } from "../ui";
import { NewBookingButton } from "./NewBookingButton";

interface Props {
  rows: Shipment[];
  allRows: Shipment[];
  customerDirectory?: readonly CustomerDirectoryEntry[];
  activeWarehouse: Warehouse;
  onUpdate: (id: string, patch: Partial<Shipment>) => void | Promise<boolean | void>;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  /** Invoice H21 — kho SCSC hoặc TCS. */
  onInvoice?: (s: Shipment) => void;
  viewSessionYmd: string;
  highlightedShipmentId?: string | null;
  selectedRowId?: string | null;
  onSelectRow?: (id: string | null) => void;
  onAddBlankRow?: (warehouse: Warehouse) => void;
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
const CUSTOMER_W = "w-[8.75rem] max-w-[8.75rem]";

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
    w: INFO_KH_W,
    title: "Shipper · CNEE · Tên hàng · CNEE in ấn",
  },
  {
    key: "status",
    label: "STATUS",
    w: "min-w-[6.5rem] max-w-[7.5rem]",
    title: "Trạng thái lô",
  },
  { key: "actions", label: "THAO TÁC", w: "min-w-[7.25rem]", title: "Ghi chú, in & menu" },
];

export function DesktopShipmentTable({
  rows,
  allRows,
  customerDirectory = [],
  activeWarehouse,
  highlightedShipmentId,
  selectedRowId,
  onSelectRow,
  onAddBlankRow,
  onUpdate,
  onDelete,
  onPrint,
  onInvoice,
  viewSessionYmd,
  onUpdateCustomers,
}: Props) {
  const isMobile = useIsMobile();
  const [dimModalRow, setDimModalRow] = useState<Shipment | null>(null);
  const allRowsRef = useRef(allRows);
  allRowsRef.current = allRows;
  const findAwbConflict = useCallback((digits: string, exceptId: string) => {
    return findAwbDigitsConflict(allRowsRef.current, digits, exceptId);
  }, []);
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
      <div
        className={isMobile ? "hidden" : "hidden md:block space-y-1"}
        data-testid="ops-desktop-shipment-table"
      >
        <section
          id={`warehouse-section-${activeWarehouse}`}
          className="mx-0 overflow-hidden rounded-2xl border border-ui-border/90 bg-ui-surface shadow-ui-md md:mx-5 md:mt-4"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ui-border/80 bg-ui-surface px-4 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="min-w-0">
                <h2 className="text-[12px] font-extrabold leading-tight tracking-tight text-ui-navy">
                  {warehouseLabel[activeWarehouse]}
                  <span className="ml-1.5 text-[10px] font-semibold text-ui-text-muted">
                    · {group.length} lô
                  </span>
                </h2>
              </div>
              {onAddBlankRow ? (
                <NewBookingButton
                  activeWarehouse={activeWarehouse}
                  onAdd={onAddBlankRow}
                />
              ) : null}
            </div>
          </div>
          <div
            className={`overflow-auto px-1 py-0.5 ${
              group.length > 4 ? "max-h-[min(86vh,860px)]" : ""
            }`}
          >
            <table className="w-full border-separate border-spacing-x-0 border-spacing-y-1.5 text-left text-[13px] leading-tight">
              <thead className="sticky top-0 z-20">
                <tr className="ops-table-head">
                  {COL_HEADERS.map((c) => (
                    <th
                      key={c.key}
                      title={c.title}
                      className={`box-border px-1 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ui-text-muted ${
                        c.key === "customerInfo" || c.key === "status"
                          ? "truncate"
                          : "whitespace-nowrap"
                      } ${c.w} ${c.key === "awb" ? "ops-table-head" : ""}`}
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
                      findAwbConflict={findAwbConflict}
                      customerDirectory={customerDirectory}
                      onUpdate={onUpdate}
                      onUpdateCustomers={onUpdateCustomers}
                      onDelete={onDelete}
                      onPrint={onPrint}
                      onInvoice={onInvoice}
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
        <LazyMobileDimKgModal
          key={dimModalRow.id}
          row={dimModalRow}
          customerDirectory={customerDirectory}
          onUpdateCustomers={onUpdateCustomers}
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
  findAwbConflict,
  customerDirectory,
  onUpdate,
  onUpdateCustomers,
  onDelete,
  onPrint,
  onInvoice,
  onOpenDimModal,
}: {
  row: Shipment;
  rowIdx: number;
  groupRowIds: string[];
  viewSessionYmd: string;
  highlighted?: boolean;
  selected?: boolean;
  onSelectRow?: (id: string | null) => void;
  findAwbConflict: (digits: string, exceptId: string) => Shipment | null;
  customerDirectory: readonly CustomerDirectoryEntry[];
  onUpdate: (id: string, patch: Partial<Shipment>) => void | Promise<boolean | void>;
  onUpdateCustomers?: (
    customers: CustomerDirectoryEntry[]
  ) => Promise<boolean | void>;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onInvoice?: (s: Shipment) => void;
  onOpenDimModal: (s: Shipment) => void;
}) {
  const toast = useToast();
  /** Mỗi lô một tint — 5 màu xoay, dễ tách khi nhiều hàng. */
  const lotSurface = `ops-lot-surface-${rowIdx % 5}`;
  const bg = selected ? statusRowSelected : lotSurface;
  const accent = statusRowAccent[row.status];
  const cell = (part: "first" | "mid" | "last" | "awb", extra = "") => {
    const round =
      part === "first" ? "rounded-l-xl" : part === "last" ? "rounded-r-xl" : "";
    const accentCls = part === "first" ? accent : "";
    const hl = highlighted ? "ring-2 ring-inset ring-ui-primary/45" : "";
    const surface = selected ? statusRowSelected : bg;
    const stickyAwb =
      part === "awb"
        ? "sticky left-0 z-[1] shadow-[2px_0_0_rgba(11,18,32,0.06)]"
        : "";
    const cardEdge =
      "border-y border-ui-border/70 shadow-[0_1px_0_rgba(15,23,42,0.04)]";
    return `${surface} ${accentCls} ${round} ${hl} ${stickyAwb} ${cardEdge} transition-colors duration-150 ease-fluid group-hover/row:shadow-[inset_0_0_0_9999px_rgba(13,148,136,0.06)] ${
      part === "first" ? "border-l border-ui-border/80" : ""
    } ${part === "last" ? "border-r border-ui-border/80" : ""} px-1 py-1 ${extra}`.trim();
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
      data-testid="ops-lot-card"
      data-lot-tone={rowIdx % 5}
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
            findAwbConflict={findAwbConflict}
            className="ops-awb !py-0 text-[14px] leading-tight"
            onCommit={(awb) => onUpdate(row.id, { awb })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "hawb")}
          />
          <InlineTextEdit
            value={row.hawb ?? ""}
            placeholder="HAWB"
            title={row.hawb?.trim() ? `HAWB: ${row.hawb}` : undefined}
            className="font-shipment-data !py-0 text-[11px] font-semibold ops-grid-cell-muted"
            maxLength={32}
            gridNav={{ rowId: row.id, field: "hawb" }}
            onCommit={(v) => onUpdate(row.id, { hawb: v.slice(0, 32) })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "flight")}
          />
        </div>
      </td>
      <td className={cell("mid", `box-border ${FLIGHT_W} align-top`)}>
        <div className="flex w-full flex-col gap-0">
          <InlineTextEdit
            value={row.flight}
            placeholder="Chuyến"
            title={row.flight?.trim() ? `Chuyến: ${row.flight}` : undefined}
            className={`font-shipment-data !py-0 text-[13px] font-bold ${flightNumberAccent} ops-grid-cell`}
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
            className="font-shipment-data !py-0 text-[11px] font-medium ops-grid-cell-muted"
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
          className="font-shipment-data !py-0 text-center text-[13px] font-extrabold text-ui-awb"
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
          className="font-shipment-data !py-0 text-right text-[13px] font-bold tabular-nums text-ui-text"
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
          className="font-shipment-data !py-0 text-right text-[13px] font-bold tabular-nums text-ui-text"
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
            aria-label="Sửa DIM"
            title="Sửa DIM (D×R×C)"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDimModal(row);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-ui-primary/35 bg-ui-primary/10 text-ui-primary hover:bg-ui-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
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
              className="min-w-0 whitespace-normal break-words text-[12px] font-extrabold leading-tight text-ui-awb line-clamp-2"
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
          dense
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
            onInvoice={onInvoice}
          />
        </div>
      </td>
    </tr>
  );
}

function shipmentRowRenderEqual(a: Shipment, b: Shipment): boolean {
  return (
    a.awb === b.awb &&
    a.flight === b.flight &&
    a.flightDate === b.flightDate &&
    a.dest === b.dest &&
    a.customer === b.customer &&
    a.pcs === b.pcs &&
    a.kg === b.kg &&
    a.dimWeightKg === b.dimWeightKg &&
    a.status === b.status &&
    a.note === b.note &&
    a.stt === b.stt &&
    (a.invoiceItems?.length ?? 0) === (b.invoiceItems?.length ?? 0) &&
    (a.invoiceDeclarations?.length ?? 0) === (b.invoiceDeclarations?.length ?? 0) &&
    (a.h21DeclarationShipperId ?? "") === (b.h21DeclarationShipperId ?? "")
  );
}

const ShipmentTableRow = memo(ShipmentTableRowImpl, (prev, next) => {
  return (
    (prev.row === next.row || shipmentRowRenderEqual(prev.row, next.row)) &&
    prev.rowIdx === next.rowIdx &&
    prev.highlighted === next.highlighted &&
    prev.selected === next.selected &&
    prev.viewSessionYmd === next.viewSessionYmd &&
    prev.customerDirectory === next.customerDirectory &&
    prev.findAwbConflict === next.findAwbConflict &&
    prev.groupRowIds === next.groupRowIds &&
    prev.onInvoice === next.onInvoice
  );
});
