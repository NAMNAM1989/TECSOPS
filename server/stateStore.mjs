import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const INITIAL_FILE = path.join(__dirname, "initialRows.json");

const REDIS_STATE_KEY = process.env.REDIS_STATE_KEY || "tecsops:state";
const REDIS_LOCK_KEY = process.env.REDIS_LOCK_KEY || "tecsops:state-lock";

/** @type {import('redis').RedisClientType | null} */
let redisStateClient = null;

const UNLOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function renumberStt(rows) {
  const c = { "TECS-TCS": 0, "TECS-SCSC": 0 };
  return rows.map((r) => ({ ...r, stt: ++c[r.warehouse] }));
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
  const rows = JSON.parse(fs.readFileSync(INITIAL_FILE, "utf8"));
  return {
    version: 1,
    rows: renumberStt(rows),
    workDateIso: new Date().toISOString(),
  };
}

/**
 * Gắn client Redis dùng cho state (GET/SET + lock). Gọi trước listen(); null = chỉ dùng file.
 * @param {import('redis').RedisClientType | null} client
 */
export function setRedisStateClient(client) {
  redisStateClient = client;
}

export function isRedisStateEnabled() {
  return redisStateClient != null;
}

function loadStateFile() {
  ensureDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (raw && Array.isArray(raw.rows) && typeof raw.version === "number") {
        return {
          version: raw.version,
          rows: raw.rows,
          workDateIso: raw.workDateIso || new Date().toISOString(),
        };
      }
    }
  } catch (e) {
    console.error("[state] load error", e.message);
  }
  const fresh = createInitialState();
  saveStateFile(fresh);
  return fresh;
}

function saveStateFile(state) {
  ensureDir();
  const tmp = `${STATE_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), "utf8");
  fs.renameSync(tmp, STATE_FILE);
}

function normalizeState(raw) {
  if (raw && Array.isArray(raw.rows) && typeof raw.version === "number") {
    return {
      version: raw.version,
      rows: raw.rows,
      workDateIso: raw.workDateIso || new Date().toISOString(),
    };
  }
  return null;
}

/** @returns {Promise<object>} */
export async function loadState() {
  if (redisStateClient) {
    const raw = await redisStateClient.get(REDIS_STATE_KEY);
    if (!raw) {
      try {
        if (fs.existsSync(STATE_FILE)) {
          const disk = normalizeState(JSON.parse(fs.readFileSync(STATE_FILE, "utf8")));
          if (disk) {
            await redisStateClient.set(REDIS_STATE_KEY, JSON.stringify(disk));
            console.log("[state] đã migrate state.json → Redis");
            return disk;
          }
        }
      } catch (e) {
        console.warn("[state] migrate file → Redis bỏ qua:", e.message);
      }
      const fresh = createInitialState();
      await redisStateClient.set(REDIS_STATE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    try {
      const parsed = normalizeState(JSON.parse(raw));
      if (parsed) return parsed;
    } catch (e) {
      console.error("[state] redis parse error", e.message);
    }
    const fresh = createInitialState();
    await redisStateClient.set(REDIS_STATE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  return loadStateFile();
}

/** @param {object} state */
export async function saveState(state) {
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
      const s = mutation.shipment;
      const id = nextNewId(rows);
      rows.push({ ...s, id });
      break;
    }
    case "CLEAR_DAY": {
      rows.length = 0;
      workDateIso = new Date().toISOString();
      break;
    }
    default:
      throw new Error(`Unknown action: ${mutation.action}`);
  }

  const normalized = renumberStt(rows);
  return {
    version: state.version + 1,
    rows: normalized,
    workDateIso,
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

/** Chuỗi Promise tuần tự — giảm race trên từng process */
let tail = Promise.resolve();

export function runMutation(mutation) {
  const result = tail.then(async () => {
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
