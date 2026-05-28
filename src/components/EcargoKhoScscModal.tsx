import { useCallback, useEffect, useMemo, useRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import type { EcargoSaveStatus } from "../hooks/useEcargoKhoScscRegister";
import type { EcargoJobRecord } from "../types/ecargoJob";
import { isEcargoJobRunning } from "../types/ecargoJob";
import { useEcargoModalBodyController } from "../hooks/useEcargoModalBodyController";
import { ECARGO_VEHICLE_MIN } from "../utils/ecargoKhoScscCore";
import { ECARGO_VEHICLE_TYPES, type EcargoVehicleType } from "../utils/ecargoWarehousePlan";
import { formatEcargoJobErrorMessage } from "../utils/formatEcargoJobErrorMessage";
import { EcargoProgressChecklist } from "./EcargoProgressChecklist";
import { EcargoQrPanel } from "./EcargoQrPanel";
import {
  filterCustomerVehicles,
  formatVehicleLicensePlate,
  vehicleDisplayLabel,
  type UpsertCustomerVehicleParams,
} from "../utils/customerVehicleCore";
import { OPS } from "../styles/opsModalStyles";

export { ECARGO_VEHICLE_MIN };

const ECARGO_INPUT =
  "w-full rounded-lg border border-black/[0.06] bg-white px-3 text-dashboard-primary placeholder:text-dashboard-muted focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/15 dark:border-white/[0.1] dark:bg-ops-elevated dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400/45";

const ECARGO_LABEL =
  "mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-dashboard-muted dark:text-slate-500";

const ECARGO_SECTION =
  "rounded-xl border border-black/[0.05] bg-slate-50/80 dark:border-white/[0.07] dark:bg-white/[0.03]";

const ECARGO_PRE =
  "max-h-28 overflow-auto rounded-lg border border-black/[0.06] bg-white/80 p-2.5 font-mono text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap dark:border-white/[0.08] dark:bg-black/30 dark:text-slate-200";

const ECARGO_BTN_OUTLINE_SKY =
  "min-h-9 flex-1 rounded-lg border border-sky-500/25 bg-white px-3 py-2 text-[12px] font-semibold text-sky-800 active:scale-[0.99] dark:border-sky-400/35 dark:bg-sky-500/10 dark:text-sky-100";

const ECARGO_BTN_OUTLINE_NEUTRAL =
  "min-h-9 flex-1 rounded-lg border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-medium text-dashboard-primary active:scale-[0.99] dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-slate-100";

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
  const normalizedInput = formatVehicleLicensePlate(vehicleInput);
  const filtered = useMemo(
    () => filterCustomerVehicles(vehicles, vehicleInput),
    [vehicleInput, vehicles]
  );
  const showDropdown = listOpen && vehicles.length > 0;

  const pickVehicle = (v: import("../types/customerDirectory").CustomerSavedVehicle) => {
    onSelectVehicle(v);
    onListOpenChange(false);
  };

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
    <div className="space-y-2.5">
      <div className="relative">
        <label className={ECARGO_LABEL}>Biển số xe</label>
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="50H17480"
          value={vehicleInput}
          onChange={(e) => {
            onVehicleInputChange(e.target.value);
            if (vehicles.length) onListOpenChange(true);
          }}
          onFocus={() => {
            if (vehicles.length) onListOpenChange(true);
          }}
          className={`${ECARGO_INPUT} h-11 font-mono text-base font-bold uppercase tracking-wide`}
        />
        {showDropdown ? (
          <div
            ref={listRef}
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-black/[0.08] bg-white py-1 shadow-lg dark:border-white/10 dark:bg-dashboard-surface-dark"
            role="listbox"
          >
            {(filtered.length ? filtered : vehicles).map((v) => {
              const name = v.driverName.trim();
              const id = v.driverId.trim();
              return (
                <button
                  key={v.id}
                  type="button"
                  role="option"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-sky-500/10 dark:hover:bg-sky-400/10"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickVehicle(v)}
                >
                  <span className="font-mono text-[13px] font-bold uppercase text-dashboard-primary dark:text-slate-100">
                    {formatVehicleLicensePlate(v.licensePlate) || v.licensePlate}
                  </span>
                  <span className="min-w-0 truncate text-[11px] text-dashboard-muted dark:text-slate-400">
                    {name || "—"}
                    {id ? ` · ${id}` : ""}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-dashboard-muted dark:text-slate-500">Không khớp — gõ biển mới.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {vehicles.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Xe đại lý nhanh">
          {vehicles.slice(0, 6).map((v) => {
            const plate = formatVehicleLicensePlate(v.licensePlate);
            const selected = Boolean(plate && plate === normalizedInput);
            return (
              <button
                key={v.id}
                type="button"
                role="option"
                aria-selected={selected}
                title={v.driverName.trim() || plate}
                onClick={() => pickVehicle(v)}
                className={`rounded-md border px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition active:scale-[0.98] ${
                  selected
                    ? "border-sky-500/45 bg-sky-500/15 text-sky-900 dark:border-sky-400/50 dark:bg-sky-400/15 dark:text-sky-100"
                    : "border-black/[0.06] bg-white text-dashboard-primary hover:border-sky-400/30 dark:border-white/[0.1] dark:bg-ops-elevated dark:text-slate-200"
                }`}
              >
                {plate || "—"}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className={ECARGO_LABEL}>Tài xế</span>
          <input
            type="text"
            value={driverName}
            onChange={(e) => onDriverNameChange(e.target.value)}
            placeholder="Họ tên"
            className={`${ECARGO_INPUT} h-9 text-[13px]`}
          />
        </label>
        <label className="block min-w-0">
          <span className={ECARGO_LABEL}>CCCD</span>
          <input
            type="text"
            inputMode="numeric"
            value={driverId}
            onChange={(e) => onDriverIdChange(e.target.value.replace(/\D/g, ""))}
            placeholder="Số giấy tờ"
            className={`${ECARGO_INPUT} h-9 font-mono text-[13px]`}
          />
        </label>
      </div>
    </div>
  );
}

function EcargoWarehouseFields({
  arrivalDate,
  arrivalTimeSlot,
  arrivalTimeSlots,
  vehicleType,
  warehouseHint,
  onArrivalDateChange,
  onArrivalTimeSlotChange,
  onVehicleTypeChange,
}: {
  arrivalDate: string;
  arrivalTimeSlot: string;
  arrivalTimeSlots: readonly string[];
  vehicleType: EcargoVehicleType;
  warehouseHint: string;
  onArrivalDateChange: (date: string) => void;
  onArrivalTimeSlotChange: (slot: string) => void;
  onVehicleTypeChange: (type: EcargoVehicleType) => void;
}) {
  return (
    <div className={`${ECARGO_SECTION} divide-y divide-black/[0.05] dark:divide-white/[0.06]`}>
      <div className="grid grid-cols-2 gap-2 p-3">
        <label className="block min-w-0">
          <span className={ECARGO_LABEL}>Ngày hàng vào</span>
          <input
            type="date"
            value={arrivalDate}
            onChange={(e) => onArrivalDateChange(e.target.value)}
            className={`${ECARGO_INPUT} h-9 text-[13px]`}
          />
        </label>
        <label className="block min-w-0">
          <span className={ECARGO_LABEL}>Khung giờ</span>
          <select
            value={arrivalTimeSlot}
            onChange={(e) => onArrivalTimeSlotChange(e.target.value)}
            className={`${ECARGO_INPUT} h-9 text-[13px]`}
          >
            {arrivalTimeSlots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </label>
        <p className="col-span-2 text-[10px] leading-snug text-dashboard-muted dark:text-slate-500">{warehouseHint}</p>
      </div>

      <div className="p-3">
        <span className={ECARGO_LABEL}>Phương tiện vào kho</span>
        <div
          className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-black/[0.03] p-1 sm:grid-cols-4 dark:bg-white/[0.05]"
          role="radiogroup"
          aria-label="Phương tiện vào kho"
        >
          {ECARGO_VEHICLE_TYPES.map((type) => {
            const selected = vehicleType === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onVehicleTypeChange(type)}
                className={`rounded-md px-2 py-1.5 text-[12px] font-semibold transition active:scale-[0.98] ${
                  selected
                    ? "bg-white text-sky-800 shadow-sm ring-1 ring-sky-500/20 dark:bg-sky-500/20 dark:text-sky-100 dark:ring-sky-400/30"
                    : "text-dashboard-muted hover:text-dashboard-primary dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EcargoKhoScscModalBody({
  row,
  customerDirectory,
  vehicleForEcargo,
  driverNameForEcargo,
  driverIdForEcargo,
  arrivalDateForEcargo = "",
  arrivalTimeSlotForEcargo = "",
  vehicleTypeForEcargo = "",
  viewSessionYmd,
  saveStatus,
  job,
  autoRegistering,
  onVehicleChange,
  onDriverChange,
  onWarehouseArrivalChange,
  onVehicleTypeChange,
  onAutoRegister,
  onSaveVehicleAsDefault,
  onRefreshJob,
  onClose,
}: {
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
  onAutoRegister: (opts?: {
    driverName?: string;
    driverId?: string;
    saveAsDefault?: boolean;
    arrivalDate?: string;
    arrivalTimeSlot?: string;
    vehicleType?: EcargoVehicleType;
  }) => Promise<void>;
  onSaveVehicleAsDefault?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  onRefreshJob?: () => void;
  onClose: () => void;
}) {
  const {
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
    readiness,
    saveLabel,
    displayJob,
    jobLabel,
    canSubmit,
    registerButtonLabel,
    showAutoStatusBox,
    showManualFallback,
    pasteBlock,
    applyVehicleFields,
    handleAuto,
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
    setArrivalDate,
    setArrivalTimeSlot,
    setVehicleType,
  } = useEcargoModalBodyController({
    row,
    customerDirectory,
    vehicleForEcargo,
    driverNameForEcargo,
    driverIdForEcargo,
    arrivalDateForEcargo,
    arrivalTimeSlotForEcargo,
    vehicleTypeForEcargo,
    viewSessionYmd,
    saveStatus,
    job,
    autoRegistering,
    onVehicleChange,
    onDriverChange,
    onWarehouseArrivalChange,
    onVehicleTypeChange,
    onAutoRegister,
    onSaveVehicleAsDefault,
    onRefreshJob,
    onClose,
  });

  return (
    <div className="flex flex-col">
      <div className="space-y-3 px-4 pb-3 pt-3 sm:px-5">
        {(agentCode || !readiness.ready || saveLabel) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {agentCode ? (
              <span
                className="inline-flex max-w-full items-center gap-1 rounded-md bg-sky-500/12 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-400/12 dark:text-sky-200"
                title={agentLabel}
              >
                <span className="font-mono uppercase">{agentCode}</span>
                {agentLabel && agentLabel.toUpperCase() !== agentCode ? (
                  <span className="truncate font-normal opacity-80">· {agentLabel}</span>
                ) : null}
              </span>
            ) : (
              <span className="rounded-md bg-amber-500/12 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-400/12 dark:text-amber-200">
                Chưa khớp khách «{row.customerCode || row.customer || "?"}»
              </span>
            )}
            {prefill.appliedFromDefault && prefill.defaultVehicle ? (
              <span className="rounded-md bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-400/12 dark:text-emerald-200">
                Xe mặc định: {vehicleDisplayLabel(prefill.defaultVehicle)}
              </span>
            ) : null}
            {saveLabel ? (
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                  saveStatus === "error"
                    ? "bg-red-500/12 text-red-800 dark:bg-red-400/12 dark:text-red-200"
                    : "bg-emerald-500/12 text-emerald-800 dark:bg-emerald-400/12 dark:text-emerald-200"
                }`}
                role="status"
              >
                {saveLabel}
              </span>
            ) : null}
          </div>
        )}

        <div className={`${ECARGO_SECTION} space-y-3 p-3`}>
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
        </div>

        <EcargoWarehouseFields
          arrivalDate={arrivalDate}
          arrivalTimeSlot={arrivalTimeSlot}
          arrivalTimeSlots={arrivalTimeSlots}
          vehicleType={vehicleType}
          warehouseHint={warehouseHint}
          onArrivalDateChange={setArrivalDate}
          onArrivalTimeSlotChange={setArrivalTimeSlot}
          onVehicleTypeChange={setVehicleType}
        />

        {prefill.customer && onSaveVehicleAsDefault ? (
          <label className="flex cursor-pointer items-center gap-2 px-0.5 text-[12px] text-dashboard-muted dark:text-slate-400">
            <input
              type="checkbox"
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-black/20 text-sky-600 focus:ring-sky-400/40 dark:border-white/20"
            />
            <span>Lưu xe mặc định cho khách</span>
          </label>
        ) : null}

        {!readiness.ready ? (
          <p className="rounded-lg bg-amber-500/8 px-2.5 py-2 text-[12px] leading-snug text-amber-950 dark:bg-amber-400/10 dark:text-amber-100" role="status">
            {readiness.hint}
          </p>
        ) : null}

        {showAutoStatusBox ? (
          <div
            className={`rounded-lg px-3 py-2.5 text-[12px] leading-snug ring-1 ${
              localError || displayJob?.status === "error"
                ? "bg-red-500/10 text-red-900 ring-red-500/15 dark:bg-red-400/10 dark:text-red-200 dark:ring-red-400/20"
                : displayJob?.status === "verified" || displayJob?.status === "qr_ready"
                  ? "bg-emerald-500/10 text-emerald-900 ring-emerald-500/15 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20"
                  : "bg-sky-500/10 text-sky-950 ring-sky-500/15 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-400/20"
            }`}
            role="status"
          >
            {localError ? <p className="font-semibold">{localError}</p> : jobLabel ? <p className="font-semibold">{jobLabel}</p> : null}
            {!localError && displayJob?.message ? (
              <p className="mt-0.5 opacity-90">
                {displayJob.status === "error"
                  ? formatEcargoJobErrorMessage(displayJob.message)
                  : displayJob.message}
              </p>
            ) : null}
            {displayJob && !localError ? (
              <EcargoProgressChecklist job={displayJob} className="mt-2 border-t border-black/[0.06] pt-2 dark:border-white/[0.08]" />
            ) : null}
          </div>
        ) : null}

        {displayJob &&
        (displayJob.status === "qr_ready" || displayJob.status === "verified_waiting_qr") ? (
          <EcargoQrPanel job={displayJob} awb={row.awb} />
        ) : null}

        <details className={`${ECARGO_SECTION} group`} open={showManualFallback}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[12px] font-medium text-dashboard-muted marker:content-none dark:text-slate-400">
            <span>Dự phòng — sao chép thủ công</span>
            <svg
              className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </summary>
          <div className="space-y-2 border-t border-black/[0.05] px-3 pb-3 pt-2 dark:border-white/[0.06]">
            <pre className={ECARGO_PRE}>{pasteBlock}</pre>
            <div className="flex gap-2">
              <button type="button" onClick={() => void copyPasteBlock()} className={ECARGO_BTN_OUTLINE_SKY}>
                {copyOk ? "Đã copy ✓" : "Sao chép"}
              </button>
              <button type="button" onClick={openEcargoSite} className={ECARGO_BTN_OUTLINE_NEUTRAL}>
                Mở eCargo
              </button>
            </div>
            {copyError ? (
              <p className="text-[11px] font-medium text-red-700 dark:text-red-300" role="alert">
                {copyError}
              </p>
            ) : null}
          </div>
        </details>
      </div>

      <div className="sticky bottom-0 border-t border-black/[0.05] bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-white/[0.06] dark:bg-dashboard-surface-dark/95 sm:px-5">
        <button
          type="button"
          disabled={!canSubmit}
          aria-label="Tự động đăng ký eCargo"
          onClick={() => void handleAuto()}
          className="w-full rounded-xl bg-sky-600 py-2.5 text-[13px] font-bold uppercase tracking-wide text-white shadow-md shadow-sky-600/25 transition hover:bg-sky-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none dark:disabled:bg-slate-700"
        >
          {registerButtonLabel}
        </button>
        {!showAutoStatusBox ? (
          <p className="mt-2 text-center text-[10px] leading-snug text-dashboard-muted dark:text-slate-500">
            Tự điền form · tạo phiếu · xác thực mail
          </p>
        ) : null}
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="mt-2 w-full py-1 text-[12px] font-medium text-dashboard-muted transition hover:text-dashboard-primary dark:text-slate-500 dark:hover:text-slate-300"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}

export function EcargoKhoScscCenterModal({
  rowId,
  row,
  customerDirectory = [],
  vehicleForEcargo,
  driverNameForEcargo = "",
  driverIdForEcargo = "",
  arrivalDateForEcargo = "",
  arrivalTimeSlotForEcargo = "",
  vehicleTypeForEcargo = "",
  viewSessionYmd,
  saveStatus,
  job,
  autoRegistering,
  onVehicleChange,
  onDriverChange,
  onWarehouseArrivalChange,
  onVehicleTypeChange,
  onAutoRegister,
  onSaveVehicleAsDefault,
  onRefreshJob,
  onClose,
}: {
  rowId: string;
  row: Shipment;
  customerDirectory?: readonly CustomerDirectoryEntry[];
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
  onDriverChange?: (driverName: string, driverId: string) => void;
  onWarehouseArrivalChange?: (arrivalDate: string, arrivalTimeSlot: string) => void;
  onVehicleTypeChange?: (vehicleType: EcargoVehicleType) => void;
  onAutoRegister: (opts?: {
    driverName?: string;
    driverId?: string;
    saveAsDefault?: boolean;
    arrivalDate?: string;
    arrivalTimeSlot?: string;
    vehicleType?: EcargoVehicleType;
  }) => Promise<void>;
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
        className="relative max-h-[min(88dvh,100%)] w-full max-w-md origin-bottom overflow-y-auto overscroll-contain animate-ecargo-card-in motion-reduce:animate-none motion-reduce:opacity-100 sm:max-w-lg sm:origin-center sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-t-2xl bg-white shadow-dashboard-card-hover dark:bg-dashboard-surface-dark sm:rounded-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-black/[0.05] px-4 py-2.5 dark:border-white/[0.06] sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
                <svg className="h-4 w-5" viewBox="0 0 32 22" fill="currentColor" aria-hidden>
                  <path opacity="0.35" d="M2 14h6v5H2v-5zm22 0h6v5h-6v-5z" />
                  <path d="M1 15.5V8.5L4 5h8l2.5 3H27l3 4.5v6H1zm3-6.5v4h6V9H4zm9 0v4h14l-2-2.5H13V9z" />
                  <circle cx="8" cy="19" r="2.2" />
                  <circle cx="24" cy="19" r="2.2" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2
                  id={`ecargo-modal-title-${rowId}`}
                  className="text-base font-bold tracking-tight text-dashboard-primary dark:text-slate-100"
                >
                  eCargo SCSC
                </h2>
                <p className="truncate font-mono text-[11px] text-dashboard-muted dark:text-slate-400">
                  #{row.stt} · {row.awb} · {row.flight || "—"}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Đóng"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-dashboard-muted transition hover:bg-black/[0.05] hover:text-dashboard-primary dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
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
            driverNameForEcargo={driverNameForEcargo}
            driverIdForEcargo={driverIdForEcargo}
            arrivalDateForEcargo={arrivalDateForEcargo}
            arrivalTimeSlotForEcargo={arrivalTimeSlotForEcargo}
            vehicleTypeForEcargo={vehicleTypeForEcargo}
            viewSessionYmd={viewSessionYmd}
            saveStatus={saveStatus}
            job={job}
            autoRegistering={autoRegistering}
            onVehicleChange={onVehicleChange}
            onDriverChange={handleDriverChange}
            onWarehouseArrivalChange={onWarehouseArrivalChange}
            onVehicleTypeChange={onVehicleTypeChange}
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
  const qrReady = job?.status === "qr_ready";
  const mailReceived = job?.status === "mail_received";
  const running = isEcargoJobRunning(job?.status);
  const errored = job?.status === "error";

  const statusDot = qrReady ? (
    <span className="absolute right-0 top-0 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900" aria-hidden />
  ) : verified ? (
    <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900" aria-hidden />
  ) : mailReceived ? (
    <span className="absolute right-0 top-0 h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500 ring-1 ring-white dark:ring-slate-900" aria-hidden />
  ) : running ? (
    <span className="absolute right-0 top-0 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500 ring-1 ring-white dark:ring-slate-900" aria-hidden />
  ) : errored ? (
    <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-red-500 ring-1 ring-white dark:ring-slate-900" aria-hidden />
  ) : hasVehicle ? (
    <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-sky-500 ring-1 ring-white dark:ring-slate-900" aria-hidden />
  ) : null;

  const truckIcon = (
    <svg
      className={variant === "icon" ? "h-3.5 w-3.5 shrink-0" : "h-4 w-6 shrink-0"}
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
        className={`relative ${OPS.actionIcon} ${OPS.actionIconSky} ${
          open ? OPS.actionIconSkyOpen : ""
        } ${className}`}
      >
        {qrReady ? (
          <span className="absolute -left-0.5 -top-0.5 rounded bg-emerald-600 px-0.5 text-[7px] font-bold leading-none text-white">
            QR
          </span>
        ) : null}
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
      {qrReady ? (
        <>
          <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 ring-1 ring-white" aria-hidden />
          <span className="absolute left-1 top-1 rounded bg-emerald-600 px-1 text-[8px] font-bold leading-none text-white">
            QR
          </span>
        </>
      ) : verified ? (
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
