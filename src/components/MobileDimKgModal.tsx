import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import {
  useOpsMobileOverlayLock,
  useVisualViewportBottomInset,
} from "../hooks/useOpsMobileOverlayLock";
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
  normalizeDimLineEdges,
} from "../utils/dimBulkFill";
import { formatKgTotal } from "../utils/formatKgTotal";
import {
  dimEntryAddMeasuredFromCombo,
  dimEntryClearEstimated,
  dimEntryHasMergeableDuplicates,
  dimEntryMergeLines,
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
  /** Mobile sticky đã hiện thiếu kiện — bỏ banner vàng trùng. */
  hideRemainingHint = false,
}: {
  snap: {
    pcsMatch: boolean;
    pcsExcess: boolean;
    remainingPcs: number;
    sumDimPcs: number;
  };
  actionNote: string | null;
  declaredPcs: number | null | undefined;
  hideRemainingHint?: boolean;
}) {
  if (snap.pcsExcess) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-900">
        <span>
          DƯ KIỆN — Tổng DIM (<strong>{snap.sumDimPcs}</strong>) vượt quá kiện lô (<strong>{declaredPcs}</strong>). Xóa bớt dòng rồi lưu.
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
          Đủ {declaredPcs} kiện — bấm Lưu DIM.
        </span>
      </div>
    );
  }
  if (snap.remainingPcs > 0 && !hideRemainingHint) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-900">
        <span className="sr-only">Cảnh báo</span>
        <span>
          Đã đo <strong>{snap.sumDimPcs}</strong> / {declaredPcs ?? "—"} kiện
          (thiếu {snap.remainingPcs}). Có thể <strong>Lưu</strong> phần đã đo,
          hoặc bù kiện nếu muốn đủ lô.
        </span>
      </div>
    );
  }
  if (actionNote && !actionNote.startsWith("🎉") && !actionNote.startsWith("✨")) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900">
        <span className="sr-only">Thông tin</span>
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

function dimRuleBadgeText(
  rule: ReturnType<typeof resolveScscAirlineDimRule>,
  divisor: DimDivisor,
): string {
  if (rule) {
    const code = rule.codes[0] ? `${rule.codes[0]} · ` : "";
    return `SCSC · ${code}${rule.chargeableNote} · ÷${divisor}`;
  }
  return `IATA · làm tròn 2 số · ÷${divisor}`;
}

function DimNumCell({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  ariaLabel: string;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => {
        const n = Number(raw.replace(",", "."));
        if (Number.isFinite(n) && n > 0) onCommit(n);
        else setRaw(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-7 w-full rounded-md border border-transparent bg-transparent px-1 text-center font-mono text-[12px] font-semibold tabular-nums text-slate-800 outline-none hover:border-slate-200 focus:border-apple-blue/50 focus:bg-white focus:ring-1 focus:ring-apple-blue/20"
    />
  );
}

function DimPastePreviewTable({
  lines,
  divisor,
  dimCtx,
}: {
  lines: DimPieceLine[];
  divisor: DimDivisor;
  dimCtx: ScscDimRoundContext;
}) {
  const pcs = lines.reduce((s, l) => s + l.pcs, 0);
  return (
    <div className="overflow-x-auto border-t border-slate-100">
      <table className="w-full min-w-[22rem] border-collapse text-[11px]">
        <thead>
          <tr className="bg-emerald-50/80 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            <th className="px-2 py-1 text-left font-bold">D</th>
            <th className="px-2 py-1 text-left font-bold">R</th>
            <th className="px-2 py-1 text-left font-bold">C</th>
            <th className="px-2 py-1 text-right font-bold">Kiện</th>
            <th className="px-2 py-1 text-right font-bold">Kg</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const kg = lineDimKg(line, divisor, dimCtx);
            return (
              <tr key={`${i}-${line.lCm}-${line.wCm}-${line.hCm}-${line.pcs}`} className="border-t border-emerald-100/80">
                <td className="px-2 py-1 font-mono tabular-nums">{line.lCm}</td>
                <td className="px-2 py-1 font-mono tabular-nums">{line.wCm}</td>
                <td className="px-2 py-1 font-mono tabular-nums">{line.hCm}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">{line.pcs}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums text-emerald-800">
                  {kg != null ? formatLineDimKgDisplay(kg, dimCtx) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-emerald-200 bg-emerald-50/60 font-bold text-emerald-950">
            <td className="px-2 py-1" colSpan={3}>
              Sẽ thêm
            </td>
            <td className="px-2 py-1 text-right font-mono">{pcs}</td>
            <td className="px-2 py-1 text-right font-mono">
              {formatDimKgDisplay(
                totalDimKgFromLines(lines, divisor, dimCtx) ?? 0,
                dimCtx,
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DimLinesTable({
  measured,
  estimated,
  divisor,
  dimCtx,
  totalDimLabel,
  emptyHint,
  onPatch,
  onRemove,
  onToggleLock,
  onPasteText,
}: {
  measured: DimPieceLine[];
  estimated: DimPieceLine[];
  divisor: DimDivisor;
  dimCtx: ScscDimRoundContext;
  totalDimLabel: string;
  emptyHint: string;
  onPatch: (index: number, patch: Partial<DimPieceLine>, normalize?: boolean) => void;
  onRemove: (index: number) => void;
  onToggleLock: (index: number) => void;
  onPasteText: (text: string) => void;
}) {
  const rows = [
    ...measured.map((line, i) => ({ line, idx: i, tone: "measured" as const })),
    ...estimated.map((line, i) => ({
      line,
      idx: measured.length + i,
      tone: "estimated" as const,
    })),
  ];
  const sumPcs = rows.reduce((s, r) => s + r.line.pcs, 0);

  return (
    <div
      className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white"
      onPaste={(e) => {
        const text = e.clipboardData.getData("text");
        if (!text.trim()) return;
        const parsed = tryParseDimPieceLinesFromComboText(text);
        if (!parsed.ok) return;
        e.preventDefault();
        onPasteText(text);
      }}
    >
      <table className="w-full min-w-[34rem] border-collapse text-[12px]">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <th className="w-8 px-2 py-1.5 text-left">#</th>
            <th className="w-[4.5rem] px-1 py-1.5 text-center">D</th>
            <th className="w-[4.5rem] px-1 py-1.5 text-center">R</th>
            <th className="w-[4.5rem] px-1 py-1.5 text-center">C</th>
            <th className="w-16 px-1 py-1.5 text-center">Kiện</th>
            <th className="w-20 px-2 py-1.5 text-right">Kg</th>
            <th className="w-16 px-2 py-1.5 text-left">Nguồn</th>
            <th className="w-[4.75rem] px-1 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-[12px] text-slate-400">
                {emptyHint}
              </td>
            </tr>
          ) : (
            rows.map(({ line, idx, tone }, i) => {
              const kg = lineDimKg(line, divisor, dimCtx);
              return (
                <tr
                  key={`${idx}-${tone}-${line.lCm}-${line.wCm}-${line.hCm}-${line.pcs}`}
                  className={`border-b border-slate-100 ${
                    tone === "measured" ? "bg-emerald-50/25" : "bg-white"
                  }`}
                >
                  <td className="px-2 py-0.5 font-mono text-[11px] text-slate-400">{i + 1}</td>
                  <td className="px-1 py-0.5">
                    <DimNumCell
                      ariaLabel={`Dòng ${i + 1} cạnh D`}
                      value={line.lCm}
                      onCommit={(n) => onPatch(idx, { lCm: Math.round(n) }, true)}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <DimNumCell
                      ariaLabel={`Dòng ${i + 1} cạnh R`}
                      value={line.wCm}
                      onCommit={(n) => onPatch(idx, { wCm: Math.round(n) }, true)}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <DimNumCell
                      ariaLabel={`Dòng ${i + 1} cạnh C`}
                      value={line.hCm}
                      onCommit={(n) => onPatch(idx, { hCm: Math.round(n) }, true)}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <DimNumCell
                      ariaLabel={`Dòng ${i + 1} số kiện`}
                      value={line.pcs}
                      onCommit={(n) => onPatch(idx, { pcs: Math.max(1, Math.floor(n)) })}
                    />
                  </td>
                  <td className="px-2 py-0.5 text-right font-mono text-[12px] font-semibold tabular-nums text-slate-800">
                    {kg != null ? formatLineDimKgDisplay(kg, dimCtx) : "—"}
                  </td>
                  <td className="px-2 py-0.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        tone === "measured"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-violet-100 text-violet-800"
                      }`}
                    >
                      {tone === "measured" ? "Đo" : line.locked ? "Khóa" : "Ước"}
                    </span>
                  </td>
                  <td className="px-1 py-0.5">
                    <div className="flex justify-end gap-0.5">
                      {tone === "estimated" ? (
                        <button
                          type="button"
                          onClick={() => onToggleLock(idx)}
                          className="h-7 rounded-md px-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100"
                          title={line.locked ? "Mở khóa" : "Khóa dòng"}
                        >
                          {line.locked ? "Khóa" : "Ghim"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onRemove(idx)}
                        className="h-7 rounded-md px-1.5 text-[10px] font-bold text-red-600 hover:bg-red-50"
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot>
            <tr className="sticky bottom-0 border-t border-slate-200 bg-slate-50 font-bold">
              <td className="px-2 py-1.5 text-[10px] uppercase text-slate-500" colSpan={4}>
                Tổng
              </td>
              <td className="px-2 py-1.5 text-center font-mono tabular-nums">{sumPcs}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-violet-800">
                {totalDimLabel}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
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
          disabled={snap.remainingPcs <= 0}
          className="rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs active:scale-95 transition-all disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
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
  useOpsMobileOverlayLock(true);
  const keyboardInset = useVisualViewportBottomInset(true);

  const [comboInput, setComboInput] = useState("");

  /** Tắt mặc định — dán đo không tự bù kiện. */
  const [autoRandomAfterAdd, setAutoRandomAfterAdd] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [randomNonce, setRandomNonce] = useState(0);
  const [targetRatioPercent, setTargetRatioPercent] = useState(95.0);
  const [randomLineCountInput, setRandomLineCountInput] = useState("");
  const [randomTargetKgInput, setRandomTargetKgInput] = useState("");

  /** Mobile: Nhanh (1-click) | Đo thật (dán) — mở Đo thật nếu lô đã có dòng đo. */
  const [mobileMode, setMobileMode] = useState<"quick" | "measure">(() =>
    (row.dimLines ?? []).some((l) => !l.estimated) ? "measure" : "quick",
  );
  const [showEstimationConfigMobile, setShowEstimationConfigMobile] = useState(false);
  const [showPasteMobile, setShowPasteMobile] = useState(
    () => (row.dimLines ?? []).some((l) => !l.estimated),
  );
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const listSectionRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(true, dialogRef, onClose);

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

  const scrollListIntoView = useCallback(() => {
    window.requestAnimationFrame(() => {
      listSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const applyMutation = useCallback(
    (next: DimPieceLine[], note?: string | null, opts?: { scrollList?: boolean }) => {
      const merged = consolidateDimPieceLines(next);
      const mergeNote =
        merged.length < next.length
          ? ` Đã gộp dòng cùng kích thước (${next.length} → ${merged.length}).`
          : "";
      setLines(merged);
      setActionNote(
        note != null || mergeNote
          ? `${note ?? ""}${mergeNote}`.trim() || null
          : null,
      );
      if (opts?.scrollList) scrollListIntoView();
    },
    [scrollListIntoView],
  );

  const parsedPreview = useMemo(() => {
    if (!comboInput.trim()) return null;
    const parsed = tryParseDimPieceLinesFromComboText(comboInput);
    if (!parsed.ok) return parsed;
    return { ok: true as const, lines: consolidateDimPieceLines(parsed.lines) };
  }, [comboInput]);

  /** Ưu tiên mẫu cùng mã KH — tối đa 5 chip trên mobile. */
  const mobileTemplates = useMemo(() => {
    const code = (row.customerCode || "").trim().toUpperCase();
    const matched = code
      ? dimTemplates.filter((t) => (t.customerCode || "").toUpperCase() === code)
      : [];
    const pool = matched.length > 0 ? matched : dimTemplates;
    return pool.slice(0, 5);
  }, [dimTemplates, row.customerCode]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const close = () => setMoreMenuOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [moreMenuOpen]);

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setActionNote("❌ Clipboard trống — hãy copy kích thước trước.");
        return;
      }
      setComboInput(normalizeDimComboInput(text));
      setMobileMode("measure");
      setShowPasteMobile(true);
      setActionNote("📋 Đã dán từ clipboard — kiểm tra rồi bấm Thêm.");
    } catch {
      setActionNote("❌ Không đọc được clipboard — dán thủ công vào ô bên dưới.");
      setMobileMode("measure");
      setShowPasteMobile(true);
    }
  };

  // ── Handlers Mẫu DIM ──────────────────────────────────────

  const handleApplyTemplate = (t: DimTemplate) => {
    const templatePieceLines: DimPieceLine[] = t.lines.map((l) => ({
      lCm: l.lCm,
      wCm: l.wCm,
      hCm: l.hCm,
      pcs: l.pcs,
      estimated: false,
    }));

    const templatePcs = templatePieceLines.reduce((s, l) => s + l.pcs, 0);
    const remainingAfterTemplate =
      lot.declaredPcs != null ? Math.max(0, lot.declaredPcs - templatePcs) : 0;
    if (autoRandomAfterAdd && randomParams && remainingAfterTemplate > 0) {
      const fill = dimEntryRandomFill(templatePieceLines, lot, {
        ...randomParams,
        targetRatioPercent,
      });
      if (fill.ok) {
        applyMutation(
          fill.lines,
          `✨ Đã áp dụng mẫu "${t.name}" và tự động điền đủ kiện!`,
          { scrollList: true },
        );
      } else {
        applyMutation(
          templatePieceLines,
          `✨ Đã áp dụng mẫu "${t.name}" (${t.totalPcs} kiện).`,
          { scrollList: true },
        );
      }
    } else {
      applyMutation(
        templatePieceLines,
        `✨ Đã áp dụng mẫu "${t.name}" (${t.totalPcs} kiện).`,
        { scrollList: true },
      );
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setActionNote(`❌ Lỗi lưu mẫu: ${message}`);
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
    applyMutation(r.lines, r.note ?? "Đã bóc tách và thêm dòng đo mới.", {
      scrollList: true,
    });
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
    applyMutation(r.lines, r.note ?? null, { scrollList: true });
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
      `🎉 ĐÃ TỰ ĐỘNG ĐIỀN ĐỦ ${lot.declaredPcs}/${lot.declaredPcs} KIỆN! BẤM NÚT 'LƯU DIM'.`,
      { scrollList: true },
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

  const handlePatchLine = (
    idx: number,
    patch: Partial<DimPieceLine>,
    normalize = false,
  ) => {
    applyMutation(
      lines.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        return normalize ? normalizeDimLineEdges(next) : next;
      }),
    );
  };

  const handlePasteIntoTable = (text: string) => {
    setComboInput(normalizeDimComboInput(text));
    setMobileMode("measure");
    setShowPasteMobile(true);
    setActionNote("Đã nhận bản dán — kiểm tra bảng xem trước rồi bấm Thêm.");
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

  // ── Shared save button — đủ kiện hoặc thiếu kiện đều lưu được ─
  const saveBtnLabel = snap.pcsExcess
    ? "Dư kiện — xóa bớt"
    : snap.pcsMatch
      ? "Lưu DIM"
      : snap.pcsShort
        ? `Lưu ${snap.sumDimPcs} kiện (thiếu ${snap.remainingPcs})`
        : "Lưu DIM";

  const saveBtnClass = !snap.canSave
    ? "bg-slate-100 text-slate-400 border border-slate-200 shadow-none cursor-not-allowed"
    : snap.pcsShort
      ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
      : "bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white";

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
    onClearEstimated: () =>
      applyMutation(dimEntryClearEstimated(lines), "Đã xóa kiện ước tính chưa khóa."),
  };

  const pcsPct =
    lot.declaredPcs != null && lot.declaredPcs > 0
      ? Math.min(100, Math.round((snap.sumDimPcs / lot.declaredPcs) * 100))
      : 0;
  const canOneClick =
    lot.declaredPcs != null &&
    lot.declaredPcs > 0 &&
    lot.declaredKg != null &&
    lot.declaredKg > 0 &&
    snap.remainingPcs > 0 &&
    !snap.pcsExcess;

  const renderDimList = () => (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[11px] font-bold text-slate-600">Bảng DIM</span>
        <span className="flex items-center gap-2">
          {dimEntryHasMergeableDuplicates(lines) ? (
            <button
              type="button"
              onClick={() => {
                const r = dimEntryMergeLines(lines);
                if (!r.ok) {
                  setActionNote(`❌ ${r.error}`);
                  return;
                }
                applyMutation(r.lines, r.note ?? "Đã gộp dòng cùng kích thước.");
              }}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
            >
              Gộp dòng giống
            </button>
          ) : null}
          <span className="text-[10px] font-semibold tabular-nums text-slate-400">
            {snap.lineCount} dòng · {snap.sumDimPcs} kiện
          </span>
        </span>
      </div>
      <DimLinesTable
        measured={snap.measured}
        estimated={snap.estimated}
        divisor={divisor}
        dimCtx={dimCtx}
        totalDimLabel={totalDimLabel}
        emptyHint="Dán D×R×C×kiện vào ô trên, hoặc dán thẳng vào bảng."
        onPatch={handlePatchLine}
        onRemove={(idx) => applyMutation(dimEntryRemoveLine(lines, idx))}
        onToggleLock={handleToggleLock}
        onPasteText={handlePasteIntoTable}
      />
    </div>
  );

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="no-print fixed inset-0 z-[560] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-3 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dim-modal-title"
      ref={dialogRef}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[96dvh] max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-black/[0.08] bg-white shadow-2xl sm:h-[min(94dvh,920px)] sm:max-w-[min(96vw,42rem)] sm:rounded-2xl md:max-w-[min(96vw,68rem)] lg:h-[min(96dvh,980px)] lg:max-w-[min(96vw,88rem)] xl:max-w-[min(96vw,96rem)]"
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
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                    airlineRule
                      ? "bg-amber-100 text-amber-900 border-amber-200"
                      : "bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  {dimRuleBadgeText(airlineRule, divisor)}
                </span>
              </div>
              {/* Compact inline stats row */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700 border border-slate-200">
                  {lot.declaredPcs ?? "—"} kiện lô
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700 border border-slate-200">
                  {lot.declaredKg != null ? formatKgTotal(lot.declaredKg) : "—"} kg lô
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

        {/* ── STATUS — desktop / lỗi; mobile ẩn «thiếu kiện» trùng sticky ── */}
        {(snap.pcsExcess ||
          snap.pcsMatch ||
          snap.remainingPcs > 0 ||
          Boolean(actionNote)) && (
          <div className="hidden shrink-0 border-b border-black/[0.04] bg-white/95 px-4 py-2 md:block md:px-6 sm:px-5">
            <StatusBanner snap={snap} actionNote={actionNote} declaredPcs={lot.declaredPcs} />
          </div>
        )}
        {(snap.pcsExcess || (actionNote?.startsWith("❌") ?? false)) && (
          <div className="shrink-0 border-b border-black/[0.04] bg-white/95 px-4 py-2 md:hidden">
            <StatusBanner
              snap={snap}
              actionNote={actionNote}
              declaredPcs={lot.declaredPcs}
              hideRemainingHint
            />
          </div>
        )}

        {/* ── MOBILE STICKY: tiến độ + ⚡ ── */}
        <div className="shrink-0 border-b border-black/[0.06] bg-white px-3 py-2 md:hidden">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {snap.pcsMatch
                    ? "Đủ kiện"
                    : snap.remainingPcs > 0
                      ? `Thiếu ${snap.remainingPcs}`
                      : snap.pcsExcess
                        ? "Dư kiện"
                        : "Kiện DIM"}
                </span>
                <span
                  className={`text-[13px] font-extrabold tabular-nums ${
                    snap.pcsMatch
                      ? "text-emerald-700"
                      : snap.pcsExcess
                        ? "text-red-600"
                        : "text-amber-600"
                  }`}
                >
                  {snap.sumDimPcs}
                  <span className="text-[11px] font-semibold text-slate-400">
                    /{lot.declaredPcs ?? "—"}
                  </span>
                  {snap.totalDim != null ? (
                    <span className="ml-1.5 text-[11px] font-bold text-violet-700">
                      · {totalDimLabel}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${
                    snap.pcsExcess
                      ? "bg-red-500"
                      : snap.pcsMatch
                        ? "bg-emerald-500"
                        : "bg-amber-400"
                  }`}
                  style={{ width: `${snap.pcsExcess ? 100 : pcsPct}%` }}
                />
              </div>
            </div>
            {canOneClick ? (
              <button
                type="button"
                onClick={handleOneClickAutoFill}
                className="inline-flex h-10 shrink-0 touch-manipulation items-center gap-1 rounded-xl bg-violet-600 px-3 text-[12px] font-extrabold text-white shadow-sm active:scale-[0.98]"
              >
                ⚡ Điền đủ
              </button>
            ) : null}
          </div>
          {limitWarnings.length > 0 ? (
            <p className="mt-1.5 truncate text-[10px] font-medium text-amber-800">
              ⚠ {limitWarnings[0]?.message}
              {limitWarnings.length > 1 ? ` · +${limitWarnings.length - 1}` : ""}
            </p>
          ) : null}
        </div>

        {/* ── BODY ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-slate-50/40 px-3 py-2.5 sm:px-5 md:overflow-hidden md:px-5 md:py-3">
          {/* ===== MOBILE (<md): list-first + chế độ Nhanh/Đo thật ===== */}
          <div className="space-y-2.5 md:hidden">
            <div ref={listSectionRef}>{renderDimList()}</div>

            {/* Mode switch */}
            <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-xs">
              <button
                type="button"
                onClick={() => setMobileMode("quick")}
                className={`min-h-11 flex-1 touch-manipulation rounded-[10px] text-[12px] font-bold transition ${
                  mobileMode === "quick"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Nhanh
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMode("measure");
                  setShowPasteMobile(true);
                }}
                className={`min-h-11 flex-1 touch-manipulation rounded-[10px] text-[12px] font-bold transition ${
                  mobileMode === "measure"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Đo thật
              </button>
            </div>

            {mobileMode === "quick" ? (
              <div className="space-y-2 rounded-2xl border border-violet-200/80 bg-white p-3 shadow-xs">
                <p className="text-[11px] font-medium text-slate-600">
                  Tạo đủ {lot.declaredPcs ?? "?"} kiện @ {targetRatioPercent.toFixed(0)}% gross — rồi bấm{" "}
                  <strong className="text-emerald-700">Lưu DIM</strong>.
                </p>
                {canOneClick ? (
                  <button
                    type="button"
                    onClick={handleOneClickAutoFill}
                    className="flex w-full touch-manipulation items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 py-3 text-left font-bold text-white shadow-md active:scale-[0.98]"
                  >
                    <span>
                      <span className="block text-[12px] font-black uppercase tracking-wide">
                        ⚡ Tạo đủ DIM
                      </span>
                      <span className="mt-0.5 block text-[10px] font-medium opacity-90">
                        1 chạm · giữ dòng đo/khóa nếu có
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-white/20 px-2 py-1 text-[10px] font-black">
                      GO
                    </span>
                  </button>
                ) : snap.pcsMatch ? (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-900">
                    Đã đủ kiện — bấm Lưu DIM bên dưới.
                  </p>
                ) : null}

                {mobileTemplates.length > 0 ? (
                  <div className="space-y-1.5 border-t border-slate-100 pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-800">
                      Mẫu {row.customerCode ? `· ${row.customerCode}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {mobileTemplates.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => handleApplyTemplate(tmpl)}
                          className="inline-flex min-h-8 touch-manipulation items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-950 active:scale-95"
                        >
                          {tmpl.name}
                          <span className="rounded bg-white/80 px-1 text-[10px] tabular-nums text-indigo-700">
                            {tmpl.totalPcs}k
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {lines.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNewTemplateName(
                        `Mẫu ${row.customerCode || "DIM"} (${snap.sumDimPcs}k)`,
                      );
                      setShowSaveTemplateForm(true);
                    }}
                    className="text-[11px] font-semibold text-indigo-700"
                  >
                    + Lưu thành mẫu
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2 rounded-2xl border border-emerald-200/80 bg-white p-3 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-emerald-900">Dán kích thước đo</p>
                  <button
                    type="button"
                    onClick={() => void handlePasteClipboard()}
                    className="inline-flex min-h-8 touch-manipulation items-center rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-900"
                  >
                    📋 Clipboard
                  </button>
                </div>
                <p className="text-[10px] font-medium text-slate-500">
                  Sau khi Thêm: {autoRandomAfterAdd ? "tự điền phần kiện còn" : "chỉ thêm dòng đo"}{" "}
                  · {targetRatioPercent.toFixed(0)}% GW
                </p>
                {(showPasteMobile || comboInput.trim() || mobileMode === "measure") && (
                  <>
                    <textarea
                      id="dim-combo-input-mobile"
                      rows={2}
                      value={comboInput}
                      onChange={(e) =>
                        setComboInput(normalizeDimComboInput(e.target.value))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComboRows();
                        }
                      }}
                      placeholder={"40x50x30x10 hoặc dán nhiều dòng"}
                      className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 font-mono text-[12px] font-semibold focus:border-apple-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-apple-blue/15 min-h-[2.75rem]"
                    />
                    {comboInput.trim() && parsedPreview ? (
                      parsedPreview.ok ? (
                        <div className="overflow-hidden rounded-xl border border-emerald-200">
                          <DimPastePreviewTable
                            lines={parsedPreview.lines}
                            divisor={divisor}
                            dimCtx={dimCtx}
                          />
                          <button
                            type="button"
                            onClick={handleAddComboRows}
                            className="w-full touch-manipulation bg-emerald-600 py-2.5 text-[12px] font-bold text-white active:scale-[0.99]"
                          >
                            Thêm {parsedPreview.lines.reduce((s, l) => s + l.pcs, 0)} kiện
                            {autoRandomAfterAdd ? " + điền phần còn" : ""}
                          </button>
                        </div>
                      ) : (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900">
                          {parsedPreview.error}
                        </p>
                      )
                    ) : null}
                  </>
                )}
              </div>
            )}

            {showSaveTemplateForm ? (
              <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/80 p-2.5">
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-2 text-[12px] font-semibold"
                  placeholder="Tên mẫu"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowSaveTemplateForm(false)}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-500"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCurrentTemplate}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white"
                  >
                    Lưu mẫu
                  </button>
                </div>
              </div>
            ) : null}

            {/* Nâng cao — thu gọn */}
            <div className="rounded-2xl border border-violet-200 bg-white shadow-xs">
              <button
                type="button"
                onClick={() => setShowEstimationConfigMobile((v) => !v)}
                className="flex min-h-10 w-full touch-manipulation items-center justify-between px-3 text-[12px] font-bold text-violet-800"
              >
                <span>Nâng cao · cấu hình sinh</span>
                <span className="text-[10px] text-slate-400">
                  {showEstimationConfigMobile ? "▲ Thu" : "▼ Mở"}
                </span>
              </button>
              {showEstimationConfigMobile ? (
                <div className="border-t border-violet-100 px-3 pb-3 pt-2">
                  <EstimationConfigPanel {...estimationConfigProps} compact />
                </div>
              ) : null}
            </div>
          </div>

          {/* ===== md+: workbench bảng + rail chốt ===== */}
          <div className="hidden md:grid md:min-h-0 md:flex-1 md:grid-cols-1 md:gap-3 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
            <div className="flex min-h-0 flex-col gap-2">
              <div className="shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <label htmlFor="dim-combo-input" className="text-[11px] font-bold text-slate-700">
                    Dán D × R × C × kiện
                  </label>
                  <div className="flex items-center gap-1.5">
                    {parsedPreview?.ok ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Hợp lệ · {parsedPreview.lines.length} dòng
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handlePasteClipboard()}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Clipboard
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 px-3 pb-2">
                  <textarea
                    id="dim-combo-input"
                    rows={2}
                    value={comboInput}
                    onChange={(e) => setComboInput(normalizeDimComboInput(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAddComboRows();
                      }
                    }}
                    placeholder="Dán Excel / Zalo — 40 50 30 10 hoặc 40x50x30x10"
                    className="min-h-[2.75rem] flex-1 resize-y rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 font-mono text-[12px] font-semibold outline-none focus:border-apple-blue focus:bg-white focus:ring-1 focus:ring-apple-blue/20"
                  />
                  {comboInput.trim() && parsedPreview?.ok ? (
                    <button
                      type="button"
                      onClick={handleAddComboRows}
                      className="shrink-0 self-stretch rounded-lg bg-emerald-600 px-3 text-[12px] font-bold text-white hover:bg-emerald-700"
                    >
                      Thêm {parsedPreview.lines.reduce((s, l) => s + l.pcs, 0)} kiện
                    </button>
                  ) : null}
                </div>
                {comboInput.trim() && parsedPreview ? (
                  parsedPreview.ok ? (
                    <DimPastePreviewTable
                      lines={parsedPreview.lines}
                      divisor={divisor}
                      dimCtx={dimCtx}
                    />
                  ) : (
                    <p className="border-t border-amber-100 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-900">
                      {parsedPreview.error}
                    </p>
                  )
                ) : null}
              </div>

              {limitWarnings.length > 0 ? (
                <p className="shrink-0 truncate text-[11px] font-medium text-amber-800">
                  {limitWarnings.map((w) => w.message).join(" · ")}
                </p>
              ) : null}

              {(dimTemplates.length > 0 || lines.length > 0) && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Mẫu</span>
                  {dimTemplates.map((tmpl) => (
                    <span
                      key={tmpl.id}
                      className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white pl-2 text-[11px] font-semibold text-slate-700"
                    >
                      <button
                        type="button"
                        onClick={() => handleApplyTemplate(tmpl)}
                        className="py-0.5 hover:text-slate-900"
                      >
                        {tmpl.name}
                        <span className="ml-1 tabular-nums text-slate-400">{tmpl.totalPcs}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Xóa mẫu ${tmpl.name}`}
                        onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                        className="px-1.5 py-0.5 text-slate-300 hover:text-red-600"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {lines.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNewTemplateName(
                          `Mẫu ${row.customerCode || "DIM"} (${snap.sumDimPcs}k)`,
                        );
                        setShowSaveTemplateForm(true);
                      }}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                    >
                      + Lưu mẫu
                    </button>
                  ) : null}
                  {showSaveTemplateForm ? (
                    <span className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        className="h-7 w-40 rounded-md border border-slate-200 px-2 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={handleSaveCurrentTemplate}
                        className="text-[11px] font-bold text-emerald-700"
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSaveTemplateForm(false)}
                        className="text-[11px] text-slate-400"
                      >
                        Hủy
                      </button>
                    </span>
                  ) : null}
                </div>
              )}

              {renderDimList()}
            </div>

            <div className="hidden min-h-0 lg:flex lg:flex-col lg:gap-2">
              {canOneClick ? (
                <button
                  type="button"
                  onClick={handleOneClickAutoFill}
                  className="w-full rounded-xl bg-violet-600 px-3 py-2.5 text-left text-[12px] font-bold text-white hover:bg-violet-700"
                >
                  Bù đủ {lot.declaredPcs} kiện · {targetRatioPercent.toFixed(0)}% GW
                </button>
              ) : null}
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3">
                <PiecesProgress current={snap.sumDimPcs} total={lot.declaredPcs} />
                <div className="space-y-1 border-t border-slate-100 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Tổng DIM
                    </span>
                    <span className="text-sm font-extrabold tabular-nums text-violet-800">
                      {totalDimLabel}
                    </span>
                  </div>
                  {lot.declaredKg != null && snap.totalDim != null ? (
                    <p
                      className={`text-[10px] font-semibold ${
                        snap.dimBelowGross ? "text-slate-500" : "text-violet-700"
                      }`}
                    >
                      {snap.dimBelowGross
                        ? `DIM < Gross ${formatKgTotal(lot.declaredKg)} kg → Chargeable cân thực`
                        : `DIM ≥ Gross ${formatKgTotal(lot.declaredKg)} kg → Chargeable DIM`}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <EstimationConfigPanel {...estimationConfigProps} compact />
              </div>
              <div className="mt-auto space-y-1.5">
                <button
                  type="button"
                  disabled={!snap.canSave}
                  onClick={handleSave}
                  className={`w-full rounded-xl py-3 text-sm font-extrabold shadow-md transition-all active:scale-[0.98] ${saveBtnClass}`}
                >
                  {saveBtnLabel}
                </button>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={handleResetOriginal}
                    className="rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-[11px] font-bold text-amber-900"
                  >
                    ↺ Làm lại
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSave({ dimWeightKg: null, dimLines: null, dimDivisor: null })
                    }
                    className="rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-600"
                  >
                    Xóa DIM
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-400"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER mobile/md: Lưu + menu ⋯ ── */}
        <div
          className="shrink-0 border-t border-ui-border bg-ui-surface px-3 pt-2.5 lg:hidden"
          style={{
            paddingBottom: `max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px))`,
          }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!snap.canSave}
              onClick={handleSave}
              className={`min-h-12 flex-1 touch-manipulation rounded-2xl text-[13px] font-extrabold shadow-md transition-all active:scale-[0.98] ${saveBtnClass}`}
            >
              {saveBtnLabel}
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                aria-expanded={moreMenuOpen}
                aria-haspopup="menu"
                onClick={() => setMoreMenuOpen((v) => !v)}
                className="inline-flex h-12 w-12 touch-manipulation items-center justify-center rounded-2xl border border-ui-border bg-white text-lg font-bold text-slate-700 shadow-xs"
                title="Thêm"
              >
                ⋯
              </button>
              {moreMenuOpen ? (
                <div
                  role="menu"
                  className="absolute bottom-full right-0 z-50 mb-2 min-w-[11rem] overflow-hidden rounded-xl border border-ui-border bg-white py-1 shadow-apple-md"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      handleResetOriginal();
                    }}
                    className="block w-full px-3 py-2.5 text-left text-[13px] font-semibold text-amber-900 hover:bg-amber-50"
                  >
                    ↺ Làm lại
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onSave({ dimWeightKg: null, dimLines: null, dimDivisor: null });
                    }}
                    className="block w-full px-3 py-2.5 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Xóa DIM
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      setShowEstimationConfigMobile(true);
                      setMobileMode("quick");
                    }}
                    className="block w-full px-3 py-2.5 text-left text-[13px] font-semibold text-violet-800 hover:bg-violet-50"
                  >
                    Nâng cao
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onClose();
                    }}
                    className="block w-full px-3 py-2.5 text-left text-[13px] font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
