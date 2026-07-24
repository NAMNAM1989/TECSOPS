import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { findCustomerEntry } from "../utils/customerBookingResolve";
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
import {
  consolidateDimPieceLines,
  convertCustomerSavedDimTemplatesToPresets,
  DIM_PRESET_SIZES,
  DIM_TOTAL_BAND_BELOW_RATIO,
} from "../utils/dimBulkFill";
import { loadCustomDimPresets, saveCustomDimPreset, removeCustomDimPreset } from "../utils/dimCustomPresetsStorage";
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
  type DimEntryWorkflowStep,
} from "../utils/dimEntryState";
import { loadCustomerDimHistory, saveCustomerDimHistory } from "../utils/dimHistoryStorage";
import { CustomDimNumPad } from "./CustomDimNumPad";

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

const WORKFLOW_STEPS: { step: DimEntryWorkflowStep; label: string; hint: string }[] = [
  { step: 1, label: "Đo mẫu", hint: "Dán chuỗi số liệu hoặc chọn size mẫu đo thật" },
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
  onToggleLock,
  emptyHint,
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
        <span className="text-[10px] tabular-nums text-apple-secondary font-semibold">
          {lines.length} dòng · {lines.reduce((s, l) => s + l.pcs, 0)} kiện
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-apple-tertiary">{emptyHint ?? "Chưa có"}</p>
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
                  {/* Nút Khóa dòng cho kiện ước tính */}
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

export function MobileDimKgModal({ row, customerDirectory, onClose, onSave }: MobileDimKgModalProps) {
  const customerEntry = useMemo(
    () => findCustomerEntry(row, customerDirectory ?? []),
    [row, customerDirectory]
  );

  const customerPresets = useMemo(
    () => convertCustomerSavedDimTemplatesToPresets(customerEntry?.savedDimTemplates),
    [customerEntry]
  );

  const [lines, setLines] = useState<DimPieceLine[]>(() =>
    consolidateDimPieceLines(cloneLines(row.dimLines))
  );

  // Ô nhập dán số liệu (Copy & Paste Combo Textarea)
  const [comboInput, setComboInput] = useState("");

  // States nhập liệu 4 ô lẻ
  const [inputL, setInputL] = useState("");
  const [inputW, setInputW] = useState("");
  const [inputH, setInputH] = useState("");
  const [inputPcs, setInputPcs] = useState("");
  const [activeField, setActiveField] = useState<"l" | "w" | "h" | "pcs">("l");

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

  const [customPresets, setCustomPresets] = useState(() => loadCustomDimPresets());
  const [showAddPresetForm, setShowAddPresetForm] = useState(false);
  const [presetLabelInput, setPresetLabelInput] = useState("");
  const [presetLCmInput, setPresetLCmInput] = useState("");
  const [presetWCmInput, setPresetWCmInput] = useState("");
  const [presetHCmInput, setPresetHCmInput] = useState("");

  // Customer DIM History State
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);

  useEffect(() => {
    if (row.customerCode) {
      setCustomerHistory(loadCustomerDimHistory(row.customerCode));
    }
  }, [row.customerCode]);

  const handleCreateCustomPreset = useCallback(() => {
    const l = Number(presetLCmInput);
    const w = Number(presetWCmInput);
    const h = Number(presetHCmInput);
    if (!Number.isFinite(l) || l <= 0 || !Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      setActionNote("❌ Kích thước dài/rộng/cao phải là số dương.");
      return;
    }
    const label = presetLabelInput.trim() || `${l}×${w}×${h}`;
    const nextList = saveCustomDimPreset({ label, lCm: l, wCm: w, hCm: h });
    setCustomPresets(nextList);
    setShowAddPresetForm(false);
    setPresetLabelInput("");
    setPresetLCmInput("");
    setPresetWCmInput("");
    setPresetHCmInput("");
    setActionNote(`✅ Đã lưu mẫu size tùy chỉnh "${label}" (${l}×${w}×${h} cm).`);
  }, [presetLabelInput, presetLCmInput, presetWCmInput, presetHCmInput]);

  const handleDeleteCustomPreset = useCallback((id: string, label: string) => {
    const nextList = removeCustomDimPreset(id);
    setCustomPresets(nextList);
    setActionNote(`Đã xóa mẫu size "${label}".`);
  }, []);

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

  // Xử lý thêm dòng từ ô dán Copy & Paste
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
    applyMutation(r.lines, r.note ?? "Đã bóc tách và thêm dòng từ chuỗi dán.");
    setComboInput("");
  };

  // Hàm thêm dòng từ 4 ô input lẻ
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

    // Reset inputs
    setInputL("");
    setInputW("");
    setInputH("");
    setInputPcs("");
    setActiveField("l");
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

  const handleRandom = (overrideRatio?: number) => {
    if (!randomParams) {
      setActionNote("❌ Cần kiện lô và kg lô trên lô hàng.");
      return;
    }
    const targetEstimatedLineCount = parseRandomLineCountInput(randomLineCountInput);
    const targetTotalDimKg = parseTargetDimKgInput(randomTargetKgInput);
    const ratio = overrideRatio ?? (randomTargetKgInput ? undefined : targetRatioPercent);

    const r = dimEntryRandomFill(lines, lot, {
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
    
    // Lưu lịch sử kích thước đo thật thành công cho khách hàng
    if (row.customerCode) {
      saveCustomerDimHistory(row.customerCode, r.lines.filter(l => !l.estimated));
    }

    onSave({
      dimWeightKg: totalDimKgFromLines(r.lines, divisor, dimCtx),
      dimLines: r.lines,
      dimDivisor: divisor,
    });
  };

  const workflowHint = WORKFLOW_STEPS.find((s) => s.step === snap.workflowStep)?.hint ?? "";

  // Bàn phím ảo CustomNumPad handlers
  const handleNumKeyPress = (num: string) => {
    setActionNote(null);
    if (activeField === "l") {
      setInputL((v) => {
        const next = v + num;
        if (next.length >= 3) {
          setTimeout(() => {
            setActiveField("w");
            refW.current?.focus();
          }, 80);
        }
        return next;
      });
    } else if (activeField === "w") {
      setInputW((v) => {
        const next = v + num;
        if (next.length >= 3) {
          setTimeout(() => {
            setActiveField("h");
            refH.current?.focus();
          }, 80);
        }
        return next;
      });
    } else if (activeField === "h") {
      setInputH((v) => {
        const next = v + num;
        if (next.length >= 3) {
          setTimeout(() => {
            setActiveField("pcs");
            refPcs.current?.focus();
          }, 80);
        }
        return next;
      });
    } else if (activeField === "pcs") {
      setInputPcs((v) => v + num);
    }
  };

  const handleNumDelete = () => {
    if (activeField === "l") setInputL((v) => v.slice(0, -1));
    else if (activeField === "w") setInputW((v) => v.slice(0, -1));
    else if (activeField === "h") setInputH((v) => v.slice(0, -1));
    else if (activeField === "pcs") setInputPcs((v) => v.slice(0, -1));
  };

  const handleNumClear = () => {
    if (activeField === "l") setInputL("");
    else if (activeField === "w") setInputW("");
    else if (activeField === "h") setInputH("");
    else if (activeField === "pcs") setInputPcs("");
  };

  const handleNumAction = () => {
    if (activeField === "l") {
      setActiveField("w");
      refW.current?.focus();
    } else if (activeField === "w") {
      setActiveField("h");
      refH.current?.focus();
    } else if (activeField === "h") {
      setActiveField("pcs");
      refPcs.current?.focus();
    } else if (activeField === "pcs") {
      handleAddRowFromInputs();
    }
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
      {/* Container Bottom Sheet trên di động, Modal trên desktop */}
      <div
        className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[1.6rem] border border-black/[0.08] bg-white shadow-2xl transition-all sm:max-h-[min(90dvh,860px)] sm:max-w-xl sm:rounded-[1.6rem] md:max-h-[min(90dvh,920px)] md:max-w-3xl lg:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + ngữ cảnh lô */}
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
              {snap.remainingPcs > 0 && lot.declaredKg > 0 && snap.dimBelowGross !== false ? (
                <span className="text-violet-700 font-semibold">
                  {" "}
                  Gợi ý Ngẫu nhiên ~{snap.floorKg.toFixed(0)}–{Math.floor(snap.ceilingKg)} kg (
                  {Math.round(DIM_TOTAL_BAND_BELOW_RATIO * 100)}% dưới Gross).
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 md:px-6 bg-slate-50/30">
          <div className="space-y-3 md:grid md:grid-cols-[1.1fr_0.9fr] md:gap-5 md:space-y-0">
            {/* Cột trái — Nhập & Thao tác */}
            <div className="space-y-2.5">
              <DimWorkflowSteps active={snap.workflowStep} />
              <p className="text-[10px] leading-snug font-semibold text-slate-500">{workflowHint}</p>

              {limitWarnings.length > 0 ? (
                <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950 font-medium">
                  {limitWarnings.map((w, i) => (
                    <p key={i}>{w.kind === "dims" ? "⚠ " : "ℹ "}{w.message}</p>
                  ))}
                </div>
              ) : null}

              {/* Ô DÁN COPY & PASTE SỐ LIỆU TỪ EXCEL/ZALO/NHẮN TIN */}
              <div className="rounded-2xl border border-black/[0.06] bg-white p-3 shadow-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="dim-combo-input" className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <span>📋 Dán chuỗi số liệu (Copy & Paste)</span>
                  </label>
                  {comboInput.trim() && (
                    <button
                      type="button"
                      onClick={handleAddComboRows}
                      className="rounded-lg bg-apple-blue hover:bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-xs active:scale-95 transition-all"
                    >
                      Phân tích & Thêm
                    </button>
                  )}
                </div>

                <textarea
                  id="dim-combo-input"
                  rows={2}
                  value={comboInput}
                  onChange={(e) => setComboInput(normalizeDimComboInput(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !comboInput.includes("\n"))) {
                      e.preventDefault();
                      handleAddComboRows();
                    }
                  }}
                  placeholder={"Dán từ Excel / Zalo: 40×50×30×10 hoặc 40 50 30 10\n(Bấm Ctrl+Enter hoặc nhấn 'Phân tích & Thêm')"}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/60 p-2 font-mono text-xs font-semibold focus:border-apple-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-apple-blue/15"
                />
              </div>

              {/* Lưới nhập liệu 4 ô lẻ (Dài × Rộng × Cao × Kiện) */}
              <div className="rounded-2xl border border-black/[0.06] bg-white p-3 shadow-xs space-y-1.5">
                <span className="text-[11px] font-bold text-slate-700 block">
                  Hoặc nhập số liệu lẻ (L × W × H × Pcs)
                </span>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Dài (L)</span>
                    <input
                      ref={refL}
                      type="number"
                      inputMode="none" // Chặn bàn phím OS để hiện CustomNumPad
                      value={inputL}
                      onFocus={() => setActiveField("l")}
                      onChange={(e) => setInputL(e.target.value)}
                      placeholder="cm"
                      className={`w-full rounded-xl border px-2 py-1.5 text-center text-xs font-bold tabular-nums focus:outline-none focus:ring-2 ${
                        activeField === "l"
                          ? "border-apple-blue ring-apple-blue/20 bg-white"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    />
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Rộng (W)</span>
                    <input
                      ref={refW}
                      type="number"
                      inputMode="none"
                      value={inputW}
                      onFocus={() => setActiveField("w")}
                      onChange={(e) => setInputW(e.target.value)}
                      placeholder="cm"
                      className={`w-full rounded-xl border px-2 py-1.5 text-center text-xs font-bold tabular-nums focus:outline-none focus:ring-2 ${
                        activeField === "w"
                          ? "border-apple-blue ring-apple-blue/20 bg-white"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    />
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Cao (H)</span>
                    <input
                      ref={refH}
                      type="number"
                      inputMode="none"
                      value={inputH}
                      onFocus={() => setActiveField("h")}
                      onChange={(e) => setInputH(e.target.value)}
                      placeholder="cm"
                      className={`w-full rounded-xl border px-2 py-1.5 text-center text-xs font-bold tabular-nums focus:outline-none focus:ring-2 ${
                        activeField === "h"
                          ? "border-apple-blue ring-apple-blue/20 bg-white"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    />
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Kiện (Pcs)</span>
                    <input
                      ref={refPcs}
                      type="number"
                      inputMode="none"
                      value={inputPcs}
                      onFocus={() => setActiveField("pcs")}
                      onChange={(e) => setInputPcs(e.target.value)}
                      placeholder="kiện"
                      className={`w-full rounded-xl border px-2 py-1.5 text-center text-xs font-bold tabular-nums focus:outline-none focus:ring-2 ${
                        activeField === "pcs"
                          ? "border-apple-blue ring-apple-blue/20 bg-white"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Presets & Custom Presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>Mẫu size chọn nhanh</span>
                  <button
                    type="button"
                    onClick={() => setShowAddPresetForm((v) => !v)}
                    className="text-[10px] font-bold text-violet-700 hover:underline"
                  >
                    {showAddPresetForm ? "Hủy" : "+ ➕ Thêm Mới"}
                  </button>
                </div>

                {showAddPresetForm && (
                  <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/90 p-2.5 text-xs shadow-xs">
                    <p className="text-[10px] font-bold text-violet-950">Lưu Mẫu Size Tùy Chỉnh Mới</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      <input
                        type="text"
                        placeholder="Tên nhãn (Thùng A)"
                        value={presetLabelInput}
                        onChange={(e) => setPresetLabelInput(e.target.value)}
                        className="col-span-4 rounded-lg border border-black/10 px-2 py-1 text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Dài"
                        value={presetLCmInput}
                        onChange={(e) => setPresetLCmInput(e.target.value)}
                        className="rounded-lg border border-black/10 px-2 py-1 text-xs tabular-nums text-center"
                      />
                      <input
                        type="number"
                        placeholder="Rộng"
                        value={presetWCmInput}
                        onChange={(e) => setPresetWCmInput(e.target.value)}
                        className="rounded-lg border border-black/10 px-2 py-1 text-xs tabular-nums text-center"
                      />
                      <input
                        type="number"
                        placeholder="Cao"
                        value={presetHCmInput}
                        onChange={(e) => setPresetHCmInput(e.target.value)}
                        className="rounded-lg border border-black/10 px-2 py-1 text-xs tabular-nums text-center"
                      />
                      <button
                        type="button"
                        onClick={handleCreateCustomPreset}
                        className="rounded-lg bg-violet-600 font-bold text-white text-xs py-1 hover:bg-violet-700"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                )}

                {/*⭐ Lịch sử kích thước của khách hàng */}
                {customerHistory.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold text-emerald-800 uppercase flex items-center gap-1">
                      <span>⭐ Lịch sử của {customerEntry?.shortCode || customerEntry?.code || row.customerCode || "Khách"}</span>
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {customerHistory.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setInputL(String(preset.lCm));
                            setInputW(String(preset.wCm));
                            setInputH(String(preset.hCm));
                            setInputPcs("");
                            setActiveField("pcs");
                            refPcs.current?.focus();
                          }}
                          title={preset.description}
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-950 shadow-xs hover:bg-emerald-100"
                        >
                          🕒 {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {customerPresets.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold text-emerald-800 uppercase">⭐ Mẫu Khách Hàng</p>
                    <div className="flex flex-wrap gap-1">
                      {customerPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setInputL(String(preset.lCm));
                            setInputW(String(preset.wCm));
                            setInputH(String(preset.hCm));
                            setInputPcs("");
                            setActiveField("pcs");
                            refPcs.current?.focus();
                          }}
                          title={preset.description}
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-950 shadow-xs hover:bg-emerald-100"
                        >
                          ⭐ {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {customPresets.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase">Tùy chỉnh cá nhân</p>
                    <div className="flex flex-wrap gap-1">
                      {customPresets.map((preset) => (
                        <span
                          key={preset.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-950 shadow-xs"
                        >
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setInputL(String(preset.lCm));
                              setInputW(String(preset.wCm));
                              setInputH(String(preset.hCm));
                              setInputPcs("");
                              setActiveField("pcs");
                              refPcs.current?.focus();
                            }}
                            className="hover:underline"
                          >
                            🛠️ {preset.label}
                          </button>
                          <button
                            type="button"
                            title="Xóa mẫu này"
                            onClick={() => handleDeleteCustomPreset(preset.id, preset.label)}
                            className="ml-0.5 text-amber-600 hover:text-red-600 text-[10px] font-bold"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-1">
                  {DIM_PRESET_SIZES.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setInputL(String(preset.lCm));
                        setInputW(String(preset.wCm));
                        setInputH(String(preset.hCm));
                        setInputPcs("");
                        setActiveField("pcs");
                        refPcs.current?.focus();
                      }}
                      title={preset.description}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
                    >
                      + {preset.label} <span className="text-[9px] text-slate-400 font-mono">({preset.lCm}×{preset.wCm}×{preset.hCm})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bàn phím ảo chuyên dụng */}
              <div className="mt-1">
                <CustomDimNumPad
                  onKeyPress={handleNumKeyPress}
                  onDelete={handleNumDelete}
                  onClear={handleNumClear}
                  onAction={handleNumAction}
                  actionLabel={activeField === "pcs" ? "Thêm" : "Tiếp"}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleMerge}
                  disabled={lines.length < 2}
                  className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 shadow-xs"
                >
                  Gộp trùng kích thước
                </button>
                {snap.canRandomFill ? (
                  <button
                    type="button"
                    onClick={() => handleRandom()}
                    className="rounded-xl bg-violet-600 py-2 text-xs font-bold text-white hover:bg-violet-700 shadow-md transition-all active:scale-[0.98]"
                  >
                    Sinh Ngẫu nhiên
                  </button>
                ) : null}
              </div>

              {/* Tùy chỉnh sinh ngẫu nhiên */}
              {snap.canRandomFill && (
                <div className="mt-2.5 space-y-2 rounded-2xl border border-violet-200 bg-violet-50/40 p-3 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-violet-950">Sinh Ngẫu Nhiên % DIM</span>
                    {lot.declaredKg != null && lot.declaredKg > 0 ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          targetRatioPercent >= 98
                            ? "bg-amber-100 text-amber-900 border border-amber-200"
                            : targetRatioPercent >= 95
                              ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                              : "bg-blue-100 text-blue-900 border border-blue-200"
                        }`}
                      >
                        {targetRatioPercent.toFixed(1)}% ({Math.round(lot.declaredKg * (targetRatioPercent / 100))} kg)
                      </span>
                    ) : null}
                  </div>

                  {lot.declaredKg != null && lot.declaredKg > 0 ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold text-slate-500">
                        <span>85% (Tiết kiệm cước)</span>
                        <span>95% (Khuyên dùng)</span>
                        <span>99.9% (Sát trần)</span>
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
                        className="h-2 w-full cursor-pointer rounded-lg bg-violet-200 accent-violet-600"
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-2 grid-cols-2">
                    <label>
                      <span className="text-[10px] font-bold text-slate-500 uppercase">
                        Hoặc kg DIM cố định
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
                            ? `~${Math.round(lot.declaredKg * (targetRatioPercent / 100))} kg`
                            : "950"
                        }
                        className="mt-0.5 w-full rounded-xl border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold tabular-nums text-center focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      />
                    </label>
                    <label>
                      <span className="text-[10px] font-bold text-slate-500 uppercase">
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
                            ? `${snap.targetLineCount.min}–${snap.targetLineCount.max} dòng`
                            : String(Math.min(snap.remainingPcs, 10))
                        }
                        className="mt-0.5 w-full rounded-xl border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold tabular-nums text-center focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="mt-1 flex flex-wrap items-center justify-between text-[11px]">
                {snap.canRandomFill ? (
                  <label className="flex cursor-pointer items-center gap-1.5 text-slate-500 font-semibold">
                    <input
                      type="checkbox"
                      checked={autoRandomAfterAdd}
                      onChange={(e) => setAutoRandomAfterAdd(e.target.checked)}
                      className="rounded text-violet-600 focus:ring-violet-500"
                    />
                    Tự ngẫu nhiên sau khi Thêm
                  </label>
                ) : null}
                {snap.sumEstimatedPcs > 0 ? (
                  <button
                    type="button"
                    onClick={() => applyMutation(dimEntryClearEstimated(lines), "Đã xóa kiện ước tính chưa khóa.")}
                    className="font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800"
                  >
                    Xóa ước tính chưa khóa
                  </button>
                ) : null}
              </div>

              {actionNote ? (
                <p className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] font-semibold text-amber-900 shadow-xs">
                  {actionNote}
                </p>
              ) : null}

              {snap.canRandomFill && snap.remainingPcs > 0 && snap.measured.length > 0 ? (
                <p className="mt-2 text-[10px] text-emerald-800 font-bold">
                  Còn <strong>{snap.remainingPcs}</strong> kiện — có thể bấm{" "}
                  <strong>Sinh Ngẫu nhiên</strong> hoặc nhập thêm đo thật.
                </p>
              ) : snap.pcsMatch && snap.measured.length > 0 ? (
                <p className="mt-2 text-[10px] text-emerald-800 font-bold">
                  Đủ kiện — không cần Ngẫu nhiên. Kiểm tra tổng DIM rồi bấm Lưu.
                </p>
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
                  snap.canRandomFill
                    ? "Bấm Sinh Ngẫu nhiên để điền kiện ước tính"
                    : "Không cần ước tính — nhập đủ kiện đo thật"
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
              disabled={snap.pcsExcess}
              onClick={handleSave}
              className="flex-1 rounded-full bg-apple-blue hover:bg-blue-600 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none"
            >
              Lưu DIM
            </button>
            <button
              type="button"
              onClick={() => onSave({ dimWeightKg: null, dimLines: null, dimDivisor: null })}
              className="rounded-full border border-slate-200 bg-white hover:bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 shadow-xs"
            >
              Xóa DIM
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white hover:bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500 shadow-xs"
            >
              Hủy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
