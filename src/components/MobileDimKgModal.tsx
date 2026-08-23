import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import {
  useOpsMobileOverlayLock,
  useVisualViewportBottomInset,
} from "../hooks/useOpsMobileOverlayLock";
import {
  Banner,
  Button,
  IconButton,
  Input,
  OverflowMenu,
  TextArea,
  type BannerTone,
} from "../ui";
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

export type DimModalStatus = {
  tone: BannerTone;
  title: string;
  detail?: string;
};

function cloneLines(lines: DimPieceLine[] | null): DimPieceLine[] {
  if (!lines?.length) return [];
  return lines.map((l) => ({ ...l }));
}

function cleanActionNote(note: string): string {
  return note.replace(/^(❌|✨|🎉|📋|💾|🗑️|↺|🔒|🔓)\s*/u, "").trim();
}

/** Chargeable = max(kg lô, DIM) — chỉ hiển thị, không đổi công thức. */
export function resolveDimChargeable(opts: {
  declaredKg: number | null | undefined;
  totalDim: number | null;
  dimBelowGross: boolean | null;
}): { kg: number | null; source: "gross" | "dim" | null } {
  const { declaredKg, totalDim, dimBelowGross } = opts;
  if (totalDim == null) return { kg: null, source: null };
  if (dimBelowGross === true && declaredKg != null && declaredKg > 0) {
    return { kg: declaredKg, source: "gross" };
  }
  return { kg: totalDim, source: "dim" };
}

/**
 * Một banner duy nhất — thứ tự: lỗi/dư kiện → hạn mức SCSC → thiếu kiện → đủ kiện → ghi chú.
 */
export function resolveDimModalStatus(opts: {
  pcsExcess: boolean;
  pcsMatch: boolean;
  pcsShort: boolean;
  remainingPcs: number;
  sumDimPcs: number;
  declaredPcs: number | null | undefined;
  actionNote: string | null;
  parseError: string | null;
  limitMessages: string[];
}): DimModalStatus | null {
  const {
    pcsExcess,
    pcsMatch,
    remainingPcs,
    sumDimPcs,
    declaredPcs,
    actionNote,
    parseError,
    limitMessages,
  } = opts;

  if (pcsExcess) {
    return {
      tone: "danger",
      title: `Dư kiện — tổng DIM ${sumDimPcs} vượt kiện lô ${declaredPcs ?? "—"}.`,
      detail: "Xóa bớt dòng rồi lưu.",
    };
  }

  const dangerNote =
    actionNote && (actionNote.startsWith("❌") || actionNote.toLowerCase().includes("lỗi"))
      ? cleanActionNote(actionNote)
      : null;
  if (dangerNote) {
    return { tone: "danger", title: dangerNote };
  }

  if (parseError) {
    return { tone: "warning", title: parseError };
  }

  if (limitMessages.length > 0) {
    return {
      tone: "warning",
      title: limitMessages[0]!,
      detail:
        limitMessages.length > 1
          ? `+${limitMessages.length - 1} cảnh báo hạn mức.`
          : undefined,
    };
  }

  if (pcsMatch) {
    return {
      tone: "success",
      title: `Đủ ${declaredPcs} kiện — bấm Lưu DIM.`,
    };
  }

  if (opts.pcsShort && remainingPcs > 0) {
    return {
      tone: "warning",
      title: `Đã đo ${sumDimPcs} / ${declaredPcs ?? "—"} kiện (thiếu ${remainingPcs}).`,
      detail: "Có thể Lưu phần đã đo, hoặc bù kiện ở Nâng cao nếu muốn đủ lô.",
    };
  }

  if (actionNote) {
    const title = cleanActionNote(actionNote);
    if (!title) return null;
    return { tone: "info", title };
  }

  return null;
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

function parseDraftNumber(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
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
      className="h-8 w-full rounded-md border border-transparent bg-transparent px-1 text-center font-mono text-[12px] font-semibold tabular-nums text-ui-text outline-none hover:border-ui-border focus:border-ui-primary/50 focus:bg-ui-surface focus:ring-1 focus:ring-ui-focus"
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
    <div className="overflow-x-auto border-t border-ui-border">
      <table className="w-full min-w-[22rem] border-collapse text-[11px]">
        <thead>
          <tr className="bg-ui-surface-muted text-[10px] font-bold uppercase tracking-wide text-ui-text-muted">
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
              <tr key={`${i}-${line.lCm}-${line.wCm}-${line.hCm}-${line.pcs}`} className="border-t border-ui-border/70">
                <td className="px-2 py-1 font-mono tabular-nums">{line.lCm}</td>
                <td className="px-2 py-1 font-mono tabular-nums">{line.wCm}</td>
                <td className="px-2 py-1 font-mono tabular-nums">{line.hCm}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">{line.pcs}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums text-ui-navy">
                  {kg != null ? formatLineDimKgDisplay(kg, dimCtx) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-ui-border bg-ui-surface-muted font-bold text-ui-navy">
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
      className="min-h-0 flex-1 overflow-auto rounded-xl border border-ui-border bg-ui-surface"
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
        <thead className="sticky top-0 z-10 bg-ui-surface-muted">
          <tr className="border-b border-ui-border text-[10px] font-bold uppercase tracking-wide text-ui-text-muted">
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
              <td colSpan={8} className="px-3 py-8 text-center text-[12px] text-ui-text-muted">
                {emptyHint}
              </td>
            </tr>
          ) : (
            rows.map(({ line, idx, tone }, i) => {
              const kg = lineDimKg(line, divisor, dimCtx);
              return (
                <tr
                  key={`${idx}-${tone}-${line.lCm}-${line.wCm}-${line.hCm}-${line.pcs}`}
                  className={`border-b border-ui-border/70 ${
                    tone === "measured" ? "bg-ui-success/5" : "bg-ui-surface"
                  }`}
                >
                  <td className="px-2 py-0.5 font-mono text-[11px] text-ui-text-muted">{i + 1}</td>
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
                  <td className="px-2 py-0.5 text-right font-mono text-[12px] font-semibold tabular-nums text-ui-text">
                    {kg != null ? formatLineDimKgDisplay(kg, dimCtx) : "—"}
                  </td>
                  <td className="px-2 py-0.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        tone === "measured"
                          ? "bg-ui-success/15 text-ui-success"
                          : "bg-ui-surface-muted text-ui-text-muted"
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
                          className="h-8 rounded-md px-1.5 text-[10px] font-bold text-ui-text-muted hover:bg-ui-surface-muted"
                          title={line.locked ? "Mở khóa" : "Khóa dòng"}
                        >
                          {line.locked ? "Khóa" : "Ghim"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onRemove(idx)}
                        className="h-8 rounded-md px-1.5 text-[10px] font-bold text-ui-danger hover:bg-ui-danger/10"
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
            <tr className="sticky bottom-0 border-t border-ui-border bg-ui-surface-muted font-bold">
              <td className="px-2 py-1.5 text-[10px] uppercase text-ui-text-muted" colSpan={4}>
                Tổng
              </td>
              <td className="px-2 py-1.5 text-center font-mono tabular-nums">{sumPcs}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ui-navy">
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
}) {
  return (
    <div className="space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-ui-navy">Sinh kiện ước tính</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onGenerate}
          disabled={snap.remainingPcs <= 0}
          className="min-h-11 px-3"
        >
          Sinh ngay
        </Button>
      </div>

      <div className="space-y-2">
        {lot.declaredKg != null && lot.declaredKg > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-ui-text-muted">
              <span>Tỉ lệ DIM/Gross</span>
              <span className="text-ui-navy">
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
              className="h-2 w-full cursor-pointer rounded-lg bg-ui-surface-muted accent-ui-primary"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1.5">
          <label>
            <span className="mb-0.5 block text-[9px] font-bold uppercase text-ui-text-muted">Kg DIM cố định</span>
            <Input
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
              className="text-center text-sm font-semibold tabular-nums"
            />
          </label>
          <label>
            <span className="mb-0.5 block text-[9px] font-bold uppercase text-ui-text-muted">Số dòng ước tính</span>
            <Input
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
              className="text-center text-sm font-semibold tabular-nums"
            />
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-ui-border pt-1.5 text-[10px]">
          <label className="flex cursor-pointer items-center gap-1.5 font-semibold text-ui-text">
            <input
              type="checkbox"
              checked={autoRandomAfterAdd}
              onChange={(e) => setAutoRandomAfterAdd(e.target.checked)}
              className="rounded text-ui-primary focus:ring-ui-focus"
            />
            Tự sinh sau khi Thêm
          </label>
          {snap.sumEstimatedPcs > 0 && (
            <button
              type="button"
              onClick={onClearEstimated}
              className="font-bold text-ui-danger hover:underline"
            >
              Xóa chưa khóa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileDimKgModal({ row, onClose, onSave }: MobileDimKgModalProps) {
  const [lines, setLines] = useState<DimPieceLine[]>(() =>
    consolidateDimPieceLines(cloneLines(row.dimLines)),
  );
  useOpsMobileOverlayLock(true);
  const keyboardInset = useVisualViewportBottomInset(true);

  const [comboInput, setComboInput] = useState("");
  const [draftL, setDraftL] = useState("");
  const [draftW, setDraftW] = useState("");
  const [draftH, setDraftH] = useState("");
  const [draftPcs, setDraftPcs] = useState("");

  /** Tắt mặc định — dán/thêm đo không tự bù kiện. */
  const [autoRandomAfterAdd, setAutoRandomAfterAdd] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [randomNonce, setRandomNonce] = useState(0);
  const [targetRatioPercent, setTargetRatioPercent] = useState(95.0);
  const [randomLineCountInput, setRandomLineCountInput] = useState("");
  const [randomTargetKgInput, setRandomTargetKgInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dimTemplates, setDimTemplates] = useState<DimTemplate[]>(() => loadDimTemplates());
  const [showSaveTemplateForm, setShowSaveTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  const listSectionRef = useRef<HTMLDivElement>(null);
  const advancedRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(true, dialogRef, onClose);

  const lot = useMemo(
    () => ({
      shipmentId: row.id,
      declaredPcs: row.pcs,
      declaredKg: row.kg,
      customerCode: row.customerCode,
    }),
    [row.id, row.pcs, row.kg, row.customerCode],
  );

  const dimCtx: ScscDimRoundContext = useMemo(
    () => ({ flight: row.flight, awb: row.awb }),
    [row.flight, row.awb],
  );
  const divisor: DimDivisor = useMemo(() => dimDivisorFromFlight(row.flight), [row.flight]);
  const seed = useMemo(() => dimEntrySeed(lot), [lot]);

  const snap = useMemo(
    () => snapshotDimEntry(lines, lot, divisor, dimCtx),
    [lines, lot, divisor, dimCtx],
  );

  const totalDimLabel =
    snap.totalDim != null ? `${formatDimKgDisplay(snap.totalDim, dimCtx)} kg` : "—";

  const limitWarnings = useMemo(
    () => collectScscDimLimitWarnings(row.flight, row.awb, lines),
    [row.flight, row.awb, lines],
  );
  const airlineRule = useMemo(
    () => resolveScscAirlineDimRule(row.flight, row.awb),
    [row.flight, row.awb],
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
    [lot, divisor, dimCtx, seed],
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
        note != null || mergeNote ? `${note ?? ""}${mergeNote}`.trim() || null : null,
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

  const draftLine = useMemo((): DimPieceLine | null => {
    const l = parseDraftNumber(draftL);
    const w = parseDraftNumber(draftW);
    const h = parseDraftNumber(draftH);
    const pcs = parseDraftNumber(draftPcs);
    if (l == null || w == null || h == null || pcs == null) return null;
    return {
      lCm: Math.round(l),
      wCm: Math.round(w),
      hCm: Math.round(h),
      pcs: Math.max(1, Math.floor(pcs)),
      estimated: false,
    };
  }, [draftL, draftW, draftH, draftPcs]);

  const draftKg = draftLine ? lineDimKg(draftLine, divisor, dimCtx) : null;

  const chargeable = resolveDimChargeable({
    declaredKg: lot.declaredKg,
    totalDim: snap.totalDim,
    dimBelowGross: snap.dimBelowGross,
  });

  const status = resolveDimModalStatus({
    pcsExcess: snap.pcsExcess,
    pcsMatch: snap.pcsMatch,
    pcsShort: snap.pcsShort,
    remainingPcs: snap.remainingPcs,
    sumDimPcs: snap.sumDimPcs,
    declaredPcs: lot.declaredPcs,
    actionNote,
    parseError: parsedPreview && !parsedPreview.ok ? parsedPreview.error : null,
    limitMessages: limitWarnings.map((w) => w.message),
  });

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setActionNote("❌ Clipboard trống — hãy copy kích thước trước.");
        return;
      }
      setComboInput(normalizeDimComboInput(text));
      setActionNote("Đã dán từ clipboard — kiểm tra rồi bấm Thêm.");
    } catch {
      setActionNote("❌ Không đọc được clipboard — dán thủ công vào ô bên dưới.");
    }
  };

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
        applyMutation(fill.lines, `Đã áp dụng mẫu "${t.name}" và tự động điền đủ kiện.`, {
          scrollList: true,
        });
        return;
      }
    }
    applyMutation(templatePieceLines, `Đã áp dụng mẫu "${t.name}" (${t.totalPcs} kiện).`, {
      scrollList: true,
    });
  };

  const handleSaveCurrentTemplate = () => {
    const nameToSave =
      newTemplateName.trim() || `Mẫu ${row.customerCode || "DIM"} (${snap.sumDimPcs}k)`;
    try {
      const nextList = saveDimTemplate({
        name: nameToSave,
        lines,
        customerCode: row.customerCode,
      });
      setDimTemplates(nextList);
      setNewTemplateName("");
      setShowSaveTemplateForm(false);
      setActionNote(`Đã lưu thành công mẫu "${nameToSave}".`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setActionNote(`❌ Lỗi lưu mẫu: ${message}`);
    }
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextList = deleteDimTemplate(id);
    setDimTemplates(nextList);
    setActionNote("Đã xóa mẫu DIM.");
  };

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

  const handleAddDraftLine = () => {
    if (!draftLine) {
      setActionNote("❌ Nhập D, R, C và số kiện lớn hơn 0.");
      return;
    }
    const combo = `${draftLine.lCm}×${draftLine.wCm}×${draftLine.hCm}×${draftLine.pcs}`;
    const r = dimEntryAddMeasuredFromCombo(lines, combo, lot, {
      thenRandomFill: autoRandomAfterAdd,
      randomFillParams: randomParams ? { ...randomParams, targetRatioPercent } : undefined,
    });
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    applyMutation(r.lines, r.note ?? "Đã thêm dòng đo.", { scrollList: true });
    setDraftL("");
    setDraftW("");
    setDraftH("");
    setDraftPcs("");
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
      `Đã điền đủ ${lot.declaredPcs}/${lot.declaredPcs} kiện. Bấm Lưu DIM.`,
      { scrollList: true },
    );
  };

  const handleResetOriginal = () => {
    const original = consolidateDimPieceLines(cloneLines(row.dimLines));
    setLines(original);
    setComboInput("");
    setDraftL("");
    setDraftW("");
    setDraftH("");
    setDraftPcs("");
    setActionNote("Đã làm lại từ đầu — quay về dữ liệu ban đầu.");
  };

  const handleToggleLock = (idx: number) => {
    const next = lines.map((l, i) => {
      if (i === idx) {
        return { ...l, locked: !l.locked };
      }
      return l;
    });
    applyMutation(next, next[idx]?.locked ? "Đã khóa dòng kiện ước tính." : "Đã mở khóa dòng kiện.");
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
    setActionNote("Đã nhận bản dán — kiểm tra xem trước rồi bấm Thêm.");
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

  const handleMergeLines = () => {
    const r = dimEntryMergeLines(lines);
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    applyMutation(r.lines, r.note ?? "Đã gộp dòng cùng kích thước.");
  };

  const openAdvanced = () => {
    setShowAdvanced(true);
    window.requestAnimationFrame(() => {
      advancedRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const saveBtnLabel = snap.pcsExcess
    ? "Dư kiện — xóa bớt"
    : snap.pcsMatch
      ? "Lưu DIM"
      : snap.pcsShort
        ? `Lưu ${snap.sumDimPcs} kiện (thiếu ${snap.remainingPcs})`
        : "Lưu DIM";

  const canOneClick =
    lot.declaredPcs != null &&
    lot.declaredPcs > 0 &&
    lot.declaredKg != null &&
    lot.declaredKg > 0 &&
    snap.remainingPcs > 0 &&
    !snap.pcsExcess;

  const pcsPct =
    lot.declaredPcs != null && lot.declaredPcs > 0
      ? Math.min(100, Math.round((snap.sumDimPcs / lot.declaredPcs) * 100))
      : 0;

  const draftPcsPlaceholder =
    snap.remainingPcs > 0
      ? String(snap.remainingPcs)
      : lot.declaredPcs != null && lot.declaredPcs > 0
        ? String(lot.declaredPcs)
        : "1";

  const pastePcs = parsedPreview?.ok
    ? parsedPreview.lines.reduce((s, l) => s + l.pcs, 0)
    : 0;

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
        className="flex h-[96dvh] max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-ui-border bg-ui-surface shadow-ui-lg sm:h-[min(94dvh,880px)] sm:max-w-[min(96vw,42rem)] sm:rounded-2xl lg:max-w-[min(96vw,56rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-ui-border bg-ui-surface px-4 pb-2.5 pt-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h2 id="dim-modal-title" className="text-sm font-black tracking-tight text-ui-navy md:text-[15px]">
                  Nhập DIM
                </h2>
                <span className="text-[11px] font-semibold text-ui-text-muted">
                  {row.awb} · {row.flight}
                </span>
                <span className="rounded-full border border-ui-border bg-ui-surface-muted px-2 py-0.5 text-[10px] font-bold text-ui-text">
                  {dimRuleBadgeText(airlineRule, divisor)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="dim-totals">
                <div className="rounded-lg bg-ui-surface-muted px-2 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">Kiện</p>
                  <p className="font-mono text-[13px] font-extrabold tabular-nums text-ui-navy">
                    {snap.sumDimPcs}
                    <span className="text-[11px] font-semibold text-ui-text-muted">
                      /{lot.declaredPcs ?? "—"}
                    </span>
                  </p>
                </div>
                <div className="rounded-lg bg-ui-surface-muted px-2 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">Kg lô</p>
                  <p className="font-mono text-[13px] font-extrabold tabular-nums text-ui-navy">
                    {lot.declaredKg != null ? formatKgTotal(lot.declaredKg) : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-ui-surface-muted px-2 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">DIM</p>
                  <p className="font-mono text-[13px] font-extrabold tabular-nums text-ui-navy">
                    {totalDimLabel}
                  </p>
                </div>
                <div className="rounded-lg bg-ui-surface-muted px-2 py-1.5" data-testid="dim-chargeable">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">
                    Chargeable
                  </p>
                  <p className="font-mono text-[13px] font-extrabold tabular-nums text-ui-navy">
                    {chargeable.kg != null
                      ? `${formatKgTotal(chargeable.kg)} kg`
                      : "—"}
                    {chargeable.source ? (
                      <span className="ml-1 text-[10px] font-semibold text-ui-text-muted">
                        · {chargeable.source === "gross" ? "cân thực" : "DIM"}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              {lot.declaredPcs != null && lot.declaredPcs > 0 ? (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ui-surface-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      snap.pcsExcess
                        ? "bg-ui-danger"
                        : snap.pcsMatch
                          ? "bg-ui-success"
                          : "bg-ui-warning"
                    }`}
                    style={{ width: `${snap.pcsExcess ? 100 : pcsPct}%` }}
                  />
                </div>
              ) : null}
            </div>
            <IconButton
              label="Đóng"
              size="md"
              variant="ghost"
              onClick={onClose}
              className="shrink-0"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </IconButton>
          </div>
        </div>

        {status ? (
          <div className="shrink-0 border-b border-ui-border px-4 py-2 sm:px-5" data-testid="dim-status-banner" data-tone={status.tone}>
            <Banner tone={status.tone} title={status.title}>
              {status.detail}
            </Banner>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain bg-ui-background/40 px-3 py-2.5 sm:px-5">
          <section
            data-testid="dim-quick-measure"
            className="space-y-2.5 rounded-2xl border border-ui-border bg-ui-surface p-3 shadow-ui-sm"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-extrabold text-ui-navy">Đo nhanh</h3>
              <p className="text-[10px] font-medium text-ui-text-muted">
                Một dòng D × R × C × kiện
              </p>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ["D", draftL, setDraftL, "40"],
                  ["R", draftW, setDraftW, "50"],
                  ["C", draftH, setDraftH, "30"],
                  ["Kiện", draftPcs, setDraftPcs, draftPcsPlaceholder],
                ] as const
              ).map(([label, value, setValue, placeholder]) => (
                <label key={label} className="min-w-0">
                  <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">
                    {label}
                  </span>
                  <Input
                    inputMode="numeric"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddDraftLine();
                      }
                    }}
                    placeholder={placeholder}
                    aria-label={label === "Kiện" ? "Số kiện dòng đo" : `Cạnh ${label} (cm)`}
                    className="text-center font-mono text-sm font-semibold tabular-nums"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-ui-text-muted">
                Dòng này{" "}
                <span className="font-mono text-ui-navy">
                  {draftKg != null ? `${formatLineDimKgDisplay(draftKg, dimCtx)} kg` : "—"}
                </span>
              </p>
              <Button
                type="button"
                size="md"
                variant="secondary"
                onClick={handleAddDraftLine}
                disabled={!draftLine}
                className="min-h-11 min-w-[7.5rem]"
              >
                Thêm dòng
              </Button>
            </div>

            <div className="space-y-1.5 border-t border-ui-border pt-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-ui-text">Hoặc dán D × R × C × kiện</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void handlePasteClipboard()}
                  className="min-h-11 px-2.5"
                >
                  Clipboard
                </Button>
              </div>
              <TextArea
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
                placeholder="40×50×30×10 hoặc dán nhiều dòng"
                className="min-h-11 font-mono text-[12px] font-semibold"
              />
              {comboInput.trim() && parsedPreview?.ok ? (
                <div className="overflow-hidden rounded-xl border border-ui-border">
                  <DimPastePreviewTable
                    lines={parsedPreview.lines}
                    divisor={divisor}
                    dimCtx={dimCtx}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleAddComboRows}
                    className="min-h-11 w-full rounded-none"
                  >
                    Thêm {pastePcs} kiện
                    {autoRandomAfterAdd ? " + điền phần còn" : ""}
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

          <div ref={listSectionRef} className="flex min-h-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="text-[11px] font-bold text-ui-text">Bảng DIM</span>
              <span className="text-[10px] font-semibold tabular-nums text-ui-text-muted">
                {snap.lineCount} dòng · {snap.sumDimPcs} kiện
              </span>
            </div>
            <DimLinesTable
              measured={snap.measured}
              estimated={snap.estimated}
              divisor={divisor}
              dimCtx={dimCtx}
              totalDimLabel={totalDimLabel}
              emptyHint="Nhập D × R × C × kiện ở trên, hoặc dán thẳng vào bảng."
              onPatch={handlePatchLine}
              onRemove={(idx) => applyMutation(dimEntryRemoveLine(lines, idx))}
              onToggleLock={handleToggleLock}
              onPasteText={handlePasteIntoTable}
            />
          </div>

          <div
            ref={advancedRef}
            data-testid="dim-advanced"
            className="rounded-2xl border border-ui-border bg-ui-surface shadow-ui-sm"
          >
            <button
              type="button"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex min-h-11 w-full touch-manipulation items-center justify-between px-3 text-[12px] font-bold text-ui-navy"
            >
              <span>Nâng cao</span>
              <span className="text-[10px] font-semibold text-ui-text-muted">
                {showAdvanced ? "Thu" : "Mẫu · sinh ảo · gộp dòng"}
              </span>
            </button>
            {showAdvanced ? (
              <div className="space-y-3 border-t border-ui-border px-3 pb-3 pt-2.5">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ui-text-muted">
                    Mẫu DIM
                  </p>
                  {dimTemplates.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {dimTemplates.map((tmpl) => (
                        <span
                          key={tmpl.id}
                          className="inline-flex items-center gap-0.5 rounded-lg border border-ui-border bg-ui-surface-muted pl-2 text-[11px] font-semibold text-ui-text"
                        >
                          <button
                            type="button"
                            onClick={() => handleApplyTemplate(tmpl)}
                            className="min-h-11 py-1 pr-1"
                          >
                            {tmpl.name}
                            <span className="ml-1 tabular-nums text-ui-text-muted">{tmpl.totalPcs}</span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Xóa mẫu ${tmpl.name}`}
                            onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                            className="min-h-11 min-w-11 px-1.5 text-ui-text-muted hover:text-ui-danger"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-ui-text-muted">Chưa có mẫu đã lưu.</p>
                  )}
                  {lines.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNewTemplateName(
                          `Mẫu ${row.customerCode || "DIM"} (${snap.sumDimPcs}k)`,
                        );
                        setShowSaveTemplateForm(true);
                      }}
                      className="min-h-11 px-2"
                    >
                      + Lưu thành mẫu
                    </Button>
                  ) : null}
                  {showSaveTemplateForm ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Input
                        type="text"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder="Tên mẫu"
                        className="min-w-[10rem] flex-1"
                      />
                      <Button type="button" size="sm" onClick={handleSaveCurrentTemplate} className="min-h-11">
                        Lưu mẫu
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowSaveTemplateForm(false)}
                        className="min-h-11"
                      >
                        Hủy
                      </Button>
                    </div>
                  ) : null}
                </div>

                {dimEntryHasMergeableDuplicates(lines) ? (
                  <Button
                    type="button"
                    size="md"
                    variant="secondary"
                    onClick={handleMergeLines}
                    className="min-h-11 w-full"
                  >
                    Gộp dòng giống
                  </Button>
                ) : null}

                {canOneClick ? (
                  <Button
                    type="button"
                    size="md"
                    variant="secondary"
                    onClick={handleOneClickAutoFill}
                    className="min-h-11 w-full"
                  >
                    Điền đủ {lot.declaredPcs} kiện ước tính · {targetRatioPercent.toFixed(0)}% GW
                  </Button>
                ) : null}

                <EstimationConfigPanel
                  lot={lot}
                  snap={snap}
                  targetRatioPercent={targetRatioPercent}
                  setTargetRatioPercent={setTargetRatioPercent}
                  randomTargetKgInput={randomTargetKgInput}
                  setRandomTargetKgInput={setRandomTargetKgInput}
                  randomLineCountInput={randomLineCountInput}
                  setRandomLineCountInput={setRandomLineCountInput}
                  autoRandomAfterAdd={autoRandomAfterAdd}
                  setAutoRandomAfterAdd={setAutoRandomAfterAdd}
                  onGenerate={handleRandom}
                  onClearEstimated={() =>
                    applyMutation(dimEntryClearEstimated(lines), "Đã xóa kiện ước tính chưa khóa.")
                  }
                />
              </div>
            ) : null}
          </div>
        </div>

        <div
          data-testid="dim-footer"
          className="relative z-20 shrink-0 overflow-visible border-t border-ui-border bg-ui-surface px-3 pt-2.5"
          style={{
            paddingBottom: `max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px))`,
          }}
        >
          <div className="flex items-center gap-2 overflow-visible">
            <Button
              type="button"
              size="lg"
              variant="primary"
              disabled={!snap.canSave}
              onClick={handleSave}
              data-testid="dim-save"
              className="min-h-12 flex-1"
            >
              {saveBtnLabel}
            </Button>
            <OverflowMenu
              compact
              align="right"
              placement="up"
              label="Thêm"
              triggerClassName="inline-flex h-12 w-12 min-h-12 min-w-12 touch-manipulation items-center justify-center rounded-2xl border border-ui-border bg-ui-surface text-lg font-bold text-ui-text shadow-ui-sm"
              items={[
                { id: "reset", label: "Làm lại", onSelect: handleResetOriginal },
                {
                  id: "clear",
                  label: "Xóa DIM",
                  onSelect: () =>
                    onSave({ dimWeightKg: null, dimLines: null, dimDivisor: null }),
                },
                { id: "advanced", label: "Nâng cao", onSelect: openAdvanced },
                { id: "cancel", label: "Hủy", onSelect: onClose },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
