import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import type { EcargoJobRecord } from "../types/ecargoJob";
import {
  canRetryEcargoJob,
  canFetchEcargoQrAction,
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
import {
  buildEcargoArrivalTimeSlots,
  DEFAULT_ECARGO_VEHICLE_TYPE,
  ECARGO_VEHICLE_TYPES,
  resolveEcargoWarehouseArrival,
  todayIsoVietnam,
  type EcargoVehicleType,
} from "../utils/ecargoWarehousePlan";

export type UseEcargoModalBodyControllerArgs = {
  row: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  vehicleForEcargo: string;
  driverNameForEcargo?: string;
  driverIdForEcargo?: string;
  arrivalDateForEcargo?: string;
  arrivalTimeSlotForEcargo?: string;
  vehicleTypeForEcargo?: string;
  viewSessionYmd: string;
  saveStatus: EcargoSaveStatus;
  job?: EcargoJobRecord;
  autoRegistering: boolean;
  onVehicleChange: (raw: string) => void;
  onDriverChange: (driverName: string, driverId: string) => void;
  onWarehouseArrivalChange?: (arrivalDate: string, arrivalTimeSlot: string) => void;
  onVehicleTypeChange?: (vehicleType: EcargoVehicleType) => void;
  markedSubmitted?: boolean;
  onAutoRegister: (opts?: {
    driverName?: string;
    driverId?: string;
    saveAsDefault?: boolean;
    arrivalDate?: string;
    arrivalTimeSlot?: string;
    vehicleType?: EcargoVehicleType;
  }) => Promise<void>;
  onFetchQr?: () => Promise<void>;
  fetchQrBusy?: boolean;
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
  arrivalDateForEcargo = "",
  arrivalTimeSlotForEcargo = "",
  vehicleTypeForEcargo = "",
  viewSessionYmd,
  saveStatus,
  job,
  markedSubmitted = false,
  autoRegistering,
  onVehicleChange,
  onDriverChange,
  onWarehouseArrivalChange,
  onVehicleTypeChange,
  onAutoRegister,
  onFetchQr,
  fetchQrBusy = false,
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

  const arrivalTimeSlots = useMemo(() => buildEcargoArrivalTimeSlots(), []);

  const [arrivalDate, setArrivalDate] = useState(() =>
    resolveEcargoWarehouseArrival({
      arrivalDate: arrivalDateForEcargo,
      arrivalTimeSlot: arrivalTimeSlotForEcargo,
    }).arrivalDate
  );
  const [arrivalTimeSlot, setArrivalTimeSlot] = useState(() =>
    resolveEcargoWarehouseArrival({
      arrivalDate: arrivalDateForEcargo,
      arrivalTimeSlot: arrivalTimeSlotForEcargo,
    }).arrivalTimeSlot
  );
  const [vehicleType, setVehicleType] = useState<EcargoVehicleType>(() => {
    const fromPersisted = ECARGO_VEHICLE_TYPES.find((t) => t === vehicleTypeForEcargo);
    return fromPersisted ?? DEFAULT_ECARGO_VEHICLE_TYPE;
  });

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

  const prefillKey = `${row.id}|${prefill.vehicleInput}|${prefill.driverName}|${prefill.driverId}|${vehicleForEcargo}|${driverNameForEcargo ?? ""}|${arrivalDateForEcargo}|${arrivalTimeSlotForEcargo}|${vehicleTypeForEcargo}|${prefill.appliedFromDefault}`;

  useLayoutEffect(() => {
    if (lastPrefillKeyRef.current === prefillKey) return;
    lastPrefillKeyRef.current = prefillKey;
    setVehicleInput(prefill.vehicleInput);
    setDriverName(prefill.driverName);
    setDriverId(prefill.driverId);
    const wh = resolveEcargoWarehouseArrival({
      arrivalDate: arrivalDateForEcargo,
      arrivalTimeSlot: arrivalTimeSlotForEcargo,
    });
    setArrivalDate(wh.arrivalDate);
    setArrivalTimeSlot(wh.arrivalTimeSlot);
    const vt = ECARGO_VEHICLE_TYPES.find((t) => t === vehicleTypeForEcargo);
    setVehicleType(vt ?? DEFAULT_ECARGO_VEHICLE_TYPE);
    const shouldPersist =
      prefill.vehicleInput.length >= ECARGO_VEHICLE_MIN &&
      (!vehicleForEcargo.trim() || prefill.appliedFromDefault);
    if (shouldPersist) {
      onVehicleChange(prefill.vehicleInput);
      if (prefill.driverName.trim() || prefill.driverId.trim()) {
        onDriverChange(prefill.driverName, prefill.driverId);
      }
    }
  }, [arrivalDateForEcargo, arrivalTimeSlotForEcargo, driverNameForEcargo, onDriverChange, onVehicleChange, prefill, prefillKey, row.id, vehicleForEcargo, vehicleTypeForEcargo]);

  const warehouseHint = useMemo(() => {
    const today = todayIsoVietnam();
    if (arrivalDate <= today) {
      return "eCargo có thể yêu cầu ngày vào kho sau ngày hiện tại — thử chọn ngày mai nếu báo lỗi.";
    }
    return "Khung giờ nên cách hiện tại ≥ 6 giờ (quy tắc cut-off eCargo).";
  }, [arrivalDate]);

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
    autoRegistering ||
    fetchQrBusy ||
    (isEcargoJobRunning(displayJob?.status) && !canRetryEcargoJob(job));
  const canSubmit = readiness.ready && !autoRegistering && !fetchQrBusy && (!jobBusy || canRetryEcargoJob(job));
  const showFetchQrButton = Boolean(onFetchQr);
  const fetchQrEnabled = Boolean(
    onFetchQr && !fetchQrBusy && !autoRegistering && canFetchEcargoQrAction(job, markedSubmitted)
  );
  const fetchQrHint = useMemo(() => {
    if (!onFetchQr || !showFetchQrButton) return null;
    if (fetchQrEnabled) return null;
    if (fetchQrBusy || job?.status === "verified_waiting_qr") {
      return "Đang quét mail QR một lần — nếu chưa có mail, bấm lại sau vài phút.";
    }
    if (markedSubmitted || job?.registrationNo) {
      return "Đang tải trạng thái job — thử bấm lại sau vài giây.";
    }
    return "Hoàn tất «Tự động đăng ký eCargo» trước khi lấy QR.";
  }, [fetchQrBusy, fetchQrEnabled, job?.registrationNo, job?.status, markedSubmitted, onFetchQr, showFetchQrButton]);
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
    displayJob?.status === "qr_ready" ||
    (Boolean(displayJob?.message) && displayJob?.status !== "error") ||
    (displayJob?.status === "error" && !manualOpen);

  useEffect(() => {
    refreshJobRef.current?.();
  }, [row.id]);

  useEffect(() => {
    if (!onFetchQr) return;
    refreshJobRef.current?.();
  }, [job?.status, job?.updatedAt, onFetchQr]);

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
      await onAutoRegister({
        saveAsDefault,
        driverName,
        driverId,
        arrivalDate,
        arrivalTimeSlot,
        vehicleType,
      });
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
    arrivalDate,
    arrivalTimeSlot,
    vehicleType,
    onAutoRegister,
    onClose,
    onSaveVehicleAsDefault,
    prefill.customer,
    saveAsDefault,
  ]);

  const handleFetchQr = useCallback(async () => {
    if (!onFetchQr || !fetchQrEnabled) return;
    setLocalError(null);
    try {
      await onFetchQr();
    } catch (e) {
      setLocalError(formatEcargoJobErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }, [fetchQrEnabled, onFetchQr]);

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
    showFetchQrButton,
    fetchQrEnabled,
    fetchQrHint,
    fetchQrBusy,
    applyVehicleFields,
    handleAuto,
    handleFetchQr,
    copyPasteBlock,
    openEcargoSite,
    setVehicleInput,
    setDriverName,
    setDriverId,
    arrivalDate,
    arrivalTimeSlot,
    arrivalTimeSlots,
    vehicleType,
    warehouseHint,
    setArrivalDate: (date: string) => {
      setArrivalDate(date);
      onWarehouseArrivalChange?.(date, arrivalTimeSlot);
    },
    setArrivalTimeSlot: (slot: string) => {
      setArrivalTimeSlot(slot);
      onWarehouseArrivalChange?.(arrivalDate, slot);
    },
    setVehicleType: (type: EcargoVehicleType) => {
      setVehicleType(type);
      onVehicleTypeChange?.(type);
    },
  };
}
