import { useCallback, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import { useDimSpeechRecognition } from "../hooks/useDimSpeechRecognition";
import {
  numbersFromDimVoiceTranscript,
  preprocessDimVoiceTranscript,
} from "../utils/dimVoiceTranscript";
import {
  type DimDivisor,
  type DimPieceLine,
  type DimRoundingPolicyId,
  dimDivisorFromFlight,
  dimRoundingPolicyFromFlight,
  formatDimKgDisplay,
  lineDimKg,
  parseDimLineQuadsFromNumbers,
  totalDimKgFromLines,
  tryParseDimPieceLinesFromComboText,
} from "../utils/volumetricDim";

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

function cloneLines(lines: DimPieceLine[] | null): DimPieceLine[] {
  if (!lines?.length) return [];
  return lines.map((l) => ({ ...l }));
}

/**
 * Chuẩn hóa ô nhập DIM: giữ xuống dòng (dán nhiều dòng desktop), tab → space;
 * phím "," trên bàn phím số → × giữa các cạnh.
 */
function normalizeDimComboInput(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/,/g, "×")
    .replace(/\u060C/g, "×")
    .replace(/\*/g, "×");
}

function appendDimComboNumber(combo: string, num: string): string {
  const c = combo.trim();
  if (!c) return num;
  const last = c.slice(-1);
  if (last === "×") return c + num;
  if (/\d/.test(last)) return `${c}×${num}`;
  return `${c}${num}`;
}

const DIM_QUICK_NUMS = ["120", "100", "80", "60", "50", "40", "30", "25", "20"] as const;

const DIM_INPUT_HINT =
  "Mỗi dòng: D-R-C-kiện hoặc D×R×C×kiện. Enter thêm dòng · Shift+Enter xuống dòng · Ctrl+Enter luôn thêm.";

/** Mic + tổng DIM — layout gọn. */
function DimMicTotalRow({
  speechOk,
  listening,
  liveCaption,
  totalDimLabel,
  onMicPress,
}: {
  speechOk: boolean;
  listening: boolean;
  liveCaption: string;
  totalDimLabel: string;
  onMicPress: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/90 to-white p-2.5 shadow-sm"
      aria-label="Mic và tổng DIM"
    >
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0">
          {listening ? (
            <div className="absolute inset-x-0 -top-0.5 flex h-5 items-end justify-center gap-0.5" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-0.5 origin-bottom rounded-full bg-violet-500 motion-safe:animate-[dim-voice-bar_0.9s_ease-in-out_infinite]"
                  style={{ animationDelay: `${i * 0.12}s`, height: `${8 + (i % 3) * 5}px` }}
                />
              ))}
            </div>
          ) : null}
          <button
            type="button"
            disabled={!speechOk}
            onClick={onMicPress}
            aria-pressed={listening}
            aria-label={listening ? "Dừng mic" : "Mic — đọc số D R C kiện"}
            className={`relative mt-0.5 flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-transform touch-manipulation active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45 ${
              listening
                ? "bg-gradient-to-br from-rose-500 to-orange-500 text-white ring-2 ring-rose-200/90"
                : "bg-gradient-to-br from-violet-600 to-indigo-600 text-white ring-1 ring-violet-300/60"
            }`}
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 8c-2.21 0-4-1.12-4-2.5V16h8v.5C16 20.88 14.21 22 12 22z" />
            </svg>
          </button>
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-apple-tertiary">Tổng DIM</p>
          <p className="text-[1.65rem] font-bold leading-tight tabular-nums tracking-tight text-apple-label">
            {totalDimLabel}
          </p>
          {listening ? (
            <p className="mt-0.5 line-clamp-2 text-left text-[10px] text-violet-700" aria-live="polite">
              {liveCaption.trim() ? liveCaption : "Đang nghe…"}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type VoiceDimPreview = {
  transcript: string;
  parsed: DimPieceLine[];
};

export function MobileDimKgModal({ row, onClose, onSave }: MobileDimKgModalProps) {
  const [combo, setCombo] = useState("");
  const [lines, setLines] = useState<DimPieceLine[]>(() => cloneLines(row.dimLines));
  const [voicePreview, setVoicePreview] = useState<VoiceDimPreview | null>(null);

  const { listening, liveCaption, start, finalize, speechOk } = useDimSpeechRecognition();

  const dimPolicy: DimRoundingPolicyId = useMemo(
    () => dimRoundingPolicyFromFlight(row.flight),
    [row.flight]
  );

  /** Cùng quy tắc với LIST SCSC / in: 6000 (IATA) hoặc 5000 nếu cấu hình theo tiền tố hãng. */
  const divisor: DimDivisor = useMemo(() => dimDivisorFromFlight(row.flight), [row.flight]);

  const totalDim = useMemo(
    () => totalDimKgFromLines(lines, divisor, dimPolicy),
    [lines, divisor, dimPolicy]
  );

  const totalDimLabel = useMemo(() => {
    if (totalDim == null) return "—";
    return `${formatDimKgDisplay(totalDim, dimPolicy)} kg`;
  }, [totalDim, dimPolicy]);

  const sumDimPcs = useMemo(() => lines.reduce((s, l) => s + l.pcs, 0), [lines]);
  const declaredPcs = row.pcs;
  /** Chỉ chặn lưu khi dư kiện (DIM > lô). Thiếu kiện vẫn cho lưu. */
  const pcsExcess =
    declaredPcs != null && lines.length > 0 && sumDimPcs > declaredPcs;
  const pcsShort =
    declaredPcs != null && lines.length > 0 && sumDimPcs < declaredPcs;

  const appendQuads = useCallback((parsed: DimPieceLine[]) => {
    if (parsed.length === 0) return;
    setLines((prev) => [...prev, ...parsed]);
  }, []);

  const applyVoicePreview = useCallback(() => {
    if (!voicePreview?.parsed.length) return;
    const parsed = voicePreview.parsed;
    const nextSum = lines.reduce((s, l) => s + l.pcs, 0) + parsed.reduce((s, l) => s + l.pcs, 0);
    if (declaredPcs != null && nextSum > declaredPcs) {
      window.alert(
        `Dư kiện: nếu thêm nhóm này, tổng kiện (${nextSum}) vượt kiện lô (${declaredPcs}).`
      );
      return;
    }
    appendQuads(parsed);
    setVoicePreview(null);
  }, [appendQuads, declaredPcs, lines, voicePreview]);

  const addFromCombo = () => {
    const parsedResult = tryParseDimPieceLinesFromComboText(combo);
    if (!parsedResult.ok) {
      window.alert(parsedResult.error);
      return;
    }
    const parsed = parsedResult.lines;
    const nextSum = lines.reduce((s, l) => s + l.pcs, 0) + parsed.reduce((s, l) => s + l.pcs, 0);
    if (declaredPcs != null && nextSum > declaredPcs) {
      window.alert(
        `Dư kiện: nếu thêm dòng này, tổng kiện (${nextSum}) vượt kiện lô (${declaredPcs}).`
      );
      return;
    }
    appendQuads(parsed);
    setCombo("");
  };

  const startVoiceCalc = useCallback(() => {
    if (listening) {
      finalize();
      return;
    }
    setVoicePreview(null);
    start({
      continuous: false,
      interimResults: false,
      onFinal: (text) => {
        if (!text.trim()) {
          window.alert("Chưa nghe được câu thoại — thử lại.");
          return;
        }
        const nums = numbersFromDimVoiceTranscript(text);
        const parsed = parseDimLineQuadsFromNumbers(nums);
        if (parsed.length > 0) {
          setVoicePreview({ transcript: text.trim(), parsed });
          return;
        }
        const normalized = preprocessDimVoiceTranscript(text).replace(/\s+/g, "");
        setCombo(normalizeDimComboInput(normalized));
        window.alert(
          "Chưa đủ bộ số (cần ít nhất D×R×C hoặc D×R×C×kiện). Đã đưa phần nhận được vào ô nhập — sửa rồi bấm Thêm dòng."
        );
      },
      onErrorMessage: (m) => window.alert(m),
    });
  }, [finalize, listening, start]);

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (lines.length > 0 && totalDim != null) {
      if (pcsExcess) {
        window.alert(
          `Dư kiện: tổng kiện DIM (${sumDimPcs}) lớn hơn kiện lô (${declaredPcs}). Giảm kiện trong các dòng hoặc sửa số kiện lô.`
        );
        return;
      }
      onSave({ dimWeightKg: totalDim, dimLines: lines, dimDivisor: divisor });
      return;
    }
    window.alert("Thêm ít nhất một dòng D×R×C×kiện.");
  };

  const handleClear = () => {
    onSave({ dimWeightKg: null, dimLines: null, dimDivisor: null });
  };

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dim-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92vh,680px)] w-full max-w-sm flex-col overflow-hidden rounded-[1.35rem] border border-black/[0.06] bg-white shadow-2xl shadow-black/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 bg-gradient-to-b from-slate-50/90 to-white px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <h2 id="dim-modal-title" className="text-[1.05rem] font-semibold tracking-tight text-apple-label">
              Nhập DIM
            </h2>
            {dimPolicy === "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND" ? (
              <span
                className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900"
                title="VietJet: DIM mỗi dòng cắt 3 số lẻ"
              >
                VJ
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-apple-tertiary">Dài × Rộng × Cao × kiện (cm)</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2.5">
          <div className="space-y-2.5">
            <DimMicTotalRow
              speechOk={speechOk}
              listening={listening}
              liveCaption={liveCaption}
              totalDimLabel={totalDimLabel}
              onMicPress={startVoiceCalc}
            />

            {voicePreview ? (
              <div
                className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-2.5"
                role="region"
                aria-label="Kết quả nhận từ giọng"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/75">Giọng nói</p>
                <p className="mt-1 line-clamp-3 text-[11px] text-apple-label">{voicePreview.transcript}</p>
                <p className="mt-1 font-mono text-xs font-semibold text-emerald-950">
                  {voicePreview.parsed
                    .map((l) => {
                      const kg = lineDimKg(l, divisor, dimPolicy);
                      const kgPart = kg != null ? ` → ${formatDimKgDisplay(kg, dimPolicy)} kg` : "";
                      return `${l.lCm}×${l.wCm}×${l.hCm}×${l.pcs}${kgPart}`;
                    })
                    .join(" · ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyVoicePreview}
                    className="min-h-[40px] flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white active:scale-[0.99]"
                  >
                    Thêm vào danh sách
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoicePreview(null)}
                    className="min-h-[40px] rounded-xl border border-black/[0.12] px-3 py-2 text-sm font-semibold text-apple-secondary"
                  >
                    Bỏ qua
                  </button>
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="dim-combo" className="text-xs font-semibold text-apple-label">
                  Ô nhập
                </label>
                <span
                  className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-black/[0.05] text-[11px] font-bold text-apple-tertiary"
                  title={DIM_INPUT_HINT}
                >
                  ?
                </span>
              </div>
              <textarea
                id="dim-combo"
                rows={4}
                aria-describedby="dim-combo-hint"
                inputMode="text"
                enterKeyHint="enter"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={combo}
                onChange={(e) => setCombo(normalizeDimComboInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
                    const multiLine = combo.includes("\n");
                    const submit =
                      e.ctrlKey ||
                      e.metaKey ||
                      (!multiLine && !e.shiftKey);
                    if (submit) {
                      e.preventDefault();
                      addFromCombo();
                    }
                    return;
                  }
                  if (e.key === "," || e.key === "\u060C") {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const startPos = el.selectionStart ?? combo.length;
                    const end = el.selectionEnd ?? combo.length;
                    const ins = "×";
                    const next = combo.slice(0, startPos) + ins + combo.slice(end);
                    setCombo(next);
                    const pos = startPos + ins.length;
                    requestAnimationFrame(() => {
                      el.setSelectionRange(pos, pos);
                    });
                  }
                }}
                placeholder={"40-50-30-4\n60-50-30-5"}
                className="max-h-40 min-h-[5rem] w-full resize-y rounded-2xl border border-black/[0.07] bg-slate-50/40 px-3 py-2.5 font-mono text-sm text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-apple-blue/18"
              />
              <p id="dim-combo-hint" className="sr-only">
                {DIM_INPUT_HINT}
              </p>
              <div
                className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label="Số nhanh cm"
              >
                {DIM_QUICK_NUMS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCombo((c) => appendDimComboNumber(c, n))}
                    className="shrink-0 min-h-[34px] min-w-[2.65rem] rounded-xl border border-black/[0.08] bg-white px-2.5 text-xs font-bold tabular-nums text-apple-label shadow-sm active:scale-[0.98] active:bg-black/[0.03]"
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setCombo((c) => {
                      const t = c.trim();
                      if (!t) return c;
                      return t.endsWith("×") ? t : `${t}×`;
                    })
                  }
                  className="shrink-0 min-h-[34px] min-w-[2.65rem] rounded-xl border border-apple-blue/25 bg-apple-blue/8 px-2.5 text-xs font-bold text-apple-blue active:scale-[0.98]"
                  aria-label="Dấu nhân"
                >
                  ×
                </button>
              </div>
              <button
                type="button"
                onClick={addFromCombo}
                className="mt-2 w-full rounded-2xl bg-apple-blue py-2.5 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"
              >
                Thêm dòng
              </button>
            </div>

            {declaredPcs != null ? (
              <div
                className={`rounded-xl border px-3 py-2 text-[11px] leading-snug ${
                  lines.length === 0
                    ? "border-black/[0.08] bg-black/[0.03] text-apple-secondary"
                    : pcsExcess
                      ? "border-red-300 bg-red-50 text-red-950"
                      : pcsShort
                        ? "border-amber-200 bg-amber-50/90 text-amber-950"
                        : "border-emerald-200 bg-emerald-50/90 text-emerald-950"
                }`}
                role="status"
              >
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <span className="font-semibold">Kiện lô (K): {declaredPcs}</span>
                  {lines.length > 0 ? (
                    <>
                      <span className="text-apple-tertiary">→</span>
                      <span className="font-mono font-bold">Tổng kiện DIM: {sumDimPcs}</span>
                    </>
                  ) : null}
                </div>
                {lines.length > 0 ? (
                  <p className="mt-1.5 text-[11px] font-medium leading-snug">
                    {pcsExcess ? (
                      <span className="text-red-800">Dư kiện — không lưu được. Giảm kiện trong các dòng.</span>
                    ) : pcsShort ? (
                      <span className="text-amber-900">Thiếu kiện so với lô — vẫn có thể lưu DIM.</span>
                    ) : (
                      <span className="text-emerald-800">Khớp kiện.</span>
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-apple-secondary">Các dòng</span>
                <span className="text-[10px] text-apple-tertiary">{lines.length}</span>
              </div>
              {lines.length === 0 ? (
                <p className="rounded-xl border border-dashed border-black/[0.12] py-5 text-center text-xs text-apple-tertiary">
                  Chưa có dòng
                </p>
              ) : (
                <ul className="space-y-2">
                  {lines.map((line, idx) => {
                    const sub = lineDimKg(line, divisor, dimPolicy);
                    return (
                      <li
                        key={`${idx}-${line.lCm}-${line.wCm}-${line.hCm}-${line.pcs}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.08] bg-black/[0.02] px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs font-semibold text-apple-label">
                            {line.lCm}×{line.wCm}×{line.hCm}{" "}
                            <span className="text-apple-secondary">×{line.pcs}</span>
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium tabular-nums text-apple-secondary">
                            →{" "}
                            {sub != null ? `${formatDimKgDisplay(sub, dimPolicy)} kg` : "—"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-semibold text-red-600"
                        >
                          Xóa
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-black/[0.06] p-4 pt-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pcsExcess}
              title={pcsExcess ? "Dư kiện so với lô — không lưu được" : undefined}
              className="min-w-0 flex-1 rounded-full bg-apple-blue px-3 py-2.5 text-sm font-semibold text-white hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:bg-apple-tertiary disabled:text-white/85"
              onClick={handleSave}
            >
              Lưu DIM
            </button>
            <button
              type="button"
              className="rounded-full border border-black/[0.12] px-3 py-2.5 text-sm font-semibold text-apple-label hover:bg-black/[0.03]"
              onClick={handleClear}
            >
              Xóa DIM
            </button>
            <button
              type="button"
              className="rounded-full border border-black/[0.12] px-3 py-2.5 text-sm font-semibold text-apple-secondary hover:bg-black/[0.03]"
              onClick={onClose}
            >
              Hủy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
