import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";

interface SummaryBarProps {
  rows: Shipment[];
  warehouse: Warehouse;
}

const POST_VOLUME: ShipmentStatus[] = ["CUSTOMS", "SECURITY", "OLA_PULL", "WEIGH_SLIP", "COMPLETED"];

/** Một vòng lặp: đếm lô / kiện / kg / trạng thái cho đúng một kho (tránh nhiều lần filter cùng mảng). */
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
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] md:gap-2 md:text-xs">
      <Chip label="Lô" value={groupLen} />
      <Chip label="Kiện" value={totalPcs} />
      <Chip label="Kg" value={totalKg.toLocaleString()} />
      {pending > 0 && <Chip label="BOOKING" value={pending} warn />}
      {postVolume > 0 && <Chip label="Sau ĐO VOLUME" value={postVolume} />}
      {noPcs > 0 && <Chip label="Thiếu SL" value={noPcs} warn />}
    </div>
  );
}

function Chip({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  const tone = warn ? "bg-amber-100/90 text-amber-950" : "bg-black/[0.05] text-apple-label";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold md:px-2.5 md:py-1 ${tone}`}
    >
      {label}
      <span className="tabular-nums font-semibold">{value}</span>
    </span>
  );
}
