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
import { debugWarn } from "../utils/debugLog";
import {
  loadAirlineLabelOverridesFromStorage,
  saveAirlineLabelOverridesToStorage,
} from "../utils/airlineLabelOverridesStorage";
import { mergeServerCatalogIntoLocalStore } from "../printing/printerProfilesSync";
import type { EcargoJobRecord } from "../types/ecargoJob";

export type SyncStatus = "loading" | "live" | "degraded" | "offline";

type Fallback = { rows: Shipment[] };

const SOCKET_IO_PATH = "/socket.io/" as const;
const SOCKET_RECONNECT_DELAY_MS = 1000;
const SOCKET_RECONNECT_DELAY_MAX_MS = 10000;

/** Giữ bản sao mới hơn hoặc bằng `version` (tránh ghi đè do gói tin lệch thứ tự). */
function hydratePrinterProfiles(next: AppState): AppState {
  if (next.printerProfiles && next.printerProfiles.profiles.length > 0) {
    mergeServerCatalogIntoLocalStore(next.printerProfiles);
  }
  return next;
}

function pickNewerState(prev: AppState | null, next: AppState): AppState {
  const picked = !prev || next.version >= prev.version ? next : prev;
  return hydratePrinterProfiles(picked);
}

function offlineBootstrapState(rows: Shipment[]): AppState {
  return {
    version: 0,
    rows,
    customers: loadCustomerDirectoryFromStorage() ?? buildDefaultCustomerDirectory(),
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
  const ecargoJobListenersRef = useRef(new Set<(job: EcargoJobRecord) => void>());
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
        setState((prev) => pickNewerState(prev, next));
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
      socket.on("ecargo-job", (payload: unknown) => {
        const job = parseEcargoJobLoose(payload);
        if (!job) return;
        for (const fn of ecargoJobListenersRef.current) fn(job);
      });
    })();

    return () => {
      cancelled = true;
      setSocketConnected(false);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const subscribeEcargoJob = useCallback((fn: (job: EcargoJobRecord) => void) => {
    ecargoJobListenersRef.current.add(fn);
    return () => {
      ecargoJobListenersRef.current.delete(fn);
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
          if (mutation.action === "SET_AIRLINE_LABEL_OVERRIDES" && next.airlineLabelOverrides) {
            saveAirlineLabelOverridesToStorage(next.airlineLabelOverrides);
          }
          if (mutation.action === "SET_PRINTER_PROFILES" && next.printerProfiles) {
            mergeServerCatalogIntoLocalStore(next.printerProfiles);
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
      if (mutation.action === "SET_CUSTOMERS") {
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

  return { status, state, mutate, socketConnected, subscribeEcargoJob };
}

function parseEcargoJobLoose(raw: unknown): EcargoJobRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const shipmentId = typeof o.shipmentId === "string" ? o.shipmentId : "";
  const status = typeof o.status === "string" ? o.status : "";
  if (!shipmentId || !status) return null;
  return {
    shipmentId,
    status: status as EcargoJobRecord["status"],
    jobId: typeof o.jobId === "string" ? o.jobId : undefined,
    vehicleNo: typeof o.vehicleNo === "string" ? o.vehicleNo : undefined,
    message: typeof o.message === "string" ? o.message : undefined,
    verifyUrl: typeof o.verifyUrl === "string" ? o.verifyUrl : undefined,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : undefined,
    finishedAt: typeof o.finishedAt === "string" ? o.finishedAt : undefined,
  };
}
