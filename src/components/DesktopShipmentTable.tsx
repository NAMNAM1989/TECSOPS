import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import { CutoffCountdown } from "./CutoffCountdown";
import { StatusSelect } from "./StatusBadge";
import { SummaryBar } from "./SummaryBar";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { statusRowBg, statusRowBorder } from "./statusStyles";
import { canPrintDimReport, printDimReport } from "../utils/printDimReport";

interface Props {
  rows: Shipment[];
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
  { key: "dim", label: "DIM kg", w: "w-[4.5rem] text-right" },
  { key: "customer", label: "KHÁCH HÀNG", w: "min-w-[120px]" },
  { key: "note", label: "NOTE", w: "min-w-[100px] max-w-[180px]" },
  { key: "status", label: "TRẠNG THÁI", w: "min-w-[110px]" },
  { key: "actions", label: "", w: "w-36" },
] as const;

export function DesktopShipmentTable({ rows, onUpdate, onDelete, onPrint, onEdit }: Props) {
  return (
    <div className="hidden md:block space-y-8">
      {WAREHOUSES.map((wh) => {
        const group = rows.filter((r) => r.warehouse === wh);
        if (group.length === 0) return null;

        return (
          <section key={wh}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[19px] font-semibold tracking-tight text-apple-label">{wh}</h2>
                <span className="rounded-full bg-apple-label px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  {group.length} lô
                </span>
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
                  {group.map((row) => (
                    <ShipmentRow
                      key={row.id}
                      row={row}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      onPrint={onPrint}
                      onEdit={onEdit}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ShipmentRow({
  row,
  onUpdate,
  onDelete,
  onPrint,
  onEdit,
}: {
  row: Shipment;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onEdit: (s: Shipment) => void;
}) {
  const bg = statusRowBg[row.status];
  const border = statusRowBorder[row.status];

  return (
    <tr
      id={`shipment-row-${row.id}`}
      className={`border-b border-black/[0.06] transition-colors hover:brightness-[0.99] ${bg} ${border}`}
    >
      {/* # */}
      <td className="border-r border-black/[0.06] px-2.5 py-2 text-center text-xs font-semibold text-apple-secondary">
        {row.stt}
      </td>
      {/* AWB */}
      <td className="border-r border-black/[0.06] px-2.5 py-2">
        <span className="font-mono text-sm font-semibold tracking-tight text-apple-label">{row.awb}</span>
      </td>
      {/* Flight */}
      <td className="border-r border-black/[0.06] px-2.5 py-2">
        <span className="font-semibold text-apple-label">{row.flight}</span>
        <span className="ml-1 text-[11px] font-medium text-apple-secondary">/{row.flightDate}</span>
      </td>
      {/* Cutoff */}
      <td className="border-r border-black/[0.06] px-2.5 py-2 whitespace-nowrap">
        {row.cutoffNote && (
          <span className="mr-1 inline-block rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            {row.cutoffNote}
          </span>
        )}
        {row.cutoff ? (
          <CutoffCountdown iso={row.cutoff} />
        ) : (
          <span className="text-xs italic text-apple-tertiary">—</span>
        )}
      </td>
      {/* DEST */}
      <td className="border-r border-black/[0.06] px-2.5 py-2 text-center text-sm font-semibold text-apple-label">
        {row.dest}
      </td>
      {/* PCS — inline edit */}
      <td className="border-r border-black/[0.06] px-1.5 py-1 text-right">
        <InlineNumberEdit
          value={row.pcs}
          placeholder="Nhập"
          className="font-mono text-sm font-bold tabular-nums"
          onCommit={(v) => onUpdate(row.id, { pcs: v })}
        />
      </td>
      {/* KG — inline edit */}
      <td className="border-r border-black/[0.06] px-1.5 py-1 text-right">
        <InlineNumberEdit
          value={row.kg}
          placeholder="Nhập"
          className="font-mono text-sm font-bold tabular-nums"
          onCommit={(v) => onUpdate(row.id, { kg: v })}
        />
      </td>
      {/* DIM kg */}
      <td className="border-r border-black/[0.06] px-1.5 py-1 text-right">
        <InlineNumberEdit
          value={row.dimWeightKg}
          placeholder="—"
          className="font-mono text-xs font-semibold tabular-nums"
          onCommit={(v) =>
            onUpdate(row.id, { dimWeightKg: v, dimLines: null, dimDivisor: null })
          }
        />
      </td>
      {/* Customer */}
      <td className="border-r border-black/[0.06] px-2.5 py-2 font-semibold text-apple-label">
        {row.customer}
      </td>
      {/* Note */}
      <td className="border-r border-black/[0.06] px-2.5 py-2 align-top">
        {row.note ? (
          <span className="line-clamp-2 text-xs leading-snug text-apple-secondary" title={row.note}>
            {row.note}
          </span>
        ) : (
          <span className="text-xs italic text-apple-tertiary">—</span>
        )}
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
          {canPrintDimReport(row) ? (
            <button
              type="button"
              title="In form DIM"
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
