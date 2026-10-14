import type { OpsStatsLotRow } from "./opsStatsMetrics";

export type LotSortKey = "day" | "pcs" | "kg" | "dim" | "cw" | "delta";
export type LotSortDir = "asc" | "desc";
export type LotSortState = { key: LotSortKey; dir: LotSortDir } | null;

export function parseLotSortParam(raw: string | null | undefined): LotSortState {
  if (!raw) return null;
  const m = /^(day|pcs|kg|dim|cw|delta):(asc|desc)$/.exec(raw.trim());
  if (!m) return null;
  return { key: m[1] as LotSortKey, dir: m[2] as LotSortDir };
}

export function serializeLotSortParam(sort: LotSortState): string | null {
  if (!sort) return null;
  return `${sort.key}:${sort.dir}`;
}

export function toggleLotSort(prev: LotSortState, key: LotSortKey): LotSortState {
  if (!prev || prev.key !== key) return { key, dir: key === "day" ? "asc" : "desc" };
  if (prev.dir === "desc") return { key, dir: "asc" };
  if (prev.dir === "asc" && key !== "day") return { key, dir: "desc" };
  return null; // third click → default
}

function cmpNum(a: number, b: number): number {
  return a - b;
}

/** Sort lots; null sort = default sessionDate, stt, awb. */
export function sortOpsStatsLots(
  lots: readonly OpsStatsLotRow[],
  sort: LotSortState
): OpsStatsLotRow[] {
  const arr = [...lots];
  if (!sort) {
    arr.sort((a, b) => {
      const da = (a.shipment.sessionDate || "").trim();
      const db = (b.shipment.sessionDate || "").trim();
      if (da !== db) return da.localeCompare(db);
      if (a.shipment.stt !== b.shipment.stt) return a.shipment.stt - b.shipment.stt;
      return (a.shipment.awb || "").localeCompare(b.shipment.awb || "");
    });
    return arr;
  }
  const dir = sort.dir === "asc" ? 1 : -1;
  arr.sort((a, b) => {
    let c = 0;
    switch (sort.key) {
      case "day":
        c = (a.shipment.sessionDate || "").localeCompare(b.shipment.sessionDate || "");
        break;
      case "pcs":
        c = cmpNum(a.pcs, b.pcs);
        break;
      case "kg":
        c = cmpNum(a.actualKg, b.actualKg);
        break;
      case "dim":
        c = cmpNum(a.dimKg, b.dimKg);
        break;
      case "cw":
        c = cmpNum(a.chargeableKg, b.chargeableKg);
        break;
      case "delta":
        c = cmpNum(a.deltaKg, b.deltaKg);
        break;
    }
    if (c !== 0) return c * dir;
    return (a.shipment.awb || "").localeCompare(b.shipment.awb || "");
  });
  return arr;
}
