import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import { CutoffCountdown } from "./CutoffCountdown";
import { StatusSelect } from "./StatusBadge";
import { SummaryBar } from "./SummaryBar";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { statusRowBg, statusRowBorder } from "./statusStyles";

interface Props {
  rows: Shipment[];
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
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
  { key: "customer", label: "KHÁCH HÀNG", w: "min-w-[120px]" },
  { key: "status", label: "TRẠNG THÁI", w: "min-w-[110px]" },
  { key: "actions", label: "", w: "w-20" },
] as const;

export function DesktopShipmentTable({ rows, onUpdate, onDelete, onPrint }: Props) {
  return (
    <div className="hidden md:block space-y-8">
      {WAREHOUSES.map((wh) => {
        const group = rows.filter((r) => r.warehouse === wh);
        if (group.length === 0) return null;

        return (
          <section key={wh}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-extrabold text-slate-800">{wh}</h2>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-white">
                  {group.length} lô
                </span>
              </div>
              <SummaryBar rows={rows} warehouse={wh} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-700">
                    {COL_HEADERS.map((c) => (
                      <th
                        key={c.key}
                        className={`whitespace-nowrap border-r border-slate-600 px-2.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-100 last:border-r-0 ${c.w}`}
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
}: {
  row: Shipment;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
}) {
  const bg = statusRowBg[row.status];
  const border = statusRowBorder[row.status];

  return (
    <tr
      id={`shipment-row-${row.id}`}
      className={`border-b border-slate-200 transition-colors hover:brightness-95 ${bg} ${border}`}
    >
      {/* # */}
      <td className="border-r border-slate-200/60 px-2.5 py-2 text-center text-xs font-bold text-slate-500">
        {row.stt}
      </td>
      {/* AWB */}
      <td className="border-r border-slate-200/60 px-2.5 py-2">
        <span className="font-mono text-sm font-black tracking-tight text-slate-900">{row.awb}</span>
      </td>
      {/* Flight */}
      <td className="border-r border-slate-200/60 px-2.5 py-2">
        <span className="font-bold text-slate-800">{row.flight}</span>
        <span className="ml-1 text-[11px] font-semibold text-slate-500">/{row.flightDate}</span>
      </td>
      {/* Cutoff */}
      <td className="border-r border-slate-200/60 px-2.5 py-2 whitespace-nowrap">
        {row.cutoffNote && (
          <span className="mr-1 inline-block rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
            {row.cutoffNote}
          </span>
        )}
        {row.cutoff ? (
          <CutoffCountdown iso={row.cutoff} />
        ) : (
          <span className="text-xs italic text-slate-400">—</span>
        )}
      </td>
      {/* DEST */}
      <td className="border-r border-slate-200/60 px-2.5 py-2 text-center text-sm font-extrabold text-slate-900">
        {row.dest}
      </td>
      {/* PCS — inline edit */}
      <td className="border-r border-slate-200/60 px-1.5 py-1 text-right">
        <InlineNumberEdit
          value={row.pcs}
          placeholder="Nhập"
          className="font-mono text-sm font-bold tabular-nums"
          onCommit={(v) => onUpdate(row.id, { pcs: v })}
        />
      </td>
      {/* KG — inline edit */}
      <td className="border-r border-slate-200/60 px-1.5 py-1 text-right">
        <InlineNumberEdit
          value={row.kg}
          placeholder="Nhập"
          className="font-mono text-sm font-bold tabular-nums"
          onCommit={(v) => onUpdate(row.id, { kg: v })}
        />
      </td>
      {/* Customer */}
      <td className="border-r border-slate-200/60 px-2.5 py-2 font-bold text-slate-800">
        {row.customer}
      </td>
      {/* Status */}
      <td className="border-r border-slate-200/60 px-2 py-2">
        <StatusSelect
          value={row.status}
          compact
          onChange={(s: ShipmentStatus) => onUpdate(row.id, { status: s })}
        />
      </td>
      {/* Actions */}
      <td className="px-1.5 py-2">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            title="In nhãn"
            onClick={() => onPrint(row)}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-white/70 hover:text-slate-900"
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
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-100 hover:text-red-600"
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
