import { useCallback, useMemo, useRef, useState } from "react";
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

/** Thanh 3 bước đổi màu trạng thái trực quan */
function DimWorkflowSteps({
  snap,
}: {
  snap: {
    sumMeasuredPcs: number;
    remainingPcs: number;
    pcsMatch: boolean;
    pcsExcess: boolean;
  };
}) {
  return (
    <nav className="flex gap-1.5 rounded-2xl border border-black/[0.06] bg-slate-100/70 p-1">
      {/* Bước 1 */}
      <div
        className={`min-w-0 flex-1 rounded-xl px-2 py-1.5 text-center transition-all ${
          snap.sumMeasuredPcs > 0
            ? "bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-xs"
            : "bg-white text-slate-700 shadow-xs"
        }`}
      >
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Bước 1</p>
        <p className="truncate text-[11px] font-bold">
          {snap.sumMeasuredPcs > 0 ? `✅ Đo ${snap.sumMeasuredPcs} kiện` : "1. Đo mẫu"}
        </p>
      </div>

      {/* Bước 2 */}
      <div
        className={`min-w-0 flex-1 rounded-xl px-2 py-1.5 text-center transition-all ${
          snap.pcsMatch
            ? "bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-xs"
            : snap.remainingPcs > 0
              ? "bg-amber-50 text-amber-900 border border-amber-300 animate-pulse shadow-xs"
              : "bg-white text-slate-700 shadow-xs"
        }`}
      >
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Bước 2</p>
        <p className="truncate text-[11px] font-bold">
          {snap.pcsMatch
            ? "✅ Đủ kiện"
            : snap.remainingPcs > 0
              ? `⚠️ Thiếu ${snap.remainingPcs} kiện`
              : "2. Ước tính"}
        </p>
      </div>

      {/* Bước 3 */}
      <div
        className={`min-w-0 flex-1 rounded-xl px-2 py-1.5 text-center transition-all ${
          snap.pcsMatch
            ? "bg-emerald-600 text-white font-extrabold shadow-md scale-[1.02]"
            : "bg-white text-slate-400 shadow-xs"
        }`}
      >
        <p className="text-[9px] font-bold uppercase tracking-wider opacity-80">Bước 3</p>
        <p className="truncate text-[11px] font-bold">
          {snap.pcsMatch ? "🟢 SẴN SÀNG LƯU" : "3. Kiểm & Lưu"}
        </p>
      </div>
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
                      {line.locked ? "🔒 Khóa" : "🔓 Khóa"}
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

export function MobileDimKgModal({ row, onClose, onSave }: MobileDimKgModalProps) {
  const [lines, setLines] = useState<DimPieceLine[]>(() =>
    consolidateDimPieceLines(cloneLines(row.dimLines))
  );

  const [comboInput, setComboInput] = useState("");
  const [inputL, setInputL] = useState("");
  const [inputW, setInputW] = useState("");
  const [inputH, setInputH] = useState("");
  const [inputPcs, setInputPcs] = useState("");

  const refL = useRef<HTMLInputElement>(null);
  const refW = useRef<HTMLInputElement>(null);
  const refH = useRef<HTMLInputElement>(null);
  const refPcs = useRef<HTMLInputElement>(null);

  const [autoRandomAfterAdd, setAutoRandomAfterAdd] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [randomNonce, setRandomNonce] = useState(0);
  const [targetRatioPercent, setTargetRatioPercent] = useState(95.0);
  const [randomLineCountInput, setRandomLineCountInput] = useState("");
  const [randomTargetKgInput, setRandomTargetKgInput] = useState("");

  const [showEstimationConfig, setShowEstimationConfig] = useState(false);
  const [showManualSection, setShowManualSection] = useState(false);

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

  const handleAddRowFromInputs = () => {
    const l = Number(inputL);
    const w = Number(inputW);
    const h = Number(inputH);
    const p = Number(inputPcs) || 1;

    if (!l || l <= 0 || !w || w <= 0 || !h || h <= 0) {
      setActionNote("❌ Dài, Rộng, Cao phải là số dương.");
      return;
    }

    const currentTotalPcs = lines.reduce((s, x) => s + x.pcs, 0);
    if (lot.declaredPcs != null && currentTotalPcs + p > lot.declaredPcs) {
      setActionNote(`❌ Tổng kiện (${currentTotalPcs + p}) vượt quá số kiện của lô hàng (${lot.declaredPcs}).`);
      return;
    }

    const newLine: DimPieceLine = { lCm: l, wCm: w, hCm: h, pcs: p, estimated: false };
    const nextLines = [...lines, newLine];

    if (autoRandomAfterAdd && randomParams) {
      const fill = dimEntryRandomFill(nextLines, lot, {
        ...randomParams,
        targetRatioPercent,
      });
      if (fill.ok) {
        applyMutation(fill.lines, fill.note ?? "Đã thêm dòng và tự động sinh ngẫu nhiên.");
      } else {
        applyMutation(nextLines, `Đã thêm dòng. Tự sinh ngẫu nhiên lỗi: ${fill.error}`);
      }
    } else {
      applyMutation(nextLines, "Đã thêm dòng đo mới.");
    }

    setInputL("");
    setInputW("");
    setInputH("");
    setInputPcs("");
    refL.current?.focus();
  };

  const handleMerge = () => {
    const r = dimEntryMergeLines(lines);
    if (!r.ok) {
      setActionNote(`❌ ${r.error}`);
      return;
    }
    applyMutation(r.lines, "Đã gộp các dòng cùng kích thước.");
  };

  // Thao tác Sinh ngẫu nhiên
  const handleRandom = (overrideRatio?: number) => {
    if (!randomParams) {
      setActionNote("❌ Cần bổ sung Số kiện lô và Kg lô để sinh ngẫu nhiên.");
      return;
    }
    const targetEstimatedLineCount = parseRandomLineCountInput(randomLineCountInput);
    const targetTotalDimKg = parseTargetDimKgInput(randomTargetKgInput);
    const ratio = overrideRatio ?? (randomTargetKgInput ? undefined : targetRatioPercent);

    // Nếu chưa có dòng đo thật nào, dùng mẫu tiêu chuẩn làm gốc
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

  // Thao tác 1-CLICK TỰ ĐỘNG TẠO ĐỦ DIM
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
      `🎉 ĐÃ TỰ ĐỘNG ĐIỀN ĐỦ ${lot.declaredPcs}/${lot.declaredPcs} KIỆN! BẤM NÚT 'LƯU DIM' BÊN DƯỚI.`
    );
  };

  // Nút Safety Reset - Làm lại từ đầu
  const handleResetOriginal = () => {
    const original = consolidateDimPieceLines(cloneLines(row.dimLines));
    setLines(original);
    setComboInput("");
    setInputL("");
    setInputW("");
    setInputH("");
    setInputPcs("");
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

  return (
    <div
      className="no-print fixed inset-0 z-[480] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4 md:p-6 transition-all duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dim-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[1.6rem] border border-black/[0.08] bg-white shadow-2xl transition-all sm:max-h-[min(90dvh,860px)] sm:max-w-xl sm:rounded-[1.6rem] md:max-h-[min(90dvh,920px)] md:max-w-3xl lg:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + Ngữ cảnh lô */}
        <div className="shrink-0 border-b border-black/[0.06] bg-gradient-to-b from-slate-50 to-white px-4 pb-3 pt-3.5 sm:px-5 md:px-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="dim-modal-title" className="text-[1.1rem] font-bold tracking-tight text-slate-800">
                Nhập DIM
              </h2>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                {row.awb} · {row.flight}
                {airlineRule ? ` · ${airlineRule.codes.join("/")}` : ""}
              </p>
            </div>
            {airlineRule ? (
              <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-200">
                SCSC · {airlineRule.chargeableNote.slice(0, 24)}
              </span>
            ) : null}
          </div>

          <div className="mt-2.5 grid grid-cols-4 gap-1.5">
            <div className="rounded-xl bg-slate-100 p-1.5 text-center border border-black/[0.03]">
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Kiện lô</p>
              <p className="text-xs font-bold tabular-nums text-slate-800">{lot.declaredPcs ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-1.5 text-center border border-black/[0.03]">
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Kg lô</p>
              <p className="text-xs font-bold tabular-nums text-slate-800">{lot.declaredKg ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-violet-50 p-1.5 text-center border border-violet-100">
              <p className="text-[8px] font-bold uppercase tracking-wider text-violet-700">Tổng DIM</p>
              <p className="text-xs font-bold tabular-nums text-violet-900">{totalDimLabel}</p>
            </div>
            <div
              className={`rounded-xl p-1.5 text-center border ${
                snap.pcsExcess
                  ? "bg-red-50 border-red-200 text-red-900"
                  : snap.pcsMatch
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
            >
              <p className="text-[8px] font-bold uppercase tracking-wider text-apple-secondary">Kiện DIM</p>
              <p className="text-xs font-bold tabular-nums">
                {snap.sumDimPcs}
                {lot.declaredPcs != null ? (
                  <span className="text-[10px] font-semibold text-slate-500"> / {lot.declaredPcs}</span>
                ) : null}
              </p>
            </div>
          </div>

          {lot.declaredKg != null && snap.totalDim != null ? (
            <p className="mt-1.5 text-[10px] font-bold text-slate-600">
              {snap.dimBelowGross
                ? `DIM ${snap.totalDim.toFixed(1)} kg < Gross ${lot.declaredKg} kg — chargeable theo cân thực.`
                : `DIM ${snap.totalDim.toFixed(1)} kg ≥ Gross ${lot.declaredKg} kg — chargeable theo DIM.`}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 md:px-6 bg-slate-50/30">
          <div className="space-y-3 md:grid md:grid-cols-[1.1fr_0.9fr] md:gap-5 md:space-y-0">
            {/* Cột trái — Nhập kích thước & Thao tác thủ công */}
            <div className="space-y-2.5">
              {/* ⚡ NÚT 1-CLICK TỰ ĐỘNG ĐIỀN ĐỦ DIM */}
              <button
                type="button"
                onClick={handleOneClickAutoFill}
                className="w-full rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 py-3 px-3.5 font-bold text-white shadow-md transition-all active:scale-[0.98] flex items-center justify-between gap-2 border border-violet-400/30"
              >
                <div className="flex items-center gap-2 text-left">
                  <span className="text-xl">⚡</span>
                  <div>
                    <p className="text-xs font-black tracking-wide uppercase">TỰ ĐỘNG TẠO ĐỦ DIM (1-CLICK)</p>
                    <p className="text-[10px] opacity-90 font-medium">Tự tạo đủ {lot.declaredPcs ?? "?"} kiện · Tối ưu 95% Cân thực</p>
                  </div>
                </div>
                <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-xs">
                  Bấm ngay ➔
                </span>
              </button>

              <DimWorkflowSteps snap={snap} />

              {limitWarnings.length > 0 ? (
                <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950 font-medium">
                  {limitWarnings.map((w, i) => (
                    <p key={i}>{w.kind === "dims" ? "⚠ " : "ℹ "}{w.message}</p>
                  ))}
                </div>
              ) : null}

              {/* Ô DÁN / NHẬP THÔNG MINH */}
              <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="dim-combo-input" className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="text-base">📋</span>
                    <span>Dán / Nhập chuỗi kích thước đo thật</span>
                  </label>
                  {parsedPreview?.ok && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      Phát hiện hợp lệ
                    </span>
                  )}
                </div>

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
                  placeholder={"Dán từ Excel / Zalo (Ví dụ: 40x50x30x10 hoặc 40 50 30 10)\n(Nhấn Enter hoặc nút 'Thêm' để chốt)"}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/70 p-2 font-mono text-xs font-semibold focus:border-apple-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-apple-blue/15"
                />

                {comboInput.trim() && parsedPreview ? (
                  parsedPreview.ok ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                        <span>✨ Đã nhận diện {parsedPreview.lines.length} nhóm ({parsedPreview.lines.reduce((s, l) => s + l.pcs, 0)} kiện):</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {parsedPreview.lines.map((l, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] font-mono font-bold text-emerald-900 shadow-xs">
                            {l.lCm}×{l.wCm}×{l.hCm} <span className="text-violet-700">×{l.pcs} kiện</span>
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleAddComboRows}
                        className="mt-1 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2 text-xs font-bold text-white shadow-xs transition-all active:scale-[0.99]"
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

              {/* Mục gập/mở Nhập 4 ô lẻ thủ công */}
              <div className="rounded-2xl border border-black/[0.06] bg-white p-3 shadow-xs space-y-2">
                <button
                  type="button"
                  onClick={() => setShowManualSection((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-bold text-slate-700"
                >
                  <span>⚙️ Nhập thủ công 4 ô lẻ (L × W × H × Pcs)</span>
                  <span className="text-[10px] text-slate-400">{showManualSection ? "▲ Thu gọn" : "▼ Mở rộng"}</span>
                </button>

                {showManualSection && (
                  <div className="space-y-2 pt-1 border-t border-slate-100">
                    <div className="grid grid-cols-4 gap-1.5">
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Dài</span>
                        <input
                          ref={refL}
                          type="number"
                          min={1}
                          value={inputL}
                          onChange={(e) => setInputL(e.target.value)}
                          placeholder="cm"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-bold tabular-nums focus:border-apple-blue focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Rộng</span>
                        <input
                          ref={refW}
                          type="number"
                          min={1}
                          value={inputW}
                          onChange={(e) => setInputW(e.target.value)}
                          placeholder="cm"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-bold tabular-nums focus:border-apple-blue focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Cao</span>
                        <input
                          ref={refH}
                          type="number"
                          min={1}
                          value={inputH}
                          onChange={(e) => setInputH(e.target.value)}
                          placeholder="cm"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-bold tabular-nums focus:border-apple-blue focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Kiện</span>
                        <input
                          ref={refPcs}
                          type="number"
                          min={1}
                          value={inputPcs}
                          onChange={(e) => setInputPcs(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddRowFromInputs();
                            }
                          }}
                          placeholder="pcs"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-bold tabular-nums focus:border-apple-blue focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddRowFromInputs}
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 py-1.5 text-xs font-bold text-slate-700 transition-colors"
                    >
                      + Thêm dòng lẻ
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleMerge}
                  disabled={lines.length < 2}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 shadow-xs"
                >
                  Gộp trùng kích thước
                </button>
              </div>

              {actionNote ? (
                <p className="mt-1.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-bold text-amber-900 shadow-xs">
                  {actionNote}
                </p>
              ) : null}

              {snap.remainingPcs > 0 ? (
                <div className="mt-2 rounded-xl bg-amber-100/80 border border-amber-300 p-2.5 text-xs text-amber-950 font-bold flex items-start gap-2 shadow-xs">
                  <span className="text-base">⚠️</span>
                  <div>
                    <p className="font-extrabold uppercase text-[11px] text-amber-900">Đang thiếu {snap.remainingPcs} kiện!</p>
                    <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                      Hãy bấm nút tím <strong className="text-violet-900">"⚡ TỰ ĐỘNG TẠO ĐỦ DIM (1-CLICK)"</strong> ở phía trên để hệ thống tự điền đủ.
                    </p>
                  </div>
                </div>
              ) : snap.pcsMatch ? (
                <div className="mt-2 rounded-xl bg-emerald-100/90 border border-emerald-300 p-2.5 text-xs text-emerald-950 font-bold flex items-center gap-2 shadow-xs">
                  <span className="text-base">🎉</span>
                  <div>
                    <p className="font-extrabold uppercase text-[11px] text-emerald-900">Đã đủ 100% kiện ({lot.declaredPcs}/{lot.declaredPcs} kiện)!</p>
                    <p className="text-[10px] text-emerald-800 font-medium mt-0.5">
                      Kiểm tra danh sách bên phải rồi bấm nút <strong className="text-emerald-900">"🟢 LƯU DIM (ĐÃ ĐỦ KIỆN)"</strong> ở cuối màn hình.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Cột phải — Danh sách tách đo thật / ước tính */}
            <div className="space-y-2.5 md:max-h-[580px] md:overflow-y-auto md:rounded-2xl md:border md:border-black/[0.06] md:bg-slate-50/30 md:p-3">
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
                emptyHint="Dán hoặc nhập kích thước ở bên trái"
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
                    : "Bấm nút ⚡ TỰ ĐỘNG TẠO ĐỦ DIM bên trái hoặc bấm Sinh ngay"
                }
                estimationControls={
                  <div className="rounded-xl border border-violet-200 bg-white p-2.5 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowEstimationConfig((v) => !v)}
                        className="flex items-center gap-1.5 text-xs font-bold text-violet-900 hover:text-violet-700"
                      >
                        <span>✨ Cấu hình & Sinh ngẫu nhiên</span>
                        <span className="text-[10px]">{showEstimationConfig ? "▲ Thu gọn" : "▼ Mở rộng"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRandom()}
                        className="rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1 text-xs font-bold text-white shadow-xs active:scale-95 transition-all"
                      >
                        Sinh ngay
                      </button>
                    </div>

                    {(showEstimationConfig || snap.estimated.length === 0) && (
                      <div className="pt-1.5 space-y-2 border-t border-violet-100 text-xs">
                        {lot.declaredKg != null && lot.declaredKg > 0 ? (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-slate-600">
                              <span>Tỉ lệ DIM/Gross:</span>
                              <span className="text-violet-700 font-bold">
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
                                const val = Number(e.target.value);
                                setTargetRatioPercent(val);
                                setRandomTargetKgInput("");
                              }}
                              className="h-1.5 w-full cursor-pointer rounded-lg bg-violet-200 accent-violet-600"
                            />
                          </div>
                        ) : null}

                        <div className="grid grid-cols-2 gap-1.5">
                          <label>
                            <span className="text-[9px] font-bold text-slate-500 uppercase">Kg DIM cố định</span>
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
                              className="mt-0.5 w-full rounded-lg border border-violet-200 bg-slate-50 px-2 py-1 text-xs font-semibold tabular-nums text-center focus:bg-white focus:outline-none"
                            />
                          </label>
                          <label>
                            <span className="text-[9px] font-bold text-slate-500 uppercase">Số dòng ước tính</span>
                            <input
                              type="number"
                              min={1}
                              max={snap.remainingPcs}
                              inputMode="numeric"
                              value={randomLineCountInput}
                              onChange={(e) => setRandomLineCountInput(e.target.value)}
                              placeholder={
                                snap.targetLineCount
                                  ? `${snap.targetLineCount.min}–${snap.targetLineCount.max} dòng`
                                  : String(Math.min(snap.remainingPcs, 10))
                              }
                              className="mt-0.5 w-full rounded-lg border border-violet-200 bg-slate-50 px-2 py-1 text-xs font-semibold tabular-nums text-center focus:bg-white focus:outline-none"
                            />
                          </label>
                        </div>

                        <div className="flex items-center justify-between pt-1 text-[10px]">
                          <label className="flex cursor-pointer items-center gap-1 text-slate-600 font-semibold">
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
                              onClick={() => applyMutation(dimEntryClearEstimated(lines), "Đã xóa kiện ước tính chưa khóa.")}
                              className="font-bold text-red-600 hover:underline"
                            >
                              Xóa chưa khóa
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                }
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-black/[0.06] p-3.5 bg-slate-50/50">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!snap.pcsMatch}
              onClick={handleSave}
              className={`flex-1 rounded-full py-3 text-xs sm:text-sm font-extrabold shadow-md transition-all active:scale-[0.98] ${
                snap.pcsMatch
                  ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white ring-2 ring-emerald-400/40 animate-pulse"
                  : "bg-slate-200 text-slate-400 border border-slate-300 shadow-none cursor-not-allowed"
              }`}
            >
              {snap.pcsMatch
                ? "🟢 LƯU DIM (ĐÃ ĐỦ KIỆN - SẴN SÀNG)"
                : snap.remainingPcs > 0
                  ? `⚠️ CHƯA ĐỦ KIỆN (THIẾU ${snap.remainingPcs} KIỆN)`
                  : snap.pcsExcess
                    ? "⚠️ DƯ KIỆN LÔ HÀNG (BẤM XÓA BỚT)"
                    : "Lưu DIM"}
            </button>

            {/* Nút Safety Reset - Làm lại từ đầu */}
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
