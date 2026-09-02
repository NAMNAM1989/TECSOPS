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
  loadCustomerRecentDims,
  recordCustomerRecentDims,
  deleteCustomerRecentDim,
  type DimTemplate,
  type CustomerRecentDimSize,
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

/** Preset quy cách hàng không phổ biến */
const CARGO_PRESETS = [
  { label: "Dệt may / Garment", d: 60, r: 40, c: 40, icon: "👕" },
  { label: "Thủy sản / Foam", d: 50, r: 40, c: 30, icon: "🐟" },
  { label: "Trái cây / Nông sản", d: 40, r: 30, c: 20, icon: "🍎" },
  { label: "Thùng chuẩn 50³", d: 50, r: 50, c: 50, icon: "📦" },
  { label: "Pallet gỗ", d: 120, r: 80, c: 80, icon: "🪵" },
] as const;

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

export function MobileDimKgModal({
  row,
  customerDirectory,
  onClose,
  onSave,
}: MobileDimKgModalProps) {
  const [lines, setLines] = useState<DimPieceLine[]>(() =>
    consolidateDimPieceLines(cloneLines(row.dimLines)),
  );
  useOpsMobileOverlayLock(true);
  const keyboardInset = useVisualViewportBottomInset(true);

  const [comboInput, setComboInput] = useState("");

  const customerKey = useMemo(
    () => (row.customerCode || row.customer || "").trim(),
    [row.customerCode, row.customer],
  );

  const matchedCustomer = useMemo(() => {
    if (!customerDirectory?.length) return null;
    const code = row.customerCode?.trim().toUpperCase();
    const name = row.customer?.trim().toLowerCase();
    return (
      customerDirectory.find((c) => {
        if (code && c.code.toUpperCase() === code) return true;
        if (code && c.shortCode && c.shortCode.toUpperCase() === code) return true;
        if (name && c.name.toLowerCase() === name) return true;
        return false;
      }) ?? null
    );
  }, [customerDirectory, row.customerCode, row.customer]);

  const [customerRecentDims, setCustomerRecentDims] = useState<CustomerRecentDimSize[]>(() =>
    customerKey ? loadCustomerRecentDims(customerKey) : [],
  );

  useEffect(() => {
    if (customerKey) {
      setCustomerRecentDims(loadCustomerRecentDims(customerKey));
    } else {
      setCustomerRecentDims([]);
    }
  }, [customerKey]);

  /** Tắt mặc định — dán/thêm đo không tự bù kiện. */
  const [autoRandomAfterAdd, setAutoRandomAfterAdd] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [targetRatioPercent, setTargetRatioPercent] = useState(95.0);
  const [randomLineCountInput, setRandomLineCountInput] = useState("");
  const [randomTargetKgInput, setRandomTargetKgInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dimTemplates, setDimTemplates] = useState<DimTemplate[]>(() => loadDimTemplates());
  const [showSaveTemplateForm, setShowSaveTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const listSectionRef = useRef<HTMLDivElement>(null);
  const advancedRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const comboInputRef = useRef<HTMLTextAreaElement>(null);
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

  type DynamicPresetItem = {
    id: string;
    label: string;
    d: number;
    r: number;
    c: number;
    type: "profile" | "recent" | "standard";
    icon: string;
  };

  const dynamicPresets = useMemo((): DynamicPresetItem[] => {
    const list: DynamicPresetItem[] = [];
    const seen = new Set<string>();

    // 1. Profile saved templates (⭐) from Customer Directory
    if (matchedCustomer?.savedDimTemplates?.length) {
      for (const t of matchedCustomer.savedDimTemplates) {
        const key = `${t.lCm}x${t.wCm}x${t.hCm}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            id: `prof-${t.id}`,
            label: t.label ? `${t.label} (${t.lCm}×${t.wCm}×${t.hCm})` : `${t.lCm}×${t.wCm}×${t.hCm}`,
            d: t.lCm,
            r: t.wCm,
            c: t.hCm,
            type: "profile",
            icon: "⭐",
          });
        }
      }
    }

    // 2. Customer recent used dims (🕒)
    if (customerRecentDims.length) {
      for (const item of customerRecentDims) {
        const key = `${item.lCm}x${item.wCm}x${item.hCm}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            id: `recent-${key}`,
            label: item.label ? `${item.label} (${item.lCm}×${item.wCm}×${item.hCm})` : `${item.lCm}×${item.wCm}×${item.hCm}`,
            d: item.lCm,
            r: item.wCm,
            c: item.hCm,
            type: "recent",
            icon: "🕒",
          });
        }
      }
    }

    // 3. Fallback standard presets (📦)
    for (const p of CARGO_PRESETS) {
      const key = `${p.d}x${p.r}x${p.c}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          id: `std-${p.label}`,
          label: `${p.label} (${p.d}×${p.r}×${p.c})`,
          d: p.d,
          r: p.r,
          c: p.c,
          type: "standard",
          icon: p.icon,
        });
      }
    }

    return list;
  }, [matchedCustomer, customerRecentDims]);

  const handleApplyPreset = (p: { d: number; r: number; c: number; label?: string }) => {
    const pcsVal = snap.remainingPcs > 0 ? snap.remainingPcs : 1;
    const combo = `${p.d}×${p.r}×${p.c}×${pcsVal}`;
    setComboInput(combo);
    setActionNote(`Đã chọn: ${p.label || `${p.d}×${p.r}×${p.c}`} (${combo}). Bấm Thêm hoặc Enter.`);
    comboInputRef.current?.focus();
  };

  const handleDeleteRecentPreset = (
    e: React.MouseEvent,
    size: { d: number; r: number; c: number },
  ) => {
    e.stopPropagation();
    if (!customerKey) return;
    const next = deleteCustomerRecentDim(customerKey, {
      lCm: size.d,
      wCm: size.r,
      hCm: size.c,
    });
    setCustomerRecentDims(next);
    setActionNote(`Đã xóa kích thước ${size.d}×${size.r}×${size.c} khỏi danh sách gần đây.`);
  };

  const handleQuickBookmarkForCustomer = () => {
    if (!customerKey) {
      setActionNote("❌ Lô hàng chưa có thông tin khách để lưu.");
      return;
    }
    const targetLines = lines.filter((l) => !l.estimated);
    const toSave = targetLines.length > 0 ? targetLines : lines;
    if (!toSave.length) {
      if (comboInput.trim() && parsedPreview?.ok) {
        recordCustomerRecentDims(
          customerKey,
          parsedPreview.lines.map((l) => ({ lCm: l.lCm, wCm: l.wCm, hCm: l.hCm })),
        );
        const updated = loadCustomerRecentDims(customerKey);
        setCustomerRecentDims(updated);
        setActionNote(`⭐ Đã lưu kích thước từ ô nhập vào danh sách của khách ${customerKey.toUpperCase()}.`);
        return;
      }
      setActionNote("❌ Nhập kích thước trước khi lưu.");
      return;
    }
    recordCustomerRecentDims(
      customerKey,
      toSave.map((l) => ({ lCm: l.lCm, wCm: l.wCm, hCm: l.hCm })),
    );
    const updated = loadCustomerRecentDims(customerKey);
    setCustomerRecentDims(updated);
    setActionNote(`⭐ Đã lưu ${toSave.length} kích thước vào danh sách của khách ${customerKey.toUpperCase()}.`);
  };

  const handlePatchLine = (
    index: number,
    patch: Partial<DimPieceLine>,
    normalizeEdges?: boolean,
  ) => {
    setLines((prev) => {
      const next = prev.map((l, i) => {
        if (i !== index) return l;
        const merged = { ...l, ...patch };
        return normalizeEdges ? normalizeDimLineEdges(merged) : merged;
      });
      return consolidateDimPieceLines(next);
    });
  };

  const handleToggleLock = (index: number) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, locked: !l.locked } : l)),
    );
  };

  const handlePasteIntoTable = (text: string) => {
    const r = dimEntryAddMeasuredFromCombo(lines, text, lot, {
      thenRandomFill: autoRandomAfterAdd,
      randomFillParams: randomParams ? { ...randomParams, targetRatioPercent } : undefined,
    });
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    applyMutation(r.lines, r.note ?? "Đã nạp kích thước từ dán trực tiếp.", {
      scrollList: true,
    });
  };

  const handleRandom = () => {
    if (!randomParams) return;
    const targetKg = parseTargetDimKgInput(randomTargetKgInput);
    const lineCount = parseRandomLineCountInput(randomLineCountInput);
    const r = dimEntryRandomFill(lines, lot, {
      ...randomParams,
      targetRatioPercent,
      targetTotalDimKg: targetKg,
      targetEstimatedLineCount: lineCount,
    });
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    applyMutation(r.lines, r.note, { scrollList: true });
  };

  const handleOneClickAutoFill = () => {
    if (!randomParams) return;
    const r = dimEntryRandomFill(lines, lot, {
      ...randomParams,
      targetRatioPercent,
    });
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    applyMutation(r.lines, r.note, { scrollList: true });
  };

  const handleResetOriginal = () => {
    setLines(consolidateDimPieceLines(cloneLines(row.dimLines)));
    setComboInput("");
    setActionNote("Đã hoàn tác về trạng thái ban đầu.");
  };

  const handleSave = () => {
    const v = dimEntryValidateSave(lines, lot, divisor, dimCtx);
    if (!v.ok) {
      setActionNote(`❌ ${v.error}`);
      return;
    }
    if (customerKey && v.lines.length > 0) {
      recordCustomerRecentDims(
        customerKey,
        v.lines.map((l) => ({ lCm: l.lCm, wCm: l.wCm, hCm: l.hCm })),
      );
    }
    onSave({
      dimWeightKg: snap.totalDim,
      dimLines: v.lines,
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

  /** Copy chuỗi format terminal hệ thống hàng không */
  const handleCopyFormatString = async (format: "scsc" | "tcs" | "cargospot") => {
    if (!lines.length) return;
    let str = "";
    if (format === "scsc") {
      str = lines.map((l) => `${l.lCm}-${l.wCm}-${l.hCm}/${l.pcs}`).join(" ");
    } else if (format === "tcs") {
      str = lines.map((l) => `${l.lCm}*${l.wCm}*${l.hCm}/${l.pcs}`).join("+");
    } else {
      str = lines.map((l) => `${l.pcs}/${l.lCm}/${l.wCm}/${l.hCm}`).join(" ");
    }
    try {
      await navigator.clipboard.writeText(str);
      setCopyFeedback(format);
      setTimeout(() => setCopyFeedback(null), 2000);
      setActionNote(`📋 Đã copy chuỗi format ${format.toUpperCase()}: ${str}`);
    } catch {
      setActionNote("❌ Không thể copy vào clipboard.");
    }
  };

  // Global Ctrl+S to save and Ctrl+V handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (snap.canSave) handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

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

  const pastePcs = parsedPreview?.ok
    ? parsedPreview.lines.reduce((s, l) => s + l.pcs, 0)
    : 0;

  // Tính chênh lệch và tỷ trọng thể tích
  const isVolumetric = snap.totalDim != null && lot.declaredKg != null && snap.totalDim > lot.declaredKg;
  const deltaKg = snap.totalDim != null && lot.declaredKg != null ? snap.totalDim - lot.declaredKg : 0;

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
        className="flex h-[96dvh] max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-ui-border bg-ui-surface shadow-ui-lg sm:h-[min(94dvh,900px)] sm:max-w-[min(96vw,52rem)] sm:rounded-2xl lg:max-w-[min(96vw,64rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="shrink-0 border-b border-ui-border bg-ui-surface px-4 pb-2.5 pt-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h2 id="dim-modal-title" className="text-sm font-black tracking-tight text-ui-navy md:text-[15px]">
                  Nhập DIM
                </h2>
                <span className="font-mono text-[12px] font-bold text-ui-awb">
                  {row.awb || "—"}
                </span>
                <span className="text-[11px] font-semibold text-ui-text-muted">
                  · {row.flight || "—"}
                </span>
                <span className="rounded-full border border-ui-border bg-ui-surface-muted px-2 py-0.5 text-[10px] font-bold text-ui-text">
                  {dimRuleBadgeText(airlineRule, divisor)}
                </span>
                {isVolumetric ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                    ⚡ Hàng thể tích (+{formatKgTotal(deltaKg)} kg)
                  </span>
                ) : lot.declaredKg != null && snap.totalDim != null ? (
                  <span className="rounded-full bg-ui-success/15 px-2 py-0.5 text-[10px] font-extrabold text-ui-success">
                    ✓ Hàng nặng (Tính theo Gross)
                  </span>
                ) : null}
              </div>

              {/* KPI STRIP */}
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="dim-totals">
                <div className="rounded-xl border border-ui-border/80 bg-ui-surface-muted/60 px-2.5 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">Kiện</p>
                  <p className="font-mono text-[14px] font-extrabold tabular-nums text-ui-navy">
                    {snap.sumDimPcs}
                    <span className="text-[11px] font-semibold text-ui-text-muted">
                      /{lot.declaredPcs ?? "—"}
                    </span>
                    {snap.pcsMatch ? (
                      <span className="ml-1 text-[11px] font-bold text-ui-success">✓</span>
                    ) : null}
                  </p>
                </div>
                <div className="rounded-xl border border-ui-border/80 bg-ui-surface-muted/60 px-2.5 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">Kg lô (Gross)</p>
                  <p className="font-mono text-[14px] font-extrabold tabular-nums text-ui-navy">
                    {lot.declaredKg != null ? `${formatKgTotal(lot.declaredKg)}` : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-ui-border/80 bg-ui-surface-muted/60 px-2.5 py-1.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">DIM (Thể tích)</p>
                  <p className={`font-mono text-[14px] font-extrabold tabular-nums ${isVolumetric ? "text-amber-800" : "text-ui-navy"}`}>
                    {totalDimLabel}
                  </p>
                </div>
                <div className="rounded-xl border border-ui-border/80 bg-ui-surface-muted/60 px-2.5 py-1.5" data-testid="dim-chargeable">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">
                    Chargeable (CW)
                  </p>
                  <p className="font-mono text-[14px] font-extrabold tabular-nums text-ui-navy">
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

        {/* STATUS BANNER */}
        {status ? (
          <div className="shrink-0 border-b border-ui-border px-4 py-2 sm:px-5" data-testid="dim-status-banner" data-tone={status.tone}>
            <Banner tone={status.tone} title={status.title}>
              {status.detail}
            </Banner>
          </div>
        ) : null}

        {/* WORKSPACE BODY - 2 COLUMNS ON DESKTOP */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-ui-background/40 p-3 sm:p-4 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-4 lg:overflow-hidden">
          {/* LEFT COLUMN: FAST ENTRY & PRESETS */}
          <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
            {/* FAST MEASURE SECTION */}
            <section
              data-testid="dim-quick-measure"
              className="space-y-3 rounded-2xl border border-ui-border bg-ui-surface p-3.5 shadow-ui-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-extrabold text-ui-navy">Đo nhanh</h3>
                <p className="text-[10px] font-medium text-ui-text-muted">
                  D × R × C × kiện (vd: 40×50×30×10)
                </p>
              </div>

              {/* CUSTOMER & COMMON AIR CARGO PRESETS */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ui-text-muted">
                    {customerKey ? (
                      <span>
                        Quy cách khách <span className="font-extrabold text-ui-navy">[{customerKey.toUpperCase()}]</span>
                      </span>
                    ) : (
                      "Quy cách phổ biến (1-Click)"
                    )}
                  </p>
                  {customerKey ? (
                    <button
                      type="button"
                      onClick={handleQuickBookmarkForCustomer}
                      className="text-[10px] font-bold text-ui-primary hover:underline"
                      title="Lưu kích thước đang nhập vào danh sách thường dùng của khách này"
                    >
                      + Lưu mẫu khách
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {dynamicPresets.map((p) => (
                    <span
                      key={p.id}
                      className={`group inline-flex items-center rounded-lg border text-[11px] font-semibold transition ${
                        p.type === "profile"
                          ? "border-amber-300/90 bg-amber-50/80 text-amber-950 hover:bg-amber-100"
                          : p.type === "recent"
                            ? "border-teal-300/90 bg-teal-50/80 text-teal-950 hover:bg-teal-100"
                            : "border-ui-border/80 bg-ui-surface-muted text-ui-text hover:border-ui-primary/50 hover:bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(p)}
                        className="flex items-center gap-1 px-2.5 py-1.5 active:scale-[0.98]"
                        title={p.label}
                      >
                        <span>{p.icon}</span>
                        <span className="font-mono">{p.d}×{p.r}×{p.c}</span>
                      </button>
                      {p.type === "recent" ? (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteRecentPreset(e, p)}
                          aria-label={`Xóa kích thước ${p.d}x${p.r}x${p.c}`}
                          className="mr-1 rounded px-1 text-[10px] text-ui-text-muted opacity-60 hover:bg-red-100 hover:text-ui-danger group-hover:opacity-100"
                          title="Xóa khỏi danh sách gần đây"
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>

              {/* COMBO PASTE / TEXT AREA */}
              <div className="space-y-1.5 border-t border-ui-border/70 pt-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-ui-text">Nhập hoặc dán kích thước</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void handlePasteClipboard()}
                    className="min-h-9 px-2 text-[11px]"
                  >
                    📋 Clipboard
                  </Button>
                </div>
                <TextArea
                  ref={comboInputRef}
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
                  placeholder={"40×50×30×10\n60×40×40×20\n50 40 30 15..."}
                  className="min-h-[6.5rem] sm:min-h-[8rem] font-mono text-[12px] font-semibold leading-relaxed"
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
                      variant="primary"
                      size="md"
                      onClick={handleAddComboRows}
                      className="min-h-11 w-full rounded-none font-bold"
                    >
                      Thêm {pastePcs} kiện
                      {autoRandomAfterAdd ? " + điền phần còn" : ""}
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-end pt-0.5">
                    <Button
                      type="button"
                      size="md"
                      variant="secondary"
                      onClick={handleAddComboRows}
                      disabled={!comboInput.trim()}
                      className="min-h-10 min-w-[7.5rem] font-bold"
                    >
                      Thêm dòng
                    </Button>
                  </div>
                )}
              </div>
            </section>

            {/* ADVANCED COLLAPSIBLE ACCORDION */}
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

          {/* RIGHT COLUMN: DIM LINES TABLE & FAST COPY */}
          <div ref={listSectionRef} className="flex min-h-0 flex-1 flex-col gap-2.5 lg:overflow-hidden">
            {/* Table Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-extrabold text-ui-navy">Bảng DIM</span>
                <span className="rounded-full bg-ui-surface-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-ui-text-muted">
                  {snap.lineCount} dòng · {snap.sumDimPcs} kiện
                </span>
              </div>
              {dimEntryHasMergeableDuplicates(lines) ? (
                <button
                  type="button"
                  onClick={handleMergeLines}
                  className="text-[11px] font-bold text-ui-primary hover:underline"
                >
                  Gộp dòng trùng
                </button>
              ) : null}
            </div>

            {/* Editable Table */}
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

            {/* QUICK OPERATIONAL FORMAT STRINGS */}
            {lines.length > 0 ? (
              <div className="shrink-0 rounded-xl border border-ui-border/70 bg-ui-surface p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ui-text-muted">
                    Sao chép chuỗi gửi hệ thống (eSID / SCSC / TCS)
                  </span>
                  {copyFeedback ? (
                    <span className="text-[10px] font-bold text-ui-success">
                      ✓ Đã copy {copyFeedback.toUpperCase()}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleCopyFormatString("scsc")}
                    className="inline-flex items-center gap-1 rounded-lg border border-ui-border bg-ui-surface-muted px-2 py-1 font-mono text-[11px] font-semibold text-ui-text transition hover:bg-ui-surface"
                    title="Định dạng SCSC / eSID: 40-50-30/10 60-40-40/40"
                  >
                    <span>SCSC (D-R-C/K)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyFormatString("tcs")}
                    className="inline-flex items-center gap-1 rounded-lg border border-ui-border bg-ui-surface-muted px-2 py-1 font-mono text-[11px] font-semibold text-ui-text transition hover:bg-ui-surface"
                    title="Định dạng TCS: 40*50*30/10+60*40*40/40"
                  >
                    <span>TCS (D*R*C/K)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyFormatString("cargospot")}
                    className="inline-flex items-center gap-1 rounded-lg border border-ui-border bg-ui-surface-muted px-2 py-1 font-mono text-[11px] font-semibold text-ui-text transition hover:bg-ui-surface"
                    title="Định dạng IATA/Champ: 10/40/50/30 40/60/40/40"
                  >
                    <span>IATA (K/D/R/C)</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* FOOTER TOOLBAR & CTA */}
        <div
          data-testid="dim-footer"
          className="relative z-20 shrink-0 overflow-visible border-t border-ui-border bg-ui-surface px-4 py-2.5"
          style={{
            paddingBottom: `max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px))`,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 overflow-visible">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Button
                type="button"
                size="md"
                variant="ghost"
                onClick={onClose}
                className="min-h-11 px-3 text-ui-text-muted hover:text-ui-text font-semibold text-[12px] sm:text-[13px]"
              >
                Hủy
              </Button>
              <Button
                type="button"
                size="md"
                variant="secondary"
                onClick={handleResetOriginal}
                className="min-h-11 px-3 text-[12px] font-semibold"
                title="Khôi phục trạng thái ban đầu"
              >
                ↺ Làm lại
              </Button>
              {lines.length > 0 ? (
                <Button
                  type="button"
                  size="md"
                  variant="ghost"
                  onClick={() =>
                    onSave({ dimWeightKg: null, dimLines: null, dimDivisor: null })
                  }
                  className="min-h-11 px-2.5 text-[12px] font-semibold text-ui-danger hover:bg-ui-danger/10"
                  title="Xóa toàn bộ dữ liệu DIM của lô"
                >
                  🗑️ Xóa DIM
                </Button>
              ) : null}
              <Button
                type="button"
                size="md"
                variant={showAdvanced ? "secondary" : "ghost"}
                onClick={() => setShowAdvanced((v) => !v)}
                className="min-h-11 px-3 text-[12px] font-semibold text-ui-navy"
                title="Mở / đóng bảng cấu hình nâng cao"
              >
                ⚙️ {showAdvanced ? "Thu gọn" : "Nâng cao"}
              </Button>
            </div>

            <div className="flex flex-1 sm:flex-initial items-center justify-end">
              <Button
                type="button"
                size="lg"
                variant="primary"
                disabled={!snap.canSave}
                onClick={handleSave}
                data-testid="dim-save"
                className="min-h-11 sm:min-h-12 w-full sm:w-auto sm:min-w-[15rem] font-bold text-sm shadow-ui-sm"
              >
                {saveBtnLabel} (Enter / Ctrl+S)
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
