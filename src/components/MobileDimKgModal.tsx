import { useCallback, useMemo, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import {
  type DimDivisor,
  type DimPieceLine,
  dimDivisorFromFlight,
  formatDimKgDisplay,
  formatLineDimKgDisplay,
  lineDimKg,
  totalDimKgFromLines,
  type ScscDimRoundContext,
} from "../utils/volumetricDim";
import { collectScscDimLimitWarnings } from "../utils/scscAirlineLimitsCheck";
import { resolveScscAirlineDimRule } from "../utils/scscChargeableWeight";
import { consolidateDimPieceLines, DIM_TOTAL_BAND_BELOW_RATIO } from "../utils/dimBulkFill";
import {
  appendDimComboNumber,
  dimEntryAddMeasuredFromCombo,
  dimEntryClearEstimated,
  dimEntryMergeLines,
  dimEntryRandomFill,
  dimEntryRemoveLine,
  dimEntrySeed,
  dimEntryValidateSave,
  normalizeDimComboInput,
  parseRandomLineCountInput,
  parseTargetDimKgInput,
  snapshotDimEntry,
  type DimEntryWorkflowStep,
} from "../utils/dimEntryState";

export type MobileDimSavePayload = {
  dimWeightKg: number | null;
  dimLines: DimPieceLine[] | null;
  dimDivisor: DimDivisor | null;
};

interface MobileDimKgModalProps {
  row: Shipment;
  onClose: () => void;
  onSave: (payload: MobileDimSavePayload) => void;
}

const DIM_QUICK_NUMS = ["120", "100", "80", "60", "50", "40", "30", "25", "20"] as const;

const WORKFLOW_STEPS: { step: DimEntryWorkflowStep; label: string; hint: string }[] = [
  { step: 1, label: "Đo mẫu", hint: "Nhập hoặc dán size đo thật (D×R×C×kiện)" },
  { step: 2, label: "Sinh ước tính", hint: "Chỉ khi còn kiện thiếu — Ngẫu nhiên phần còn lại" },
  { step: 3, label: "Kiểm & lưu", hint: "Khớp kiện lô — chargeable = max(cân, DIM)" },
];

function cloneLines(lines: DimPieceLine[] | null): DimPieceLine[] {
  if (!lines?.length) return [];
  return lines.map((l) => ({ ...l }));
}

function DimWorkflowSteps({ active }: { active: DimEntryWorkflowStep }) {
  return (
    <nav
      className="flex gap-1 rounded-2xl border border-black/[0.06] bg-slate-50/80 p-1"
      aria-label="Quy trình nhập DIM"
    >
      {WORKFLOW_STEPS.map(({ step, label }) => {
        const isActive = step === active;
        const isDone = step < active;
        return (
          <div
            key={step}
            className={`min-w-0 flex-1 rounded-xl px-2 py-1.5 text-center transition-colors ${
              isActive
                ? "bg-white shadow-sm ring-1 ring-apple-blue/20"
                : isDone
                  ? "text-emerald-800"
                  : "text-apple-tertiary"
            }`}
          >
            <p className="text-[10px] font-bold tabular-nums">{step}</p>
            <p className={`truncate text-[10px] font-semibold ${isActive ? "text-apple-label" : ""}`}>
              {label}
            </p>
          </div>
        );
      })}
    </nav>
  );
}

function DimLineSection({
  title,
  tone,
  lines,
  startIndex,
  divisor,
  dimCtx,
  onRemove,
  emptyHint,
}: {
  title: string;
  tone: "measured" | "estimated";
  lines: DimPieceLine[];
  startIndex: number;
  divisor: DimDivisor;
  dimCtx: ScscDimRoundContext;
  onRemove: (index: number) => void;
  emptyHint?: string;
}) {
  const border =
    tone === "measured" ? "border-emerald-200/80 bg-emerald-50/40" : "border-violet-200/80 bg-violet-50/30";
  const badge =
    tone === "measured"
      ? "bg-emerald-100 text-emerald-900"
      : "bg-violet-100 text-violet-900";

  return (
    <section className={`rounded-xl border ${border} p-2`}>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge}`}>
          {title}
        </span>
        <span className="text-[10px] tabular-nums text-apple-secondary">
          {lines.length} dòng · {lines.reduce((s, l) => s + l.pcs, 0)} kiện
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-apple-tertiary">{emptyHint ?? "Chưa có"}</p>
      ) : (
        <ul className="space-y-1.5">
          {lines.map((line, i) => {
            const idx = startIndex + i;
            const sub = lineDimKg(line, divisor, dimCtx);
            return (
              <li
                key={`${idx}-${line.lCm}-${line.wCm}-${line.hCm}-${line.pcs}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-black/[0.06] bg-white px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-semibold text-apple-label">
                    {line.lCm}×{line.wCm}×{line.hCm}{" "}
                    <span className="text-apple-secondary">×{line.pcs}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] tabular-nums text-apple-secondary">
                    {sub != null ? `${formatLineDimKgDisplay(sub, dimCtx)} kg` : "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="shrink-0 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600"
                >
                  Xóa
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function MobileDimKgModal({ row, onClose, onSave }: MobileDimKgModalProps) {
  const [combo, setCombo] = useState("");
  const [lines, setLines] = useState<DimPieceLine[]>(() =>
    consolidateDimPieceLines(cloneLines(row.dimLines))
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [autoRandomAfterAdd, setAutoRandomAfterAdd] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [randomNonce, setRandomNonce] = useState(0);
  const [randomLineCountInput, setRandomLineCountInput] = useState("");
  const [randomTargetKgInput, setRandomTargetKgInput] = useState("");

  const lot = useMemo(
    () => ({
      shipmentId: row.id,
      declaredPcs: row.pcs,
      declaredKg: row.kg,
    }),
    [row.id, row.pcs, row.kg]
  );

  const dimCtx: ScscDimRoundContext = useMemo(
    () => ({ flight: row.flight, awb: row.awb }),
    [row.flight, row.awb]
  );
  const divisor: DimDivisor = useMemo(() => dimDivisorFromFlight(row.flight), [row.flight]);
  const seed = useMemo(() => dimEntrySeed(lot), [lot]);

  const snap = useMemo(
    () => snapshotDimEntry(lines, lot, divisor, dimCtx),
    [lines, lot, divisor, dimCtx]
  );

  const totalDimLabel =
    snap.totalDim != null ? `${formatDimKgDisplay(snap.totalDim, dimCtx)} kg` : "—";

  const limitWarnings = useMemo(
    () => collectScscDimLimitWarnings(row.flight, row.awb, lines),
    [row.flight, row.awb, lines]
  );
  const airlineRule = useMemo(
    () => resolveScscAirlineDimRule(row.flight, row.awb),
    [row.flight, row.awb]
  );

  const randomParams = useMemo(
    () =>
      lot.declaredPcs != null && lot.declaredKg != null
        ? {
            declaredPcs: lot.declaredPcs,
            declaredKg: lot.declaredKg,
            divisor,
            dimCtx,
            seed,
          }
        : null,
    [lot, divisor, dimCtx, seed]
  );

  const applyMutation = useCallback((next: DimPieceLine[], note?: string | null) => {
    setLines(next);
    setActionNote(note ?? null);
  }, []);

  const handleAddRows = useCallback(() => {
    const r = dimEntryAddMeasuredFromCombo(lines, combo, lot, {
      thenRandomFill: autoRandomAfterAdd,
      randomFillParams: randomParams ?? undefined,
    });
    if (!r.ok) {
      window.alert(r.error);
      return;
    }
    applyMutation(r.lines, r.note ?? null);
    setCombo("");
    textareaRef.current?.focus();
  }, [lines, combo, lot, autoRandomAfterAdd, randomParams, applyMutation]);

  const handleMerge = () => {
    const r = dimEntryMergeLines(lines);
    if (!r.ok) {
      window.alert(r.error);
      return;
    }
    applyMutation(r.lines, "Đã gộp các dòng cùng kích thước.");
  };

  const handleRandom = () => {
    if (!randomParams) {
      window.alert("Cần kiện lô và kg lô trên lô hàng.");
      return;
    }
    const targetEstimatedLineCount = parseRandomLineCountInput(randomLineCountInput);
    const targetTotalDimKg = parseTargetDimKgInput(randomTargetKgInput);
    const r = dimEntryRandomFill(lines, lot, {
      ...randomParams,
      regenerationNonce: randomNonce,
      targetEstimatedLineCount,
      targetTotalDimKg,
    });
    if (!r.ok) {
      window.alert(r.error);
      setActionNote(r.error);
      return;
    }
    setRandomNonce((n) => n + 1);
    applyMutation(r.lines, r.note ?? null);
  };

  const handleSave = () => {
    const r = dimEntryValidateSave(lines, lot, divisor, dimCtx);
    if (!r.ok) {
      window.alert(r.error);
      return;
    }
    onSave({
      dimWeightKg: totalDimKgFromLines(r.lines, divisor, dimCtx),
      dimLines: r.lines,
      dimDivisor: divisor,
    });
  };

  const workflowHint = WORKFLOW_STEPS.find((s) => s.step === snap.workflowStep)?.hint ?? "";

  return (
    <div
      className="no-print fixed inset-0 z-[480] flex items-end justify-center bg-black/30 p-2 sm:items-center sm:p-4 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dim-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(94dvh,760px)] w-full max-w-[min(100%,26rem)] flex-col overflow-hidden rounded-[1.35rem] border border-black/[0.06] bg-white shadow-2xl shadow-black/10 sm:max-h-[min(92dvh,860px)] sm:max-w-xl md:max-h-[min(92dvh,920px)] md:max-w-3xl lg:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + ngữ cảnh lô */}
        <div className="shrink-0 border-b border-black/[0.06] bg-gradient-to-b from-slate-50/90 to-white px-4 pb-3 pt-4 sm:px-5 md:px-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="dim-modal-title" className="text-[1.05rem] font-semibold tracking-tight text-apple-label">
                Nhập DIM
              </h2>
              <p className="mt-0.5 text-[11px] text-apple-tertiary">
                {row.awb} · {row.flight}
                {airlineRule ? ` · ${airlineRule.codes.join("/")}` : ""}
              </p>
            </div>
            {airlineRule ? (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold">
                SCSC · {airlineRule.chargeableNote.slice(0, 24)}
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-black/[0.03] px-2.5 py-2">
              <p className="text-[9px] font-medium uppercase text-apple-tertiary">Kiện lô</p>
              <p className="text-sm font-bold tabular-nums">{lot.declaredPcs ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-black/[0.03] px-2.5 py-2">
              <p className="text-[9px] font-medium uppercase text-apple-tertiary">Kg lô</p>
              <p className="text-sm font-bold tabular-nums">{lot.declaredKg ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-violet-50 px-2.5 py-2">
              <p className="text-[9px] font-medium uppercase text-violet-700/80">Tổng DIM</p>
              <p className="text-sm font-bold tabular-nums text-violet-900">{totalDimLabel}</p>
            </div>
            <div
              className={`rounded-xl px-2.5 py-2 ${
                snap.pcsExcess
                  ? "bg-red-50"
                  : snap.pcsMatch
                    ? "bg-emerald-50"
                    : "bg-amber-50"
              }`}
            >
              <p className="text-[9px] font-medium uppercase text-apple-tertiary">Kiện DIM</p>
              <p className="text-sm font-bold tabular-nums">
                {snap.sumDimPcs}
                {lot.declaredPcs != null ? (
                  <span className="text-xs font-medium text-apple-secondary"> / {lot.declaredPcs}</span>
                ) : null}
              </p>
            </div>
          </div>

          {lot.declaredKg != null && snap.totalDim != null ? (
            <p className="mt-2 text-[10px] font-medium text-emerald-900">
              {snap.dimBelowGross
                ? `DIM ${snap.totalDim.toFixed(1)} kg < cân ${lot.declaredKg} kg — chargeable theo cân thực.`
                : `DIM ${snap.totalDim.toFixed(1)} kg ≥ cân ${lot.declaredKg} kg — chargeable theo DIM (hàng cồng kềnh).`}
              {snap.remainingPcs > 0 && lot.declaredKg > 0 && snap.dimBelowGross !== false ? (
                <span className="text-apple-secondary">
                  {" "}
                  Gợi ý Ngẫu nhiên ~{snap.floorKg.toFixed(0)}–{Math.floor(snap.ceilingKg)} kg (
                  {Math.round(DIM_TOTAL_BAND_BELOW_RATIO * 100)}% dưới cân).
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 md:px-6">
          <div className="space-y-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-5 md:space-y-0">
            {/* Cột trái — nhập & thao tác */}
            <div className="space-y-3">
              <DimWorkflowSteps active={snap.workflowStep} />
              <p className="text-[10px] leading-snug text-apple-secondary">{workflowHint}</p>

              {limitWarnings.length > 0 ? (
                <div className="space-y-1 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950">
                  {limitWarnings.map((w, i) => (
                    <p key={i}>{w.kind === "dims" ? "⚠ " : "ℹ "}{w.message}</p>
                  ))}
                </div>
              ) : null}

              <div>
                <label htmlFor="dim-combo" className="text-xs font-semibold text-apple-label">
                  Bước 1 — Nhập mẫu đo (D×R×C×kiện)
                </label>
                <textarea
                  ref={textareaRef}
                  id="dim-combo"
                  rows={isInputFocused ? 3 : 4}
                  value={combo}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  onChange={(e) => {
                    const el = e.target;
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    setCombo(normalizeDimComboInput(el.value));
                    requestAnimationFrame(() => el.setSelectionRange(start, end));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
                      const multiLine = combo.includes("\n");
                      if (e.ctrlKey || e.metaKey || (!multiLine && !e.shiftKey)) {
                        e.preventDefault();
                        handleAddRows();
                      }
                    }
                    if (e.key === "," || e.key === "\u060C") {
                      e.preventDefault();
                      const el = e.currentTarget;
                      const pos = el.selectionStart ?? combo.length;
                      const end = el.selectionEnd ?? combo.length;
                      setCombo(combo.slice(0, pos) + "×" + combo.slice(end));
                    }
                  }}
                  placeholder={"40×50×30×10\n40 50 30 10\nDán từ Excel cũng được"}
                  className="mt-1.5 max-h-48 min-h-[5.5rem] w-full resize-y rounded-2xl border border-black/[0.07] bg-slate-50/40 px-3 py-2.5 font-mono text-sm focus:border-apple-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-apple-blue/18"
                />

                <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
                  {DIM_QUICK_NUMS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setCombo((c) => appendDimComboNumber(c, n));
                        textareaRef.current?.focus();
                      }}
                      className="shrink-0 min-h-[32px] min-w-[2.5rem] rounded-lg border border-black/[0.08] bg-white px-2 text-xs font-bold tabular-nums"
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <div
                  className={`mt-2 grid gap-2 ${snap.canRandomFill ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}
                >
                  <button
                    type="button"
                    onClick={handleAddRows}
                    className="rounded-xl bg-apple-blue py-2.5 text-xs font-semibold text-white sm:text-sm"
                  >
                    Thêm dòng
                  </button>
                  <button
                    type="button"
                    onClick={handleMerge}
                    disabled={lines.length < 2}
                    className="rounded-xl border border-black/[0.12] bg-white py-2.5 text-xs font-semibold disabled:opacity-40 sm:text-sm"
                  >
                    Gộp mẫu
                  </button>
                  {snap.canRandomFill ? (
                    <button
                      type="button"
                      onClick={handleRandom}
                      className="col-span-2 rounded-xl bg-violet-600 py-2.5 text-xs font-semibold text-white sm:col-span-1 sm:text-sm"
                    >
                      Ngẫu nhiên
                    </button>
                  ) : null}
                </div>

                {snap.canRandomFill ? (
                  <div className="mt-2 space-y-2 rounded-xl border border-violet-100 bg-violet-50/30 p-2.5">
                    <p className="text-[10px] font-semibold text-violet-900">Tùy chọn Ngẫu nhiên</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label>
                        <span className="text-[10px] font-medium text-apple-secondary">
                          Tổng DIM mục tiêu (kg)
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={0.1}
                          inputMode="decimal"
                          value={randomTargetKgInput}
                          onChange={(e) => setRandomTargetKgInput(e.target.value)}
                          placeholder={
                            lot.declaredKg != null
                              ? `~${Math.round(lot.declaredKg * (1 - DIM_TOTAL_BAND_BELOW_RATIO))} (tự)`
                              : "950"
                          }
                          className="mt-0.5 w-full rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-sm font-semibold tabular-nums focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                        />
                      </label>
                      <label>
                        <span className="text-[10px] font-medium text-apple-secondary">
                          Số dòng ước tính
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={snap.remainingPcs}
                          inputMode="numeric"
                          value={randomLineCountInput}
                          onChange={(e) => setRandomLineCountInput(e.target.value)}
                          placeholder={
                            snap.targetLineCount
                              ? `${snap.targetLineCount.min}–${snap.targetLineCount.max} (tự)`
                              : String(Math.min(snap.remainingPcs, 10))
                          }
                          className="mt-0.5 w-full rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-sm font-semibold tabular-nums focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                        />
                      </label>
                    </div>
                    <p className="text-[10px] leading-snug text-apple-tertiary">
                      Nhập kg tổng (vd. lô 1000 kg → <strong>950</strong>) — hệ thống tự cân bằng
                      khớp ±1 kg. Để trống = tự chọn ~95–99.9% kg lô.
                    </p>
                  </div>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  {snap.canRandomFill ? (
                    <label className="flex cursor-pointer items-center gap-1.5 text-apple-secondary">
                      <input
                        type="checkbox"
                        checked={autoRandomAfterAdd}
                        onChange={(e) => setAutoRandomAfterAdd(e.target.checked)}
                        className="rounded"
                      />
                      Tự sinh ngẫu nhiên sau Thêm dòng
                    </label>
                  ) : null}
                  {snap.sumEstimatedPcs > 0 ? (
                    <button
                      type="button"
                      onClick={() => applyMutation(dimEntryClearEstimated(lines), "Đã xóa kiện ước tính.")}
                      className="font-semibold text-apple-secondary underline-offset-2 hover:underline"
                    >
                      Xóa ước tính
                    </button>
                  ) : null}
                </div>

                {actionNote ? (
                  <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
                    {actionNote}
                  </p>
                ) : null}

                {snap.canRandomFill && snap.remainingPcs > 0 && snap.measured.length > 0 ? (
                  <p className="mt-2 text-[10px] text-emerald-900">
                    Còn <strong>{snap.remainingPcs}</strong> kiện — có thể bấm{" "}
                    <strong>Ngẫu nhiên</strong> hoặc nhập thêm đo thật.
                  </p>
                ) : snap.pcsMatch && snap.measured.length > 0 ? (
                  <p className="mt-2 text-[10px] text-emerald-900">
                    Đủ kiện — không cần Ngẫu nhiên. Kiểm tra DIM rồi lưu.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Cột phải — danh sách tách đo / ước tính */}
            <div
              className={`space-y-2 md:max-h-[min(58dvh,520px)] md:overflow-y-auto md:rounded-2xl md:border md:border-black/[0.06] md:bg-slate-50/30 md:p-3 ${
                isInputFocused ? "hidden md:block" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-apple-label">Danh sách DIM</span>
                <span className="text-[10px] text-apple-tertiary">
                  {snap.lineCount} dòng
                  {snap.targetLineCount
                    ? ` · mục tiêu ${snap.targetLineCount.min}–${snap.targetLineCount.max}`
                    : ""}
                </span>
              </div>

              <DimLineSection
                title="Đo thật"
                tone="measured"
                lines={snap.measured}
                startIndex={0}
                divisor={divisor}
                dimCtx={dimCtx}
                onRemove={(idx) => applyMutation(dimEntryRemoveLine(lines, idx))}
                emptyHint="Nhập mẫu đo bên trái"
              />
              <DimLineSection
                title="Ước tính"
                tone="estimated"
                lines={snap.estimated}
                startIndex={snap.measured.length}
                divisor={divisor}
                dimCtx={dimCtx}
                onRemove={(idx) => applyMutation(dimEntryRemoveLine(lines, idx))}
                emptyHint={
                  snap.canRandomFill
                    ? "Bấm Ngẫu nhiên sau khi có mẫu đo"
                    : "Không cần ước tính — nhập đủ kiện đo thật"
                }
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-black/[0.06] p-4 sm:px-5 md:px-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={snap.pcsExcess}
              onClick={handleSave}
              className="min-w-0 flex-1 rounded-full bg-apple-blue py-2.5 text-sm font-semibold text-white disabled:bg-apple-tertiary"
            >
              Lưu DIM
            </button>
            <button
              type="button"
              onClick={() => onSave({ dimWeightKg: null, dimLines: null, dimDivisor: null })}
              className="rounded-full border border-black/[0.12] px-3 py-2.5 text-sm font-semibold"
            >
              Xóa DIM
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/[0.12] px-3 py-2.5 text-sm font-semibold text-apple-secondary"
            >
              Hủy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
