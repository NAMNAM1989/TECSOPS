import type { Shipment } from "../types/shipment";

export type AppState = {
  version: number;
  rows: Shipment[];
  workDateIso: string;
};

export type ShipmentMutation =
  | { action: "UPDATE"; id: string; patch: Partial<Shipment> }
  | { action: "DELETE"; id: string }
  | { action: "ADD"; shipment: Omit<Shipment, "id" | "stt"> }
  | { action: "CLEAR_DAY" };

function renumberStt(rows: Shipment[]): Shipment[] {
  const c: Record<string, number> = { "TECS-TCS": 0, "TECS-SCSC": 0 };
  return rows.map((r) => ({ ...r, stt: ++c[r.warehouse] }));
}

function nextNewId(rows: Shipment[]): string {
  let maxNew = 0;
  for (const r of rows) {
    const m = /^new-(\d+)$/.exec(r.id);
    if (m) maxNew = Math.max(maxNew, parseInt(m[1], 10));
  }
  return `new-${Math.max(100, maxNew) + 1}`;
}

/** Khớp logic `server/stateStore.mjs` — dùng khi không có API (offline). */
export function applyShipmentMutation(state: AppState, mutation: ShipmentMutation): AppState {
  const rows = [...state.rows];
  let workDateIso = state.workDateIso;

  switch (mutation.action) {
    case "UPDATE": {
      const i = rows.findIndex((r) => r.id === mutation.id);
      if (i === -1) throw new Error(`Shipment not found: ${mutation.id}`);
      rows[i] = { ...rows[i], ...mutation.patch };
      break;
    }
    case "DELETE": {
      const i = rows.findIndex((r) => r.id === mutation.id);
      if (i === -1) throw new Error(`Shipment not found: ${mutation.id}`);
      rows.splice(i, 1);
      break;
    }
    case "ADD": {
      const id = nextNewId(rows);
      rows.push({ ...mutation.shipment, id } as Shipment);
      break;
    }
    case "CLEAR_DAY": {
      rows.length = 0;
      workDateIso = new Date().toISOString();
      break;
    }
    default:
      throw new Error("Unknown mutation");
  }

  return {
    version: state.version + 1,
    rows: renumberStt(rows),
    workDateIso,
  };
}
