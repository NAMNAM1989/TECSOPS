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
  lineDimKg,
  parseDimLineQuadsFromNumbers,
  parsePositiveNumbersFromText,
  totalDimKgFromLines,
} from "../utils/volumetricDim";

export type MobileDimSavePayload = {
  dimWeightKg: number | null;
  dimLines: DimPieceLine[] | null;
  dimDivisor: DimDivisor | null;
};

/** Hệ số cố định — giao diện không còn chọn 5000/6000 */
const DIM_DIVISOR_UI: DimDivisor = 6000;

interface MobileDimKgModalProps {
  row: Shipment;
  onClose: () => void;
  onSave: (payload: MobileDimSavePayload) => void;
}

function cloneLines(lines: DimPieceLine[] | null): DimPieceLine[] {
  if (!lines?.length) return [];
  return lines.map((l) => ({ ...l }));
}

/** Trên bàn phím số mobile, phím "," → coi như phân cách nhân (×) giữa các cạnh. */
function normalizeDimComboInput(raw: string): string {
  return raw
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

/** Mic + tổng DIM (không hướng dẫn chữ). */
function DimMicTotalRow({
  speechOk,
  listening,
  liveCaption,
  totalDim,
  onMicPress,
}: {
  speechOk: boolean;
  listening: boolean;
  liveCaption: string;
  totalDim: number | null;
  onMicPress: () => void;
}) {
  return (
    <section className="rounded-xl border border-violet-200/60 bg-violet-50/40 p-3" aria-label="Mic và tổng DIM">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          {listening ? (
            <div className="absolute inset-x-0 -top-0.5 flex h-6 items-end justify-center gap-0.5" aria-hidden>
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
            aria-label={listening ? "Đang nghe — chạm lại để dừng" : "Mic nhập DIM"}
            className={`relative mt-1 flex h-14 w-14 items-center justify-center rounded-full shadow-md transition-transform touch-manipulation active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45 ${
              listening
                ? "bg-gradient-to-br from-rose-500 to-orange-500 text-white ring-2 ring-rose-200/90"
                : "bg-gradient-to-br from-violet-600 to-sky-600 text-white ring-2 ring-violet-200/80"
            }`}
          >
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 8c-2.21 0-4-1.12-4-2.5V16h8v.5C16 20.88 14.21 22 12 22z" />
            </svg>
          </button>
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-[11px] font-medium text-apple-secondary">Tổng DIM</p>
          <p className="text-2xl font-bold leading-tight tabular-nums tracking-tight text-apple-label">
            {totalDim != null ? `${totalDim} kg` : "—"}
          </p>
          {listening && liveCaption ? (
            <p className="mt-1 line-clamp-2 text-left text-[11px] text-violet-700" aria-live="polite">
              {liveCaption}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function MobileDimKgModal({ row, onClose, onSave }: MobileDimKgModalProps) {
  const [combo, setCombo] = useState("");
  const [lines, setLines] = useState<DimPieceLine[]>(() => cloneLines(row.dimLines));

  const { listening, liveCaption, start, finalize, speechOk } = useDimSpeechRecognition();

  const totalDim = useMemo(() => totalDimKgFromLines(lines, DIM_DIVISOR_UI), [lines]);

  const sumDimPcs = useMemo(() => lines.reduce((s, l) => s + l.pcs, 0), [lines]);
  const declaredPcs = row.pcs;
  const pcsMismatch = declaredPcs != null && lines.length > 0 && sumDimPcs !== declaredPcs;

  const appendQuads = useCallback((parsed: DimPieceLine[]) => {
    if (parsed.length === 0) return;
    setLines((prev) => [...prev, ...parsed]);
  }, []);

  const addFromCombo = () => {
    const nums = parsePositiveNumbersFromText(combo);
    const parsed = parseDimLineQuadsFromNumbers(nums);
    if (parsed.length === 0) {
      window.alert("Cần ít nhất 3 số (D×R×C) hoặc 4 số (D×R×C×kiện).");
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
    start({
      continuous: true,
      onFinal: (text) => {
        if (!text.trim()) {
          window.alert("Chưa nghe được câu thoại — thử lại.");
          return;
        }
        const nums = numbersFromDimVoiceTranscript(text);
        const parsed = parseDimLineQuadsFromNumbers(nums);
        if (parsed.length > 0) {
          appendQuads(parsed);
          return;
        }
        const normalized = preprocessDimVoiceTranscript(text).replace(/\s+/g, "");
        setCombo(normalizeDimComboInput(normalized));
        window.alert("Chưa đủ bộ số — đã đưa phần nhận được vào ô nhập.");
      },
      onErrorMessage: (m) => window.alert(m),
    });
  }, [appendQuads, finalize, listening, start]);

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (lines.length > 0 && totalDim != null) {
      if (declaredPcs != null && sumDimPcs !== declaredPcs) {
        window.alert(
          `Tổng kiện DIM (${sumDimPcs}) phải bằng kiện lô (${declaredPcs}).`
        );
        return;
      }
      onSave({ dimWeightKg: totalDim, dimLines: lines, dimDivisor: DIM_DIVISOR_UI });
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
        className="flex max-h-[min(92vh,680px)] w-full max-w-sm flex-col rounded-2xl border border-black/[0.08] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-black/[0.06] p-4 pb-3">
          <h2 id="dim-modal-title" className="text-base font-semibold text-apple-label">
            DIM — D×R×C × kiện
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <div className="space-y-3">
            <DimMicTotalRow
              speechOk={speechOk}
              listening={listening}
              liveCaption={liveCaption}
              totalDim={totalDim}
              onMicPress={startVoiceCalc}
            />

            <div>
              <input
                id="dim-combo"
                type="text"
                inputMode="text"
                enterKeyHint="done"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={combo}
                onChange={(e) => setCombo(normalizeDimComboInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
                    e.preventDefault();
                    addFromCombo();
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
                placeholder="120×50×30×4"
                className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-base text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DIM_QUICK_NUMS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCombo((c) => appendDimComboNumber(c, n))}
                    className="min-h-[36px] min-w-[2.5rem] rounded-lg border border-black/[0.1] bg-white px-2 text-xs font-bold tabular-nums text-apple-label active:bg-black/[0.04]"
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
                  className="min-h-[36px] min-w-[2.5rem] rounded-lg border border-apple-blue/30 bg-apple-blue/10 px-2 text-xs font-bold text-apple-blue"
                  aria-label="×"
                >
                  ×
                </button>
              </div>
              <button
                type="button"
                onClick={addFromCombo}
                className="mt-2 w-full rounded-xl bg-apple-blue py-2.5 text-sm font-semibold text-white active:scale-[0.99]"
              >
                Thêm dòng
              </button>
            </div>

            {declaredPcs != null ? (
              <div
                className={`rounded-xl border px-3 py-2 text-[11px] leading-snug ${
                  lines.length === 0
                    ? "border-black/[0.08] bg-black/[0.03] text-apple-secondary"
                    : pcsMismatch
                      ? "border-amber-300 bg-amber-50 text-amber-950"
                      : "border-emerald-200 bg-emerald-50/90 text-emerald-950"
                }`}
                role="status"
              >
                <span className="font-semibold">Kiện lô: {declaredPcs}</span>
                {lines.length > 0 ? (
                  <>
                    {" · "}
                    <span className="font-mono font-bold">DIM: {sumDimPcs}</span>
                    {pcsMismatch ? (
                      <span className="block pt-1 font-semibold">Chưa khớp kiện — không lưu được.</span>
                    ) : (
                      <span className="text-emerald-800"> ✓</span>
                    )}
                  </>
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
                    const sub = lineDimKg(line, DIM_DIVISOR_UI);
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
                            → {sub != null ? `${sub} kg` : "—"}
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
              disabled={pcsMismatch}
              title={pcsMismatch ? "Kiện DIM phải khớp kiện lô" : undefined}
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
