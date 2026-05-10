import { useCallback, useEffect, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { EcargoExtensionStatus } from "../types/ecargo";
import {
  loadEcargoKhoScscState,
  saveEcargoKhoScscState,
  type EcargoKhoScscPersistedMap,
} from "../utils/ecargoRegisterLocalStorage";
import { buildEcargoPayload, canSendEcargoRegister, normalizeVehicleNo } from "../utils/ecargoPayload";
import { dispatchEcargoRegisterFromOps } from "../utils/dispatchEcargoRegisterFromOps";

const ECARGO_STATUS_EVENT = "ECARGO_REGISTER_STATUS";

function isEcargoExtensionStatus(x: unknown): x is EcargoExtensionStatus {
  return (
    x === "received" ||
    x === "filling" ||
    x === "submitted" ||
    x === "waiting_verify_email" ||
    x === "verified_waiting_qr" ||
    x === "qr_ready" ||
    x === "error"
  );
}

export function useEcargoKhoScscRegister() {
  const [map, setMap] = useState<EcargoKhoScscPersistedMap>(() => loadEcargoKhoScscState());

  useEffect(() => {
    saveEcargoKhoScscState(map);
  }, [map]);

  useEffect(() => {
    const applyStatus = (rec: Record<string, unknown>) => {
      const id = rec.opsShipmentId;
      const st = rec.status;
      if (typeof id !== "string" || !id) return;
      if (!isEcargoExtensionStatus(st)) return;
      const vehicleNo = typeof rec.vehicleNo === "string" ? rec.vehicleNo : "";
      const message = typeof rec.message === "string" ? rec.message : undefined;
      setMap((prev) => ({
        ...prev,
        [id]: {
          vehicleInput: normalizeVehicleNo(vehicleNo) || prev[id]?.vehicleInput || "",
          phase: "extension",
          extensionStatus: st,
          extensionMessage: message,
        },
      }));
    };

    const onCustom = (ev: Event) => {
      const ce = ev as CustomEvent<unknown>;
      const d = ce.detail;
      if (!d || typeof d !== "object") return;
      applyStatus(d as Record<string, unknown>);
    };

    /** Extension có thể gửi trạng thái qua postMessage thay vì CustomEvent. */
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      const o = d as Record<string, unknown>;
      if (o.type !== ECARGO_STATUS_EVENT) return;
      applyStatus(o);
    };

    window.addEventListener(ECARGO_STATUS_EVENT, onCustom);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener(ECARGO_STATUS_EVENT, onCustom);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const setVehicle = useCallback((id: string, raw: string) => {
    const vehicleInput = normalizeVehicleNo(raw);
    setMap((prev) => ({
      ...prev,
      [id]: {
        vehicleInput,
        phase: "idle",
        extensionStatus: undefined,
        extensionMessage: undefined,
      },
    }));
  }, []);

  const register = useCallback((row: Shipment, viewSessionYmd: string, vehicleRaw: string) => {
    const vehicleInput = normalizeVehicleNo(vehicleRaw);
    if (!canSendEcargoRegister(row, vehicleInput, viewSessionYmd)) return;

    setMap((prev) => ({
      ...prev,
      [row.id]: {
        vehicleInput,
        phase: "sending",
        extensionStatus: undefined,
        extensionMessage: undefined,
      },
    }));

    requestAnimationFrame(() => {
      const envelope = buildEcargoPayload({
        row,
        vehicleNormalized: vehicleInput,
        viewSessionYmd,
      });
      dispatchEcargoRegisterFromOps(envelope);
      setMap((prev) => ({
        ...prev,
        [row.id]: {
          vehicleInput,
          phase: "sent_local",
          extensionStatus: undefined,
          extensionMessage: undefined,
        },
      }));
    });
  }, []);

  return { map, setVehicle, register };
}
