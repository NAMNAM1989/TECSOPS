import { useState } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import { StatusSelect } from "./StatusBadge";
import { SummaryBar } from "./SummaryBar";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { InlineTextEdit } from "./InlineTextEdit";
import { formatYmdToFlightDateDdMon, parseBookingDateLoose } from "../utils/bookingDateParse";
import { focusShipmentGridCell } from "../utils/focusShipmentGrid";
import { InlineAwbEdit } from "./InlineAwbEdit";
import { InlineCutoffBlock } from "./InlineCutoffBlock";
import { MobileDimKgModal } from "./MobileDimKgModal";
import { statusRowBg, statusRowBorder } from "./statusStyles";
import { canPrintDimScscReport, printDimReport } from "../utils/printDimReport";
import {
  canExportTcsDimTemplate,
  downloadTcsAttachedDimsExcel,
  printTcsAttachedDimsList,
} from "../utils/exportTcsAttachedDimsExcel";

interface Props {
  rows: Shipment[];
  /** Toàn bộ lô (kiểm tra trùng AWB khi sửa inline). */
  allRows: Shipment[];
  /** Thêm dòng trống vào đúng kho (nút cạnh tiêu đề TCS / SCSC). */
  onAddBlankRow: (warehouse: Warehouse) => void;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onEdit: (s: Shipment) => void;
}

const WAREHOUSES: Warehouse[] = ["TECS-TCS", "TECS-SCSC"];

const COL_HEADERS = [
  { key: "stt", label: "#", w: "w-9" },
  { key: "awb", label: "AWB / BOOKING", w: "min-w-[150px]" },
  { key: "flight", label: "CHUYẾN BAY", w: "min-w-[110px]" },
  { key: "cutoff", label: "CUTOFF / NOTE", w: "min-w-[120px]" },
  { key: "dest", label: "DEST", w: "w-16" },
  { key: "pcs", label: "KIỆN", w: "w-16 text-right" },
  { key: "kg", label: "KG", w: "w-16 text-right" },
  { key: "dim", label: "DIM kg", w: "min-w-[5.5rem] text-right" },
  { key: "customer", label: "KHÁCH HÀNG", w: "min-w-[120px]" },
  { key: "note", label: "NOTE", w: "min-w-[100px] max-w-[180px]" },
  { key: "status", label: "TRẠNG THÁI", w: "min-w-[110px]" },
  { key: "actions", label: "", w: "w-44" },
] as const;

export function DesktopShipmentTable({ rows, allRows, onAddBlankRow, onUpdate, onDelete, onPrint, onEdit }: Props) {
  const [dimModalRow, setDimModalRow] = useState<Shipment | null>(null);

  return (
    <>
    <div className="hidden md:block space-y-8">
      {WAREHOUSES.map((wh) => {
        const group = rows.filter((r) => r.warehouse === wh);

        return (
          <section key={wh}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h2 className="text-[19px] font-semibold tracking-tight text-apple-label">{wh}</h2>
                <span className="rounded-full bg-apple-label px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  {group.length} lô
                </span>
                <button
                  type="button"
                  title={`Thêm dòng booking vào ${wh}`}
                  onClick={() => void onAddBlankRow(wh)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-apple-blue px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-apple-blue-hover active:scale-[0.98]"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Nhập booking
                </button>
              </div>
              <SummaryBar rows={rows} warehouse={wh} />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-apple">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-black/[0.08] bg-apple-bg">
                    {COL_HEADERS.map((c) => (
                      <th
                        key={c.key}
                        className={`whitespace-nowrap border-r border-black/[0.06] px-2.5 py-3 text-[10px] font-semibold uppercase tracking-wider text-apple-secondary last:border-r-0 ${c.w}`}
                      >
                        {c.label || "THAO TÁC"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.length === 0 ? (
                    <tr>
                      <td
                        colSpan={COL_HEADERS.length}
                        className="px-4 py-8 text-center text-sm italic text-apple-tertiary"
                      >
                        Chưa có lô — bấm « Nhập booking » phía trên để thêm dòng.
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      const groupRowIds = group.map((r) => r.id);
                      return group.map((row) => (
                        <ShipmentRow
                          key={row.id}
                          row={row}
                          groupRowIds={groupRowIds}
                          allRows={allRows}
                          onUpdate={onUpdate}
                          onDelete={onDelete}
                          onPrint={onPrint}
                          onEdit={onEdit}
                          onOpenDimModal={setDimModalRow}
                        />
                      ));
                    })()
                  )}
                </tbody>
              </table>
            </div>
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
    </>
  );
}

function ShipmentRow({
  row,
  groupRowIds,
  allRows,
  onUpdate,
  onDelete,
  onPrint,
  onEdit,
  onOpenDimModal,
}: {
  row: Shipment;
  groupRowIds: string[];
  allRows: Shipment[];
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onEdit: (s: Shipment) => void;
  onOpenDimModal: (s: Shipment) => void;
}) {
  const bg = statusRowBg[row.status];
  const border = statusRowBorder[row.status];
  const sessionYear = parseInt(row.sessionDate.slice(0, 4), 10) || new Date().getFullYear();
  const rowIdx = groupRowIds.indexOf(row.id);
  const hasNextRow = rowIdx >= 0 && rowIdx < groupRowIds.length - 1;

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
    <tr
      id={`shipment-row-${row.id}`}
      className={`border-b border-black/[0.06] transition-colors hover:brightness-[0.99] ${bg} ${border}`}
    >
      {/* # */}
      <td className="border-r border-black/[0.06] px-2.5 py-2 text-center text-xs font-semibold text-apple-secondary">
        {row.stt}
      </td>
      {/* AWB — nhập inline (thêm dòng từ « Nhập booking »). */}
      <td className="border-r border-black/[0.06] px-1 py-1">
        <InlineAwbEdit
          rowId={row.id}
          value={row.awb}
          allRows={allRows}
          onCommit={(awb) => onUpdate(row.id, { awb })}
          onEnterNavigateDown={() => focusShipmentGridCell(row.id, "flight")}
        />
      </td>
      {/* Flight — 2 dòng: chuyến + ngày, Enter xuống ô kế */}
      <td className="border-r border-black/[0.06] px-1.5 py-1 align-top">
        <div className="flex min-w-[6.5rem] flex-col gap-0.5">
          <InlineTextEdit
            value={row.flight}
            placeholder="Chuyến"
            className="font-semibold text-apple-label"
            uppercase
            maxLength={12}
            gridNav={{ rowId: row.id, field: "flight" }}
            onCommit={(v) => onUpdate(row.id, { flight: v })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "flightDate")}
          />
          <InlineTextEdit
            value={row.flightDate}
            placeholder="15APR"
            className="text-[11px] font-medium text-apple-secondary"
            uppercase
            maxLength={16}
            gridNav={{ rowId: row.id, field: "flightDate" }}
            onCommit={onFlightDateCommit}
            onEnterNavigateDown={onFlightDateEnterDown}
          />
        </div>
      </td>
      {/* Cutoff (giờ + ngày) + ghi chú cutoff — nhập inline */}
      <td className="border-r border-black/[0.06] px-1 py-1 align-top">
        <div className="flex min-w-[6rem] flex-col gap-1">
          <InlineCutoffBlock
            rowId={row.id}
            cutoffIso={row.cutoff}
            sessionYear={sessionYear}
            onCommit={(iso) => onUpdate(row.id, { cutoff: iso })}
            onEnterAfterCommit={() => focusShipmentGridCell(row.id, "cutoffNote")}
          />
          <InlineTextEdit
            value={row.cutoffNote ?? ""}
            placeholder="PER / note"
            className="text-[10px] font-semibold text-apple-label"
            uppercase
            maxLength={32}
            gridNav={{ rowId: row.id, field: "cutoffNote" }}
            onCommit={(v) => onUpdate(row.id, { cutoffNote: v })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "dest")}
          />
        </div>
      </td>
      {/* DEST */}
      <td className="border-r border-black/[0.06] px-1 py-1 text-center">
        <InlineTextEdit
          value={row.dest}
          placeholder="DEST"
          className="text-center text-sm font-semibold text-apple-label"
          uppercase
          maxLength={3}
          gridNav={{ rowId: row.id, field: "dest" }}
          onCommit={(v) => onUpdate(row.id, { dest: v.slice(0, 3) })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("dest") : undefined}
        />
      </td>
      {/* PCS — inline edit */}
      <td className="border-r border-black/[0.06] px-1.5 py-1 text-right">
        <InlineNumberEdit
          value={row.pcs}
          placeholder="Nhập"
          className="font-mono text-sm font-bold tabular-nums"
          gridNav={{ rowId: row.id, field: "pcs" }}
          onCommit={(v) => onUpdate(row.id, { pcs: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("pcs") : undefined}
        />
      </td>
      {/* KG — inline edit */}
      <td className="border-r border-black/[0.06] px-1.5 py-1 text-right">
        <InlineNumberEdit
          value={row.kg}
          placeholder="Nhập"
          className="font-mono text-sm font-bold tabular-nums"
          gridNav={{ rowId: row.id, field: "kg" }}
          onCommit={(v) => onUpdate(row.id, { kg: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("kg") : undefined}
        />
      </td>
      {/* DIM kg — khi đã có D×R×C: chỉ hiển thị + modal (tránh sửa nhanh làm mất dimLines → mất in DIM) */}
      <td className="border-r border-black/[0.06] px-1.5 py-1 text-right align-top">
        <div className="flex flex-col items-end gap-1">
          {(row.dimLines?.length ?? 0) > 0 ? (
            <span
              className="font-mono text-xs font-semibold tabular-nums text-apple-label"
              title="Đã có chi tiết kiện — chỉnh kg/DIM trong « D×R×C » để giữ bảng in."
            >
              {row.dimWeightKg != null ? row.dimWeightKg : "—"}
            </span>
          ) : (
            <InlineNumberEdit
              value={row.dimWeightKg}
              placeholder="—"
              className="font-mono text-xs font-semibold tabular-nums"
              gridNav={{ rowId: row.id, field: "dimKg" }}
              onCommit={(v) =>
                onUpdate(row.id, { dimWeightKg: v, dimLines: null, dimDivisor: null })
              }
              onEnterNavigateDown={hasNextRow ? navDownSameField("dimKg") : undefined}
            />
          )}
          {(row.dimLines?.length ?? 0) > 0 ? (
            <span className="text-[9px] font-medium text-apple-tertiary">{row.dimLines!.length} nhóm</span>
          ) : null}
          <button
            type="button"
            title="Nhập DIM đầy đủ (D×R×C × kiện, tính khối / nhập kg)"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDimModal(row);
            }}
            className="rounded-lg border border-apple-blue/35 bg-apple-blue/8 px-1.5 py-0.5 text-[10px] font-bold leading-none text-apple-blue hover:bg-apple-blue/15"
          >
            D×R×C
          </button>
        </div>
      </td>
      {/* Customer */}
      <td className="border-r border-black/[0.06] px-1 py-1">
        <InlineTextEdit
          value={row.customer}
          placeholder="Khách"
          className="text-sm font-semibold text-apple-label"
          maxLength={120}
          gridNav={{ rowId: row.id, field: "customer" }}
          onCommit={(v) => onUpdate(row.id, { customer: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("customer") : undefined}
        />
      </td>
      {/* Note */}
      <td className="border-r border-black/[0.06] px-1 py-1 align-top">
        <InlineTextEdit
          value={row.note ?? ""}
          placeholder="Ghi chú"
          className="line-clamp-2 text-left text-xs leading-snug text-apple-secondary"
          maxLength={2000}
          gridNav={{ rowId: row.id, field: "note" }}
          onCommit={(v) => onUpdate(row.id, { note: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("note") : undefined}
        />
      </td>
      {/* Status */}
      <td className="border-r border-black/[0.06] px-2 py-2">
        <StatusSelect
          value={row.status}
          compact
          onChange={(s: ShipmentStatus) => onUpdate(row.id, { status: s })}
        />
      </td>
      {/* Actions */}
      <td className="px-1.5 py-2">
        <div className="flex flex-wrap items-center justify-center gap-0.5">
          <button
            type="button"
            title="Sửa lô"
            onClick={() => onEdit(row)}
            className="rounded-full p-2 text-apple-blue hover:bg-apple-blue/10"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
              />
            </svg>
          </button>
          {canPrintDimScscReport(row) ? (
            <button
              type="button"
              title="In DIM SCSC (form MAWB + bảng kích thước)"
              onClick={() => printDimReport(row)}
              className="rounded-full p-2 text-apple-secondary hover:bg-emerald-50 hover:text-emerald-800"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
          ) : null}
          {row.warehouse === "TECS-TCS" && canExportTcsDimTemplate(row) ? (
            <>
              <button
                type="button"
                title="LIST DIM TCS — Excel mẫu ATTACHED_LIST_DIMS"
                onClick={() => downloadTcsAttachedDimsExcel(row)}
                className="rounded-full p-2 text-emerald-700 hover:bg-emerald-50"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </button>
              <button
                type="button"
                title="IN DIM TCS — in bảng 4 cột"
                onClick={() => printTcsAttachedDimsList(row)}
                className="rounded-full p-2 text-emerald-700 hover:bg-emerald-50"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
              </button>
            </>
          ) : null}
          <button
            type="button"
            title="In nhãn"
            onClick={() => onPrint(row)}
            className="rounded-full p-2 text-apple-secondary hover:bg-black/[0.05] hover:text-apple-label"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
          </button>
          <button
            type="button"
            title="Xóa"
            onClick={() => {
              if (confirm(`Xóa AWB ${row.awb}?`)) onDelete(row.id);
            }}
            className="rounded-full p-2 text-apple-tertiary hover:bg-red-50 hover:text-red-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}
