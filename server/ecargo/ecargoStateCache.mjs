/** Cache state ngắn hạn — tránh loadState/Postgres đầy đủ mỗi POST /api/ecargo/jobs. */
const TTL_MS = Number(process.env.ECARGO_STATE_CACHE_MS) || 8_000;

/** @type {{ state: object | null; at: number }} */
let snapshot = { state: null, at: 0 };

/** @param {object} state */
export function setEcargoStateSnapshot(state) {
  if (state && typeof state === "object") {
    snapshot = { state, at: Date.now() };
  }
}

export function invalidateEcargoStateSnapshot() {
  snapshot = { state: null, at: 0 };
}

/**
 * @param {() => Promise<object>} loadState
 * @param {string} shipmentId
 */
export async function loadShipmentRowForEcargo(loadState, shipmentId) {
  const now = Date.now();
  if (snapshot.state && now - snapshot.at < TTL_MS) {
    const row = snapshot.state.rows?.find((r) => r.id === shipmentId);
    if (row) return { state: snapshot.state, row };
  }
  const state = await loadState();
  setEcargoStateSnapshot(state);
  const row = state.rows?.find((r) => r.id === shipmentId);
  return { state, row };
}
