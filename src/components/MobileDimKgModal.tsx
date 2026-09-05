import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { useIsMobile } from "../hooks/useIsMobile";
import { useDraggablePanel } from "../hooks/useDraggablePanel";
import { useDimLinesHistory } from "../hooks/useDimLinesHistory";
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
  SplitPane,
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
import { saveCustomerDimHistory } from "../utils/dimHistoryStorage";
import { loadCustomDimPresets } from "../utils/dimCustomPresetsStorage";
import {
  applyDimTemplateLines,
  customerDimTemplateToPieceLines,
  pieceLinesToCustomerDimTemplate,
  seedLinesFromCustomerDefault,
  type DimTemplateApplyMode,
} from "../utils/dimTemplateApply";
import {
  clearDimDraft,
  dimDraftParentChanged,
  loadDimDraft,
  saveDimDraft,
} from "../utils/dimDraftStorage";

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
  /** Đồng bộ mẫu DIM multi-line lên hồ sơ khách (server). */
  onUpdateCustomers?: (
    customers: CustomerDirectoryEntry[],
  ) => Promise<boolean | void> | boolean | void;
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

type DimCellNav = "next" | "prev" | "up" | "down";

function focusDimCell(row: number, col: number) {
  const el = document.querySelector<HTMLInputElement>(
    `[data-dim-cell="${row}-${col}"]`,
  );
  el?.focus();
  el?.select();
}

function DimNumCell({
  value,
  onCommit,
  ariaLabel,
  rowIndex,
  colIndex,
  rowCount,
}: {
  value: number;
  onCommit: (n: number) => void;
  ariaLabel: string;
  rowIndex: number;
  colIndex: number;
  rowCount: number;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  const commitRaw = (): boolean => {
    const n = Number(raw.replace(",", "."));
    if (Number.isFinite(n) && n > 0) {
      if (n !== value) onCommit(n);
      return true;
    }
    setRaw(String(value));
    return false;
  };

  const navigate = (dir: DimCellNav) => {
    const cols = 4;
    if (dir === "next") {
      if (colIndex < cols - 1) focusDimCell(rowIndex, colIndex + 1);
      else if (rowIndex < rowCount - 1) focusDimCell(rowIndex + 1, 0);
    } else if (dir === "prev") {
      if (colIndex > 0) focusDimCell(rowIndex, colIndex - 1);
      else if (rowIndex > 0) focusDimCell(rowIndex - 1, cols - 1);
    } else if (dir === "down" && rowIndex < rowCount - 1) {
      focusDimCell(rowIndex + 1, colIndex);
    } else if (dir === "up" && rowIndex > 0) {
      focusDimCell(rowIndex - 1, colIndex);
    }
  };

  return (
    <input
      aria-label={ariaLabel}
      data-dim-cell={`${rowIndex}-${colIndex}`}
      inputMode="numeric"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => {
        commitRaw();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitRaw();
          navigate("next");
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          commitRaw();
          navigate("down");
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          commitRaw();
          navigate("up");
        }
      }}
      className="h-9 w-full rounded-md border border-transparent bg-transparent px-1 text-center font-mono text-[13px] font-semibold tabular-nums text-ui-text outline-none hover:border-ui-border focus:border-ui-primary/50 focus:bg-ui-surface focus:ring-1 focus:ring-ui-focus"
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
      <table className="w-full min-w-[40rem] border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-ui-surface-muted shadow-sm">
          <tr className="border-b border-ui-border text-[11px] font-bold uppercase tracking-wide text-ui-text-muted">
            <th className="w-10 px-2.5 py-2 text-left">#</th>
            <th className="w-[5.25rem] px-1.5 py-2 text-center">D</th>
            <th className="w-[5.25rem] px-1.5 py-2 text-center">R</th>
            <th className="w-[5.25rem] px-1.5 py-2 text-center">C</th>
            <th className="w-[4.75rem] px-1.5 py-2 text-center">Kiện</th>
            <th className="w-24 px-2.5 py-2 text-right">Kg</th>
            <th className="w-20 px-2.5 py-2 text-left">Nguồn</th>
            <th className="w-[5.5rem] px-1.5 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-ui-text-muted">
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
                  <td className="px-2.5 py-1 font-mono text-[12px] text-ui-text-muted">{i + 1}</td>
                  <td className="px-1.5 py-1">
                    <DimNumCell
                      ariaLabel={`Dòng ${i + 1} cạnh D`}
                      value={line.lCm}
                      rowIndex={i}
                      colIndex={0}
                      rowCount={rows.length}
                      onCommit={(n) => onPatch(idx, { lCm: Math.round(n) }, true)}
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <DimNumCell
                      ariaLabel={`Dòng ${i + 1} cạnh R`}
                      value={line.wCm}
                      rowIndex={i}
                      colIndex={1}
                      rowCount={rows.length}
                      onCommit={(n) => onPatch(idx, { wCm: Math.round(n) }, true)}
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <DimNumCell
                      ariaLabel={`Dòng ${i + 1} cạnh C`}
                      value={line.hCm}
                      rowIndex={i}
                      colIndex={2}
                      rowCount={rows.length}
                      onCommit={(n) => onPatch(idx, { hCm: Math.round(n) }, true)}
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <DimNumCell
                      ariaLabel={`Dòng ${i + 1} số kiện`}
                      value={line.pcs}
                      rowIndex={i}
                      colIndex={3}
                      rowCount={rows.length}
                      onCommit={(n) => onPatch(idx, { pcs: Math.max(1, Math.floor(n)) })}
                    />
                  </td>
                  <td className="px-2.5 py-1 text-right font-mono text-[13px] font-semibold tabular-nums text-ui-text">
                    {kg != null ? formatLineDimKgDisplay(kg, dimCtx) : "—"}
                  </td>
                  <td className="px-2.5 py-1">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                        tone === "measured"
                          ? "bg-ui-success/15 text-ui-success"
                          : "bg-ui-surface-muted text-ui-text-muted"
                      }`}
                    >
                      {tone === "measured" ? "Đo" : line.locked ? "Khóa" : "Ước"}
                    </span>
                  </td>
                  <td className="px-1.5 py-1">
                    <div className="flex justify-end gap-0.5">
                      {tone === "estimated" ? (
                        <button
                          type="button"
                          onClick={() => onToggleLock(idx)}
                          className="h-9 rounded-md px-2 text-[11px] font-bold text-ui-text-muted hover:bg-ui-surface-muted"
                          title={line.locked ? "Mở khóa" : "Khóa dòng"}
                        >
                          {line.locked ? "Khóa" : "Ghim"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onRemove(idx)}
                        className="h-9 rounded-md px-2 text-[11px] font-bold text-ui-danger hover:bg-ui-danger/10"
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
              <td className="px-2.5 py-2 text-[11px] uppercase text-ui-text-muted" colSpan={4}>
                Tổng
              </td>
              <td className="px-2.5 py-2 text-center font-mono text-[13px] tabular-nums">{sumPcs}</td>
              <td className="px-2.5 py-2 text-right font-mono text-[13px] tabular-nums text-ui-navy">
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
  lockFixedKg,
  setLockFixedKg,
  randomTargetKgInput,
  setRandomTargetKgInput,
  randomLineCountInput,
  setRandomLineCountInput,
  autoRandomAfterAdd,
  setAutoRandomAfterAdd,
  hasEstimated,
  onGenerate,
  onClearEstimated,
}: {
  lot: { declaredKg: number | null | undefined; declaredPcs: number | null | undefined };
  snap: {
    remainingPcs: number;
    sumEstimatedPcs: number;
    targetLineCount: { min: number; max: number } | null;
  };
  targetRatioPercent: number;
  setTargetRatioPercent: (v: number) => void;
  lockFixedKg: boolean;
  setLockFixedKg: (v: boolean) => void;
  randomTargetKgInput: string;
  setRandomTargetKgInput: (v: string) => void;
  randomLineCountInput: string;
  setRandomLineCountInput: (v: string) => void;
  autoRandomAfterAdd: boolean;
  setAutoRandomAfterAdd: (v: boolean) => void;
  hasEstimated: boolean;
  onGenerate: () => void;
  onClearEstimated: () => void;
}) {
  const ratioKg =
    lot.declaredKg != null && lot.declaredKg > 0
      ? Math.round(lot.declaredKg * (targetRatioPercent / 100))
      : null;
  const canGenerate = snap.remainingPcs > 0;

  return (
    <div className="space-y-2.5 text-xs" data-testid="dim-estimate-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px] font-bold text-ui-navy">Bù kiện ước tính</span>
          <p className="text-[10px] text-ui-text-muted">
            {canGenerate
              ? `Còn thiếu ${snap.remainingPcs} kiện · mục tiêu dưới kg lô`
              : "Đã đủ kiện — xóa ước tính chưa khóa nếu muốn sinh lại"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="min-h-11 px-3"
          title={
            canGenerate
              ? hasEstimated
                ? "Sinh lại phân bổ kiện ước tính"
                : "Bù kiện còn thiếu bằng dòng ước tính"
              : "Không còn kiện thiếu"
          }
        >
          {hasEstimated && canGenerate ? "Sinh lại" : "Bù kiện ước tính"}
        </Button>
      </div>

      {lot.declaredKg != null && lot.declaredKg > 0 ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-ui-text-muted">
            <span>Tỉ lệ DIM / Gross</span>
            <span className="tabular-nums text-ui-navy">
              {targetRatioPercent.toFixed(1)}%
              {ratioKg != null && !lockFixedKg ? ` · ~${ratioKg} kg` : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {[92, 95, 98].map((p) => (
              <button
                key={p}
                type="button"
                disabled={lockFixedKg}
                onClick={() => {
                  setTargetRatioPercent(p);
                  setRandomTargetKgInput("");
                }}
                className={`min-h-9 rounded-lg px-2.5 text-[11px] font-bold tabular-nums transition ${
                  !lockFixedKg && Math.abs(targetRatioPercent - p) < 0.26
                    ? "bg-ui-primary text-white"
                    : "border border-ui-border bg-ui-surface-muted text-ui-text hover:bg-ui-surface disabled:opacity-40"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
          <input
            type="range"
            min={85}
            max={99.9}
            step={0.5}
            value={targetRatioPercent}
            disabled={lockFixedKg}
            onChange={(e) => {
              setTargetRatioPercent(Number(e.target.value));
              setRandomTargetKgInput("");
            }}
            className="h-2 w-full cursor-pointer rounded-lg bg-ui-surface-muted accent-ui-primary disabled:cursor-not-allowed disabled:opacity-40"
          />
        </div>
      ) : null}

      <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-ui-text">
        <input
          type="checkbox"
          checked={lockFixedKg}
          onChange={(e) => {
            const on = e.target.checked;
            setLockFixedKg(on);
            if (on && !randomTargetKgInput.trim() && ratioKg != null) {
              setRandomTargetKgInput(String(ratioKg));
            }
            if (!on) setRandomTargetKgInput("");
          }}
          className="rounded text-ui-primary focus:ring-ui-focus"
        />
        Khóa kg DIM cố định
      </label>

      <div className={`grid gap-1.5 ${lockFixedKg ? "grid-cols-2" : "grid-cols-1"}`}>
        {lockFixedKg ? (
          <label>
            <span className="mb-0.5 block text-[9px] font-bold uppercase text-ui-text-muted">
              Kg DIM cố định
            </span>
            <Input
              type="number"
              min={1}
              step={0.1}
              inputMode="decimal"
              value={randomTargetKgInput}
              onChange={(e) => setRandomTargetKgInput(e.target.value)}
              placeholder={ratioKg != null ? String(ratioKg) : "950"}
              className="text-center text-sm font-semibold tabular-nums"
            />
          </label>
        ) : null}
        <label>
          <span className="mb-0.5 block text-[9px] font-bold uppercase text-ui-text-muted">
            Số dòng ước tính
          </span>
          <Input
            type="number"
            min={1}
            max={Math.max(1, snap.remainingPcs)}
            inputMode="numeric"
            value={randomLineCountInput}
            onChange={(e) => setRandomLineCountInput(e.target.value)}
            placeholder={
              snap.targetLineCount
                ? `vd. ${Math.round((snap.targetLineCount.min + snap.targetLineCount.max) / 2)}`
                : String(Math.min(Math.max(1, snap.remainingPcs), 10))
            }
            className="text-center text-sm font-semibold tabular-nums"
          />
          {snap.targetLineCount ? (
            <span className="mt-0.5 block text-[9px] text-ui-text-muted">
              Lô lớn: gợi ý {snap.targetLineCount.min}–{snap.targetLineCount.max} dòng
            </span>
          ) : null}
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
          Tự bù sau khi Thêm
        </label>
        {snap.sumEstimatedPcs > 0 ? (
          <button
            type="button"
            onClick={onClearEstimated}
            className="font-bold text-ui-danger hover:underline"
          >
            Xóa chưa khóa
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function MobileDimKgModal({
  row,
  customerDirectory,
  onClose,
  onSave,
  onUpdateCustomers,
}: MobileDimKgModalProps) {
  useOpsMobileOverlayLock(true);
  const keyboardInset = useVisualViewportBottomInset(true);
  const isMobile = useIsMobile(640);
  const {
    panelRef: dragPanelRef,
    offset: dragOffset,
    size: dragSize,
    dragging: isDraggingPanel,
    resizing: isResizingPanel,
    nudgeByKey,
    handleProps: dragHandleProps,
    resizeHandleProps,
    resizable: panelResizable,
  } = useDraggablePanel({
    enabled: !isMobile,
    persistKey: "tecsops_dim_modal_layout_v1",
    resizable: true,
  });

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

  const initialLines = useMemo(() => {
    const draft = loadDimDraft(row.id);
    if (draft?.lines.length) {
      // Ưu tiên draft đang soạn nếu lô chưa có DIM lưu, hoặc draft mới hơn thao tác trống
      if (!row.dimLines?.length) {
        return consolidateDimPieceLines(cloneLines(draft.lines));
      }
    }
    if (row.dimLines?.length) {
      return consolidateDimPieceLines(cloneLines(row.dimLines));
    }
    const seeded = seedLinesFromCustomerDefault(matchedCustomer, row.pcs);
    return seeded ? consolidateDimPieceLines(seeded) : [];
  }, []); // seed once on open

  const {
    lines,
    setLines,
    replaceLines,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDimLinesHistory(initialLines);

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
  const [actionNote, setActionNote] = useState<string | null>(() => {
    const draft = loadDimDraft(row.id);
    if (draft?.lines.length && !row.dimLines?.length) {
      return "Đã khôi phục bản nháp DIM (chưa lưu).";
    }
    if (row.dimLines?.length) return null;
    if (initialLines.length > 0) {
      return "Đã áp mẫu kích thước mặc định của khách (có thể Ctrl+Z / Thay mẫu).";
    }
    return null;
  });
  const [targetRatioPercent, setTargetRatioPercent] = useState(95.0);
  const [lockFixedKg, setLockFixedKg] = useState(false);
  const [randomLineCountInput, setRandomLineCountInput] = useState("");
  const [randomTargetKgInput, setRandomTargetKgInput] = useState("");
  const [regenerationNonce, setRegenerationNonce] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dimTemplates, setDimTemplates] = useState<DimTemplate[]>(() => loadDimTemplates());
  const [showSaveTemplateForm, setShowSaveTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [templateApplyMode, setTemplateApplyMode] =
    useState<DimTemplateApplyMode>("replace");

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

  // C3: autosave draft theo shipmentId
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (lines.length === 0) {
        clearDimDraft(row.id);
        return;
      }
      saveDimDraft(row.id, lines, {
        declaredPcs: lot.declaredPcs ?? null,
        declaredKg: lot.declaredKg ?? null,
      });
    }, 450);
    return () => window.clearTimeout(t);
  }, [lines, lot.declaredPcs, lot.declaredKg, row.id]);

  // C3: cảnh báo khi pcs/kg lô đổi so với draft
  useEffect(() => {
    const draft = loadDimDraft(row.id);
    if (dimDraftParentChanged(draft, row.pcs ?? null, row.kg ?? null)) {
      setActionNote(
        `⚠ Lô đổi kiện/kg (nháp: ${draft?.declaredPcs ?? "—"}k/${draft?.declaredKg ?? "—"}kg → hiện: ${row.pcs ?? "—"}k/${row.kg ?? "—"}kg). Kiểm tra lại bảng DIM.`,
      );
    }
  }, [row.id, row.pcs, row.kg]);

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

    const applied = applyDimTemplateLines(
      lines,
      templatePieceLines,
      templateApplyMode,
      lot.declaredPcs,
    );

    const modeLabel =
      templateApplyMode === "replace"
        ? "thay"
        : templateApplyMode === "insert"
          ? "chèn"
          : "scale kiện";

    const templatePcs = applied.filter((l) => !l.estimated).reduce((s, l) => s + l.pcs, 0);
    const remainingAfterTemplate =
      lot.declaredPcs != null ? Math.max(0, lot.declaredPcs - templatePcs) : 0;

    if (
      templateApplyMode !== "insert" &&
      autoRandomAfterAdd &&
      randomParams &&
      remainingAfterTemplate > 0
    ) {
      const fill = dimEntryRandomFill(applied, lot, {
        ...randomParams,
        regenerationNonce: regenerationNonce + 1,
        targetRatioPercent: lockFixedKg ? undefined : targetRatioPercent,
        targetTotalDimKg: lockFixedKg ? parseTargetDimKgInput(randomTargetKgInput) : undefined,
      });
      if (fill.ok) {
        setRegenerationNonce((n) => n + 1);
        applyMutation(
          fill.lines,
          `Đã ${modeLabel} mẫu "${t.name}" và tự động điền đủ kiện.`,
          { scrollList: true },
        );
        return;
      }
    }
    applyMutation(
      applied,
      `Đã ${modeLabel} mẫu "${t.name}" (${templatePcs} kiện đo).`,
      { scrollList: true },
    );
  };

  const handleSaveCurrentTemplate = () => {
    const nameToSave =
      newTemplateName.trim() || `Mẫu ${row.customerCode || "DIM"} (${snap.sumDimPcs}k)`;
    void (async () => {
      if (matchedCustomer && onUpdateCustomers && customerDirectory) {
        const serverTmpl = pieceLinesToCustomerDimTemplate({
          label: nameToSave,
          lines,
          isDefault: !(matchedCustomer.savedDimTemplates?.length),
        });
        if (!serverTmpl) {
          setActionNote("❌ Cần ít nhất 1 dòng DIM để lưu mẫu khách.");
          return;
        }
        const next = customerDirectory.map((c) => {
          if (c.id !== matchedCustomer.id) return c;
          const prev = c.savedDimTemplates ?? [];
          return {
            ...c,
            savedDimTemplates: [serverTmpl, ...prev.filter((t) => t.id !== serverTmpl.id)].slice(
              0,
              20,
            ),
            defaultDimTemplateId: c.defaultDimTemplateId || serverTmpl.id,
          };
        });
        try {
          const ok = await onUpdateCustomers([...next]);
          if (ok === false) {
            setActionNote("❌ Không đồng bộ được mẫu lên hồ sơ khách.");
            return;
          }
          setNewTemplateName("");
          setShowSaveTemplateForm(false);
          setActionNote(`☁ Đã lưu mẫu "${nameToSave}" lên hồ sơ khách (đồng bộ server).`);
          return;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          setActionNote(`❌ Lỗi sync mẫu khách: ${message}`);
          return;
        }
      }
      try {
        const nextList = saveDimTemplate({
          name: nameToSave,
          lines,
          customerCode: row.customerCode,
        });
        setDimTemplates(nextList);
        setNewTemplateName("");
        setShowSaveTemplateForm(false);
        setActionNote(`Đã lưu mẫu local "${nameToSave}".`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setActionNote(`❌ Lỗi lưu mẫu: ${message}`);
      }
    })();
  };

  const handleApplyCustomerServerTemplate = (tmplId: string) => {
    const tmpl = matchedCustomer?.savedDimTemplates?.find((t) => t.id === tmplId);
    if (!tmpl) return;
    const piece =
      templateApplyMode === "scale"
        ? customerDimTemplateToPieceLines(tmpl, lot.declaredPcs)
        : customerDimTemplateToPieceLines(tmpl, null);
    const applied = applyDimTemplateLines(
      lines,
      piece,
      templateApplyMode === "scale" ? "replace" : templateApplyMode,
      lot.declaredPcs,
    );
    const pcs = applied.filter((l) => !l.estimated).reduce((s, l) => s + l.pcs, 0);
    applyMutation(applied, `Đã áp mẫu khách "${tmpl.label}" (${pcs} kiện).`, {
      scrollList: true,
    });
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
      randomFillParams: randomParams
        ? {
            ...randomParams,
            regenerationNonce: regenerationNonce + 1,
            targetRatioPercent: lockFixedKg ? undefined : targetRatioPercent,
            targetTotalDimKg: lockFixedKg ? parseTargetDimKgInput(randomTargetKgInput) : undefined,
          }
        : undefined,
    });
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    if (autoRandomAfterAdd) setRegenerationNonce((n) => n + 1);
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
    type: "profile" | "recent" | "custom" | "standard";
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

    // 3. Legacy custom presets (local) — vẫn hiện nếu còn trong storage
    for (const item of loadCustomDimPresets()) {
      const key = `${item.lCm}x${item.wCm}x${item.hCm}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          id: `custom-${item.id}`,
          label: item.label || `${item.lCm}×${item.wCm}×${item.hCm}`,
          d: item.lCm,
          r: item.wCm,
          c: item.hCm,
          type: "custom",
          icon: "📌",
        });
      }
    }

    // 4. Fallback standard presets (📦)
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
    const r = dimEntryAddMeasuredFromCombo(lines, combo, lot, {
      thenRandomFill: autoRandomAfterAdd,
      randomFillParams: randomParams
        ? {
            ...randomParams,
            regenerationNonce: regenerationNonce + 1,
            targetRatioPercent: lockFixedKg ? undefined : targetRatioPercent,
            targetTotalDimKg: lockFixedKg ? parseTargetDimKgInput(randomTargetKgInput) : undefined,
          }
        : undefined,
    });
    if (!r.ok) {
      setComboInput(combo);
      setActionNote(`❌ ${r.error} — đã điền vào ô nhập.`);
      comboInputRef.current?.focus();
      return;
    }
    if (autoRandomAfterAdd) setRegenerationNonce((n) => n + 1);
    applyMutation(
      r.lines,
      r.note ??
        `Đã thêm ${p.label || `${p.d}×${p.r}×${p.c}`} × ${pcsVal} kiện.`,
      { scrollList: true },
    );
    setComboInput("");
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
      randomFillParams: randomParams
        ? {
            ...randomParams,
            regenerationNonce: regenerationNonce + 1,
            targetRatioPercent: lockFixedKg ? undefined : targetRatioPercent,
            targetTotalDimKg: lockFixedKg ? parseTargetDimKgInput(randomTargetKgInput) : undefined,
          }
        : undefined,
    });
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    if (autoRandomAfterAdd) setRegenerationNonce((n) => n + 1);
    applyMutation(r.lines, r.note ?? "Đã nạp kích thước từ dán trực tiếp.", {
      scrollList: true,
    });
  };

  const handleRandom = () => {
    if (!randomParams) return;
    const nextNonce = regenerationNonce + 1;
    setRegenerationNonce(nextNonce);
    const targetKg = lockFixedKg ? parseTargetDimKgInput(randomTargetKgInput) : undefined;
    const lineCount = parseRandomLineCountInput(randomLineCountInput);
    const r = dimEntryRandomFill(lines, lot, {
      ...randomParams,
      regenerationNonce: nextNonce,
      targetRatioPercent: lockFixedKg ? undefined : targetRatioPercent,
      targetTotalDimKg: targetKg,
      targetEstimatedLineCount: lineCount,
    });
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    applyMutation(r.lines, r.note ?? "Đã bù kiện ước tính.", { scrollList: true });
  };

  const openAdvancedPanel = useCallback(() => {
    setShowAdvanced(true);
    window.requestAnimationFrame(() => {
      advancedRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const handleResetOriginal = () => {
    replaceLines(consolidateDimPieceLines(cloneLines(row.dimLines)));
    setComboInput("");
    setRegenerationNonce(0);
    setActionNote("Đã hoàn tác về trạng thái ban đầu (xóa lịch sử undo).");
  };

  const handleSave = () => {
    const v = dimEntryValidateSave(lines, lot, divisor, dimCtx);
    if (!v.ok) {
      setActionNote(`❌ ${v.error}`);
      return;
    }
    if (customerKey && v.lines.length > 0) {
      const measured = v.lines.filter((l) => !l.estimated);
      const forRecent = measured.length > 0 ? measured : v.lines;
      recordCustomerRecentDims(
        customerKey,
        forRecent.map((l) => ({ lCm: l.lCm, wCm: l.wCm, hCm: l.hCm })),
      );
      if (measured.length > 0) {
        saveCustomerDimHistory(
          customerKey,
          measured.map((l) => ({ lCm: l.lCm, wCm: l.wCm, hCm: l.hCm })),
        );
      }
    }
    clearDimDraft(row.id);
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

  /** Copy chuỗi format terminal hệ thống hàng không. Dòng ước tính gắn suffix `*`. */
  const handleCopyFormatString = async (format: "scsc" | "tcs" | "cargospot") => {
    if (!lines.length) return;
    const mark = (base: string, estimated?: boolean) => (estimated ? `${base}*` : base);
    let str = "";
    if (format === "scsc") {
      str = lines.map((l) => mark(`${l.lCm}-${l.wCm}-${l.hCm}/${l.pcs}`, l.estimated)).join(" ");
    } else if (format === "tcs") {
      str = lines.map((l) => mark(`${l.lCm}*${l.wCm}*${l.hCm}/${l.pcs}`, l.estimated)).join("+");
    } else {
      str = lines.map((l) => mark(`${l.pcs}/${l.lCm}/${l.wCm}/${l.hCm}`, l.estimated)).join(" ");
    }
    const estCount = lines.filter((l) => l.estimated).length;
    try {
      await navigator.clipboard.writeText(str);
      setCopyFeedback(format);
      setTimeout(() => setCopyFeedback(null), 2000);
      const estHint = estCount > 0 ? ` (${estCount} dòng ước gắn *)` : "";
      setActionNote(`📋 Đã copy chuỗi format ${format.toUpperCase()}${estHint}: ${str}`);
    } catch {
      setActionNote("❌ Không thể copy vào clipboard.");
    }
  };

  // Ctrl+S lưu · Ctrl+Enter lưu · Ctrl+Z/Y undo/redo · Ctrl+B bù · Ctrl+G gộp
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const inCombo =
        target instanceof HTMLTextAreaElement && target === comboInputRef.current;
      const inPlainText =
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement &&
          target.type === "text" &&
          !target.hasAttribute("data-dim-cell"));

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (snap.canSave) handleSave();
        return;
      }
      if (mod && e.key === "Enter") {
        e.preventDefault();
        if (snap.canSave) handleSave();
        return;
      }
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (inCombo || inPlainText) return;
        e.preventDefault();
        if (undo()) setActionNote("↩ Đã hoàn tác một bước.");
        return;
      }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        if (inCombo || inPlainText) return;
        e.preventDefault();
        if (redo()) setActionNote("↪ Đã làm lại một bước.");
        return;
      }
      if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (snap.remainingPcs > 0) handleRandom();
        else setActionNote("Không còn kiện thiếu để bù.");
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        handleMergeLines();
        return;
      }
      if (
        mod &&
        !inCombo &&
        !inPlainText &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        nudgeByKey(e.key, e.shiftKey ? 48 : 16);
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
        ref={dragPanelRef}
        className="relative flex h-[98dvh] max-h-[98dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-ui-border bg-ui-surface shadow-ui-lg sm:h-[min(96dvh,980px)] sm:max-w-[min(98vw,72rem)] sm:rounded-2xl lg:max-w-[min(98vw,90rem)] xl:max-w-[min(98vw,96rem)]"
        data-testid="dim-modal-shell"
        style={
          isMobile
            ? undefined
            : {
                transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
                willChange: isDraggingPanel || isResizingPanel ? "transform" : undefined,
                ...(dragSize
                  ? {
                      width: dragSize.width,
                      height: dragSize.height,
                      maxWidth: "98vw",
                      maxHeight: "98dvh",
                    }
                  : {}),
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER — kéo được trên desktop */}
        <div
          data-testid="dim-modal-drag-handle"
          title={
            isMobile
              ? undefined
              : "Kéo để di chuyển · double-click về giữa · Ctrl+mũi tên tinh chỉnh"
          }
          className={`shrink-0 border-b border-ui-border bg-ui-surface px-4 pb-2.5 pt-3 sm:px-5 ${
            isMobile
              ? ""
              : isDraggingPanel
                ? "cursor-grabbing select-none"
                : "cursor-grab select-none touch-none"
          }`}
          {...(isMobile ? {} : dragHandleProps)}
        >
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
              data-no-drag
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

        {/* WORKSPACE BODY - 2 COLUMNS ON DESKTOP (kéo được) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-ui-background/40 p-3 sm:p-4 lg:overflow-hidden">
          <SplitPane
            surfaceId="dim_modal_workspace"
            breakpoint="lg"
            unit="px"
            defaultPrimary={416}
            minPrimary={300}
            maxPrimary={560}
            minSecondaryPx={360}
            className="min-h-0 flex-1 gap-3 lg:gap-0"
            primary={
          <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
            {/* LEFT COLUMN: FAST ENTRY & PRESETS */}
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
                      title="Ghim kích thước đang nhập vào danh sách gần đây của khách (trên máy này)"
                    >
                      + Ghim gần đây
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
                          : p.type === "recent" || p.type === "custom"
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-ui-text-muted">
                        Mẫu DIM
                      </p>
                      <div
                        className="inline-flex rounded-lg border border-ui-border bg-ui-surface-muted p-0.5"
                        role="group"
                        aria-label="Chế độ áp mẫu"
                      >
                        {(
                          [
                            ["replace", "Thay"],
                            ["insert", "Chèn"],
                            ["scale", "Scale"],
                          ] as const
                        ).map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setTemplateApplyMode(mode)}
                            className={`min-h-8 rounded-md px-2 text-[10px] font-bold ${
                              templateApplyMode === mode
                                ? "bg-ui-primary text-white"
                                : "text-ui-text-muted hover:text-ui-text"
                            }`}
                            title={
                              mode === "replace"
                                ? "Thay toàn bộ bảng bằng mẫu"
                                : mode === "insert"
                                  ? "Chèn dòng mẫu vào bảng hiện tại"
                                  : "Scale kiện mẫu theo tổng kiện lô"
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {matchedCustomer?.savedDimTemplates?.length ? (
                      <div className="space-y-1" data-testid="dim-customer-server-templates">
                        <p className="text-[10px] font-semibold text-ui-text-muted">
                          Mẫu khách (server)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {matchedCustomer.savedDimTemplates.map((tmpl) => {
                            const multi = (tmpl.lines?.length ?? 0) > 1;
                            const pcs =
                              tmpl.lines?.reduce((s, l) => s + l.pcs, 0) ??
                              null;
                            return (
                              <button
                                key={tmpl.id}
                                type="button"
                                onClick={() => handleApplyCustomerServerTemplate(tmpl.id)}
                                className="min-h-11 rounded-lg border border-teal-300/80 bg-teal-50/70 px-2.5 text-[11px] font-semibold text-teal-950 hover:bg-teal-100"
                                title={
                                  multi
                                    ? `${tmpl.label} · ${tmpl.lines!.length} dòng`
                                    : `${tmpl.lCm}×${tmpl.wCm}×${tmpl.hCm}`
                                }
                              >
                                ☁ {tmpl.label}
                                {pcs != null ? (
                                  <span className="ml-1 tabular-nums text-teal-700/80">{pcs}</span>
                                ) : null}
                                {multi ? (
                                  <span className="ml-1 text-[9px] font-bold text-teal-700">
                                    ×{tmpl.lines!.length}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
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
                          {matchedCustomer && onUpdateCustomers ? "Lưu lên khách" : "Lưu mẫu"}
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

                  <EstimationConfigPanel
                    lot={lot}
                    snap={snap}
                    targetRatioPercent={targetRatioPercent}
                    setTargetRatioPercent={setTargetRatioPercent}
                    lockFixedKg={lockFixedKg}
                    setLockFixedKg={setLockFixedKg}
                    randomTargetKgInput={randomTargetKgInput}
                    setRandomTargetKgInput={setRandomTargetKgInput}
                    randomLineCountInput={randomLineCountInput}
                    setRandomLineCountInput={setRandomLineCountInput}
                    autoRandomAfterAdd={autoRandomAfterAdd}
                    setAutoRandomAfterAdd={setAutoRandomAfterAdd}
                    hasEstimated={snap.estimatedLineCount > 0}
                    onGenerate={handleRandom}
                    onClearEstimated={() =>
                      applyMutation(dimEntryClearEstimated(lines), "Đã xóa kiện ước tính chưa khóa.")
                    }
                  />
                </div>
              ) : null}
            </div>
          </div>
            }
            secondary={
          <div ref={listSectionRef} className="flex min-h-0 flex-1 flex-col gap-2.5 lg:overflow-hidden">
            {/* RIGHT COLUMN: DIM LINES TABLE & FAST COPY */}
            {/* Table Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-extrabold text-ui-navy">Bảng DIM</span>
                <span className="rounded-full bg-ui-surface-muted px-2.5 py-1 text-[11px] font-bold tabular-nums text-ui-text-muted">
                  {snap.lineCount} dòng · {snap.sumDimPcs}
                  {lot.declaredPcs != null ? `/${lot.declaredPcs}` : ""} kiện
                  {snap.estimatedLineCount > 0
                    ? ` · ${snap.sumEstimatedPcs} ước`
                    : ""}
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
            }
          />
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
                title="Khôi phục trạng thái ban đầu và xóa lịch sử undo"
              >
                ↺ Làm lại
              </Button>
              <Button
                type="button"
                size="md"
                variant="ghost"
                disabled={!canUndo}
                onClick={() => {
                  if (undo()) setActionNote("↩ Đã hoàn tác một bước.");
                }}
                className="min-h-11 px-2.5 text-[12px] font-semibold disabled:opacity-40"
                title="Hoàn tác (Ctrl+Z)"
                data-testid="dim-undo"
              >
                Undo
              </Button>
              <Button
                type="button"
                size="md"
                variant="ghost"
                disabled={!canRedo}
                onClick={() => {
                  if (redo()) setActionNote("↪ Đã làm lại một bước.");
                }}
                className="min-h-11 px-2.5 text-[12px] font-semibold disabled:opacity-40"
                title="Làm lại (Ctrl+Y)"
                data-testid="dim-redo"
              >
                Redo
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
                onClick={() => {
                  if (showAdvanced) {
                    setShowAdvanced(false);
                  } else {
                    openAdvancedPanel();
                  }
                }}
                className="min-h-11 px-3 text-[12px] font-semibold text-ui-navy"
                title="Mở / đóng bảng cấu hình nâng cao"
              >
                {showAdvanced ? "Thu gọn" : "Nâng cao"}
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
                {saveBtnLabel} (Ctrl+Enter / Ctrl+S)
              </Button>
            </div>
          </div>
        </div>

        {panelResizable ? (
          <>
            <div
              className="absolute bottom-0 right-0 z-30 h-4 w-4 cursor-se-resize"
              title="Kéo góc để đổi kích thước"
              {...resizeHandleProps("se")}
            />
            <div
              className="absolute bottom-0 left-1/2 z-30 h-3 w-10 -translate-x-1/2 cursor-s-resize"
              {...resizeHandleProps("s")}
            />
            <div
              className="absolute right-0 top-1/2 z-30 h-10 w-3 -translate-y-1/2 cursor-e-resize"
              {...resizeHandleProps("e")}
            />
            <div
              className="absolute left-0 top-1/2 z-30 h-10 w-3 -translate-y-1/2 cursor-w-resize"
              {...resizeHandleProps("w")}
            />
            <div
              className="absolute left-1/2 top-0 z-30 h-3 w-10 -translate-x-1/2 cursor-n-resize"
              {...resizeHandleProps("n")}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
