import { useCallback, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  type DimDivisor,
  type DimPieceLine,
  dimDivisorFromFlight,
  formatDimKgDisplay,
  formatLineDimKgDisplay,
  lineDimKg,
  totalDimKgFromLines,
  tryParseDimPieceLinesFromComboText,
  type ScscDimRoundContext,
} from "../utils/volumetricDim";
import { collectScscDimLimitWarnings } from "../utils/scscAirlineLimitsCheck";
import { resolveScscAirlineDimRule } from "../utils/scscChargeableWeight";
import {
  consolidateDimPieceLines,
} from "../utils/dimBulkFill";
import {
  dimEntryAddMeasuredFromCombo,
  dimEntryClearEstimated,
  dimEntryRandomFill,
  dimEntryRemoveLine,
  dimEntrySeed,
  dimEntryValidateSave,
  normalizeDimComboInput,
  parseRandomLineCountInput,
  parseTargetDimKgInput,
  snapshotDimEntry,
} from "../utils/dimEntryState";
import {
  loadDimTemplates,
  saveDimTemplate,
  deleteDimTemplate,
  type DimTemplate,
} from "../utils/dimTemplateStorage";

export type MobileDimSavePayload = {
  dimWeightKg: number | null;
  dimLines: DimPieceLine[] | null;
  dimDivisor: DimDivisor | null;
};

interface MobileDimKgModalProps {
  row: Shipment;
  customerDirectory?: readonly CustomerDirectoryEntry[];
  onClose: () => void;
  onSave: (payload: MobileDimSavePayload) => void;
}

function cloneLines(lines: DimPieceLine[] | null): DimPieceLine[] {
  if (!lines?.length) return [];
  return lines.map((l) => ({ ...l }));
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

/** Unified status banner — single source of truth, replaces 3 old layers */
function StatusBanner({
  snap,
  actionNote,
  declaredPcs,
}: {
  snap: {
    pcsMatch: boolean;
    pcsExcess: boolean;
    remainingPcs: number;
    sumDimPcs: number;
  };
  actionNote: string | null;
  declaredPcs: number | null | undefined;
}) {
  if (snap.pcsExcess) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-900">
        <span>
          DƯ KIỆN — Tổng DIM (<strong>{snap.sumDimPcs}</strong>) vượt quá kiện lô (<strong>{declaredPcs}</strong>). Hãy bấm <strong>Xóa</strong> bớt dòng ước tính.
        </span>
      </div>
    );
  }
  if (actionNote?.startsWith("❌")) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-900">
        <span>{actionNote.slice(2)}</span>
      </div>
    );
  }
  if (snap.pcsMatch) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs font-extrabold text-emerald-900">
        <span>
          ĐÃ ĐỦ 100% — {declaredPcs}/{declaredPcs} kiện.{" "}
          <span className="hidden lg:inline">Bấm LƯU DIM bên phải.</span>
          <span className="lg:hidden">Bấm LƯU DIM bên dưới.</span>
        </span>
      </div>
    );
  }
  if (snap.remainingPcs > 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-900">
        <span className="sr-only">Cảnh báo</span>
        <span>
          Đang thiếu <strong>{snap.remainingPcs} kiện</strong> — Bấm nút{" "}
          <strong className="text-violet-800">⚡ TỰ ĐỘNG TẠO ĐỦ DIM</strong>{" "}
          <span className="hidden lg:inline">bên trái</span>
          <span className="lg:hidden">ở trên</span>{" "}
          để hệ thống tự điền đủ.
        </span>
      </div>
    );
  }
  if (actionNote) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900">
        <span className="shrink-0">ℹ️</span>
        <span>{actionNote}</span>
      </div>
    );
  }
  return null;
}

/** Pieces progress bar for Column C */
function PiecesProgress({
  current,
  total,
}: {
  current: number;
  total: number | null | undefined;
}) {
  if (total == null) return null;
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const done = current === total && total > 0;
  const over = current > total;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kiện DIM</span>
        <span
          className={`text-xl font-extrabold tabular-nums leading-none ${
            over ? "text-red-600" : done ? "text-emerald-700" : current > 0 ? "text-amber-600" : "text-slate-300"
          }`}
        >
          {current}
          <span className="text-sm font-semibold text-slate-400"> / {total}</span>
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            over ? "bg-red-500" : done ? "bg-emerald-500" : "bg-amber-400"
          }`}
          style={{ width: `${over ? 100 : pct}%` }}
        />
      </div>
      <p
        className={`text-right text-[10px] font-bold ${
          over ? "text-red-600" : done ? "text-emerald-700" : "text-slate-400"
        }`}
      >
        {over ? "⚠ DƯ KIỆN" : done ? "✅ ĐỦ 100%" : `${pct}% hoàn thành`}
      </p>
    </div>
  );
}

/** DIM line list section (measured or estimated) */
function DimLineSection({
  title,
  tone,
  lines,
  startIndex,
  divisor,
  dimCtx,
  onRemove,
  onToggleLock,
  emptyHint,
  estimationControls,
}: {
  title: string;
  tone: "measured" | "estimated";
  lines: DimPieceLine[];
  startIndex: number;
  divisor: DimDivisor;
  dimCtx: ScscDimRoundContext;
  onRemove: (index: number) => void;
  onToggleLock?: (index: number) => void;
  emptyHint?: string;
  estimationControls?: React.ReactNode;
}) {
  const border =
    tone === "measured" ? "border-emerald-200/80 bg-emerald-50/40" : "border-violet-200/80 bg-violet-50/30";
  const badge =
    tone === "measured"
      ? "bg-emerald-100 text-emerald-900"
      : "bg-violet-100 text-violet-900";

  return (
    <section className={`rounded-xl border ${border} p-2.5 space-y-2`}>
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge}`}>
          {title}
        </span>
        <span className="text-[10px] tabular-nums text-apple-secondary font-semibold">
          {lines.length} dòng · {lines.reduce((s, l) => s + l.pcs, 0)} kiện
        </span>
      </div>

      {estimationControls}

      {lines.length === 0 ? (
        <p className="py-2.5 text-center text-[11px] text-apple-tertiary">{emptyHint ?? "Chưa có"}</p>
      ) : (
        <ul className="space-y-1.5">
          {lines.map((line, i) => {
            const idx = startIndex + i;
            const sub = lineDimKg(line, divisor, dimCtx);
            return (
              <li
                key={`${idx}-${line.lCm}-${line.wCm}-${line.hCm}-${line.pcs}-${line.locked ? "L" : "U"}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-black/[0.06] bg-white px-2.5 py-2 shadow-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-bold text-apple-label">
                    {line.lCm}×{line.wCm}×{line.hCm}{" "}
                    <span className="text-violet-700 font-semibold">×{line.pcs}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] tabular-nums text-apple-secondary font-medium">
                    {sub != null ? `${formatLineDimKgDisplay(sub, dimCtx)} kg` : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {tone === "estimated" && onToggleLock && (
                    <button
                      type="button"
                      onClick={() => onToggleLock(idx)}
                      className={`rounded-md px-2 py-1 text-[10px] font-bold border transition-colors ${
                        line.locked
                          ? "bg-amber-100 border-amber-300 text-amber-900"
                          : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                      }`}
                      title={line.locked ? "Mở khóa dòng" : "Khóa cố định dòng này"}
                    >
                      {line.locked ? "🔒" : "🔓"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600 active:bg-red-100"
                  >
                    Xóa
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Estimation config panel — reused in Col B (mobile) and Col C (desktop)
// ─────────────────────────────────────────────────────────────
function EstimationConfigPanel({
  lot,
  snap,
  targetRatioPercent,
  setTargetRatioPercent,
  randomTargetKgInput,
  setRandomTargetKgInput,
  randomLineCountInput,
  setRandomLineCountInput,
  autoRandomAfterAdd,
  setAutoRandomAfterAdd,
  onGenerate,
  onClearEstimated,
  compact,
}: {
  lot: { declaredKg: number | null | undefined; declaredPcs: number | null | undefined };
  snap: { remainingPcs: number; sumEstimatedPcs: number; targetLineCount: { min: number; max: number } | null };
  targetRatioPercent: number;
  setTargetRatioPercent: (v: number) => void;
  randomTargetKgInput: string;
  setRandomTargetKgInput: (v: string) => void;
  randomLineCountInput: string;
  setRandomLineCountInput: (v: string) => void;
  autoRandomAfterAdd: boolean;
  setAutoRandomAfterAdd: (v: boolean) => void;
  onGenerate: () => void;
  onClearEstimated: () => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className={`font-bold text-violet-900 ${compact ? "text-[11px]" : "text-xs"}`}>✨ Cấu hình Ước tính</span>
        <button
          type="button"
          onClick={onGenerate}
          className="rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs active:scale-95 transition-all"
        >
          Sinh ngay
        </button>
      </div>

      <div className="space-y-2">
        {lot.declaredKg != null && lot.declaredKg > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-slate-600">
              <span>Tỉ lệ DIM/Gross</span>
              <span className="text-violet-700">
                {targetRatioPercent.toFixed(1)}% (~{Math.round(lot.declaredKg * (targetRatioPercent / 100))} kg)
              </span>
            </div>
            <input
              type="range"
              min={85}
              max={99.9}
              step={0.5}
              value={targetRatioPercent}
              onChange={(e) => {
                setTargetRatioPercent(Number(e.target.value));
                setRandomTargetKgInput("");
              }}
              className="h-1.5 w-full cursor-pointer rounded-lg bg-violet-200 accent-violet-600"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1.5">
          <label>
            <span className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Kg DIM cố định</span>
            <input
              type="number"
              min={1}
              step={0.1}
              inputMode="decimal"
              value={randomTargetKgInput}
              onChange={(e) => setRandomTargetKgInput(e.target.value)}
              placeholder={
                lot.declaredKg != null
                  ? `~${Math.round(lot.declaredKg * (targetRatioPercent / 100))} kg`
                  : "950"
              }
              className="w-full rounded-lg border border-violet-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold tabular-nums text-center focus:bg-white focus:outline-none"
            />
          </label>
          <label>
            <span className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">Số dòng ước tính</span>
            <input
              type="number"
              min={1}
              max={snap.remainingPcs}
              inputMode="numeric"
              value={randomLineCountInput}
              onChange={(e) => setRandomLineCountInput(e.target.value)}
              placeholder={
                snap.targetLineCount
                  ? `${snap.targetLineCount.min}–${snap.targetLineCount.max}`
                  : String(Math.min(snap.remainingPcs, 10))
              }
              className="w-full rounded-lg border border-violet-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold tabular-nums text-center focus:bg-white focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center justify-between pt-0.5 text-[10px] border-t border-violet-100">
          <label className="flex cursor-pointer items-center gap-1.5 text-slate-600 font-semibold">
            <input
              type="checkbox"
              checked={autoRandomAfterAdd}
              onChange={(e) => setAutoRandomAfterAdd(e.target.checked)}
              className="rounded text-violet-600 focus:ring-violet-500"
            />
            Tự sinh sau khi Thêm
          </label>
          {snap.sumEstimatedPcs > 0 && (
            <button
              type="button"
              onClick={onClearEstimated}
              className="font-bold text-red-600 hover:underline"
            >
              Xóa chưa khóa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Modal Component
// ─────────────────────────────────────────────────────────────

export function MobileDimKgModal({ row, onClose, onSave }: MobileDimKgModalProps) {
  const [lines, setLines] = useState<DimPieceLine[]>(() =>
    consolidateDimPieceLines(cloneLines(row.dimLines))
  );

  const [comboInput, setComboInput] = useState("");

  const [autoRandomAfterAdd, setAutoRandomAfterAdd] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [randomNonce, setRandomNonce] = useState(0);
  const [targetRatioPercent, setTargetRatioPercent] = useState(95.0);
  const [randomLineCountInput, setRandomLineCountInput] = useState("");
  const [randomTargetKgInput, setRandomTargetKgInput] = useState("");

  // Mobile/md only — estimation config collapsible
  const [showEstimationConfigMobile, setShowEstimationConfigMobile] = useState(false);

  // Mẫu DIM đã lưu
  const [dimTemplates, setDimTemplates] = useState<DimTemplate[]>(() => loadDimTemplates());
  const [showSaveTemplateForm, setShowSaveTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  const lot = useMemo(
    () => ({
      shipmentId: row.id,
      declaredPcs: row.pcs,
      declaredKg: row.kg,
      customerCode: row.customerCode,
    }),
    [row.id, row.pcs, row.kg, row.customerCode]
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

  const parsedPreview = useMemo(() => {
    if (!comboInput.trim()) return null;
    return tryParseDimPieceLinesFromComboText(comboInput);
  }, [comboInput]);

  // ── Handlers Mẫu DIM ──────────────────────────────────────

  const handleApplyTemplate = (t: DimTemplate) => {
    const templatePieceLines: DimPieceLine[] = t.lines.map((l) => ({
      lCm: l.lCm,
      wCm: l.wCm,
      hCm: l.hCm,
      pcs: l.pcs,
      estimated: false,
    }));

    if (autoRandomAfterAdd && randomParams) {
      const fill = dimEntryRandomFill(templatePieceLines, lot, {
        ...randomParams,
        targetRatioPercent,
      });
      if (fill.ok) {
        applyMutation(fill.lines, `✨ Đã áp dụng mẫu "${t.name}" và tự động điền đủ kiện!`);
      } else {
        applyMutation(templatePieceLines, `✨ Đã áp dụng mẫu "${t.name}" (${t.totalPcs} kiện).`);
      }
    } else {
      applyMutation(templatePieceLines, `✨ Đã áp dụng mẫu "${t.name}" (${t.totalPcs} kiện).`);
    }
  };

  const handleSaveCurrentTemplate = () => {
    const nameToSave = newTemplateName.trim() || `Mẫu ${row.customerCode || "DIM"} (${snap.sumDimPcs}k)`;
    try {
      const nextList = saveDimTemplate({
        name: nameToSave,
        lines,
        customerCode: row.customerCode,
      });
      setDimTemplates(nextList);
      setNewTemplateName("");
      setShowSaveTemplateForm(false);
      setActionNote(`💾 Đã lưu thành công mẫu "${nameToSave}"!`);
    } catch (err: any) {
      setActionNote(`❌ Lỗi lưu mẫu: ${err?.message || err}`);
    }
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextList = deleteDimTemplate(id);
    setDimTemplates(nextList);
    setActionNote("🗑️ Đã xóa mẫu DIM.");
  };

  // ── Handlers ──────────────────────────────────────────────

  const handleAddComboRows = () => {
    if (!comboInput.trim()) return;
    const r = dimEntryAddMeasuredFromCombo(lines, comboInput, lot, {
      thenRandomFill: autoRandomAfterAdd,
      randomFillParams: randomParams ? { ...randomParams, targetRatioPercent } : undefined,
    });
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    applyMutation(r.lines, r.note ?? "Đã bóc tách và thêm dòng đo mới.");
    setComboInput("");
  };


  const handleRandom = (overrideRatio?: number) => {
    if (!randomParams) {
      setActionNote("❌ Cần bổ sung Số kiện lô và Kg lô để sinh ngẫu nhiên.");
      return;
    }
    const targetEstimatedLineCount = parseRandomLineCountInput(randomLineCountInput);
    const targetTotalDimKg = parseTargetDimKgInput(randomTargetKgInput);
    const ratio = overrideRatio ?? (randomTargetKgInput ? undefined : targetRatioPercent);

    let baseLines = lines;
    if (baseLines.length === 0) {
      baseLines = [{ lCm: 40, wCm: 35, hCm: 30, pcs: 1, estimated: false }];
    }

    const r = dimEntryRandomFill(baseLines, lot, {
      ...randomParams,
      regenerationNonce: randomNonce,
      targetEstimatedLineCount,
      targetTotalDimKg,
      targetRatioPercent: ratio,
    });
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    setRandomNonce((n) => n + 1);
    applyMutation(r.lines, r.note ?? null);
  };

  const handleOneClickAutoFill = () => {
    if (lot.declaredPcs == null || lot.declaredPcs <= 0) {
      setActionNote("❌ Lô hàng chưa khai báo số kiện.");
      return;
    }
    if (lot.declaredKg == null || lot.declaredKg <= 0) {
      setActionNote("❌ Lô hàng chưa khai báo Gross Weight (Kg).");
      return;
    }

    let baseLines = lines;
    if (baseLines.length === 0) {
      baseLines = [{ lCm: 40, wCm: 35, hCm: 30, pcs: 1, estimated: false }];
    }

    const fill = dimEntryRandomFill(baseLines, lot, {
      declaredPcs: lot.declaredPcs,
      declaredKg: lot.declaredKg,
      divisor,
      dimCtx,
      seed,
      regenerationNonce: randomNonce,
      targetRatioPercent,
    });

    if (!fill.ok) {
      setActionNote(`❌ ${fill.error}`);
      return;
    }

    setRandomNonce((n) => n + 1);
    applyMutation(
      fill.lines,
      `🎉 ĐÃ TỰ ĐỘNG ĐIỀN ĐỦ ${lot.declaredPcs}/${lot.declaredPcs} KIỆN! BẤM NÚT 'LƯU DIM'.`
    );
  };

  const handleResetOriginal = () => {
    const original = consolidateDimPieceLines(cloneLines(row.dimLines));
    setLines(original);
    setComboInput("");
    setActionNote("↺ Đã làm lại từ đầu — quay về dữ liệu ban đầu.");
  };

  const handleToggleLock = (idx: number) => {
    const next = lines.map((l, i) => {
      if (i === idx) {
        return { ...l, locked: !l.locked };
      }
      return l;
    });
    applyMutation(next, next[idx]?.locked ? "🔒 Đã khóa dòng kiện ước tính." : "🔓 Đã mở khóa dòng kiện.");
  };

  const handleSave = () => {
    const r = dimEntryValidateSave(lines, lot, divisor, dimCtx);
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }

    onSave({
      dimWeightKg: totalDimKgFromLines(r.lines, divisor, dimCtx),
      dimLines: r.lines,
      dimDivisor: divisor,
    });
  };

  // ── Shared save button label ───────────────────────────────
  const saveBtnLabel = snap.pcsMatch
    ? "🟢 LƯU DIM (ĐÃ ĐỦ KIỆN)"
    : snap.remainingPcs > 0
      ? `⚠️ THIẾU ${snap.remainingPcs} KIỆN`
      : snap.pcsExcess
        ? "⚠️ DƯ KIỆN (XÓA BỚT)"
        : "Lưu DIM";

  const saveBtnClass = snap.pcsMatch
    ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white ring-2 ring-emerald-400/40 animate-pulse"
    : "bg-slate-100 text-slate-400 border border-slate-200 shadow-none cursor-not-allowed";

  // ── Estimation config shared props ─────────────────────────
  const estimationConfigProps = {
    lot,
    snap,
    targetRatioPercent,
    setTargetRatioPercent,
    randomTargetKgInput,
    setRandomTargetKgInput,
    randomLineCountInput,
    setRandomLineCountInput,
    autoRandomAfterAdd,
    setAutoRandomAfterAdd,
    onGenerate: handleRandom,
    onClearEstimated: () => applyMutation(dimEntryClearEstimated(lines), "Đã xóa kiện ước tính chưa khóa."),
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="no-print fixed inset-0 z-[480] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 md:p-5 transition-all duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dim-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[1.6rem] border border-black/[0.08] bg-white shadow-2xl transition-all sm:max-h-[min(92dvh,900px)] sm:max-w-xl sm:rounded-[1.6rem] md:max-h-[min(93dvh,920px)] md:max-w-3xl lg:max-h-[min(94dvh,940px)] lg:max-w-5xl xl:max-w-6xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── HEADER — compact single row ── */}
        <div className="shrink-0 border-b border-black/[0.06] bg-gradient-to-b from-slate-50 to-white px-4 pb-2.5 pt-3 sm:px-5 md:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h2 id="dim-modal-title" className="text-sm font-black tracking-tight text-slate-800 md:text-[15px]">
                  Nhập DIM
                </h2>
                <span className="text-[11px] font-semibold text-slate-500">
                  {row.awb} · {row.flight}
                </span>
                {airlineRule && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-200">
                    SCSC · {airlineRule.chargeableNote.slice(0, 24)}
                  </span>
                )}
              </div>
              {/* Compact inline stats row */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700 border border-slate-200">
                  {lot.declaredPcs ?? "—"} kiện lô
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700 border border-slate-200">
                  {lot.declaredKg ?? "—"} kg lô
                </span>
                {snap.totalDim != null && (
                  <span className="rounded-md bg-violet-100 px-2 py-0.5 font-bold text-violet-800 border border-violet-200">
                    DIM {totalDimLabel}
                  </span>
                )}
                {lot.declaredKg != null && snap.totalDim != null && (
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border ${
                    snap.dimBelowGross
                      ? "bg-slate-50 text-slate-500 border-slate-200"
                      : "bg-violet-50 text-violet-700 border-violet-200"
                  }`}>
                    {snap.dimBelowGross ? "Chargeable: Cân thực" : "Chargeable: DIM"}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Đóng"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── STATUS BANNER — sticky ── */}
        {(snap.pcsExcess || snap.pcsMatch || snap.remainingPcs > 0 || actionNote) && (
          <div className="shrink-0 border-b border-black/[0.04] bg-white/95 px-4 py-2 sm:px-5 md:px-6">
            <StatusBanner snap={snap} actionNote={actionNote} declaredPcs={lot.declaredPcs} />
          </div>
        )}

        {/* ── BODY ── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/40 px-4 py-3 sm:px-5 md:px-6">
          {/*
            Mobile: 1 column
            md: 2 columns [260px, 1fr]
            lg+: 3 columns [280px, 1fr, 256px]
          */}
          <div className="space-y-3 md:grid md:grid-cols-[260px_1fr] md:gap-4 md:space-y-0 lg:grid-cols-[280px_1fr_256px] lg:gap-5">

            {/* ══ COLUMN A: Input Controls ══ */}
            <div className="space-y-2.5">

              {/* 1-Click Auto Fill */}
              <button
                type="button"
                onClick={handleOneClickAutoFill}
                className="w-full rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 py-4 px-4 font-bold text-white shadow-lg shadow-violet-500/25 transition-all active:scale-[0.97] flex items-center justify-between gap-3 border border-violet-400/30"
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="text-2xl">⚡</span>
                  <div>
                    <p className="text-xs font-black tracking-wide uppercase leading-tight">TỰ ĐỘNG TẠO ĐỦ DIM</p>
                    <p className="text-[10px] opacity-85 font-medium mt-0.5">
                      Điền đủ {lot.declaredPcs ?? "?"} kiện · 95% Gross Wt
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-white/25 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">
                  1-CLICK ➔
                </span>
              </button>

              {limitWarnings.length > 0 && (
                <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950 font-medium">
                  {limitWarnings.map((w, i) => (
                    <p key={i}>{w.kind === "dims" ? "⚠ " : "ℹ "}{w.message}</p>
                  ))}
                </div>
              )}

              {/* 💾 MẪU DIM ĐÃ LƯU & LƯU MẪU MỚI */}
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/50 to-white p-3 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <span>📁</span>
                    <span>Mẫu DIM đã lưu ({dimTemplates.length})</span>
                  </span>
                  {lines.length > 0 && !showSaveTemplateForm && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewTemplateName(`Mẫu ${row.customerCode || "DIM"} (${snap.sumDimPcs}k)`);
                        setShowSaveTemplateForm(true);
                      }}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs active:scale-95 transition-all"
                    >
                      + Lưu Mẫu
                    </button>
                  )}
                </div>

                {/* Form tạo mẫu mới */}
                {showSaveTemplateForm && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-2.5 space-y-2">
                    <p className="text-[11px] font-bold text-indigo-900">
                      💾 Đặt tên mẫu ({snap.sumDimPcs} kiện · {lines.length} dòng):
                    </p>
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveCurrentTemplate();
                        }
                      }}
                      placeholder="VD: Thùng Áo 60x40, Linh Kiện S..."
                      className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                      autoFocus
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowSaveTemplateForm(false)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveCurrentTemplate}
                        className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1 text-[11px] font-bold text-white shadow-xs"
                      >
                        Lưu Mẫu
                      </button>
                    </div>
                  </div>
                )}

                {/* Danh sách chip mẫu đã lưu */}
                {dimTemplates.length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-medium py-1">
                    Chưa có mẫu nào. Nhập DIM và bấm <strong className="text-indigo-700">+ Lưu Mẫu</strong> để lưu cho lần sau.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    {dimTemplates.map((tmpl) => (
                      <div
                        key={tmpl.id}
                        onClick={() => handleApplyTemplate(tmpl)}
                        className="group inline-flex items-center gap-1.5 rounded-xl border border-indigo-200/80 bg-white hover:bg-indigo-50/80 hover:border-indigo-300 px-2.5 py-1.5 text-xs font-bold text-indigo-950 shadow-xs cursor-pointer active:scale-95 transition-all"
                        title={`Áp dụng mẫu ${tmpl.name} (${tmpl.totalPcs} kiện, ${tmpl.lines.length} dòng)`}
                      >
                        <span className="text-indigo-600">🏷️</span>
                        <span>{tmpl.name}</span>
                        <span className="rounded-full bg-indigo-100 text-indigo-800 px-1.5 py-0.2 text-[10px] tabular-nums">
                          {tmpl.totalPcs}k
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                          className="ml-0.5 text-slate-300 hover:text-red-600 font-black text-xs px-0.5"
                          title="Xóa mẫu này"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Smart paste input */}
              <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="dim-combo-input" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span>📋</span>
                    <span>Dán kích thước đo thật</span>
                  </label>
                  {parsedPreview?.ok && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      ✓ Hợp lệ
                    </span>
                  )}
                </div>

                <textarea
                  id="dim-combo-input"
                  rows={5}
                  value={comboInput}
                  onChange={(e) => setComboInput(normalizeDimComboInput(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComboRows();
                    }
                  }}
                  placeholder={"Dán từ Excel / Zalo\nVí dụ: 40x50x30x10 hoặc 40 50 30 10\nHỗ trợ nhiều dòng cùng lúc"}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 font-mono text-xs font-semibold focus:border-apple-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-apple-blue/15 min-h-[6rem]"
                />

                {comboInput.trim() && parsedPreview ? (
                  parsedPreview.ok ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 space-y-2">
                      <p className="text-[11px] font-bold text-emerald-800">
                        ✨ {parsedPreview.lines.length} nhóm · {parsedPreview.lines.reduce((s, l) => s + l.pcs, 0)} kiện nhận diện được:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {parsedPreview.lines.map((l, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] font-mono font-bold text-emerald-900 shadow-xs">
                            {l.lCm}×{l.wCm}×{l.hCm} <span className="text-violet-700">×{l.pcs}</span>
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleAddComboRows}
                        className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2 text-xs font-bold text-white shadow-xs transition-all active:scale-[0.99]"
                      >
                        ➕ Thêm {parsedPreview.lines.reduce((s, l) => s + l.pcs, 0)} kiện đo (Enter)
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 font-medium">
                      ⚠ {parsedPreview.error}
                    </div>
                  )
                ) : null}
              </div>



              {/* Mobile-only estimation config (hidden on lg+ where Col C takes over) */}
              <div className="lg:hidden rounded-2xl border border-violet-200 bg-white p-3.5 shadow-xs space-y-2">
                <button
                  type="button"
                  onClick={() => setShowEstimationConfigMobile((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-bold text-violet-800"
                >
                  <span>✨ Cấu hình & Sinh ngẫu nhiên</span>
                  <span className="text-[10px] text-slate-400">{showEstimationConfigMobile ? "▲ Thu" : "▼ Mở"}</span>
                </button>
                {showEstimationConfigMobile && (
                  <div className="border-t border-violet-100 pt-2.5">
                    <EstimationConfigPanel {...estimationConfigProps} compact />
                  </div>
                )}
                {!showEstimationConfigMobile && (
                  <button
                    type="button"
                    onClick={() => handleRandom()}
                    className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 py-2 text-xs font-bold text-white shadow-xs transition-all active:scale-95"
                  >
                    Sinh ngay (mặc định {targetRatioPercent.toFixed(0)}%)
                  </button>
                )}
              </div>

            </div>

            {/* ══ COLUMN B: DIM List ══ */}
            <div
              className="space-y-2.5 md:overflow-y-auto md:rounded-2xl md:border md:border-black/[0.06] md:bg-white/70 md:p-3"
              style={{ maxHeight: "min(540px, 62dvh)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Danh sách DIM</span>
                <span className="text-[10px] font-bold text-slate-400">
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
                emptyHint="Dán hoặc nhập kích thước đo thật ở bên trái"
              />

              <DimLineSection
                title="Ước tính"
                tone="estimated"
                lines={snap.estimated}
                startIndex={snap.measured.length}
                divisor={divisor}
                dimCtx={dimCtx}
                onRemove={(idx) => applyMutation(dimEntryRemoveLine(lines, idx))}
                onToggleLock={handleToggleLock}
                emptyHint={
                  snap.pcsMatch
                    ? "Đã đủ kiện — không cần ước tính"
                    : "Bấm ⚡ TỰ ĐỘNG TẠO ĐỦ DIM hoặc Sinh ngay"
                }
              />
            </div>

            {/* ══ COLUMN C: Stats + Config + Save (lg+ only) ══ */}
            <div className="hidden lg:flex lg:flex-col lg:gap-3">

              {/* Progress + Stats card */}
              <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-xs space-y-3.5">
                <PiecesProgress current={snap.sumDimPcs} total={lot.declaredPcs} />

                <div className="border-t border-slate-100 pt-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tổng DIM</span>
                    <span className="text-base font-extrabold tabular-nums text-violet-800">{totalDimLabel}</span>
                  </div>
                  {lot.declaredKg != null && snap.totalDim != null && (
                    <p className={`text-[10px] font-semibold ${snap.dimBelowGross ? "text-slate-500" : "text-violet-700"}`}>
                      {snap.dimBelowGross
                        ? `DIM < Gross ${lot.declaredKg} kg → Chargeable theo cân thực`
                        : `DIM ≥ Gross ${lot.declaredKg} kg → Chargeable theo DIM`}
                    </p>
                  )}
                </div>
              </div>

              {/* Estimation config — always expanded on desktop */}
              <div className="rounded-2xl border border-violet-200/80 bg-white p-4 shadow-xs">
                <EstimationConfigPanel {...estimationConfigProps} />
              </div>

              {/* Save + Actions — sticky at bottom */}
              <div className="mt-auto space-y-2">
                <button
                  type="button"
                  disabled={!snap.pcsMatch}
                  onClick={handleSave}
                  className={`w-full rounded-2xl py-4 text-sm font-extrabold shadow-md transition-all active:scale-[0.98] ${saveBtnClass}`}
                >
                  {saveBtnLabel}
                </button>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={handleResetOriginal}
                    className="rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 py-2.5 text-[11px] font-bold text-amber-900 transition-colors"
                  >
                    ↺ Làm lại
                  </button>
                  <button
                    type="button"
                    onClick={() => onSave({ dimWeightKg: null, dimLines: null, dimDivisor: null })}
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2.5 text-[11px] font-bold text-slate-600 transition-colors"
                  >
                    Xóa DIM
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2.5 text-[11px] font-bold text-slate-400 transition-colors"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── FOOTER — mobile/md only (lg+ uses Col C save button) ── */}
        <div className="shrink-0 border-t border-ui-border bg-ui-surface p-3.5 lg:hidden">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!snap.pcsMatch}
              onClick={handleSave}
              className={`flex-1 rounded-full py-3.5 text-xs sm:text-sm font-extrabold shadow-md transition-all active:scale-[0.98] ${saveBtnClass}`}
            >
              {saveBtnLabel}
            </button>
            <button
              type="button"
              onClick={handleResetOriginal}
              className="rounded-full border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3.5 py-3 text-xs font-bold text-amber-900 shadow-xs"
              title="Khôi phục lại dữ liệu DIM ban đầu"
            >
              ↺ Làm lại
            </button>
            <button
              type="button"
              onClick={() => onSave({ dimWeightKg: null, dimLines: null, dimDivisor: null })}
              className="rounded-full border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-3 text-xs font-bold text-slate-700 shadow-xs"
            >
              Xóa DIM
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-3 text-xs font-bold text-slate-500 shadow-xs"
            >
              Hủy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
