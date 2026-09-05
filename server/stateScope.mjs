/**
 * Thu hẹp AppState trên wire: chỉ rows đúng sessionDate (giữ customers/profiles).
 * full=true → không lọc rows.
 * Mọi response đều compact field rỗng trên rows để giảm JSON.
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Khóa luôn giữ trên wire (kể cả "") để client list/Ops không lệch schema tối thiểu. */
const ROW_ALWAYS_KEYS = new Set([
  "id",
  "stt",
  "sessionDate",
  "awb",
  "flight",
  "flightDate",
  "cutoff",
  "cutoffNote",
  "dest",
  "warehouse",
  "customer",
  "status",
]);

export function normalizeSessionDateParam(raw) {
  const s = String(raw ?? "")
    .trim();
  return YMD_RE.test(s) ? s : null;
}

export function parseStateScopeFromQuery(query = {}) {
  const full =
    query.full === "1" ||
    query.full === "true" ||
    query.full === true;
  if (full) return { full: true, sessionDate: null };
  const sessionDate = normalizeSessionDateParam(query.sessionDate ?? query.session_date);
  return { full: false, sessionDate };
}

export function parseStateScopeFromHeaders(headers = {}) {
  const fullRaw = headers["x-tecsops-state-full"] ?? headers["X-TECSOPS-State-Full"];
  if (fullRaw === "1" || fullRaw === "true") {
    return { full: true, sessionDate: null };
  }
  const sessionDate = normalizeSessionDateParam(
    headers["x-tecsops-session-date"] ?? headers["X-TECSOPS-Session-Date"]
  );
  return { full: false, sessionDate };
}

function isEmptyWireValue(v) {
  if (v == null) return true;
  if (v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/**
 * Bỏ field null / "" / [] trên từng lô — giữ khóa tối thiểu Ops.
 * Giảm ~40–70% JSON rows khi nhiều ô in ấn trống.
 */
export function compactShipmentRowForWire(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (ROW_ALWAYS_KEYS.has(k)) {
      out[k] = v ?? (k === "stt" ? 0 : "");
      continue;
    }
    if (isEmptyWireValue(v)) continue;
    out[k] = v;
  }
  return out;
}

export function compactShipmentRowsForWire(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(compactShipmentRowForWire);
}

/**
 * @param {object} state
 * @param {{ full?: boolean, sessionDate?: string | null }} scope
 * @param {{ omitCustomers?: boolean, compactRows?: boolean }} options
 */
export function projectAppState(state, scope = {}, options = {}) {
  if (!state || typeof state !== "object") return state;
  const omitCustomers = Boolean(options.omitCustomers);
  const compactRows = options.compactRows !== false;

  if (scope.full || !scope.sessionDate) {
    const projected = {
      ...state,
      rows: compactRows
        ? compactShipmentRowsForWire(state.rows)
        : state.rows,
      stateScope: scope.full ? "full" : "all",
    };
    if (omitCustomers && !scope.full) {
      const { customers: _c, ...rest } = projected;
      return { ...rest, customersOmitted: true };
    }
    return projected;
  }
  const key = scope.sessionDate;
  const rows = Array.isArray(state.rows)
    ? state.rows.filter((r) => String(r?.sessionDate || "").trim() === key)
    : [];
  const projected = {
    ...state,
    rows: compactRows ? compactShipmentRowsForWire(rows) : rows,
    stateScope: key,
  };
  if (omitCustomers) {
    const { customers: _c, ...rest } = projected;
    return { ...rest, customersOmitted: true };
  }
  return projected;
}

/** Emit sync đã project theo scope từng socket. */
export async function emitScopedSync(io, state, options = {}) {
  const sockets = await io.fetchSockets();
  const omitCustomersDefault = Boolean(options.omitCustomers);
  for (const socket of sockets) {
    const scope = socket.data?.stateScope || { full: false, sessionDate: null };
    const omitCustomers =
      omitCustomersDefault && !scope.full && Boolean(scope.sessionDate);
    socket.emit(
      "sync",
      projectAppState(state, scope, { omitCustomers })
    );
  }
}

export function mutationTouchesCustomers(mutation) {
  const action = String(mutation?.action ?? "").trim();
  return action === "SET_CUSTOMERS" || action === "RESET_TRIAL_DATA";
}

export function mutationsTouchCustomers(mutations) {
  if (!Array.isArray(mutations)) return false;
  return mutations.some((m) => mutationTouchesCustomers(m));
}
