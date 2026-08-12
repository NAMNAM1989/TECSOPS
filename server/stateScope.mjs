/**
 * Thu hẹp AppState trên wire: chỉ rows đúng sessionDate (giữ customers/profiles).
 * full=true → không lọc rows.
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSessionDateParam(raw) {
  const s = String(raw ?? "").trim();
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

/**
 * @param {object} state
 * @param {{ full?: boolean, sessionDate?: string | null }} scope
 */
export function projectAppState(state, scope = {}) {
  if (!state || typeof state !== "object") return state;
  if (scope.full || !scope.sessionDate) {
    return {
      ...state,
      stateScope: scope.full ? "full" : "all",
    };
  }
  const key = scope.sessionDate;
  const rows = Array.isArray(state.rows)
    ? state.rows.filter((r) => String(r?.sessionDate || "").trim() === key)
    : [];
  return {
    ...state,
    rows,
    stateScope: key,
  };
}

/** Emit sync đã project theo scope từng socket. */
export async function emitScopedSync(io, state) {
  const sockets = await io.fetchSockets();
  for (const socket of sockets) {
    const scope = socket.data?.stateScope || { full: false, sessionDate: null };
    socket.emit("sync", projectAppState(state, scope));
  }
}
