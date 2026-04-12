import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Shipment } from "../types/shipment";
import { saveRows } from "../utils/shipmentStorage";
import {
  applyShipmentMutation,
  type AppState,
  type ShipmentMutation,
} from "../utils/shipmentMutations";

export type SyncStatus = "loading" | "live" | "degraded" | "offline";

type Fallback = { rows: Shipment[] };

function parseState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== "number" || !Array.isArray(o.rows)) return null;
  return { version: o.version, rows: o.rows as Shipment[] };
}

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
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error(String(res.status));
        const parsed = parseState(await res.json());
        if (!parsed) throw new Error("Invalid state");
        if (cancelled) return;
        apiOkRef.current = true;
        setState(parsed);
        setStatus("degraded");
      } catch {
        if (cancelled) return;
        apiOkRef.current = false;
        setSocketConnected(false);
        setState({
          version: 0,
          rows: fallbackRef.current.rows,
        });
        setStatus("offline");
        return;
      }

      if (cancelled) return;

      const socket = io({
        path: "/socket.io/",
        transports: ["websocket", "polling"],
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });
      socketRef.current = socket;

      const mergeIfNewer = (next: AppState) => {
        setState((prev) => {
          if (!prev || next.version >= prev.version) return next;
          return prev;
        });
      };

      const onSync = (payload: unknown) => {
        const next = parseState(payload);
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
      setState((prev) => {
        if (!prev) return prev;
        try {
          const next = applyShipmentMutation(prev, mutation);
          saveRows(next.rows);
          computed = next;
          return next;
        } catch {
          return prev;
        }
      });
      return computed;
    }

    const res = await fetch("/api/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof body?.error === "string" ? body.error : res.statusText;
      throw new Error(msg);
    }
    const next = parseState(body);
    if (next) {
      setState((prev) => {
        if (!prev || next.version >= prev.version) return next;
        return prev;
      });
    }
    return next;
  }, []);

  return { status, state, mutate, socketConnected };
}
