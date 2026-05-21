import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
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

export { ECARGO_VEHICLE_MIN };

function EcargoKhoScscModalBody({
  row,
  vehicleForEcargo,
  viewSessionYmd,
  saveStatus,
  job,
  autoRegistering,
  onVehicleChange,
  onAutoRegister,
  onRefreshJob,
  onClose,
}: {
  row: Shipment;
  vehicleForEcargo: string;
  viewSessionYmd: string;
  saveStatus: EcargoSaveStatus;
  job?: EcargoJobRecord;
  autoRegistering: boolean;
  onVehicleChange: (raw: string) => void;
  onAutoRegister: () => Promise<void>;
  onRefreshJob?: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const refreshJobRef = useRef(onRefreshJob);
  refreshJobRef.current = onRefreshJob;

  const pasteDate = useMemo(() => {
    const fromRow = (row.flightDate ?? "").trim();
    if (fromRow) return fromRow.toUpperCase();
    return formatSessionYmdForEcargoPaste(viewSessionYmd);
  }, [row.flightDate, viewSessionYmd]);

  const pasteBlock = useMemo(
    () => buildKhoScscEcargoPasteBlock(row, vehicleForEcargo, pasteDate),
    [pasteDate, row, vehicleForEcargo]
  );

  const readiness = useMemo(
    () => getEcargoRegisterReadiness(row, vehicleForEcargo, viewSessionYmd),
    [row, vehicleForEcargo, viewSessionYmd]
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
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    refreshJobRef.current?.();
  }, [row.id]);

  useEffect(() => {
    if (job?.status === "error" || localError) setManualOpen(true);
  }, [job?.status, localError]);

  const handleAuto = useCallback(async () => {
    if (!canSubmit) return;
    setLocalError(null);
    setCopyError(null);
    setManualOpen(false);
    try {
      await onAutoRegister();
      onClose();
    } catch (e) {
      setLocalError(formatEcargoJobErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }, [canSubmit, onAutoRegister, onClose]);

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
      <label className="block min-w-0">
        <span className="mb-2 block text-sm font-semibold text-apple-secondary">Số xe</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="VD: 50H17480"
          value={vehicleForEcargo}
          onChange={(e) => onVehicleChange(e.target.value)}
          className="h-14 w-full rounded-[1.1rem] border border-black/[0.12] bg-[#f7f7fb] px-5 font-mono text-lg font-bold uppercase tracking-wide text-apple-label shadow-inner placeholder:text-apple-tertiary focus:outline-none focus:ring-2 focus:ring-sky-300/60"
        />
        {saveLabel ? (
          <span
            className={`mt-2 block text-[12px] font-medium ${
              saveStatus === "error" ? "text-red-600" : "text-emerald-700"
            }`}
            role="status"
          >
            {saveLabel}
          </span>
        ) : null}
      </label>

      {!readiness.ready ? (
        <p className="text-[13px] leading-snug text-apple-secondary" role="status">
          {readiness.hint}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit}
        aria-label="Tự động đăng ký eCargo"
        onClick={handleAuto}
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
  vehicleForEcargo,
  viewSessionYmd,
  saveStatus,
  job,
  autoRegistering,
  onVehicleChange,
  onAutoRegister,
  onRefreshJob,
  onClose,
}: {
  rowId: string;
  row: Shipment;
  vehicleForEcargo: string;
  viewSessionYmd: string;
  saveStatus: EcargoSaveStatus;
  job?: EcargoJobRecord;
  autoRegistering: boolean;
  onVehicleChange: (raw: string) => void;
  onAutoRegister: () => Promise<void>;
  onRefreshJob?: () => void;
  onClose: () => void;
}) {
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
            vehicleForEcargo={vehicleForEcargo}
            viewSessionYmd={viewSessionYmd}
            saveStatus={saveStatus}
            job={job}
            autoRegistering={autoRegistering}
            onVehicleChange={onVehicleChange}
            onAutoRegister={onAutoRegister}
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
