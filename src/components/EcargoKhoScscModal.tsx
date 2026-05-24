import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { getEcargoRegisterReadiness } from "../utils/ecargoPayload";
import {
  ECARGO_SCSC_CREATE_URL,
  ECARGO_VEHICLE_MIN,
} from "../utils/ecargoKhoScscCore";
import {
  buildKhoScscEcargoPasteBlock,
  formatSessionYmdForEcargoPaste,
} from "../utils/ecargoPasteBlock";
import type { EcargoSaveStatus } from "../hooks/useEcargoKhoScscRegister";
import type { EcargoJobRecord } from "../types/ecargoJob";
import { ecargoJobStatusLabel, isEcargoJobRunning, type EcargoJobStatus } from "../types/ecargoJob";
import { ecargoKhoScscSaveStatusLabel } from "../utils/ecargoUiLabels";
import { copyTextToClipboard } from "../utils/copyTextToClipboard";
import { formatEcargoJobErrorMessage } from "../utils/formatEcargoJobErrorMessage";
import {
  filterCustomerVehicles,
  formatVehicleLicensePlate,
  resolveEcargoVehiclePrefill,
  vehicleDisplayLabel,
  type UpsertCustomerVehicleParams,
} from "../utils/customerVehicleCore";

export { ECARGO_VEHICLE_MIN };

const ECARGO_INPUT =
  "w-full rounded-xl border border-black/[0.06] bg-white px-4 text-dashboard-primary shadow-dashboard-card placeholder:text-dashboard-muted focus:border-sky-400/40 focus:outline-none focus:ring-2 focus:ring-sky-400/20 dark:border-white/[0.12] dark:bg-ops-elevated dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-sky-400/45 dark:focus:ring-sky-400/25";

const ECARGO_LABEL =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-dashboard-muted dark:text-slate-400";

const ECARGO_PRE =
  "max-h-32 overflow-auto rounded-xl border border-black/[0.06] bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800 shadow-dashboard-card whitespace-pre-wrap dark:border-white/[0.1] dark:bg-black/35 dark:text-slate-200";

const ECARGO_BTN_OUTLINE_SKY =
  "min-h-11 flex-1 rounded-full border border-sky-500/30 bg-white py-2.5 text-[13px] font-bold text-sky-800 shadow-dashboard-card active:scale-[0.99] dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-100 dark:hover:bg-sky-500/25";

const ECARGO_BTN_OUTLINE_NEUTRAL =
  "min-h-11 flex-1 rounded-full border border-black/[0.06] bg-white py-2.5 text-[13px] font-semibold text-dashboard-primary shadow-dashboard-card active:scale-[0.99] dark:border-white/[0.14] dark:bg-white/[0.07] dark:text-slate-100 dark:hover:bg-white/[0.11]";

function EcargoVehiclePicker({
  vehicles,
  vehicleInput,
  driverName,
  driverId,
  listOpen,
  onListOpenChange,
  onSelectVehicle,
  onVehicleInputChange,
  onDriverNameChange,
  onDriverIdChange,
}: {
  vehicles: readonly import("../types/customerDirectory").CustomerSavedVehicle[];
  vehicleInput: string;
  driverName: string;
  driverId: string;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
  onSelectVehicle: (v: import("../types/customerDirectory").CustomerSavedVehicle) => void;
  onVehicleInputChange: (raw: string) => void;
  onDriverNameChange: (raw: string) => void;
  onDriverIdChange: (raw: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(
    () => filterCustomerVehicles(vehicles, vehicleInput),
    [vehicleInput, vehicles]
  );
  const showDropdown = listOpen && vehicles.length > 0;

  useEffect(() => {
    if (!showDropdown) return;
    const onDoc = (e: Event) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (inputRef.current?.contains(t) || listRef.current?.contains(t)) return;
      onListOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onListOpenChange, showDropdown]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <label className={ECARGO_LABEL}>Số xe</label>
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={vehicles.length ? "Chọn hoặc gõ biển số…" : "VD: 50H17480"}
          value={vehicleInput}
          onChange={(e) => {
            onVehicleInputChange(e.target.value);
            if (vehicles.length) onListOpenChange(true);
          }}
          onFocus={() => {
            if (vehicles.length) onListOpenChange(true);
          }}
          className={`${ECARGO_INPUT} h-14 font-mono text-lg font-bold uppercase tracking-wide`}
        />
        {showDropdown ? (
          <div
            ref={listRef}
            className="absolute left-0 right-0 top-full z-10 mt-1.5 max-h-44 overflow-y-auto rounded-xl border border-black/[0.06] bg-white py-1 shadow-dashboard-card-hover dark:border-white/10 dark:bg-dashboard-surface-dark"
            role="listbox"
          >
            {(filtered.length ? filtered : vehicles).map((v) => (
              <button
                key={v.id}
                type="button"
                role="option"
                className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-sky-500/10 dark:hover:bg-sky-400/10"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelectVehicle(v);
                  onListOpenChange(false);
                }}
              >
                <span className="font-mono text-sm font-bold uppercase text-dashboard-primary dark:text-dashboard-primary-dark">
                  {v.licensePlate}
                </span>
                <span className="text-[12px] text-dashboard-muted dark:text-dashboard-muted-dark">
                  {v.driverName || "—"}
                  {v.driverId ? ` · ${v.driverId}` : ""}
                </span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="px-4 py-2 text-[12px] text-dashboard-muted dark:text-dashboard-muted-dark">
                Không khớp xe nào — tiếp tục gõ biển mới.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className={ECARGO_LABEL}>Tên tài xế</span>
          <input
            type="text"
            value={driverName}
            onChange={(e) => onDriverNameChange(e.target.value)}
            placeholder="Tên trên eCargo"
            className={`${ECARGO_INPUT} h-11 text-sm`}
          />
        </label>
        <label className="block min-w-0">
          <span className={ECARGO_LABEL}>CCCD / CMND</span>
          <input
            type="text"
            inputMode="numeric"
            value={driverId}
            onChange={(e) => onDriverIdChange(e.target.value.replace(/\D/g, ""))}
            placeholder="Số giấy tờ tài xế"
            className={`${ECARGO_INPUT} h-11 font-mono text-sm`}
          />
        </label>
      </div>
    </div>
  );
}

function EcargoKhoScscModalBody({
  row,
  customerDirectory,
  vehicleForEcargo,
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
}: {
  row: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  vehicleForEcargo: string;
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
}) {
  const prefill = useMemo(
    () => resolveEcargoVehiclePrefill(row, customerDirectory, vehicleForEcargo),
    [customerDirectory, row, vehicleForEcargo]
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
  const syncedShipmentRef = useRef<string | null>(null);
  refreshJobRef.current = onRefreshJob;

  const agentCode = (prefill.customer?.code || row.customerCode || row.customer || "").trim().toUpperCase();
  const agentLabel = prefill.customer?.name?.trim() || row.customer?.trim() || agentCode;

  useLayoutEffect(() => {
    if (syncedShipmentRef.current === row.id) return;
    syncedShipmentRef.current = row.id;
    setVehicleInput(prefill.vehicleInput);
    setDriverName(prefill.driverName);
    setDriverId(prefill.driverId);
    if (prefill.vehicleInput && !vehicleForEcargo.trim()) {
      onVehicleChange(prefill.vehicleInput);
      onDriverChange(prefill.driverName, prefill.driverId);
    }
  }, [onDriverChange, onVehicleChange, prefill, row.id, vehicleForEcargo]);

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
    if (!job) return undefined;
    if (autoRegistering && job.status === "error") {
      return {
        ...job,
        status: "queued" satisfies EcargoJobStatus,
        message: "Đang gửi lệnh tự động mới…",
      };
    }
    return job;
  }, [autoRegistering, job]);
  const jobLabel = displayJob ? ecargoJobStatusLabel(displayJob.status) : "";
  const jobRunning = isEcargoJobRunning(displayJob?.status) || autoRegistering;
  const canSubmit = readiness.ready && !jobRunning;
  const showManualFallback =
    manualOpen || job?.status === "error" || Boolean(localError);

  const showAutoStatusBox =
    Boolean(localError) ||
    jobRunning ||
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
      if (saveAsDefault && prefill.customer && onSaveVehicleAsDefault) {
        await onSaveVehicleAsDefault({
          customerId: prefill.customer.id,
          licensePlate: effectiveVehicle,
          driverName,
          driverId,
          setAsDefault: true,
        });
      }
      await onAutoRegister({ saveAsDefault, driverName, driverId });
      onClose();
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

  return (
    <div className="space-y-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:pb-7">
      {agentCode ? (
        <div
          className="inline-flex max-w-full items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1.5 text-[12px] font-semibold text-sky-800 ring-1 ring-sky-500/20 dark:bg-sky-400/15 dark:text-sky-200 dark:ring-sky-400/25"
          title={agentLabel}
        >
          <span className="text-sky-700/80 dark:text-sky-300/80">Xe của đại lý:</span>
          <span className="truncate font-mono uppercase">{agentCode}</span>
          {agentLabel && agentLabel.toUpperCase() !== agentCode ? (
            <span className="truncate font-normal opacity-90">· {agentLabel}</span>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl bg-amber-500/15 px-3 py-2 text-[12px] font-medium text-amber-900 ring-1 ring-amber-500/20 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/25">
          Chưa khớp hồ sơ khách — thêm mã «{row.customerCode || row.customer || "?"}» trong Danh bạ khách để lưu xe mặc định.
        </p>
      )}

      <EcargoVehiclePicker
        vehicles={prefill.vehicles}
        vehicleInput={vehicleInput}
        driverName={driverName}
        driverId={driverId}
        listOpen={pickerOpen}
        onListOpenChange={setPickerOpen}
        onSelectVehicle={(v) => {
          applyVehicleFields(v.licensePlate, v.driverName, v.driverId);
        }}
        onVehicleInputChange={(raw) => {
          const normalized = formatVehicleLicensePlate(raw);
          setVehicleInput(normalized);
          onVehicleChange(normalized);
          const matched = prefill.vehicles.find(
            (v) => formatVehicleLicensePlate(v.licensePlate) === normalized
          );
          if (matched) {
            setDriverName(matched.driverName);
            setDriverId(matched.driverId);
            onDriverChange(matched.driverName, matched.driverId);
          }
        }}
        onDriverNameChange={(raw) => {
          setDriverName(raw);
          onDriverChange(raw, driverId);
        }}
        onDriverIdChange={(raw) => {
          setDriverId(raw);
          onDriverChange(driverName, raw);
        }}
      />

      {prefill.vehicles.length > 0 ? (
        <p className="text-[11px] leading-snug text-dashboard-muted dark:text-dashboard-muted-dark">
          {prefill.vehicles.length} xe trong hồ sơ
          {prefill.defaultVehicle ? ` · mặc định: ${vehicleDisplayLabel(prefill.defaultVehicle)}` : ""}
        </p>
      ) : null}

      {saveLabel ? (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            saveStatus === "error"
              ? "bg-red-500/15 text-red-800 ring-1 ring-red-500/20 dark:bg-red-400/15 dark:text-red-200"
              : "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/20 dark:bg-emerald-400/15 dark:text-emerald-300"
          }`}
          role="status"
        >
          {saveLabel}
        </span>
      ) : null}

      {prefill.customer && onSaveVehicleAsDefault ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-black/[0.05] bg-dashboard-canvas/80 px-3.5 py-3 text-[13px] text-dashboard-primary shadow-dashboard-card dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-slate-200">
          <input
            type="checkbox"
            checked={saveAsDefault}
            onChange={(e) => setSaveAsDefault(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-black/20 text-sky-600 focus:ring-sky-400/40 dark:border-white/20"
          />
          <span>Lưu xe này làm mặc định cho Khách hàng này</span>
        </label>
      ) : null}

      {!readiness.ready ? (
        <p className="text-[13px] leading-snug text-dashboard-muted dark:text-dashboard-muted-dark" role="status">
          {readiness.hint}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit}
        aria-label="Tự động đăng ký eCargo"
        onClick={() => void handleAuto()}
        className="w-full rounded-2xl bg-sky-600 py-3.5 text-base font-bold uppercase tracking-wide text-white shadow-[0_6px_20px_rgba(2,132,199,0.32)] transition hover:bg-sky-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-100 disabled:shadow-none dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
      >
        {jobRunning ? "Đang tự động đăng ký…" : "Tự động đăng ký eCargo"}
      </button>

      {showAutoStatusBox ? (
        <div
          className={`rounded-xl px-4 py-3 text-[13px] leading-snug ring-1 ${
            localError || displayJob?.status === "error"
              ? "bg-red-500/10 text-red-900 ring-red-500/20 dark:bg-red-400/10 dark:text-red-200 dark:ring-red-400/25"
              : displayJob?.status === "verified"
                ? "bg-emerald-500/10 text-emerald-900 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/25"
                : "bg-sky-500/10 text-sky-950 ring-sky-500/20 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-400/25"
          }`}
          role="status"
        >
          {localError ? <p className="font-bold">{localError}</p> : jobLabel ? <p className="font-bold">{jobLabel}</p> : null}
          {!localError && displayJob?.message ? (
            <p className="mt-1 font-medium opacity-90">
              {displayJob.status === "error"
                ? formatEcargoJobErrorMessage(displayJob.message)
                : displayJob.message}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[12px] leading-snug text-dashboard-muted dark:text-dashboard-muted-dark">
          Hệ thống tự điền form eCargo SCSC, tạo phiếu, đọc mail xác thực và bấm Xác Thực.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-black/[0.05] bg-dashboard-canvas/60 shadow-dashboard-card dark:border-white/[0.08] dark:bg-black/25">
        <button
          type="button"
          onClick={() => setManualOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[13px] font-semibold text-dashboard-primary dark:text-dashboard-primary-dark"
          aria-expanded={showManualFallback}
        >
          <span>Dự phòng: sao chép mẫu thủ công</span>
          <svg
            className={`h-4 w-4 shrink-0 text-dashboard-muted transition-transform dark:text-dashboard-muted-dark ${showManualFallback ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {showManualFallback ? (
          <div className="space-y-3 border-t border-black/[0.05] px-4 pb-4 pt-3 dark:border-white/[0.06]">
            <p className="text-[12px] leading-snug text-dashboard-muted dark:text-dashboard-muted-dark">
              Khi tự động lỗi: sao chép 5 dòng → mở eCargo → dán vào form (extension hoặc tay).
            </p>
            <pre className={ECARGO_PRE}>{pasteBlock}</pre>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => void copyPasteBlock()} className={ECARGO_BTN_OUTLINE_SKY}>
                {copyOk ? "Đã sao chép ✓" : "Sao chép mẫu 5 dòng"}
              </button>
              <button type="button" onClick={openEcargoSite} className={ECARGO_BTN_OUTLINE_NEUTRAL}>
                Mở eCargo SCSC
              </button>
            </div>
            {copyOk ? (
              <p className="text-[12px] font-medium text-emerald-700 dark:text-emerald-300" role="status">
                Đã copy mẫu — mở eCargo và dán (Ctrl+V).
              </p>
            ) : null}
            {copyError ? (
              <p className="text-[12px] font-medium text-red-700 dark:text-red-300" role="alert">
                {copyError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="w-full rounded-full py-2.5 text-[13px] font-semibold text-dashboard-muted transition hover:bg-black/[0.04] dark:text-dashboard-muted-dark dark:hover:bg-white/[0.06]"
      >
        Đóng
      </button>
    </div>
  );
}

export function EcargoKhoScscCenterModal({
  rowId,
  row,
  customerDirectory = [],
  vehicleForEcargo,
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
}: {
  rowId: string;
  row: Shipment;
  customerDirectory?: readonly CustomerDirectoryEntry[];
  vehicleForEcargo: string;
  viewSessionYmd: string;
  saveStatus: EcargoSaveStatus;
  job?: EcargoJobRecord;
  autoRegistering: boolean;
  onVehicleChange: (raw: string) => void;
  onDriverChange?: (driverName: string, driverId: string) => void;
  onAutoRegister: (opts?: { driverName?: string; driverId?: string; saveAsDefault?: boolean }) => Promise<void>;
  onSaveVehicleAsDefault?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  onRefreshJob?: () => void;
  onClose: () => void;
}) {
  const handleDriverChange = useCallback(
    (name: string, id: string) => {
      onDriverChange?.(name, id);
    },
    [onDriverChange]
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[420] flex items-end justify-center bg-black/50 p-0 backdrop-blur-md animate-ecargo-backdrop-in motion-reduce:animate-none dark:bg-black/65 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchEnd={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`ecargo-modal-title-${rowId}`}
        data-ecargo-panel={rowId}
        id={`ecargo-panel-${rowId}`}
        className="relative max-h-[min(92dvh,100%)] w-full max-w-2xl origin-bottom overflow-y-auto overscroll-contain animate-ecargo-card-in motion-reduce:animate-none motion-reduce:opacity-100 sm:origin-center sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-t-2xl bg-white shadow-dashboard-card-hover dark:bg-dashboard-surface-dark sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.05] px-5 py-4 dark:border-white/[0.06] sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/20 dark:bg-sky-400/15 dark:text-sky-300 dark:ring-sky-400/25">
                <svg className="h-6 w-8" viewBox="0 0 32 22" fill="currentColor" aria-hidden>
                  <path opacity="0.35" d="M2 14h6v5H2v-5zm22 0h6v5h-6v-5z" />
                  <path d="M1 15.5V8.5L4 5h8l2.5 3H27l3 4.5v6H1zm3-6.5v4h6V9H4zm9 0v4h14l-2-2.5H13V9z" />
                  <circle cx="8" cy="19" r="2.2" />
                  <circle cx="24" cy="19" r="2.2" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2
                  id={`ecargo-modal-title-${rowId}`}
                  className="text-xl font-bold tracking-tight text-dashboard-primary dark:text-dashboard-primary-dark sm:text-2xl"
                >
                  eCargo
                </h2>
                <p className="truncate font-mono text-sm font-semibold text-dashboard-muted dark:text-dashboard-muted-dark">
                  Lô #{row.stt} · {row.awb}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Đóng"
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-dashboard-muted transition hover:bg-black/[0.05] hover:text-dashboard-primary dark:text-dashboard-muted-dark dark:hover:bg-white/[0.08] dark:hover:text-dashboard-primary-dark"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <EcargoKhoScscModalBody
            row={row}
            customerDirectory={customerDirectory}
            vehicleForEcargo={vehicleForEcargo}
            viewSessionYmd={viewSessionYmd}
            saveStatus={saveStatus}
            job={job}
            autoRegistering={autoRegistering}
            onVehicleChange={onVehicleChange}
            onDriverChange={handleDriverChange}
            onAutoRegister={onAutoRegister}
            onSaveVehicleAsDefault={onSaveVehicleAsDefault}
            onRefreshJob={onRefreshJob}
            onClose={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

export function EcargoKhoScscTriggerButton({
  rowId,
  open,
  hasVehicle,
  job,
  onClick,
  className = "",
  title,
  variant = "default",
}: {
  rowId: string;
  open: boolean;
  hasVehicle: boolean;
  job?: EcargoJobRecord;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  title?: string;
  /** `icon` — chỉ biểu tượng xe (bảng desktop). */
  variant?: "default" | "icon";
}) {
  const verified = job?.status === "verified";
  const running = isEcargoJobRunning(job?.status);
  const errored = job?.status === "error";

  const statusDot = verified ? (
    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-ops-elevated" aria-hidden />
  ) : running ? (
    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500 ring-1 ring-white dark:ring-ops-elevated" aria-hidden />
  ) : errored ? (
    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-red-500 ring-1 ring-white dark:ring-ops-elevated" aria-hidden />
  ) : hasVehicle ? (
    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-sky-500 ring-1 ring-white dark:ring-ops-elevated" aria-hidden />
  ) : null;

  const truckIcon = (
    <svg
      className={variant === "icon" ? "h-4 w-4 shrink-0" : "h-4 w-6 shrink-0"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16V8l2.5-2.5H14L17 8v8M3 16h18M7 16v2m10-2v2M7 18a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zm8 0a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zM5 11h12" />
    </svg>
  );

  if (variant === "icon") {
    return (
      <button
        type="button"
        data-ecargo-trigger={rowId}
        aria-label="eCargo"
        title={title ?? "eCargo — đăng ký kho SCSC"}
        aria-expanded={open}
        aria-controls={`ecargo-panel-${rowId}`}
        onClick={onClick}
        className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sky-700 transition-all active:scale-[0.96] dark:text-sky-300 ${
          open
            ? "bg-sky-500/15 ring-1 ring-sky-500/30 shadow-[0_0_10px_rgba(14,165,233,0.2)] dark:bg-sky-400/15 dark:ring-sky-400/30"
            : "bg-white/90 shadow-dashboard-card hover:bg-sky-500/10 dark:bg-ops-elevated dark:hover:bg-sky-400/15"
        } ${className}`}
      >
        {statusDot}
        {truckIcon}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-ecargo-trigger={rowId}
      aria-label="eCargo"
      title={title ?? "eCargo — tự động đăng ký kho SCSC"}
      aria-expanded={open}
      aria-controls={`ecargo-panel-${rowId}`}
      onClick={onClick}
      className={`relative flex h-11 min-w-[2.75rem] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 shadow-sm transition-all active:scale-[0.97] ${
        open
          ? "border-sky-600 bg-sky-100 text-sky-900 ring-1 ring-sky-300/50"
          : "border-sky-500/80 bg-gradient-to-b from-white via-sky-50 to-sky-100 text-sky-800 hover:border-sky-600"
      } ${className}`}
    >
      {verified ? (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white" aria-hidden />
      ) : running ? (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500 ring-1 ring-white" aria-hidden />
      ) : errored ? (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500 ring-1 ring-white" aria-hidden />
      ) : hasVehicle ? (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sky-600 ring-1 ring-white" aria-hidden />
      ) : null}
      <svg className="h-4 w-6 shrink-0" viewBox="0 0 32 22" fill="currentColor" aria-hidden>
        <path opacity="0.35" d="M2 14h6v5H2v-5zm22 0h6v5h-6v-5z" />
        <path d="M1 15.5V8.5L4 5h8l2.5 3H27l3 4.5v6H1zm3-6.5v4h6V9H4zm9 0v4h14l-2-2.5H13V9z" />
        <circle cx="8" cy="19" r="2.2" />
        <circle cx="24" cy="19" r="2.2" />
      </svg>
      <span className="text-[12px] font-extrabold uppercase tracking-wide">eCargo</span>
    </button>
  );
}
