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

export type SyncStatus = "loading" | "live" | "degraded" | "offline";

type Fallback = { rows: Shipment[] };

const SOCKET_IO_PATH = "/socket.io/" as const;
const SOCKET_RECONNECT_DELAY_MS = 1000;
const SOCKET_RECONNECT_DELAY_MAX_MS = 10000;

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

/**
 * Đồng bộ state lô hàng: fetch `/api/state`, Socket.IO `sync`, mutation POST hoặc chế độ offline + `localStorage`.
 */
export function useShipmentSync(fallback: Fallback) {
  const [status, setStatus] = useState<SyncStatus>("loading");
  const [socketConnected, setSocketConnected] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const apiOkRef = useRef(false);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/state", { ...credFetch, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const parsed = parseAppState(await res.json());
        if (!parsed) throw new Error("Invalid state");
        if (cancelled) return;
        apiOkRef.current = true;
        setState(parsed);
        saveRows(parsed.rows);
        saveCustomerDirectoryToStorage(parsed.customers);
        setStatus("degraded");
      } catch (e) {
        if (cancelled) return;
        debugWarn("sync:/api/state", e);
        apiOkRef.current = false;
        setSocketConnected(false);
        setState(offlineBootstrapState(fallbackRef.current.rows));
        setStatus("offline");
        return;
      }

      if (cancelled) return;

      const socket = io({
        path: SOCKET_IO_PATH,
        transports: ["websocket", "polling"],
        withCredentials: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: SOCKET_RECONNECT_DELAY_MS,
        reconnectionDelayMax: SOCKET_RECONNECT_DELAY_MAX_MS,
      });
      socketRef.current = socket;

      const mergeIfNewer = (next: AppState) => {
        if (cancelled) return;
        setState((prev) => {
          const picked = pickNewerState(prev, next);
          if (picked === next || (prev && picked.version !== prev.version)) {
            saveRows(picked.rows);
            saveCustomerDirectoryToStorage(picked.customers);
          }
          return picked;
        });
      };

      const onSync = (payload: unknown) => {
        if (cancelled) return;
        const next = parseAppState(payload);
        if (next) mergeIfNewer(next);
      };

      socket.on("connect", () => {
        if (cancelled) return;
        setSocketConnected(true);
        setStatus("live");
      });
      socket.on("disconnect", () => {
        if (cancelled) return;
        setSocketConnected(false);
        if (apiOkRef.current) setStatus("degraded");
      });
      socket.on("sync", onSync);
    })();

    return () => {
      cancelled = true;
      setSocketConnected(false);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const mutate = useCallback(async (mutation: ShipmentMutation): Promise<AppState | null> => {
    if (!apiOkRef.current) {
      let computed: AppState | null = null;
      let offlineErr: Error | null = null;
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
          computed = next;
          return next;
        } catch (e) {
          offlineErr = e instanceof Error ? e : new Error(String(e));
          return prev;
        }
      });
      if (offlineErr) throw offlineErr;
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
      if (!next) {
        throw new Error("Phản hồi máy chủ không hợp lệ sau khi lưu.");
      }
      setState((prev) => pickNewerState(prev, next));
      saveRows(next.rows);
      if (mutation.action === "SET_CUSTOMERS" || mutation.action === "RESET_TRIAL_DATA") {
        saveCustomerDirectoryToStorage(next.customers);
      }
      return next;
    } catch (e) {
      if (rollbackRef.current) {
        setState(rollbackRef.current);
        saveRows(rollbackRef.current.rows);
      }
      throw e;
    }
  }, []);

  const refreshState = useCallback(async (): Promise<void> => {
    if (!apiOkRef.current) return;
    try {
      const res = await fetch("/api/state", { ...credFetch, cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const parsed = parseAppState(await res.json());
      if (parsed) {
        setState((prev) => pickNewerState(prev, parsed));
        saveRows(parsed.rows);
        saveCustomerDirectoryToStorage(parsed.customers);
      }
    } catch (e) {
      debugWarn("sync:refresh", e);
    }
  }, []);

  const applyRemoteState = useCallback((raw: unknown, opts?: { force?: boolean }): boolean => {
    const parsed = parseAppState(raw);
    if (!parsed) return false;
    setState((prev) => {
      if (opts?.force) return parsed;
      return pickNewerState(prev, parsed);
    });
    saveRows(parsed.rows);
    saveCustomerDirectoryToStorage(parsed.customers);
    return true;
  }, []);

  return { status, state, mutate, socketConnected, refreshState, applyRemoteState };
}
