import type { Shipment, Warehouse } from "../types/shipment";

interface SummaryBarProps {
  rows: Shipment[];
  warehouse: Warehouse;
}

export function SummaryBar({ rows, warehouse }: SummaryBarProps) {
  const group = rows.filter((r) => r.warehouse === warehouse);
  const totalPcs = group.reduce((s, r) => s + (r.pcs ?? 0), 0);
  const totalKg = group.reduce((s, r) => s + (r.kg ?? 0), 0);
  const pending = group.filter((r) => r.status === "PENDING").length;
  const atRisk = group.filter(
    (r) => r.status === "AT_RISK" || r.status === "CUTOFF_PASSED"
  ).length;
  const noPcs = group.filter((r) => r.pcs === null).length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] md:gap-2 md:text-xs">
      <Chip label="Lô" value={group.length} />
      <Chip label="Kiện" value={totalPcs} />
      <Chip label="Kg" value={totalKg.toLocaleString()} />
      {pending > 0 && <Chip label="BOOKING" value={pending} warn />}
      {atRisk > 0 && <Chip label="Cần xử lý" value={atRisk} danger />}
      {noPcs > 0 && <Chip label="Thiếu SL" value={noPcs} warn />}
    </div>
  );
}

function Chip({
  label,
  value,
  warn,
  danger,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
  danger?: boolean;
}) {
  const tone = danger
    ? "bg-red-100/90 text-red-900"
    : warn
      ? "bg-amber-100/90 text-amber-950"
      : "bg-black/[0.05] text-apple-label";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold md:px-2.5 md:py-1 ${tone}`}
    >
      {label}
      <span className="tabular-nums font-semibold">{value}</span>
    </span>
  );
}
