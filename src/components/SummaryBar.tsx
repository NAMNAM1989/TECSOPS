import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";

interface SummaryBarProps {
  rows: Shipment[];
  warehouse: Warehouse;
}

const POST_VOLUME: ShipmentStatus[] = ["CUSTOMS", "SECURITY", "OLA_PULL", "WEIGH_SLIP", "COMPLETED"];

/** Thẻ chỉ số gọn — góc phải header kho. */
export function SummaryBar({ rows, warehouse }: SummaryBarProps) {
  let groupLen = 0;
  let totalPcs = 0;
  let totalKg = 0;
  let pending = 0;
  let postVolume = 0;
  let noPcs = 0;
  for (const r of rows) {
    if (r.warehouse !== warehouse) continue;
    groupLen++;
    totalPcs += r.pcs ?? 0;
    totalKg += r.kg ?? 0;
    if (r.status === "PENDING") pending++;
    if (POST_VOLUME.includes(r.status)) postVolume++;
    if (r.pcs === null) noPcs++;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <StatCard label="Lô" value={groupLen} />
      <StatCard label="Kiện" value={totalPcs} />
      <StatCard label="Kg" value={totalKg.toLocaleString()} />
      {pending > 0 ? <StatCard label="BOOKING" value={pending} warn /> : null}
      {postVolume > 0 ? <StatCard label="Sau ĐO VOLUME" value={postVolume} /> : null}
      {noPcs > 0 ? <StatCard label="Thiếu SL" value={noPcs} warn /> : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div
      className={`inline-flex min-w-[3.25rem] flex-col items-center rounded-lg border px-2 py-1 shadow-sm ${
        warn
          ? "border-amber-300/70 bg-amber-50/95 dark:border-amber-600/40 dark:bg-amber-950/40"
          : "border-black/[0.08] bg-white/95 dark:border-white/10 dark:bg-ops-elevated/90"
      }`}
    >
      <span
        className={`text-[8px] font-bold uppercase tracking-wide ${
          warn ? "text-amber-800 dark:text-amber-300" : "text-apple-secondary dark:text-ops-secondary"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-[11px] font-bold tabular-nums leading-tight ${
          warn ? "text-amber-950 dark:text-amber-100" : "text-apple-label dark:text-ops-label"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
