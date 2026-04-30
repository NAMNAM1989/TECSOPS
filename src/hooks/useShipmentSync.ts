import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Shipment } from "../types/shipment";
import { saveRows } from "../utils/shipmentStorage";
import { credFetch } from "../apiFetch";
import { parseAppState } from "../utils/appStateParse";
import { buildDefaultCustomerDirectory } from "../utils/defaultCustomerDirectory";
import {
  loadCustomerDirectoryFromStorage,
  saveCustomerDirectoryToStorage,
} from "../utils/customerDirectoryStorage";
import {
  applyShipmentMutation,
  type AppState,
  type ShipmentMutation,
} from "../utils/shipmentMutations";

export type SyncStatus = "loading" | "live" | "degraded" | "offline";

type Fallback = { rows: Shipment[] };

const SOCKET_IO_PATH = "/socket.io/" as const;
const SOCKET_RECONNECT_DELAY_MS = 1000;
const SOCKET_RECONNECT_DELAY_MAX_MS = 10000;

/** Giữ bản sao mới hơn hoặc bằng `version` (tránh ghi đè do gói tin lệch thứ tự). */
function pickNewerState(prev: AppState | null, next: AppState): AppState {
  if (!prev || next.version >= prev.version) return next;
  return prev;
}

function offlineBootstrapState(rows: Shipment[]): AppState {
  return {
    version: 0,
    rows,
    customers: loadCustomerDirectoryFromStorage() ?? buildDefaultCustomerDirectory(),
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
        setStatus("degraded");
      } catch {
        if (cancelled) return;
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
        setState((prev) => pickNewerState(prev, next));
      };

      const onSync = (payload: unknown) => {
        const next = parseAppState(payload);
        if (next) mergeIfNewer(next);
      };

      socket.on("connect", () => {
        setSocketConnected(true);
        setStatus("live");
      });
      socket.on("disconnect", () => {
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
          if (mutation.action === "SET_CUSTOMERS") {
            saveCustomerDirectoryToStorage(next.customers);
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
      throw new Error(msg);
    }
    const next = parseAppState(body);
    if (!next) {
      throw new Error("Phản hồi máy chủ không hợp lệ sau khi lưu.");
    }
    setState((prev) => pickNewerState(prev, next));
    return next;
  }, []);

  return { status, state, mutate, socketConnected };
}
