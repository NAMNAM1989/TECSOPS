import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Shipment } from "../types/shipment";
import { saveRows } from "../utils/shipmentStorage";
import { credFetch } from "../apiFetch";
import { parseAppState } from "../utils/appStateParse";
import {
  loadCustomerDirectoryFromStorage,
  saveCustomerDirectoryToStorage,
} from "../utils/customerDirectoryStorage";
import {
  applyShipmentMutation,
  type AppState,
  type ShipmentMutation,
} from "../utils/shipmentMutations";
import { debugWarn } from "../utils/debugLog";
import {
  loadAirlineLabelOverridesFromStorage,
  saveAirlineLabelOverridesToStorage,
} from "../utils/airlineLabelOverridesStorage";
import { hydrateEsidProfilesFromAppState } from "../utils/esidProfilesSync";

export type SyncStatus = "loading" | "live" | "degraded" | "offline";

type Fallback = { rows: Shipment[] };

/** Mutation đã áp offline, chờ đẩy lên server khi có mạng lại. */
type QueuedMutation = {
  mutation: ShipmentMutation;
  /** ID lô do ADD sinh cục bộ — cần map sang ID server khi replay. */
  localId?: string;
};

const SOCKET_IO_PATH = "/socket.io/" as const;
const SOCKET_RECONNECT_DELAY_MS = 1000;
const SOCKET_RECONNECT_DELAY_MAX_MS = 10000;
const STATE_FETCH_ATTEMPTS = 3;
const STATE_FETCH_RETRY_MS = 400;
/** Chặn hàng đợi phình vô hạn nếu offline kéo dài. */
const OFFLINE_QUEUE_MAX = 500;

function pickNewerState(prev: AppState | null, next: AppState): AppState {
  return !prev || next.version >= prev.version ? next : prev;
}

function offlineBootstrapState(rows: Shipment[]): AppState {
  return {
    version: 0,
    rows,
    customers: loadCustomerDirectoryFromStorage() ?? [],
    airlineLabelOverrides: loadAirlineLabelOverridesFromStorage() ?? undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAppState(): Promise<AppState> {
  const res = await fetch("/api/state", { ...credFetch, cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const parsed = parseAppState(await res.json());
  if (!parsed) throw new Error("Invalid state");
  return parsed;
}

async function fetchAppStateWithRetry(attempts = STATE_FETCH_ATTEMPTS): Promise<AppState> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchAppState();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(STATE_FETCH_RETRY_MS * (i + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function postMutation(mutation: ShipmentMutation): Promise<AppState> {
  const res = await fetch("/api/mutation", {
    ...credFetch,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mutation),
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const msg = typeof o.error === "string" ? o.error : res.statusText;
    debugWarn("sync:mutation", res.status, msg);
    throw new Error(msg);
  }
  const next = parseAppState(body);
  if (!next) throw new Error("Phản hồi máy chủ không hợp lệ sau khi lưu.");
  return next;
}

/** ID lô mới xuất hiện sau khi ADD — dùng map ID cục bộ sang ID server. */
function addedRowId(before: AppState, after: AppState): string | null {
  const known = new Set(before.rows.map((r) => r.id));
  for (const r of after.rows) {
    if (!known.has(r.id)) return r.id;
  }
  return null;
}

function remapMutationId(mutation: ShipmentMutation, idMap: Map<string, string>): ShipmentMutation {
  if (mutation.action !== "UPDATE" && mutation.action !== "DELETE") return mutation;
  const mapped = idMap.get(mutation.id);
  return mapped ? { ...mutation, id: mapped } : mutation;
}

/**
 * Đẩy các mutation đã áp offline lên server theo đúng thứ tự.
 * Mutation lỗi được giữ lại để thử lại lần kết nối sau — không im lặng bỏ dữ liệu.
 */
async function replayOfflineQueue(
  queue: QueuedMutation[],
  serverState: AppState
): Promise<{ state: AppState; pending: QueuedMutation[] }> {
  const idMap = new Map<string, string>();
  const pending: QueuedMutation[] = [];
  let current = serverState;

  for (const entry of queue) {
    const mutation = remapMutationId(entry.mutation, idMap);
    try {
      const next = await postMutation(mutation);
      if (entry.mutation.action === "ADD" && entry.localId) {
        const serverId = addedRowId(current, next);
        if (serverId) idMap.set(entry.localId, serverId);
      }
      current = next;
    } catch (e) {
      debugWarn("sync:offline-replay", entry.mutation.action, e);
      pending.push(entry);
    }
  }
  return { state: current, pending };
}

/**
 * Đồng bộ state lô hàng: fetch `/api/state`, Socket.IO `sync`, mutation POST hoặc chế độ offline + `localStorage`.
 */
export function useShipmentSync(fallback: Fallback) {
  const [status, setStatus] = useState<SyncStatus>("loading");
  const [socketConnected, setSocketConnected] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const apiOkRef = useRef(false);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const cancelledRef = useRef(false);
  const offlineQueueRef = useRef<QueuedMutation[]>([]);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const persistIfApplied = useCallback((prev: AppState | null, next: AppState, force: boolean) => {
    const picked = force ? next : pickNewerState(prev, next);
    if (force || picked === next) {
      saveRows(picked.rows);
      saveCustomerDirectoryToStorage(picked.customers);
      hydrateEsidProfilesFromAppState(picked);
      if (picked.airlineLabelOverrides) {
        saveAirlineLabelOverridesToStorage(picked.airlineLabelOverrides);
      }
    }
    return picked;
  }, []);

  const connectSocket = useCallback((version: number) => {
    if (cancelledRef.current) return;
    socketRef.current?.close();
    const socket = io({
      path: SOCKET_IO_PATH,
      query: { v: String(version) },
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: SOCKET_RECONNECT_DELAY_MS,
      reconnectionDelayMax: SOCKET_RECONNECT_DELAY_MAX_MS,
    });
    socketRef.current = socket;

    const mergeIfNewer = (next: AppState) => {
      if (cancelledRef.current) return;
      setState((prev) => persistIfApplied(prev, next, false));
    };

    const onSync = (payload: unknown) => {
      if (cancelledRef.current) return;
      const next = parseAppState(payload);
      if (next) mergeIfNewer(next);
    };

    socket.on("connect", () => {
      if (cancelledRef.current) return;
      setSocketConnected(true);
      setStatus("live");
    });
    socket.on("disconnect", () => {
      if (cancelledRef.current) return;
      setSocketConnected(false);
      if (apiOkRef.current) setStatus("degraded");
    });
    socket.on("sync", onSync);
  }, [persistIfApplied]);

  const goLiveFromParsed = useCallback(
    async (parsed: AppState) => {
      apiOkRef.current = true;

      /** Đẩy chỉnh sửa offline lên server trước, tránh bị state server ghi đè mất. */
      let live = parsed;
      if (offlineQueueRef.current.length > 0) {
        const queued = offlineQueueRef.current;
        offlineQueueRef.current = [];
        const { state: replayed, pending } = await replayOfflineQueue(queued, parsed);
        if (cancelledRef.current) return;
        offlineQueueRef.current = pending;
        live = replayed;
      }

      setState(live);
      saveRows(live.rows);
      saveCustomerDirectoryToStorage(live.customers);
      hydrateEsidProfilesFromAppState(live);
      if (live.airlineLabelOverrides) {
        saveAirlineLabelOverridesToStorage(live.airlineLabelOverrides);
      }
      setStatus("degraded");
      connectSocket(live.version);
    },
    [connectSocket]
  );

  useEffect(() => {
    cancelledRef.current = false;

    (async () => {
      try {
        const parsed = await fetchAppStateWithRetry();
        if (cancelledRef.current) return;
        await goLiveFromParsed(parsed);
      } catch (e) {
        if (cancelledRef.current) return;
        debugWarn("sync:/api/state", e);
        apiOkRef.current = false;
        setSocketConnected(false);
        setState(offlineBootstrapState(fallbackRef.current.rows));
        setStatus("offline");
      }
    })();

    const onOnline = () => {
      if (cancelledRef.current || apiOkRef.current) return;
      void (async () => {
        try {
          const parsed = await fetchAppStateWithRetry();
          if (cancelledRef.current) return;
          await goLiveFromParsed(parsed);
        } catch (e) {
          debugWarn("sync:online-retry", e);
        }
      })();
    };
    window.addEventListener("online", onOnline);

    return () => {
      cancelledRef.current = true;
      window.removeEventListener("online", onOnline);
      setSocketConnected(false);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [goLiveFromParsed]);

  const mutate = useCallback(async (mutation: ShipmentMutation): Promise<AppState | null> => {
    if (!apiOkRef.current) {
      let computed: AppState | null = null;
      let offlineErr: Error | null = null;
      let queued: QueuedMutation | null = null;
      setState((prev) => {
        if (!prev) return prev;
        try {
          const next = applyShipmentMutation(prev, mutation);
          saveRows(next.rows);
          if (mutation.action === "SET_CUSTOMERS" || mutation.action === "RESET_TRIAL_DATA") {
            saveCustomerDirectoryToStorage(next.customers);
          }
          if (mutation.action === "SET_AIRLINE_LABEL_OVERRIDES" && next.airlineLabelOverrides) {
            saveAirlineLabelOverridesToStorage(next.airlineLabelOverrides);
          }
          queued = {
            mutation,
            localId: mutation.action === "ADD" ? (addedRowId(prev, next) ?? undefined) : undefined,
          };
          computed = next;
          return next;
        } catch (e) {
          offlineErr = e instanceof Error ? e : new Error(String(e));
          return prev;
        }
      });
      if (offlineErr) throw offlineErr;
      if (queued && offlineQueueRef.current.length < OFFLINE_QUEUE_MAX) {
        offlineQueueRef.current.push(queued);
      }
      return computed;
    }

    /** Xóa lô: cập nhật UI ngay để AWB được giải phóng trước khi server phản hồi. */
    const rollbackRef: { current: AppState | null } = { current: null };
    if (mutation.action === "DELETE") {
      setState((prev) => {
        if (!prev) return prev;
        rollbackRef.current = prev;
        try {
          const next = applyShipmentMutation(prev, mutation);
          saveRows(next.rows);
          return next;
        } catch {
          return prev;
        }
      });
    }

    try {
      const next = await postMutation(mutation);
      let applied: AppState = next;
      setState((prev) => {
        applied = pickNewerState(prev, next);
        if (applied === next) {
          saveRows(next.rows);
          if (mutation.action === "SET_CUSTOMERS" || mutation.action === "RESET_TRIAL_DATA") {
            saveCustomerDirectoryToStorage(next.customers);
          }
          if (mutation.action === "SET_AIRLINE_LABEL_OVERRIDES" && next.airlineLabelOverrides) {
            saveAirlineLabelOverridesToStorage(next.airlineLabelOverrides);
          }
          if (
            mutation.action === "SET_ESID_REGISTRANT_STORE" ||
            mutation.action === "SET_ESID_AGENT_STORE" ||
            next.esidRegistrantStore ||
            next.esidAgentStore
          ) {
            hydrateEsidProfilesFromAppState(next);
          }
        }
        return applied;
      });
      return applied;
    } catch (e) {
      if (rollbackRef.current) {
        setState(rollbackRef.current);
        saveRows(rollbackRef.current.rows);
      }
      throw e;
    }
  }, []);

  /**
   * Nhiều mutation trong một request — tránh N round-trip + N lần broadcast full state.
   * Offline thì rơi về áp tuần tự cục bộ qua `mutate`.
   */
  const mutateBatch = useCallback(
    async (mutations: ShipmentMutation[]): Promise<AppState | null> => {
      if (mutations.length === 0) return null;
      if (!apiOkRef.current) {
        let last: AppState | null = null;
        for (const m of mutations) last = await mutate(m);
        return last;
      }
      const res = await fetch("/api/mutations", {
        ...credFetch,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutations),
      });
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        const msg = typeof o.error === "string" ? o.error : res.statusText;
        debugWarn("sync:mutations", res.status, msg);
        throw new Error(msg);
      }
      const next = parseAppState(body);
      if (!next) throw new Error("Phản hồi máy chủ không hợp lệ sau khi lưu.");
      let applied: AppState = next;
      setState((prev) => {
        applied = persistIfApplied(prev, next, false);
        return applied;
      });
      return applied;
    },
    [mutate, persistIfApplied]
  );

  const refreshState = useCallback(async (): Promise<void> => {
    if (!apiOkRef.current) return;
    try {
      const parsed = await fetchAppState();
      setState((prev) => persistIfApplied(prev, parsed, false));
    } catch (e) {
      debugWarn("sync:refresh", e);
    }
  }, [persistIfApplied]);

  const applyRemoteState = useCallback(
    (raw: unknown, opts?: { force?: boolean }): boolean => {
      const parsed = parseAppState(raw);
      if (!parsed) return false;
      setState((prev) => persistIfApplied(prev, parsed, Boolean(opts?.force)));
      return true;
    },
    [persistIfApplied]
  );

  return {
    status,
    state,
    mutate,
    mutateBatch,
    socketConnected,
    refreshState,
    applyRemoteState,
  };
}
