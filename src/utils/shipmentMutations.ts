import type { Shipment, Warehouse } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { WAREHOUSE_ORDER, normalizeWarehouse } from "../constants/warehouses";
import { awbDigitsKey } from "./awbFormat";
import { awbConflictMessage, findAwbDigitsConflict } from "./awbUnique";
import { workflowStatusPatchFromDataEdit } from "./shipmentWorkflowStatus";
import { assertCustomerDirectoryValid } from "./customerDirectoryCore";
import { clampCustomerDirectoryEntry } from "./customerDirectoryProfile";
import type { AirlineLabelOverrides } from "./airlineLabelOverridesCore";
import { clampAirlineLabelOverrides, EMPTY_AIRLINE_LABEL_OVERRIDES } from "./airlineLabelOverridesCore";
import type { EsidRegistrantStoreV1 } from "./esidRegistrantProfile";
import {
  emptyRegistrantStore,
  normalizeEsidRegistrantStore,
} from "./esidRegistrantProfile";
import type { EsidAgentStoreV1 } from "./esidAgentProfile";
import { emptyAgentStore, normalizeEsidAgentStore } from "./esidAgentProfile";

export type AppState = {
  version: number;
  rows: Shipment[];
  /** Danh bạ mã — tên; có thể rỗng nếu chưa cấu hình */
  customers: CustomerDirectoryEntry[];
  /** Ghi đè tên hãng trên tem (ưu tiên hơn bản mặc định trong code) */
  airlineLabelOverrides?: AirlineLabelOverrides;
  /** Hồ sơ Người khai ESID — dùng chung mọi máy */
  esidRegistrantStore?: EsidRegistrantStoreV1;
  /** Hồ sơ Agent ESID — dùng chung mọi máy */
  esidAgentStore?: EsidAgentStoreV1;
};

export type ShipmentMutation =
  | { action: "UPDATE"; id: string; patch: Partial<Shipment> }
  | { action: "DELETE"; id: string }
  | { action: "ADD"; shipment: Omit<Shipment, "id" | "stt"> }
  | { action: "SET_CUSTOMERS"; customers: CustomerDirectoryEntry[] }
  | { action: "RESET_TRIAL_DATA" }
  | { action: "SET_AIRLINE_LABEL_OVERRIDES"; overrides: AirlineLabelOverrides }
  | { action: "SET_ESID_REGISTRANT_STORE"; store: EsidRegistrantStoreV1 }
  | { action: "SET_ESID_AGENT_STORE"; store: EsidAgentStoreV1 };

function assertAwbUnique(rows: Shipment[], awb: string, exceptId?: string) {
  const d = awbDigitsKey(awb);
  if (d.length !== 11) return;
  const conflict = findAwbDigitsConflict(rows, d, exceptId);
  if (conflict) throw new Error(awbConflictMessage(conflict));
}

function renumberSttForAll(rows: Shipment[]): Shipment[] {
  const order: string[] = [];
  const byDay = new Map<string, Shipment[]>();
  for (const r of rows) {
    const key = r.sessionDate || "legacy";
    if (!byDay.has(key)) {
      byDay.set(key, []);
      order.push(key);
    }
    byDay.get(key)!.push(r);
  }
  const out: Shipment[] = [];
  for (const key of order) {
    const dayRows = byDay.get(key)!;
    const c = Object.fromEntries(WAREHOUSE_ORDER.map((w) => [w, 0])) as Record<Warehouse, number>;
    for (const r of dayRows) {
      const wh: Warehouse = normalizeWarehouse(r.warehouse);
      out.push({ ...r, stt: ++c[wh] });
    }
  }
  return out;
}

function nextNewId(rows: Shipment[]): string {
  let maxNew = 0;
  for (const r of rows) {
    const m = /^new-(\d+)$/.exec(r.id);
    if (m) maxNew = Math.max(maxNew, parseInt(m[1], 10));
  }
  return `new-${Math.max(100, maxNew) + 1}`;
}

/**
 * Áp một mutation lên snapshot cục bộ (cùng quy tắc `server/stateStore.mjs`).
 * Ném lỗi nếu ID không tồn tại, AWB trùng 11 số, hoặc `sessionDate` ADD không hợp lệ.
 */
function resolvedAirlineOverrides(s: AppState): AirlineLabelOverrides {
  return clampAirlineLabelOverrides(s.airlineLabelOverrides ?? EMPTY_AIRLINE_LABEL_OVERRIDES);
}

function resolvedEsidRegistrant(s: AppState): EsidRegistrantStoreV1 {
  return normalizeEsidRegistrantStore(s.esidRegistrantStore ?? emptyRegistrantStore());
}

function resolvedEsidAgent(s: AppState): EsidAgentStoreV1 {
  return normalizeEsidAgentStore(s.esidAgentStore ?? emptyAgentStore());
}

function nextState(
  state: AppState,
  rows: Shipment[],
  extras: Partial<Omit<AppState, "version" | "rows">> = {}
): AppState {
  return {
    version: state.version + 1,
    rows: renumberSttForAll(rows),
    customers: extras.customers ?? state.customers,
    airlineLabelOverrides: extras.airlineLabelOverrides ?? resolvedAirlineOverrides(state),
    esidRegistrantStore: extras.esidRegistrantStore ?? resolvedEsidRegistrant(state),
    esidAgentStore: extras.esidAgentStore ?? resolvedEsidAgent(state),
  };
}

export function applyShipmentMutation(state: AppState, mutation: ShipmentMutation): AppState {
  const rows = [...state.rows];

  switch (mutation.action) {
    case "SET_CUSTOMERS": {
      assertCustomerDirectoryValid(mutation.customers);
      return nextState(state, rows, {
        customers: mutation.customers.map((e) => clampCustomerDirectoryEntry(e)),
      });
    }
    case "RESET_TRIAL_DATA": {
      return nextState(state, [], { customers: [] });
    }
    case "SET_AIRLINE_LABEL_OVERRIDES": {
      return nextState(state, rows, {
        airlineLabelOverrides: clampAirlineLabelOverrides(mutation.overrides),
      });
    }
    case "SET_ESID_REGISTRANT_STORE": {
      return nextState(state, rows, {
        esidRegistrantStore: normalizeEsidRegistrantStore(mutation.store),
      });
    }
    case "SET_ESID_AGENT_STORE": {
      return nextState(state, rows, {
        esidAgentStore: normalizeEsidAgentStore(mutation.store),
      });
    }
    case "UPDATE": {
      const i = rows.findIndex((r) => r.id === mutation.id);
      if (i === -1) throw new Error(`Shipment not found: ${mutation.id}`);
      if (mutation.patch.awb !== undefined) {
        assertAwbUnique(rows, mutation.patch.awb, mutation.id);
      }
      const prev = rows[i];
      const merged = { ...prev, ...mutation.patch };
      const statusExtra = workflowStatusPatchFromDataEdit(prev, mutation.patch, merged);
      rows[i] = { ...merged, ...statusExtra };
      break;
    }
    case "DELETE": {
      const i = rows.findIndex((r) => r.id === mutation.id);
      if (i === -1) throw new Error(`Shipment not found: ${mutation.id}`);
      rows.splice(i, 1);
      break;
    }
    case "ADD": {
      const s = mutation.shipment;
      if (!s.sessionDate || !/^\d{4}-\d{2}-\d{2}$/.test(s.sessionDate)) {
        throw new Error("ADD requires sessionDate");
      }
      assertAwbUnique(rows, s.awb);
      const id = nextNewId(rows);
      rows.push({ ...s, id } as Shipment);
      break;
    }
    default:
      throw new Error("Unknown mutation");
  }

  return nextState(state, rows);
}
