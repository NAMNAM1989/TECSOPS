import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { AppState, ShipmentMutation } from "../utils/shipmentMutations";
import {
  normalizeEcargoKhoScscMap,
  normalizeEcargoVehicleInput,
  type EcargoKhoScscPersistedMap,
} from "../utils/ecargoKhoScscCore";
import {
  isEcargoLocalMigrated,
  loadLegacyEcargoKhoScscLocalState,
  markEcargoLocalMigrated,
} from "../utils/ecargoRegisterLocalStorage";
import { credFetch } from "../apiFetch";
import { canSendEcargoRegister } from "../utils/ecargoPayload";
import type { EcargoJobRecord } from "../types/ecargoJob";
import { computeEcargoSeedFromCustomer } from "../utils/customerVehicleCore";

const SAVE_DEBOUNCE_MS = 600;

export type EcargoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export type EcargoLinePatch = {
  vehicleInput?: string;
  driverName?: string;
  driverId?: string;
};

export function useEcargoKhoScscRegister(
  state: AppState | null,
  mutate: (mutation: ShipmentMutation) => Promise<AppState | null>,
  subscribeEcargoJob?: (fn: (job: EcargoJobRecord) => void) => () => void
) {
  const serverMap = useMemo(
    () => normalizeEcargoKhoScscMap(state?.ecargoKhoScsc),
    [state?.ecargoKhoScsc]
  );

  const [draftOverlay, setDraftOverlay] = useState<EcargoKhoScscPersistedMap>({});
  const [saveStatusById, setSaveStatusById] = useState<Record<string, EcargoSaveStatus>>({});
  const [jobsById, setJobsById] = useState<Record<string, EcargoJobRecord>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPatchRef = useRef<Map<string, EcargoLinePatch>>(new Map());
  const migrateStartedRef = useRef(false);

  const map = useMemo(
    () => ({ ...serverMap, ...draftOverlay }),
    [draftOverlay, serverMap]
  );

  useEffect(() => {
    if (!subscribeEcargoJob) return;
    return subscribeEcargoJob((job) => {
      setJobsById((prev) => ({ ...prev, [job.shipmentId]: job }));
      if (job.status === "verified") {
        setSubmittingId((id) => (id === job.shipmentId ? null : id));
      }
      if (job.status === "error") {
        setSubmittingId((id) => (id === job.shipmentId ? null : id));
      }
    });
  }, [subscribeEcargoJob]);

  useEffect(() => {
    if (!state || migrateStartedRef.current || isEcargoLocalMigrated()) return;
    const legacy = loadLegacyEcargoKhoScscLocalState();
    migrateStartedRef.current = true;
    if (Object.keys(legacy).length === 0) {
      markEcargoLocalMigrated();
      return;
    }
    void mutate({ action: "MERGE_ECARGO_KHO_SCSC", map: legacy })
      .then(() => markEcargoLocalMigrated())
      .catch(() => {
        migrateStartedRef.current = false;
      });
  }, [mutate, state]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    setDraftOverlay((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(prev)) {
        const serverLine = serverMap[id];
        const draftLine = prev[id];
        if (
          serverLine &&
          draftLine &&
          serverLine.vehicleInput === draftLine.vehicleInput &&
          serverLine.driverName === draftLine.driverName &&
          serverLine.driverId === draftLine.driverId &&
          serverLine.markedSubmitted === draftLine.markedSubmitted
        ) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [serverMap]);

  const flushEcargoLine = useCallback(
    async (shipmentId: string, patch: EcargoLinePatch) => {
      setSaveStatusById((s) => ({ ...s, [shipmentId]: "saving" }));
      try {
        await mutate({
          action: "PATCH_ECARGO_KHO_SCSC",
          shipmentId,
          ...patch,
        });
        setSaveStatusById((s) => ({ ...s, [shipmentId]: "saved" }));
      } catch {
        setSaveStatusById((s) => ({ ...s, [shipmentId]: "error" }));
      }
    },
    [mutate]
  );

  const scheduleFlush = useCallback(
    (shipmentId: string, patch: EcargoLinePatch) => {
      const prevPending = pendingPatchRef.current.get(shipmentId) ?? {};
      pendingPatchRef.current.set(shipmentId, { ...prevPending, ...patch });

      const existing = timersRef.current.get(shipmentId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timersRef.current.delete(shipmentId);
        const merged = pendingPatchRef.current.get(shipmentId) ?? {};
        pendingPatchRef.current.delete(shipmentId);
        void flushEcargoLine(shipmentId, merged);
      }, SAVE_DEBOUNCE_MS);
      timersRef.current.set(shipmentId, timer);
    },
    [flushEcargoLine]
  );

  const setEcargoLine = useCallback(
    (shipmentId: string, patch: EcargoLinePatch) => {
      const prevLine = map[shipmentId];
      const vehicleInput =
        patch.vehicleInput !== undefined
          ? normalizeEcargoVehicleInput(patch.vehicleInput)
          : prevLine?.vehicleInput ?? "";
      const driverName =
        patch.driverName !== undefined ? patch.driverName.trim().slice(0, 120) : prevLine?.driverName;
      const driverId =
        patch.driverId !== undefined
          ? patch.driverId.replace(/\D/g, "").slice(0, 20)
          : prevLine?.driverId;

      setDraftOverlay((o) => ({
        ...o,
        [shipmentId]: {
          vehicleInput,
          ...(driverName ? { driverName } : {}),
          ...(driverId ? { driverId } : {}),
          markedSubmitted: prevLine?.markedSubmitted,
          updatedAt: prevLine?.updatedAt,
        },
      }));
      setSaveStatusById((s) => ({ ...s, [shipmentId]: "pending" }));

      const flushPatch: EcargoLinePatch = {};
      if (patch.vehicleInput !== undefined) flushPatch.vehicleInput = vehicleInput;
      if (patch.driverName !== undefined) flushPatch.driverName = driverName ?? "";
      if (patch.driverId !== undefined) flushPatch.driverId = driverId ?? "";
      scheduleFlush(shipmentId, flushPatch);
    },
    [map, scheduleFlush]
  );

  const setVehicle = useCallback(
    (shipmentId: string, raw: string) => {
      setEcargoLine(shipmentId, { vehicleInput: raw });
    },
    [setEcargoLine]
  );

  const setDriver = useCallback(
    (shipmentId: string, driverName: string, driverId: string) => {
      setEcargoLine(shipmentId, { driverName, driverId });
    },
    [setEcargoLine]
  );

  const applyCustomerEcargoPrefill = useCallback(
    (row: Shipment) => {
      const line = map[row.id];
      const { prefill, patch } = computeEcargoSeedFromCustomer(row, state?.customers ?? [], line);
      if (patch) {
        setEcargoLine(row.id, patch);
      }
      return prefill;
    },
    [map, setEcargoLine, state?.customers]
  );

  const getSaveStatus = useCallback(
    (shipmentId: string): EcargoSaveStatus => saveStatusById[shipmentId] ?? "idle",
    [saveStatusById]
  );

  const getJob = useCallback(
    (shipmentId: string): EcargoJobRecord | undefined => jobsById[shipmentId],
    [jobsById]
  );

  const autoRegister = useCallback(
    async (
      row: Shipment,
      viewSessionYmd: string,
      opts?: { driverName?: string; driverId?: string }
    ) => {
      const shipmentId = row.id;
      const line = map[shipmentId];
      const vehicleInput = normalizeEcargoVehicleInput(line?.vehicleInput ?? "");
      const driverName = opts?.driverName?.trim() || line?.driverName?.trim() || undefined;
      const driverId = opts?.driverId?.trim() || line?.driverId?.trim() || undefined;

      if (!canSendEcargoRegister(row, vehicleInput, viewSessionYmd)) {
        throw new Error("Chưa đủ dữ liệu để tự động đăng ký eCargo.");
      }

      const pending = timersRef.current.get(shipmentId);
      if (pending) {
        clearTimeout(pending);
        timersRef.current.delete(shipmentId);
        const merged = pendingPatchRef.current.get(shipmentId) ?? { vehicleInput };
        pendingPatchRef.current.delete(shipmentId);
        await flushEcargoLine(shipmentId, merged);
      }

      setSubmittingId(shipmentId);
      setJobsById((prev) => {
        const cur = prev[shipmentId];
        if (cur?.status === "error") {
          return {
            ...prev,
            [shipmentId]: {
              ...cur,
              status: "queued",
              message: "Đang gửi lệnh tự động mới…",
              updatedAt: new Date().toISOString(),
            },
          };
        }
        return prev;
      });
      try {
        const res = await fetch("/api/ecargo/jobs", {
          ...credFetch,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipmentId,
            viewSessionYmd,
            vehicleNo: vehicleInput,
            driverName,
            driverId,
          }),
        });
        const body: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
          throw new Error(typeof o.error === "string" ? o.error : "Không gửi được lệnh eCargo.");
        }
        const o = body as { job?: EcargoJobRecord };
        if (o.job) {
          setJobsById((prev) => ({ ...prev, [shipmentId]: o.job! }));
          if (o.job.status === "verified" || o.job.status === "error") {
            setSubmittingId(null);
          }
        }
      } catch (e) {
        setSubmittingId(null);
        throw e;
      }
    },
    [flushEcargoLine, map]
  );

  const isAutoRegistering = useCallback(
    (shipmentId: string) => submittingId === shipmentId,
    [submittingId]
  );

  const refreshJob = useCallback(async (shipmentId: string) => {
    try {
      const res = await fetch(`/api/ecargo/jobs/${encodeURIComponent(shipmentId)}`, {
        ...credFetch,
        cache: "no-store",
      });
      if (!res.ok) return;
      const body: unknown = await res.json().catch(() => ({}));
      const o = body && typeof body === "object" ? (body as { job?: EcargoJobRecord }) : {};
      if (o.job) {
        setJobsById((prev) => ({ ...prev, [shipmentId]: o.job! }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  return {
    map,
    setVehicle,
    setDriver,
    setEcargoLine,
    applyCustomerEcargoPrefill,
    getSaveStatus,
    getJob,
    refreshJob,
    autoRegister,
    isAutoRegistering,
  };
};
