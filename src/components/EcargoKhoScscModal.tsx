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
    <div className="space-y-3">
      <div className="relative">
        <label className="mb-2 block text-sm font-semibold text-apple-secondary">Số xe</label>
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
          className="h-14 w-full rounded-[1.1rem] border border-black/[0.12] bg-[#f7f7fb] px-5 font-mono text-lg font-bold uppercase tracking-wide text-apple-label shadow-inner placeholder:text-apple-tertiary focus:outline-none focus:ring-2 focus:ring-sky-300/60"
        />
        {showDropdown ? (
          <div
            ref={listRef}
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-44 overflow-y-auto rounded-xl border border-black/[0.1] bg-white py-1 shadow-apple-md"
            role="listbox"
          >
            {(filtered.length ? filtered : vehicles).map((v) => (
              <button
                key={v.id}
                type="button"
                role="option"
                className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-sky-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelectVehicle(v);
                  onListOpenChange(false);
                }}
              >
                <span className="font-mono text-sm font-bold uppercase text-apple-label">{v.licensePlate}</span>
                <span className="text-[12px] text-apple-secondary">
                  {v.driverName || "—"}
                  {v.driverId ? ` · ${v.driverId}` : ""}
                </span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="px-4 py-2 text-[12px] text-apple-tertiary">Không khớp xe nào — tiếp tục gõ biển mới.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[12px] font-semibold text-apple-secondary">Tên tài xế</span>
          <input
            type="text"
            value={driverName}
            onChange={(e) => onDriverNameChange(e.target.value)}
            placeholder="Tên trên eCargo"
            className="h-11 w-full rounded-xl border border-black/[0.1] bg-[#f7f7fb] px-3.5 text-sm text-apple-label focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[12px] font-semibold text-apple-secondary">CCCD / CMND</span>
          <input
            type="text"
            inputMode="numeric"
            value={driverId}
            onChange={(e) => onDriverIdChange(e.target.value.replace(/\D/g, ""))}
            placeholder="Số giấy tờ tài xế"
            className="h-11 w-full rounded-xl border border-black/[0.1] bg-[#f7f7fb] px-3.5 font-mono text-sm text-apple-label focus:outline-none focus:ring-2 focus:ring-sky-300/60"
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
    <div className="space-y-5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pb-8">
      {agentCode ? (
        <div
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1.5 text-[12px] font-semibold text-sky-900"
          title={agentLabel}
        >
          <span className="text-sky-700/80">Xe của đại lý:</span>
          <span className="truncate font-mono uppercase">{agentCode}</span>
          {agentLabel && agentLabel.toUpperCase() !== agentCode ? (
            <span className="truncate font-normal text-sky-800/90">· {agentLabel}</span>
          ) : null}
        </div>
      ) : (
        <p className="text-[12px] text-amber-800">
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
        <p className="text-[11px] leading-snug text-apple-tertiary">
          {prefill.vehicles.length} xe trong hồ sơ
          {prefill.defaultVehicle ? ` · mặc định: ${vehicleDisplayLabel(prefill.defaultVehicle)}` : ""}
        </p>
      ) : null}

      {saveLabel ? (
        <span
          className={`block text-[12px] font-medium ${
            saveStatus === "error" ? "text-red-600" : "text-emerald-700"
          }`}
          role="status"
        >
          {saveLabel}
        </span>
      ) : null}

      {prefill.customer && onSaveVehicleAsDefault ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-black/[0.08] bg-[#fafafc] px-3.5 py-3 text-[13px] text-apple-label">
          <input
            type="checkbox"
            checked={saveAsDefault}
            onChange={(e) => setSaveAsDefault(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-black/20 text-sky-600 focus:ring-sky-400"
          />
          <span>Lưu xe này làm mặc định cho Khách hàng này</span>
        </label>
      ) : null}

      {!readiness.ready ? (
        <p className="text-[13px] leading-snug text-apple-secondary" role="status">
          {readiness.hint}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit}
        aria-label="Tự động đăng ký eCargo"
        onClick={() => void handleAuto()}
        className="w-full rounded-2xl bg-sky-600 py-4 text-lg font-extrabold uppercase tracking-wide text-white shadow-[0_6px_14px_rgba(2,132,199,0.28)] transition hover:bg-sky-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-black/30 disabled:shadow-none"
      >
        {jobRunning ? "Đang tự động đăng ký…" : "Tự động đăng ký eCargo"}
      </button>

      {showAutoStatusBox ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-[13px] leading-snug ${
            localError || displayJob?.status === "error"
              ? "border-red-300/80 bg-red-50 text-red-900"
              : displayJob?.status === "verified"
                ? "border-emerald-300/80 bg-emerald-50 text-emerald-900"
                : "border-sky-200/80 bg-sky-50 text-sky-950"
          }`}
          role="status"
        >
          {localError ? <p className="font-bold">{localError}</p> : jobLabel ? <p className="font-bold">{jobLabel}</p> : null}
          {!localError && displayJob?.message ? (
            <p className="mt-1 font-medium">
              {displayJob.status === "error"
                ? formatEcargoJobErrorMessage(displayJob.message)
                : displayJob.message}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[12px] leading-snug text-apple-secondary">
          Hệ thống tự điền form eCargo SCSC, tạo phiếu, đọc mail xác thực và bấm Xác Thực.
        </p>
      )}

      <div className="rounded-2xl border border-black/[0.08] bg-[#fafafc]">
        <button
          type="button"
          onClick={() => setManualOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[13px] font-semibold text-apple-label"
          aria-expanded={showManualFallback}
        >
          <span>Dự phòng: sao chép mẫu thủ công</span>
          <span className="text-apple-secondary">{showManualFallback ? "▴" : "▾"}</span>
        </button>
        {showManualFallback ? (
          <div className="space-y-3 border-t border-black/[0.06] px-4 pb-4 pt-3">
            <p className="text-[12px] leading-snug text-apple-secondary">
              Khi tự động lỗi: sao chép 5 dòng → mở eCargo → dán vào form (extension hoặc tay).
            </p>
            <pre className="max-h-32 overflow-auto rounded-xl border border-black/[0.08] bg-white p-3 font-mono text-[12px] leading-relaxed text-apple-label whitespace-pre-wrap">
              {pasteBlock}
            </pre>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void copyPasteBlock()}
                className="min-h-11 flex-1 rounded-xl border border-sky-600/40 bg-white py-2.5 text-[13px] font-bold text-sky-800 shadow-sm active:scale-[0.99]"
              >
                {copyOk ? "Đã sao chép ✓" : "Sao chép mẫu 5 dòng"}
              </button>
              <button
                type="button"
                onClick={openEcargoSite}
                className="min-h-11 flex-1 rounded-xl border border-black/[0.12] bg-white py-2.5 text-[13px] font-semibold text-apple-label shadow-sm active:scale-[0.99]"
              >
                Mở eCargo SCSC
              </button>
            </div>
            {copyOk ? (
              <p className="text-[12px] font-medium text-emerald-700" role="status">
                Đã copy mẫu — mở eCargo và dán (Ctrl+V).
              </p>
            ) : null}
            {copyError ? (
              <p className="text-[12px] font-medium text-red-700" role="alert">
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
        className="w-full rounded-xl py-2.5 text-[13px] font-semibold text-apple-secondary hover:bg-black/[0.04]"
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
      className="fixed inset-0 z-[420] flex items-end justify-center bg-black/45 p-0 backdrop-blur-md animate-ecargo-backdrop-in motion-reduce:animate-none sm:items-center sm:p-6"
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
        className="relative max-h-[min(92dvh,100%)] w-full max-w-2xl origin-bottom overflow-y-auto overscroll-contain animate-ecargo-card-in motion-reduce:animate-none motion-reduce:opacity-100 sm:origin-center sm:rounded-[1.35rem]"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-t-[1.35rem] border border-black/[0.08] bg-white shadow-apple-md ring-1 ring-black/[0.06] sm:rounded-[1.35rem]">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] bg-white px-5 py-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-700 shadow-sm">
                <svg className="h-6 w-8" viewBox="0 0 32 22" fill="currentColor" aria-hidden>
                  <path opacity="0.35" d="M2 14h6v5H2v-5zm22 0h6v5h-6v-5z" />
                  <path d="M1 15.5V8.5L4 5h8l2.5 3H27l3 4.5v6H1zm3-6.5v4h6V9H4zm9 0v4h14l-2-2.5H13V9z" />
                  <circle cx="8" cy="19" r="2.2" />
                  <circle cx="24" cy="19" r="2.2" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 id={`ecargo-modal-title-${rowId}`} className="text-2xl font-extrabold tracking-tight text-apple-label">
                  eCargo
                </h2>
                <p className="truncate font-mono text-sm font-bold text-apple-secondary">
                  Lô #{row.stt} · {row.awb}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Đóng"
              onClick={onClose}
              className="shrink-0 rounded-full p-2.5 text-apple-secondary transition hover:bg-black/[0.06] hover:text-apple-label active:bg-black/[0.08]"
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
}: {
  rowId: string;
  open: boolean;
  hasVehicle: boolean;
  job?: EcargoJobRecord;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  title?: string;
}) {
  const verified = job?.status === "verified";
  const running = isEcargoJobRunning(job?.status);
  const errored = job?.status === "error";

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
