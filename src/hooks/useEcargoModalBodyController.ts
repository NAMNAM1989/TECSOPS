import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import type { EcargoJobRecord } from "../types/ecargoJob";
import {
  canRetryEcargoJob,
  ecargoJobStatusLabel,
  isEcargoJobRunning,
  isEcargoJobTerminal,
  type EcargoJobStatus,
} from "../types/ecargoJob";
import type { EcargoSaveStatus } from "./useEcargoKhoScscRegister";
import { getEcargoRegisterReadiness } from "../utils/ecargoPayload";
import { ECARGO_VEHICLE_MIN } from "../utils/ecargoKhoScscCore";
import {
  buildKhoScscEcargoPasteBlock,
  formatSessionYmdForEcargoPaste,
} from "../utils/ecargoPasteBlock";
import { ecargoKhoScscSaveStatusLabel } from "../utils/ecargoUiLabels";
import { formatEcargoJobErrorMessage } from "../utils/formatEcargoJobErrorMessage";
import { copyTextToClipboard } from "../utils/copyTextToClipboard";
import {
  formatVehicleLicensePlate,
  resolveEcargoVehiclePrefill,
  type UpsertCustomerVehicleParams,
} from "../utils/customerVehicleCore";
import { ECARGO_SCSC_CREATE_URL } from "../utils/ecargoKhoScscCore";

export type UseEcargoModalBodyControllerArgs = {
  row: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  vehicleForEcargo: string;
  driverNameForEcargo?: string;
  driverIdForEcargo?: string;
  viewSessionYmd: string;
  saveStatus: EcargoSaveStatus;
  job?: EcargoJobRecord;
  autoRegistering: boolean;
  onVehicleChange: (raw: string) => void;
  onDriverChange: (driverName: string, driverId: string) => void;
  onAutoRegister: (opts?: { driverName?: string; driverId?: string; saveAsDefault?: boolean }) => Promise<void>;
  onSaveVehicleAsDefault?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  onRefreshJob?: () => void;
  onClose: () => void;
};

export function useEcargoModalBodyController({
  row,
  customerDirectory,
  vehicleForEcargo,
  driverNameForEcargo = "",
  driverIdForEcargo = "",
  viewSessionYmd,
  saveStatus,
  job,
  autoRegistering,
  onVehicleChange,
  onDriverChange,
  onAutoRegister,
  onSaveVehicleAsDefault,
  onRefreshJob,
  onClose,
}: UseEcargoModalBodyControllerArgs) {
  const prefill = useMemo(
    () =>
      resolveEcargoVehiclePrefill(row, customerDirectory, vehicleForEcargo, {
        driverName: driverNameForEcargo,
        driverId: driverIdForEcargo,
      }),
    [customerDirectory, driverIdForEcargo, driverNameForEcargo, row, vehicleForEcargo]
  );

  const [vehicleInput, setVehicleInput] = useState(prefill.vehicleInput);
  const [driverName, setDriverName] = useState(prefill.driverName);
  const [driverId, setDriverId] = useState(prefill.driverId);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const refreshJobRef = useRef(onRefreshJob);
  const lastPrefillKeyRef = useRef("");
  refreshJobRef.current = onRefreshJob;

  const agentCode = (prefill.customer?.code || row.customerCode || row.customer || "").trim().toUpperCase();
  const agentLabel = prefill.customer?.name?.trim() || row.customer?.trim() || agentCode;

  const prefillKey = `${row.id}|${prefill.vehicleInput}|${prefill.driverName}|${prefill.driverId}|${vehicleForEcargo}|${driverNameForEcargo ?? ""}|${prefill.appliedFromDefault}`;

  useLayoutEffect(() => {
    if (lastPrefillKeyRef.current === prefillKey) return;
    lastPrefillKeyRef.current = prefillKey;
    setVehicleInput(prefill.vehicleInput);
    setDriverName(prefill.driverName);
    setDriverId(prefill.driverId);
    const shouldPersist =
      prefill.vehicleInput.length >= ECARGO_VEHICLE_MIN &&
      (!vehicleForEcargo.trim() || prefill.appliedFromDefault);
    if (shouldPersist) {
      onVehicleChange(prefill.vehicleInput);
      if (prefill.driverName.trim() || prefill.driverId.trim()) {
        onDriverChange(prefill.driverName, prefill.driverId);
      }
    }
  }, [driverNameForEcargo, onDriverChange, onVehicleChange, prefill, prefillKey, row.id, vehicleForEcargo]);

  const pasteDate = useMemo(() => {
    const fromRow = (row.flightDate ?? "").trim();
    if (fromRow) return fromRow.toUpperCase();
    return formatSessionYmdForEcargoPaste(viewSessionYmd);
  }, [row.flightDate, viewSessionYmd]);

  const effectiveVehicle = formatVehicleLicensePlate(vehicleInput || vehicleForEcargo);

  const pasteBlock = useMemo(
    () => buildKhoScscEcargoPasteBlock(row, effectiveVehicle, pasteDate),
    [effectiveVehicle, pasteDate, row]
  );

  const readiness = useMemo(
    () => getEcargoRegisterReadiness(row, effectiveVehicle, viewSessionYmd),
    [effectiveVehicle, row, viewSessionYmd]
  );
  const saveLabel = ecargoKhoScscSaveStatusLabel(saveStatus);
  const displayJob = useMemo((): EcargoJobRecord | undefined => {
    if (!job || job.status === "superseded") return undefined;
    if (autoRegistering && canRetryEcargoJob(job)) {
      return {
        ...job,
        status: "queued" satisfies EcargoJobStatus,
        message: "Đang gửi lệnh đăng ký…",
      };
    }
    return job;
  }, [autoRegistering, job]);
  const jobLabel = displayJob ? ecargoJobStatusLabel(displayJob.status) : "";
  const jobBusy =
    autoRegistering || (isEcargoJobRunning(displayJob?.status) && !canRetryEcargoJob(job));
  const canSubmit = readiness.ready && !autoRegistering && (!jobBusy || canRetryEcargoJob(job));
  const registerButtonLabel = useMemo(() => {
    if (autoRegistering) return "Đang gửi lệnh…";
    if (jobBusy) return "Đang tự động đăng ký…";
    if (job?.status === "error") return "Đăng ký lại eCargo";
    if (job && isEcargoJobTerminal(job.status)) return "Đăng ký lại eCargo";
    return "Tự động đăng ký eCargo";
  }, [autoRegistering, job, jobBusy]);
  const showManualFallback = manualOpen || job?.status === "error" || Boolean(localError);
  const showAutoStatusBox =
    Boolean(localError) ||
    jobBusy ||
    autoRegistering ||
    displayJob?.status === "verified" ||
    (Boolean(displayJob?.message) && displayJob?.status !== "error") ||
    (displayJob?.status === "error" && !manualOpen);

  useEffect(() => {
    refreshJobRef.current?.();
  }, [row.id]);

  useEffect(() => {
    if (job?.status === "error" || localError) setManualOpen(true);
  }, [job?.status, localError]);

  const applyVehicleFields = useCallback(
    (plate: string, name: string, id: string) => {
      const normalized = formatVehicleLicensePlate(plate);
      setVehicleInput(normalized);
      setDriverName(name);
      setDriverId(id);
      onVehicleChange(normalized);
      onDriverChange(name, id);
    },
    [onDriverChange, onVehicleChange]
  );

  const handleAuto = useCallback(async () => {
    if (!canSubmit) return;
    setLocalError(null);
    setCopyError(null);
    setManualOpen(false);
    try {
      await onAutoRegister({ saveAsDefault, driverName, driverId });
      onClose();
      if (saveAsDefault && prefill.customer && onSaveVehicleAsDefault) {
        void onSaveVehicleAsDefault({
          customerId: prefill.customer.id,
          licensePlate: effectiveVehicle,
          driverName,
          driverId,
          setAsDefault: true,
        });
      }
    } catch (e) {
      setLocalError(formatEcargoJobErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }, [
    canSubmit,
    driverId,
    driverName,
    effectiveVehicle,
    onAutoRegister,
    onClose,
    onSaveVehicleAsDefault,
    prefill.customer,
    saveAsDefault,
  ]);

  const copyPasteBlock = useCallback(async () => {
    setCopyError(null);
    const ok = await copyTextToClipboard(pasteBlock);
    if (ok) {
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1600);
      return;
    }
    setCopyError("Không sao chép được — bôi đen khối mẫu bên dưới rồi Ctrl+C.");
  }, [pasteBlock]);

  const openEcargoSite = useCallback(() => {
    window.open(ECARGO_SCSC_CREATE_URL, "_blank", "noopener,noreferrer");
  }, []);

  return {
    prefill,
    agentCode,
    agentLabel,
    vehicleInput,
    driverName,
    driverId,
    saveAsDefault,
    setSaveAsDefault,
    pickerOpen,
    setPickerOpen,
    localError,
    copyOk,
    copyError,
    manualOpen,
    setManualOpen,
    pasteBlock,
    readiness,
    saveLabel,
    displayJob,
    jobLabel,
    canSubmit,
    registerButtonLabel,
    showManualFallback,
    showAutoStatusBox,
    applyVehicleFields,
    handleAuto,
    copyPasteBlock,
    openEcargoSite,
    setVehicleInput,
    setDriverName,
    setDriverId,
  };
}
