import type { Shipment, Warehouse } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { WAREHOUSE_ORDER, isKnownWarehouse } from "../constants/warehouses";
import { awbDigitsKey } from "./awbFormat";
import { workflowStatusPatchFromDataEdit } from "./shipmentWorkflowStatus";
import { assertCustomerDirectoryValid } from "./customerDirectoryCore";
import { clampCustomerDirectoryEntry } from "./customerDirectoryProfile";
import type { AirlineLabelOverrides } from "./airlineLabelOverridesCore";
import { clampAirlineLabelOverrides, EMPTY_AIRLINE_LABEL_OVERRIDES } from "./airlineLabelOverridesCore";
import type { PrinterProfilesCatalog } from "../printing/printerProfilesCore";
import { clampPrinterProfilesCatalog, EMPTY_PRINTER_PROFILES_CATALOG } from "../printing/printerProfilesCore";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import { clampGlobalAgentCatalog, defaultGlobalAgentCatalog } from "./globalAgentsCore";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import {
  normalizeEcargoKhoScscMap,
  normalizeEcargoVehicleInput,
  type EcargoKhoScscPersistedMap,
} from "./ecargoKhoScscCore";
import {
  clampScscWeighPrintSettings,
  defaultScscWeighPrintSettings,
} from "../printing/scscWeigh/scscWeighPrintSettingsCore";

export type AppState = {
  version: number;
  rows: Shipment[];
  /** Danh bạ mã — tên; có thể rỗng nếu chưa cấu hình */
  customers: CustomerDirectoryEntry[];
  /** Agent dùng chung (Agent A / B / không có) + mặc định cho mọi khách. */
  globalAgents?: GlobalAgentCatalog;
  /** Ghi đè tên hãng trên tem (ưu tiên hơn bản mặc định trong code) */
  airlineLabelOverrides?: AirlineLabelOverrides;
  /** Danh mục profile máy in (dùng chung trên server; active id vẫn lưu local từng máy). */
  printerProfiles?: PrinterProfilesCatalog;
  /** Người gửi / làm phiếu cân SCSC — in chung mọi phiếu. */
  scscWeighPrintSettings?: ScscWeighPrintSettings;
  /** Số xe + trạng thái đăng ký eCargo KHO SCSC (đồng bộ mọi thiết bị). */
  ecargoKhoScsc?: EcargoKhoScscPersistedMap;
};

export type ShipmentMutation =
  | { action: "UPDATE"; id: string; patch: Partial<Shipment> }
  | { action: "DELETE"; id: string }
  | { action: "ADD"; shipment: Omit<Shipment, "id" | "stt"> }
  | { action: "SET_CUSTOMERS"; customers: CustomerDirectoryEntry[] }
  | { action: "SET_GLOBAL_AGENTS"; catalog: GlobalAgentCatalog }
  | { action: "SET_AIRLINE_LABEL_OVERRIDES"; overrides: AirlineLabelOverrides }
  | { action: "SET_PRINTER_PROFILES"; catalog: PrinterProfilesCatalog }
  | { action: "SET_SCSC_WEIGH_PRINT_SETTINGS"; settings: ScscWeighPrintSettings }
  | {
      action: "PATCH_ECARGO_KHO_SCSC";
      shipmentId: string;
      vehicleInput?: string;
      markedSubmitted?: boolean;
    }
  | { action: "MERGE_ECARGO_KHO_SCSC"; map: EcargoKhoScscPersistedMap };

function assertAwbUnique(rows: Shipment[], awb: string, exceptId?: string) {
  const d = awbDigitsKey(awb);
  if (d.length !== 11) return;
  for (const r of rows) {
    if (exceptId && r.id === exceptId) continue;
    if (awbDigitsKey(r.awb) === d) {
      throw new Error("AWB đã tồn tại trong hệ thống — mỗi số AWB chỉ dùng một lần.");
    }
  }
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
      const wh: Warehouse = isKnownWarehouse(r.warehouse) ? r.warehouse : "TECS-TCS";
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

function resolvedPrinterCatalog(s: AppState): PrinterProfilesCatalog {
  return clampPrinterProfilesCatalog(s.printerProfiles ?? EMPTY_PRINTER_PROFILES_CATALOG);
}

function resolvedGlobalAgents(s: AppState): GlobalAgentCatalog {
  return clampGlobalAgentCatalog(s.globalAgents ?? defaultGlobalAgentCatalog());
}

function resolvedScscWeighPrintSettings(s: AppState): ScscWeighPrintSettings {
  return clampScscWeighPrintSettings(s.scscWeighPrintSettings ?? defaultScscWeighPrintSettings());
}

function resolvedEcargoKhoScsc(s: AppState): EcargoKhoScscPersistedMap {
  return normalizeEcargoKhoScscMap(s.ecargoKhoScsc);
}

function withEcargo(
  state: AppState,
  rows: Shipment[],
  ecargoKhoScsc: EcargoKhoScscPersistedMap,
  extras: Partial<Omit<AppState, "version" | "rows" | "ecargoKhoScsc">> = {}
): AppState {
  return {
    version: state.version + 1,
    rows: renumberSttForAll(rows),
    customers: extras.customers ?? state.customers,
    globalAgents: extras.globalAgents ?? resolvedGlobalAgents(state),
    airlineLabelOverrides: extras.airlineLabelOverrides ?? resolvedAirlineOverrides(state),
    printerProfiles: extras.printerProfiles ?? resolvedPrinterCatalog(state),
    scscWeighPrintSettings: extras.scscWeighPrintSettings ?? resolvedScscWeighPrintSettings(state),
    ecargoKhoScsc,
  };
}

export function applyShipmentMutation(state: AppState, mutation: ShipmentMutation): AppState {
  const rows = [...state.rows];
  const keepEcargo = (): EcargoKhoScscPersistedMap => resolvedEcargoKhoScsc(state);

  switch (mutation.action) {
    case "SET_CUSTOMERS": {
      assertCustomerDirectoryValid(mutation.customers);
      return withEcargo(state, rows, keepEcargo(), {
        customers: mutation.customers.map((e) => clampCustomerDirectoryEntry(e)),
      });
    }
    case "SET_GLOBAL_AGENTS": {
      return withEcargo(state, rows, keepEcargo(), {
        globalAgents: clampGlobalAgentCatalog(mutation.catalog),
      });
    }
    case "SET_AIRLINE_LABEL_OVERRIDES": {
      return withEcargo(state, rows, keepEcargo(), {
        airlineLabelOverrides: clampAirlineLabelOverrides(mutation.overrides),
      });
    }
    case "SET_PRINTER_PROFILES": {
      return withEcargo(state, rows, keepEcargo(), {
        printerProfiles: clampPrinterProfilesCatalog(mutation.catalog),
      });
    }
    case "SET_SCSC_WEIGH_PRINT_SETTINGS": {
      return withEcargo(state, rows, keepEcargo(), {
        scscWeighPrintSettings: clampScscWeighPrintSettings(mutation.settings),
      });
    }
    case "PATCH_ECARGO_KHO_SCSC": {
      const shipmentId = mutation.shipmentId.trim();
      if (!shipmentId) throw new Error("PATCH_ECARGO_KHO_SCSC requires shipmentId");
      if (!rows.some((r) => r.id === shipmentId)) {
        throw new Error(`Shipment not found: ${shipmentId}`);
      }
      const prev = keepEcargo();
      const line = { ...(prev[shipmentId] ?? { vehicleInput: "" }) };
      if (mutation.vehicleInput !== undefined) {
        line.vehicleInput = normalizeEcargoVehicleInput(mutation.vehicleInput);
      }
      if (mutation.markedSubmitted !== undefined) {
        line.markedSubmitted = mutation.markedSubmitted;
      }
      line.updatedAt = new Date().toISOString();
      const nextMap = { ...prev, [shipmentId]: line };
      if (!line.vehicleInput && !line.markedSubmitted) {
        delete nextMap[shipmentId];
      }
      return withEcargo(state, rows, nextMap);
    }
    case "MERGE_ECARGO_KHO_SCSC": {
      const merged = { ...keepEcargo(), ...normalizeEcargoKhoScscMap(mutation.map) };
      return withEcargo(state, rows, merged);
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
      const ecargo = { ...keepEcargo() };
      delete ecargo[mutation.id];
      return withEcargo(state, rows, ecargo);
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

  return withEcargo(state, rows, keepEcargo());
}
