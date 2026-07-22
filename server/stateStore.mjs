import { migrateShipmentStatus, workflowStatusPatchFromDataEdit } from "./shipmentWorkflowStatus.mjs";
import {
  parseCustomersLoose,
  validateCustomerDirectoryPayload,
} from "./customerDirectoryValidate.mjs";
import {
  emptyAirlineLabelOverrides,
  normalizeAirlineLabelOverridesLoose,
} from "./airlineLabelOverridesNormalize.mjs";
import {
  emptyPrinterProfilesCatalog,
  normalizePrinterProfilesCatalogLoose,
} from "./printerProfilesNormalize.mjs";
import {
  emptyEsidAgentStore,
  emptyEsidRegistrantStore,
  normalizeEsidAgentStoreLoose,
  normalizeEsidRegistrantStoreLoose,
} from "./esidProfilesNormalize.mjs";

const WAREHOUSE_ORDER = ["TECS-TCS", "TECS-SCSC"];

function normalizeWarehouse(raw, fallback = "TECS-TCS") {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  if (u === "TECS-SCSC" || u === "KHO-SCSC") return "TECS-SCSC";
  if (u === "TECS-TCS" || u === "KHO-TCS") return "TECS-TCS";
  if (u.includes("SCSC") || u.includes("SCCS")) return "TECS-SCSC";
  if (u.includes("TCS")) return "TECS-TCS";
  return fallback;
}

/** @type {ReturnType<import('./postgresStateStore.mjs').createPostgresStateStore> | null} */
let postgresStateStore = null;

function emptyInitialState() {
  return {
    version: 1,
    rows: [],
    customers: [],
    airlineLabelOverrides: emptyAirlineLabelOverrides(),
    printerProfiles: emptyPrinterProfilesCatalog(),
    esidRegistrantStore: emptyEsidRegistrantStore(),
    esidAgentStore: emptyEsidAgentStore(),
  };
}

/** STT theo từng sessionDate + warehouse, giữ thứ tự xuất hiện từng ngày */
function renumberSttForAll(rows) {
  const order = [];
  const byDay = new Map();
  for (const r of rows) {
    const key = r.sessionDate || "legacy";
    if (!byDay.has(key)) {
      byDay.set(key, []);
      order.push(key);
    }
    byDay.get(key).push(r);
  }
  const out = [];
  for (const key of order) {
    const dayRows = byDay.get(key);
    const c = Object.fromEntries(WAREHOUSE_ORDER.map((w) => [w, 0]));
    for (const r of dayRows) {
      const wh = normalizeWarehouse(r.warehouse);
      out.push({ ...r, stt: ++c[wh] });
    }
  }
  return out;
}

function normalizeDimLines(raw) {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const l = item.lCm;
    const w = item.wCm;
    const h = item.hCm;
    const p = item.pcs;
    if (typeof l !== "number" || typeof w !== "number" || typeof h !== "number" || typeof p !== "number")
      continue;
    if (!(l > 0 && w > 0 && h > 0 && p > 0)) continue;
    out.push({
      lCm: l,
      wCm: w,
      hCm: h,
      pcs: Math.max(1, Math.floor(p)),
      ...(item.estimated === true ? { estimated: true } : {}),
    });
  }
  return out.length ? out : null;
}

function migrateRows(rows, workDateIso) {
  const fallback = (workDateIso || new Date().toISOString()).slice(0, 10);
  return rows.map((r) => {
    const base = {
      ...r,
      warehouse: normalizeWarehouse(r.warehouse),
      sessionDate:
        typeof r.sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.sessionDate)
          ? r.sessionDate
          : fallback,
      note: typeof r.note === "string" ? r.note : "",
      customerCode: typeof r.customerCode === "string" ? r.customerCode : "",
      customerId: typeof r.customerId === "string" ? r.customerId : "",
      hawb: typeof r.hawb === "string" ? r.hawb : "",
      dimWeightKg:
        r.dimWeightKg === null || typeof r.dimWeightKg === "number" ? r.dimWeightKg : null,
      dimLines: normalizeDimLines(r.dimLines),
      dimDivisor: r.dimDivisor === 5000 || r.dimDivisor === 6000 ? r.dimDivisor : null,
    };
    return { ...base, status: migrateShipmentStatus(base) };
  });
}

function awbDigits(awb) {
  return String(awb || "").replace(/\D/g, "");
}

function findAwbConflict(rows, awbString, exceptId) {
  const d = awbDigits(awbString);
  if (d.length !== 11) return null;
  for (const r of rows) {
    if (exceptId && r.id === exceptId) continue;
    if (awbDigits(r.awb) === d) return r;
  }
  return null;
}

function assertAwbUnique(rows, awbString, exceptId) {
  const conflict = findAwbConflict(rows, awbString, exceptId);
  if (conflict) {
    const when = String(conflict.sessionDate || "").trim() || "không rõ ngày";
    throw new Error(
      `AWB đã tồn tại ở phiên ${when} (${conflict.warehouse}, STT ${conflict.stt}). Xóa lô đó trước khi dùng lại số AWB này.`
    );
  }
}

function nextNewId(rows) {
  let maxNew = 0;
  for (const r of rows) {
    const m = /^new-(\d+)$/.exec(r.id);
    if (m) maxNew = Math.max(maxNew, parseInt(m[1], 10));
  }
  return `new-${Math.max(100, maxNew) + 1}`;
}

function finishState(state, rows, extras = {}) {
  return {
    version: state.version + 1,
    rows: renumberSttForAll(rows),
    customers: extras.customers ?? state.customers ?? [],
    airlineLabelOverrides:
      extras.airlineLabelOverrides ?? normalizeAirlineLabelOverridesLoose(state.airlineLabelOverrides),
    printerProfiles: extras.printerProfiles ?? normalizePrinterProfilesCatalogLoose(state.printerProfiles),
    esidRegistrantStore:
      extras.esidRegistrantStore ?? normalizeEsidRegistrantStoreLoose(state.esidRegistrantStore),
    esidAgentStore: extras.esidAgentStore ?? normalizeEsidAgentStoreLoose(state.esidAgentStore),
  };
}

/**
 * @param {ReturnType<import('./postgresStateStore.mjs').createPostgresStateStore> | null} store
 */
export function setPostgresStateStore(store) {
  postgresStateStore = store;
}

function normalizeState(raw) {
  if (!raw || !raw.rows || !Array.isArray(raw.rows) || typeof raw.version !== "number") return null;
  const merged = migrateRows(raw.rows, raw.workDateIso);
  const hasCustomersKey = Object.prototype.hasOwnProperty.call(raw, "customers");
  const customers = parseCustomersLoose(hasCustomersKey ? raw.customers : undefined);
  return {
    version: raw.version,
    rows: renumberSttForAll(merged),
    customers,
    airlineLabelOverrides: normalizeAirlineLabelOverridesLoose(raw.airlineLabelOverrides),
    printerProfiles: normalizePrinterProfilesCatalogLoose(raw.printerProfiles),
    esidRegistrantStore: normalizeEsidRegistrantStoreLoose(raw.esidRegistrantStore),
    esidAgentStore: normalizeEsidAgentStoreLoose(raw.esidAgentStore),
  };
}

function normalizeOrThrow(raw, source) {
  const parsed = normalizeState(raw);
  if (parsed) return parsed;
  throw new Error(`[state] Dữ liệu ${source} không hợp lệ.`);
}

/** @returns {Promise<object>} */
export async function loadState() {
  if (!postgresStateStore) {
    throw new Error("[state] Postgres chưa cấu hình (DATABASE_URL).");
  }
  const raw = await postgresStateStore.loadRawState();
  if (raw) return normalizeOrThrow(raw, `Postgres (${postgresStateStore.key})`);
  const fresh = emptyInitialState();
  await postgresStateStore.saveState(fresh);
  console.info(`[state] đã bootstrap state trống vào Postgres (${postgresStateStore.key})`);
  return fresh;
}

/** Chỉ đọc version — dùng kiểm tra cache sync Sheet. */
export async function peekStateVersion() {
  if (!postgresStateStore) {
    throw new Error("[state] Postgres chưa cấu hình (DATABASE_URL).");
  }
  return postgresStateStore.peekVersion();
}

/** @param {object} state */
export async function saveState(state) {
  if (!postgresStateStore) {
    throw new Error("[state] Postgres chưa cấu hình (DATABASE_URL).");
  }
  await postgresStateStore.saveState(state);
}

/**
 * @param {object} state
 * @param {object} mutation
 */
export function applyMutation(state, mutation) {
  let rows = [...state.rows];
  const action = String(mutation?.action ?? "").trim();

  switch (action) {
    case "SET_CUSTOMERS": {
      const list = validateCustomerDirectoryPayload(mutation.customers);
      return finishState(state, rows, { customers: list });
    }
    case "RESET_TRIAL_DATA": {
      /** Xóa lô + danh bạ thử nghiệm; giữ tên hãng / profile máy in. */
      return finishState(state, [], { customers: [] });
    }
    case "SET_AIRLINE_LABEL_OVERRIDES": {
      return finishState(state, rows, {
        airlineLabelOverrides: normalizeAirlineLabelOverridesLoose(mutation?.overrides),
      });
    }
    case "SET_PRINTER_PROFILES": {
      return finishState(state, rows, {
        printerProfiles: normalizePrinterProfilesCatalogLoose(mutation?.catalog),
      });
    }
    case "SET_ESID_REGISTRANT_STORE": {
      return finishState(state, rows, {
        esidRegistrantStore: normalizeEsidRegistrantStoreLoose(mutation?.store),
      });
    }
    case "SET_ESID_AGENT_STORE": {
      return finishState(state, rows, {
        esidAgentStore: normalizeEsidAgentStoreLoose(mutation?.store),
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
      const sd = s.sessionDate;
      if (!sd || !/^\d{4}-\d{2}-\d{2}$/.test(sd)) {
        throw new Error("ADD requires shipment.sessionDate (YYYY-MM-DD)");
      }
      assertAwbUnique(rows, s.awb, null);
      const id = nextNewId(rows);
      rows.push({ ...s, id });
      break;
    }
    default:
      throw new Error(
        `Unknown action: ${action || "(thiếu)"}. Hỗ trợ: RESET_TRIAL_DATA, SET_CUSTOMERS, SET_AIRLINE_LABEL_OVERRIDES, SET_PRINTER_PROFILES, SET_ESID_REGISTRANT_STORE, SET_ESID_AGENT_STORE, UPDATE, DELETE, ADD.`
      );
  }

  return finishState(state, rows);
}

let tail = Promise.resolve();

export function runMutation(mutation) {
  const result = tail.then(async () => {
    if (!postgresStateStore) {
      throw new Error("[state] Postgres chưa cấu hình (DATABASE_URL).");
    }
    return postgresStateStore.runLocked(async (currentRaw) => {
      const current = currentRaw
        ? normalizeOrThrow(currentRaw, `Postgres (${postgresStateStore.key})`)
        : emptyInitialState();
      return applyMutation(current, mutation);
    });
  });
  tail = result.catch(async (err) => {
    console.error("[mutation]", err);
    return loadState();
  });
  return result;
}

/** Nhiều mutation trong một lần khóa Postgres — nhanh hơn khi nhập hàng loạt từ Sheet. */
export function runBatchMutations(mutations) {
  const list = Array.isArray(mutations) ? mutations : [];
  if (!list.length) {
    return tail.then(async () => loadState());
  }
  const result = tail.then(async () => {
    if (!postgresStateStore) {
      throw new Error("[state] Postgres chưa cấu hình (DATABASE_URL).");
    }
    return postgresStateStore.runLocked(async (currentRaw) => {
      let state = currentRaw
        ? normalizeOrThrow(currentRaw, `Postgres (${postgresStateStore.key})`)
        : emptyInitialState();
      for (const mutation of list) {
        state = applyMutation(state, mutation);
      }
      return state;
    });
  });
  tail = result.catch(async (err) => {
    console.error("[mutation:batch]", err);
    return loadState();
  });
  return result;
}
