import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Shipment } from "../types/shipment";
import { saveRows, scheduleSaveRows, flushScheduledSaveRows, loadSessionRows } from "../utils/shipmentStorage";
import { credFetch } from "../apiFetch";
import {
  parseAppState,
  parseAppStateFetchResult,
  mergeAppStateFromWire,
  type AppStateFetchResult,
} from "../utils/appStateParse";
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
import {
  consolidateOutboxMutations,
  remapOutboxItemIds,
  applyPendingPatchesOverServerState,
  rollbackSingleField,
  measureApplyLocal,
  getFieldDisplayName,
  type OutboxItem,
  type CellStatus,
  OUTBOX_DEBOUNCE_MS,
  OUTBOX_FLUSH_SIZE,
} from "../utils/shipmentOutbox";
import {
  loadPersistentQueue,
  savePersistentQueue,
  clearPersistentQueue,
  type PersistentMutationItem,
} from "../utils/persistentOutbox";
import { notify } from "../ui/notify";
export type SyncStatus = "loading" | "live" | "degraded" | "offline";

export type StateSyncScope = {
  /** YYYY-MM-DD — chỉ tải rows ngày phiên */
  sessionDate?: string;
  /** Stats/export — full history */
  full?: boolean;
};

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

export function assertOfflineQueueCapacity(currentLength: number, max = OFFLINE_QUEUE_MAX): void {
  if (currentLength >= max) {
    throw new Error(
      `Hàng đợi offline đã đầy (${max} thao tác). Kết nối mạng trước khi tiếp tục để tránh mất dữ liệu.`,
    );
  }
}

function pickNewerState(prev: AppState | null, next: AppState): AppState {
  return !prev || next.version >= prev.version ? next : prev;
}

function offlineBootstrapState(rows: Shipment[], sessionDate?: string): AppState {
  const bootRows =
    rows.length > 0
      ? rows
      : sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
        ? loadSessionRows(sessionDate)
        : [];
  return {
    version: 0,
    rows: bootRows,
    customers: loadCustomerDirectoryFromStorage() ?? [],
    airlineLabelOverrides: loadAirlineLabelOverridesFromStorage() ?? undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchAppStateOpts = {
  /** Nếu có và khớp server → `{ unchanged: true }` (không tải rows). */
  sinceVersion?: number;
};

async function fetchAppState(
  scope: StateSyncScope = {},
  opts: FetchAppStateOpts = {}
): Promise<AppStateFetchResult> {
  const q = new URLSearchParams();
  if (scope.full) q.set("full", "1");
  else if (scope.sessionDate) q.set("sessionDate", scope.sessionDate);
  const since =
    opts.sinceVersion != null && opts.sinceVersion > 0
      ? Math.trunc(opts.sinceVersion)
      : null;
  if (since != null) q.set("sinceVersion", String(since));
  const qs = q.toString();
  const res = await fetch(`/api/state${qs ? `?${qs}` : ""}`, {
    ...credFetch,
    cache: "no-store",
    headers: {
      ...(credFetch.headers || {}),
      ...scopeHeaders(scope),
      ...(since != null ? { "X-TECSOPS-Since-Version": String(since) } : {}),
    },
  });
  if (!res.ok) throw new Error(String(res.status));
  const parsed = parseAppStateFetchResult(await res.json());
  if (!parsed) throw new Error("Invalid state");
  return parsed;
}

async function fetchAppStateWithRetry(
  scope: StateSyncScope = {},
  attempts = STATE_FETCH_ATTEMPTS,
  opts: FetchAppStateOpts = {}
): Promise<AppStateFetchResult> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchAppState(scope, opts);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(STATE_FETCH_RETRY_MS * (i + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function requireFullState(result: AppStateFetchResult): AppState {
  if (result.kind !== "full") {
    throw new Error("Expected full state snapshot");
  }
  return result.state;
}

function scopeHeaders(scope: StateSyncScope): Record<string, string> {
  if (scope.full) return { "X-TECSOPS-State-Full": "1" };
  if (scope.sessionDate) return { "X-TECSOPS-Session-Date": scope.sessionDate };
  return {};
}

async function postMutation(
  mutation: ShipmentMutation,
  scope: StateSyncScope = {}
): Promise<AppState> {
  const res = await fetch("/api/mutation", {
    ...credFetch,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...scopeHeaders(scope),
    },
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

async function postBatchMutations(
  mutations: ShipmentMutation[],
  scope: StateSyncScope = {}
): Promise<AppState> {
  const res = await fetch("/api/mutations", {
    ...credFetch,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...scopeHeaders(scope),
    },
    body: JSON.stringify(mutations),
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const msg = typeof o.error === "string" ? o.error : res.statusText;
    debugWarn("sync:batch-mutations", res.status, msg);
    throw new Error(msg);
  }
  const next = parseAppState(body);
  if (!next) throw new Error("Phản hồi máy chủ không hợp lệ sau khi lưu hàng loạt.");
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
  serverState: AppState,
  scope: StateSyncScope = {}
): Promise<{ state: AppState; pending: QueuedMutation[] }> {
  const idMap = new Map<string, string>();
  const pending: QueuedMutation[] = [];
  let current = serverState;

  for (const entry of queue) {
    const mutation = remapMutationId(entry.mutation, idMap);
    try {
      const next = await postMutation(mutation, scope);
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
export function useShipmentSync(
  fallback: Fallback,
  initialScope: StateSyncScope = {}
) {
  const [status, setStatus] = useState<SyncStatus>("loading");
  const [socketConnected, setSocketConnected] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [syncScope, setSyncScopeState] = useState<StateSyncScope>(initialScope);
  const syncScopeRef = useRef(syncScope);
  syncScopeRef.current = syncScope;
  const stateRef = useRef<AppState | null>(state);
  stateRef.current = state;
  const [cellStatuses, setCellStatuses] = useState<Record<string, CellStatus>>({});
  const outboxQueueRef = useRef<OutboxItem[]>([]);
  const outboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboxInFlightRef = useRef(false);
  const apiOkRef = useRef(false);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const cancelledRef = useRef(false);
  const offlineQueueRef = useRef<QueuedMutation[]>([]);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const markSynced = useCallback(() => {
    setLastSyncAt(Date.now());
  }, []);

  const syncPendingCount = useCallback(() => {
    setPendingOfflineCount(offlineQueueRef.current.length);
  }, []);

  const persistOfflineQueue = useCallback(() => {
    const items: PersistentMutationItem[] = offlineQueueRef.current.map((q, idx) => ({
      id: (q.mutation as { id?: string }).id || `persisted_${Date.now()}_${idx}`,
      mutation: q.mutation,
      localId: q.localId,
      enqueuedAt: Date.now(),
    }));
    if (items.length === 0) {
      void clearPersistentQueue();
    } else {
      void savePersistentQueue(items);
    }
  }, []);

  // Nạp mutation đã lưu bền vững từ phiên trước (IndexedDB / localStorage)
  useEffect(() => {
    void loadPersistentQueue().then((persisted) => {
      if (cancelledRef.current || persisted.length === 0) return;
      const existingIds = new Set(
        offlineQueueRef.current.map((q) => (q.mutation as { id?: string }).id)
      );
      for (const item of persisted) {
        const id = (item.mutation as { id?: string }).id;
        if (!id || !existingIds.has(id)) {
          offlineQueueRef.current.push({
            mutation: item.mutation,
            localId: item.localId,
          });
        }
      }
      syncPendingCount();
    });
  }, [syncPendingCount]);

  const updateCellStatus = useCallback((updates: Record<string, CellStatus>) => {
    setCellStatuses((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(updates)) {
        if (v === "idle") {
          if (k in next) {
            delete next[k];
            changed = true;
          }
        } else if (next[k] !== v) {
          next[k] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const persistIfApplied = useCallback(
    (
      prev: AppState | null,
      next: AppState,
      force: boolean,
      options?: { skipCustomerPersist?: boolean }
    ) => {
      const picked = force ? next : pickNewerState(prev, next);
      if (force || picked === next) {
        scheduleSaveRows(picked.rows);
        if (!options?.skipCustomerPersist) {
          saveCustomerDirectoryToStorage(picked.customers);
        }
        if (picked.airlineLabelOverrides) {
          saveAirlineLabelOverridesToStorage(picked.airlineLabelOverrides);
        }
      }
      return picked;
    },
    []
  );

  const connectSocket = useCallback((version: number, scope: StateSyncScope) => {
    if (cancelledRef.current) return;
    socketRef.current?.close();
    const query: Record<string, string> = { v: String(version) };
    if (scope.full) query.full = "1";
    else if (scope.sessionDate) query.sessionDate = scope.sessionDate;
    const socket = io({
      path: SOCKET_IO_PATH,
      query,
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: SOCKET_RECONNECT_DELAY_MS,
      reconnectionDelayMax: SOCKET_RECONNECT_DELAY_MAX_MS,
    });
    socketRef.current = socket;

    const mergeIfNewer = (payload: unknown, skipCustomerPersist = false) => {
      if (cancelledRef.current) return;
      setState((prev) => {
        const next = mergeAppStateFromWire(prev, payload);
        if (!next) return prev;
        // Server thắng, TRỪ các ô đang pending trong outbox
        const mergedWithPending = applyPendingPatchesOverServerState(next, outboxQueueRef.current);
        return persistIfApplied(prev, mergedWithPending, false, { skipCustomerPersist });
      });
      markSynced();
    };

    const onSync = (payload: unknown) => {
      if (cancelledRef.current) return;
      const customersOmitted =
        payload != null &&
        typeof payload === "object" &&
        (payload as Record<string, unknown>).customersOmitted === true;
      mergeIfNewer(payload, customersOmitted);
    };

    socket.on("connect", () => {
      if (cancelledRef.current) return;
      setSocketConnected(true);
      setStatus("live");
      markSynced();
      socket.emit("setStateScope", {
        full: scope.full ? "1" : undefined,
        sessionDate: scope.sessionDate,
      });
    });
    socket.on("disconnect", () => {
      if (cancelledRef.current) return;
      setSocketConnected(false);
      if (apiOkRef.current) setStatus("degraded");
    });
    socket.on("sync", onSync);
  }, [markSynced, persistIfApplied]);

  const goLiveFromParsed = useCallback(
    async (parsed: AppState) => {
      apiOkRef.current = true;

      /** Đẩy chỉnh sửa offline lên server trước, tránh bị state server ghi đè mất. */
      let live = parsed;
      if (offlineQueueRef.current.length > 0) {
        const queued = offlineQueueRef.current;
        offlineQueueRef.current = [];
        const { state: replayed, pending } = await replayOfflineQueue(
          queued,
          parsed,
          syncScopeRef.current
        );
        if (cancelledRef.current) return;
        offlineQueueRef.current = pending;
        persistOfflineQueue();
        live = replayed;
      }

      setState(live);
      saveRows(live.rows);
      saveCustomerDirectoryToStorage(live.customers);
      if (live.airlineLabelOverrides) {
        saveAirlineLabelOverridesToStorage(live.airlineLabelOverrides);
      }
      syncPendingCount();
      markSynced();
      setStatus("degraded");
      connectSocket(live.version, syncScopeRef.current);
    },
    [connectSocket, markSynced, syncPendingCount]
  );

  useEffect(() => {
    cancelledRef.current = false;

    (async () => {
      try {
        const result = await fetchAppStateWithRetry(syncScopeRef.current);
        if (cancelledRef.current) return;
        await goLiveFromParsed(requireFullState(result));
      } catch (e) {
        if (cancelledRef.current) return;
        debugWarn("sync:/api/state", e);
        apiOkRef.current = false;
        setSocketConnected(false);
        setState(offlineBootstrapState(fallbackRef.current.rows, syncScopeRef.current.sessionDate));
        setStatus("offline");
      }
    })();

    const onOnline = () => {
      if (cancelledRef.current || apiOkRef.current) return;
      void (async () => {
        try {
          const result = await fetchAppStateWithRetry(syncScopeRef.current);
          if (cancelledRef.current) return;
          await goLiveFromParsed(requireFullState(result));
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

  useEffect(() => {
    const flush = () => {
      if (state?.rows) flushScheduledSaveRows(state.rows);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [state?.rows]);

  const setSyncScope = useCallback(
    async (nextScope: StateSyncScope) => {
      const prev = syncScopeRef.current;
      const same =
        Boolean(prev.full) === Boolean(nextScope.full) &&
        String(prev.sessionDate || "") === String(nextScope.sessionDate || "");
      setSyncScopeState(nextScope);
      syncScopeRef.current = nextScope;
      if (same || !apiOkRef.current) return;
      try {
        const result = await fetchAppState(nextScope);
        if (cancelledRef.current) return;
        const parsed = requireFullState(result);
        setState((p) => persistIfApplied(p, parsed, true));
        connectSocket(parsed.version, nextScope);
      } catch (e) {
        debugWarn("sync:setScope", e);
      }
    },
    [connectSocket, persistIfApplied]
  );

  const flushOutbox = useCallback(async () => {
    if (outboxInFlightRef.current || outboxQueueRef.current.length === 0) return;
    if (!apiOkRef.current) return;

    if (outboxTimerRef.current) {
      clearTimeout(outboxTimerRef.current);
      outboxTimerRef.current = null;
    }

    outboxInFlightRef.current = true;
    const { toSend, itemsInBatch, isAddBatch } = consolidateOutboxMutations(outboxQueueRef.current);
    if (toSend.length === 0) {
      outboxInFlightRef.current = false;
      return;
    }

    try {
      const beforeState = stateRef.current;
      let nextState: AppState;

      if (isAddBatch) {
        nextState = await postMutation(toSend[0], syncScopeRef.current);
        if (beforeState && itemsInBatch[0].localId) {
          const serverId = addedRowId(beforeState, nextState);
          if (serverId) {
            const idMap = new Map<string, string>([[itemsInBatch[0].localId, serverId]]);
            outboxQueueRef.current = remapOutboxItemIds(outboxQueueRef.current, idMap);
          }
        }
      } else {
        nextState = await postBatchMutations(toSend, syncScopeRef.current);
      }

      let applied: AppState = nextState;
      setState((prev) => {
        applied = pickNewerState(prev, nextState);
        if (applied === nextState) {
          scheduleSaveRows(nextState.rows);
          if (toSend.some((m) => m.action === "SET_CUSTOMERS")) {
            saveCustomerDirectoryToStorage(nextState.customers);
          }
          if (toSend.some((m) => m.action === "SET_AIRLINE_LABEL_OVERRIDES") && nextState.airlineLabelOverrides) {
            saveAirlineLabelOverridesToStorage(nextState.airlineLabelOverrides);
          }
        }
        stateRef.current = applied;
        return applied;
      });

      const processedIds = new Set(itemsInBatch.map((it) => it.id));
      outboxQueueRef.current = outboxQueueRef.current.filter((it) => !processedIds.has(it.id));

      const statusClear: Record<string, CellStatus> = {};
      for (const item of itemsInBatch) {
        for (const field of item.touchedFields) {
          statusClear[`${item.rowId}:${field}`] = "idle";
        }
      }
      updateCellStatus(statusClear);
      markSynced();
    } catch (err) {
      debugWarn("sync:outbox-error", err);
      const statusErrors: Record<string, CellStatus> = {};
      for (const item of itemsInBatch) {
        if (item.mutation.action === "UPDATE") {
          for (const field of item.touchedFields) {
            statusErrors[`${item.rowId}:${field}`] = "error";
            const prevVal = item.previousValues[field];
            if (stateRef.current) {
              const rolledBack = rollbackSingleField(stateRef.current, item.rowId, field, prevVal);
              stateRef.current = rolledBack;
              setState(rolledBack);
              scheduleSaveRows(rolledBack.rows);
            }
            const fieldLabel = getFieldDisplayName(field);
            const lotLabel = item.stt ? `lô #${item.stt}` : "lô";
            notify({
              title: "Lỗi lưu dữ liệu",
              message: `Không lưu được ${fieldLabel} ${lotLabel}`,
              tone: "danger",
              action: {
                label: "Thử lại",
                onClick: () => {
                  void mutate(item.mutation);
                },
              },
            });
          }
        }
      }
      updateCellStatus(statusErrors);
      const processedIds = new Set(itemsInBatch.map((it) => it.id));
      outboxQueueRef.current = outboxQueueRef.current.filter((it) => !processedIds.has(it.id));
    } finally {
      outboxInFlightRef.current = false;
      if (outboxQueueRef.current.length > 0) {
        void flushOutbox();
      }
    }
  }, [markSynced, syncPendingCount, updateCellStatus]);

  const mutate = useCallback(
    async (mutation: ShipmentMutation): Promise<AppState | null> => {
      return measureApplyLocal(mutation.action, () => {
        const base = stateRef.current;
        if (!base) return null;

        if (!apiOkRef.current) {
          assertOfflineQueueCapacity(offlineQueueRef.current.length);
          const next = applyShipmentMutation(base, mutation);
          const queued: QueuedMutation = {
            mutation,
            localId: mutation.action === "ADD" ? (addedRowId(base, next) ?? undefined) : undefined,
          };
          offlineQueueRef.current.push(queued);
          persistOfflineQueue();
          syncPendingCount();
          scheduleSaveRows(next.rows);
          if (mutation.action === "SET_CUSTOMERS") {
            saveCustomerDirectoryToStorage(next.customers);
          }
          if (mutation.action === "SET_AIRLINE_LABEL_OVERRIDES" && next.airlineLabelOverrides) {
            saveAirlineLabelOverridesToStorage(next.airlineLabelOverrides);
          }
          stateRef.current = next;
          setState(next);
          return next;
        }

        const next = applyShipmentMutation(base, mutation);
        stateRef.current = next;
        setState(next);
        scheduleSaveRows(next.rows);
        if (mutation.action === "SET_CUSTOMERS") {
          saveCustomerDirectoryToStorage(next.customers);
        }
        if (mutation.action === "SET_AIRLINE_LABEL_OVERRIDES" && next.airlineLabelOverrides) {
          saveAirlineLabelOverridesToStorage(next.airlineLabelOverrides);
        }

        let rowId = "";
        let touchedFields: string[] = [];
        const previousValues: Record<string, unknown> = {};
        let stt: number | undefined;

        if (mutation.action === "UPDATE") {
          rowId = mutation.id;
          touchedFields = Object.keys(mutation.patch);
          const existingRow = base.rows.find((r) => r.id === mutation.id);
          if (existingRow) {
            stt = existingRow.stt;
            for (const f of touchedFields) {
              previousValues[f] = (existingRow as unknown as Record<string, unknown>)[f];
            }
          }
        } else if (mutation.action === "DELETE") {
          rowId = mutation.id;
        } else if (mutation.action === "ADD") {
          const addedId = addedRowId(base, next);
          rowId = addedId ?? "";
        }

        const outboxItem: OutboxItem = {
          id: `ob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          mutation,
          localId: mutation.action === "ADD" ? rowId : undefined,
          rowId,
          stt,
          touchedFields,
          previousValues,
          createdAt: Date.now(),
        };

        outboxQueueRef.current.push(outboxItem);

        if (touchedFields.length > 0 && rowId) {
          const statusPending: Record<string, CellStatus> = {};
          for (const f of touchedFields) {
            statusPending[`${rowId}:${f}`] = "pending";
          }
          updateCellStatus(statusPending);
        }

        if (outboxQueueRef.current.length >= OUTBOX_FLUSH_SIZE) {
          if (outboxTimerRef.current) {
            clearTimeout(outboxTimerRef.current);
            outboxTimerRef.current = null;
          }
          void flushOutbox();
        } else {
          if (!outboxTimerRef.current) {
            outboxTimerRef.current = setTimeout(() => {
              outboxTimerRef.current = null;
              void flushOutbox();
            }, OUTBOX_DEBOUNCE_MS);
          }
        }

        return next;
      });
    },
    [flushOutbox, syncPendingCount, updateCellStatus]
  );

  useEffect(() => {
    return () => {
      if (outboxTimerRef.current) {
        clearTimeout(outboxTimerRef.current);
        outboxTimerRef.current = null;
      }
    };
  }, []);

  const refreshState = useCallback(async (): Promise<void> => {
    try {
      const localVersion = stateRef.current?.version;
      const result = await fetchAppStateWithRetry(syncScopeRef.current, STATE_FETCH_ATTEMPTS, {
        sinceVersion: localVersion && localVersion > 0 ? localVersion : undefined,
      });
      if (cancelledRef.current) return;
      if (result.kind === "unchanged") {
        apiOkRef.current = true;
        markSynced();
        if (!socketRef.current?.connected) {
          connectSocket(result.version, syncScopeRef.current);
        } else {
          setStatus((s) => (s === "offline" ? "degraded" : s === "loading" ? "degraded" : s));
        }
        return;
      }
      await goLiveFromParsed(result.state);
    } catch (e) {
      debugWarn("sync:refresh", e);
      if (!apiOkRef.current) {
        setStatus("offline");
        setSocketConnected(false);
      }
      throw e;
    }
  }, [connectSocket, goLiveFromParsed, markSynced]);

  const applyRemoteState = useCallback(
    (raw: unknown, opts?: { force?: boolean }): boolean => {
      const parsed = parseAppState(raw);
      if (!parsed) return false;
      setState((prev) => persistIfApplied(prev, parsed, Boolean(opts?.force)));
      markSynced();
      return true;
    },
    [markSynced, persistIfApplied]
  );

  const getCellStatus = useCallback(
    (rowId: string, field: string): CellStatus => {
      return cellStatuses[`${rowId}:${field}`] || "idle";
    },
    [cellStatuses]
  );

  return {
    status,
    state,
    mutate,
    socketConnected,
    /** Epoch ms lần nhận /api/state · socket (client). Ops strip dùng lots.syncedAt / syncMeta, không field này. */
    lastSyncAt,
    pendingOfflineCount,
    refreshState,
    applyRemoteState,
    setSyncScope,
    syncScope,
    cellStatuses,
    getCellStatus,
  };
}
