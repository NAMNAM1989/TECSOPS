import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrateShipmentStatus, workflowStatusPatchFromDataEdit } from "./shipmentWorkflowStatus.mjs";
import { buildDefaultCustomerDirectoryFromSeed } from "./customerDirectorySeed.mjs";
import {
  parseCustomersLoose,
  validateCustomerDirectoryPayload,
} from "./customerDirectoryValidate.mjs";

const WAREHOUSE_ORDER = ["TECS-TCS", "TECS-SCSC", "KHO-TCS", "KHO-SCSC"];
function isKnownWarehouse(w) {
  return WAREHOUSE_ORDER.includes(w);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const INITIAL_FILE = path.join(__dirname, "initialRows.json");
const SEED_SESSION_DAY = "2026-04-06";

const REDIS_STATE_KEY = process.env.REDIS_STATE_KEY || "tecsops:state";
const REDIS_LOCK_KEY = process.env.REDIS_LOCK_KEY || "tecsops:state-lock";

/** Production: không seed từ initialRows.json khi Redis/file trống — tránh ghi đè kỳ vọng "trống". */
function shouldSkipDemoSeed() {
  return (
    process.env.TECSOPS_DISABLE_DEMO_SEED === "1" || process.env.TECSOPS_EMPTY_INITIAL === "1"
  );
}

function emptyInitialState() {
  return { version: 1, rows: [], customers: [] };
}

/** @type {import('redis').RedisClientType | null} */
let redisStateClient = null;
/** @type {ReturnType<import('./postgresStateStore.mjs').createPostgresStateStore> | null} */
let postgresStateStore = null;

const UNLOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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
      const wh = isKnownWarehouse(r.warehouse) ? r.warehouse : "TECS-TCS";
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
    out.push({ lCm: l, wCm: w, hCm: h, pcs: Math.max(1, Math.floor(p)) });
  }
  return out.length ? out : null;
}

function migrateRows(rows, workDateIso) {
  const fallback = (workDateIso || new Date().toISOString()).slice(0, 10);
  return rows.map((r) => {
    const base = {
      ...r,
      sessionDate:
        typeof r.sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.sessionDate)
          ? r.sessionDate
          : fallback,
      note: typeof r.note === "string" ? r.note : "",
      customerCode: typeof r.customerCode === "string" ? r.customerCode : "",
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

function assertAwbUnique(rows, awbString, exceptId) {
  const d = awbDigits(awbString);
  if (d.length !== 11) return;
  for (const r of rows) {
    if (exceptId && r.id === exceptId) continue;
    if (awbDigits(r.awb) === d) {
      throw new Error("AWB đã tồn tại trong hệ thống — mỗi số AWB chỉ dùng một lần.");
    }
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

export function createInitialState() {
  const raw = JSON.parse(fs.readFileSync(INITIAL_FILE, "utf8"));
  const withS = raw.map((r) => ({
    ...r,
    sessionDate:
      typeof r.sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.sessionDate)
        ? r.sessionDate
        : SEED_SESSION_DAY,
    note: typeof r.note === "string" ? r.note : "",
    customerCode: typeof r.customerCode === "string" ? r.customerCode : "",
    dimWeightKg:
      r.dimWeightKg === null || typeof r.dimWeightKg === "number" ? r.dimWeightKg : null,
    dimLines: normalizeDimLines(r.dimLines),
    dimDivisor: r.dimDivisor === 5000 || r.dimDivisor === 6000 ? r.dimDivisor : null,
  }));
  return {
    version: 1,
    rows: renumberSttForAll(withS),
    customers: buildDefaultCustomerDirectoryFromSeed(),
  };
}

/**
 * @param {import('redis').RedisClientType | null} client
 */
export function setRedisStateClient(client) {
  redisStateClient = client;
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
  let customers = parseCustomersLoose(hasCustomersKey ? raw.customers : undefined);
  if (!hasCustomersKey) {
    customers = shouldSkipDemoSeed() ? [] : buildDefaultCustomerDirectoryFromSeed();
  }
  return {
    version: raw.version,
    rows: renumberSttForAll(merged),
    customers,
  };
}

function loadStateFile() {
  ensureDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      const n = normalizeState(raw);
      if (n) return n;
    }
  } catch (e) {
    console.error("[state] load error", e.message);
  }
  const fresh = shouldSkipDemoSeed() ? emptyInitialState() : createInitialState();
  saveStateFile(fresh);
  return fresh;
}

function saveStateFile(state) {
  ensureDir();
  const tmp = `${STATE_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), "utf8");
  fs.renameSync(tmp, STATE_FILE);
}

function normalizeOrThrow(raw, source) {
  const parsed = normalizeState(raw);
  if (parsed) return parsed;
  throw new Error(`[state] Dữ liệu ${source} không hợp lệ.`);
}

async function loadStateFromRedis() {
  if (!redisStateClient) return null;
  const raw = await redisStateClient.get(REDIS_STATE_KEY);
  if (!raw) return null;
  try {
    return normalizeOrThrow(JSON.parse(raw), `Redis (${REDIS_STATE_KEY})`);
  } catch (e) {
    console.error("[state] redis load/parse error", e.message);
    throw new Error(
      `[state] Dữ liệu Redis (${REDIS_STATE_KEY}) lỗi hoặc hỏng. Không tự seed lại. Khôi phục từ backup.`
    );
  }
}

function loadStateFileIfExists() {
  ensureDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      return normalizeOrThrow(JSON.parse(fs.readFileSync(STATE_FILE, "utf8")), STATE_FILE);
    }
  } catch (e) {
    console.warn("[state] load file existing bỏ qua:", e.message);
  }
  return null;
}

async function bootstrapStateForEmptyStore() {
  const redis = await loadStateFromRedis();
  if (redis) return redis;

  const disk = loadStateFileIfExists();
  if (disk) return disk;

  return shouldSkipDemoSeed() ? emptyInitialState() : createInitialState();
}

/** @returns {Promise<object>} */
export async function loadState() {
  if (postgresStateStore) {
    const raw = await postgresStateStore.loadRawState();
    if (raw) return normalizeOrThrow(raw, `Postgres (${postgresStateStore.key})`);
    const fresh = await bootstrapStateForEmptyStore();
    await postgresStateStore.saveState(fresh);
    console.info(`[state] đã bootstrap state vào Postgres (${postgresStateStore.key})`);
    return fresh;
  }

  if (redisStateClient) {
    const parsed = await loadStateFromRedis();
    if (!parsed) {
      try {
        if (fs.existsSync(STATE_FILE)) {
          const disk = normalizeState(JSON.parse(fs.readFileSync(STATE_FILE, "utf8")));
          if (disk) {
            await redisStateClient.set(REDIS_STATE_KEY, JSON.stringify(disk));
            console.info("[state] đã migrate state.json → Redis");
            return disk;
          }
        }
      } catch (e) {
        console.warn("[state] migrate file → Redis bỏ qua:", e.message);
      }
      const fresh = shouldSkipDemoSeed() ? emptyInitialState() : createInitialState();
      await redisStateClient.set(REDIS_STATE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return parsed;
  }
  return loadStateFile();
}

/** @param {object} state */
export async function saveState(state) {
  if (postgresStateStore) {
    await postgresStateStore.saveState(state);
    return;
  }
  if (redisStateClient) {
    await redisStateClient.set(REDIS_STATE_KEY, JSON.stringify(state));
    return;
  }
  saveStateFile(state);
}

/**
 * @param {object} state
 * @param {object} mutation
 */
export function applyMutation(state, mutation) {
  let rows = [...state.rows];

  switch (mutation.action) {
    case "SET_CUSTOMERS": {
      const list = validateCustomerDirectoryPayload(mutation.customers);
      return {
        version: state.version + 1,
        rows: renumberSttForAll(rows),
        customers: list,
      };
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
      throw new Error(`Unknown action: ${mutation.action}`);
  }

  return {
    version: state.version + 1,
    rows: renumberSttForAll(rows),
    customers: state.customers ?? [],
  };
}

/**
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withDistributedLock(fn) {
  if (!redisStateClient) return fn();
  const token = randomUUID();
  for (let attempt = 0; attempt < 120; attempt++) {
    const ok = await redisStateClient.set(REDIS_LOCK_KEY, token, { NX: true, EX: 25 });
    if (ok) {
      try {
        return await fn();
      } finally {
        await redisStateClient.eval(UNLOCK_SCRIPT, {
          keys: [REDIS_LOCK_KEY],
          arguments: [token],
        });
      }
    }
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
  }
  throw new Error("Không lấy được khóa state (Redis); thử lại sau.");
}

let tail = Promise.resolve();

export function runMutation(mutation) {
  const result = tail.then(async () => {
    if (postgresStateStore) {
      return postgresStateStore.runLocked(async (currentRaw) => {
        const current = currentRaw
          ? normalizeOrThrow(currentRaw, `Postgres (${postgresStateStore.key})`)
          : await bootstrapStateForEmptyStore();
        return applyMutation(current, mutation);
      });
    }

    if (redisStateClient) {
      return withDistributedLock(async () => {
        const current = await loadState();
        const next = applyMutation(current, mutation);
        await saveState(next);
        return next;
      });
    }
    const current = loadStateFile();
    const next = applyMutation(current, mutation);
    saveStateFile(next);
    return next;
  });
  tail = result.catch(async (err) => {
    console.error("[mutation]", err);
    return loadState();
  });
  return result;
}
