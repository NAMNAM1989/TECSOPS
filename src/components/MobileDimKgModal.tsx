import { useCallback, useEffect, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import { useDimSpeechRecognition } from "../hooks/useDimSpeechRecognition";
import {
  numbersFromDimVoiceTranscript,
  preprocessDimVoiceTranscript,
} from "../utils/dimVoiceTranscript";
import {
  type DimDivisor,
  type DimPieceLine,
  DIM_DIVISORS,
  lineDimKg,
  parseDimLineQuadsFromNumbers,
  parseKgInput,
  parsePositiveNumbersFromText,
  totalDimKgFromLines,
} from "../utils/volumetricDim";

type Tab = "calc" | "direct";

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

/** Trên bàn phím số mobile, phím "," → coi như phân cách nhân (×) giữa các cạnh. */
function normalizeDimComboInput(raw: string): string {
  return raw
    .replace(/,/g, "×")
    .replace(/\u060C/g, "×")
    .replace(/\*/g, "×");
}

type VoiceHintTone = "ok" | "warn" | "err";

function DimVoiceHero({
  variant,
  speechOk,
  listening,
  liveCaption,
  hint,
  onMicPress,
}: {
  variant: "calc" | "direct";
  speechOk: boolean;
  listening: boolean;
  liveCaption: string;
  hint: { tone: VoiceHintTone; text: string } | null;
  onMicPress: () => void;
}) {
  const example =
    variant === "calc"
      ? "« một hai không, năm mươi, ba mươi, bốn » → 120×50×30 × 4 kiện"
      : "« một trăm tám mươi phẩy năm » hoặc « 185 phẩy 5 » → kg";

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white to-sky-50/90 p-4 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]"
      aria-label="Nhập DIM bằng giọng nói"
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-violet-200/30 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-sky-200/35 blur-2xl"
        aria-hidden
      />

      <div className="relative flex flex-col items-center text-center">
        <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/80 bg-white/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 shadow-sm">
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
          Nhận diện AI · tiếng Việt
        </span>
        <h3 className="mt-2.5 text-[15px] font-semibold leading-snug tracking-tight text-apple-label">
          Nhập DIM bằng giọng nói
        </h3>
        <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-apple-secondary">
          Nhanh, chính xác và dễ sửa — trình duyệt chuyển lời nói thành số; bạn vẫn kiểm tra trước khi lưu.
        </p>

        <div className="relative mt-4">
          {listening ? (
            <div
              className="absolute inset-x-0 -top-1 flex h-8 items-end justify-center gap-1"
              aria-hidden
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-1 origin-bottom rounded-full bg-violet-400/90 motion-safe:animate-[dim-voice-bar_0.9s_ease-in-out_infinite]"
                  style={{ animationDelay: `${i * 0.12}s`, height: `${10 + (i % 3) * 6}px` }}
                />
              ))}
            </div>
          ) : null}
          <button
            type="button"
            disabled={!speechOk}
            onClick={onMicPress}
            aria-pressed={listening}
            aria-label={listening ? "Đang nghe — chạm để hủy không khả dụng, nói xong sẽ tự dừng" : "Bắt đầu nói để nhập DIM"}
            className={`relative flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-lg transition-transform touch-manipulation active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45 ${
              listening
                ? "bg-gradient-to-br from-rose-500 to-orange-500 text-white ring-4 ring-rose-200/80"
                : "bg-gradient-to-br from-violet-600 to-sky-600 text-white ring-4 ring-violet-200/70 hover:from-violet-500 hover:to-sky-500"
            }`}
          >
            <svg className="h-9 w-9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 8c-2.21 0-4-1.12-4-2.5V16h8v.5C16 20.88 14.21 22 12 22z" />
            </svg>
          </button>
        </div>

        <p className="mt-3 text-[10px] font-medium text-apple-tertiary">
          {speechOk ? "Chạm nút mic — nói rõ từng số, tạm dừng giữa các nhóm nếu cần." : "Trình duyệt này chưa hỗ trợ mic — dùng Chrome (Android) hoặc nhập tay."}
        </p>

        <div
          className="mt-2 min-h-[2.5rem] w-full rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2 text-left text-[11px] leading-snug text-apple-label backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          {listening ? (
            liveCaption ? (
              <span className="text-apple-label">Đang nghe: {liveCaption}</span>
            ) : (
              <span className="text-violet-700">Đang lắng nghe…</span>
            )
          ) : (
            <span className="text-apple-secondary">
              Ví dụ: <span className="font-mono text-[10px] text-apple-label">{example}</span>
            </span>
          )}
        </div>

        {hint ? (
          <p
            className={`mt-2 w-full rounded-lg px-2 py-1.5 text-center text-[11px] font-medium leading-snug ${
              hint.tone === "ok"
                ? "bg-emerald-100/90 text-emerald-950"
                : hint.tone === "warn"
                  ? "bg-amber-100/90 text-amber-950"
                  : "bg-rose-100/90 text-rose-950"
            }`}
            role="status"
          >
            {hint.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function MobileDimKgModal({ row, onClose, onSave }: MobileDimKgModalProps) {
  const hasSavedBreakdown = (row.dimLines?.length ?? 0) > 0;
  const [tab, setTab] = useState<Tab>(() =>
    row.dimWeightKg != null && !hasSavedBreakdown ? "direct" : "calc"
  );
  const [combo, setCombo] = useState("");
  const [lines, setLines] = useState<DimPieceLine[]>(() => cloneLines(row.dimLines));
  const [divisor, setDivisor] = useState<DimDivisor>(row.dimDivisor ?? 6000);
  const [direct, setDirect] = useState(row.dimWeightKg != null ? String(row.dimWeightKg) : "");
  const [voiceHint, setVoiceHint] = useState<{ tone: VoiceHintTone; text: string } | null>(null);

  const { listening, liveCaption, start, abort, speechOk } = useDimSpeechRecognition();

  const totalDim = useMemo(() => totalDimKgFromLines(lines, divisor), [lines, divisor]);

  useEffect(() => {
    abort();
  }, [tab, abort]);

  useEffect(() => {
    if (!voiceHint) return;
    const t = window.setTimeout(() => setVoiceHint(null), 4200);
    return () => window.clearTimeout(t);
  }, [voiceHint]);

  const appendQuads = useCallback((parsed: DimPieceLine[]) => {
    if (parsed.length === 0) return;
    setLines((prev) => [...prev, ...parsed]);
  }, []);

  const addFromCombo = () => {
    const nums = parsePositiveNumbersFromText(combo);
    const parsed = parseDimLineQuadsFromNumbers(nums);
    if (parsed.length === 0) {
      window.alert("Cần ít nhất 3 số (D×R×C) hoặc 4 số (D×R×C×kiện). VD: 120 50 30 4");
      return;
    }
    appendQuads(parsed);
    setCombo("");
  };

  const startVoiceCalc = useCallback(() => {
    if (listening) {
      abort();
      return;
    }
    start({
      onFinal: (text) => {
        if (!text.trim()) {
          setVoiceHint({ tone: "warn", text: "Chưa có câu thoại — thử lại, nói rõ từng số." });
          return;
        }
        const nums = numbersFromDimVoiceTranscript(text);
        const parsed = parseDimLineQuadsFromNumbers(nums);
        if (parsed.length > 0) {
          appendQuads(parsed);
          setTab("calc");
          setVoiceHint({
            tone: "ok",
            text:
              parsed.length === 1
                ? "Đã thêm 1 nhóm kích thước từ giọng nói — kiểm tra bảng dưới."
                : `Đã thêm ${parsed.length} nhóm từ giọng nói — kiểm tra bảng dưới.`,
          });
          return;
        }
        const normalized = preprocessDimVoiceTranscript(text).replace(/\s+/g, "");
        setCombo(normalizeDimComboInput(normalized));
        setVoiceHint({
          tone: "warn",
          text: "Chưa đủ bộ 3–4 số — đã đưa phần nhận được vào ô nhập; chỉnh tay hoặc đọc lại (dài, rộng, cao, kiện).",
        });
      },
      onErrorMessage: (m) => setVoiceHint({ tone: "err", text: m }),
    });
  }, [abort, appendQuads, listening, start]);

  const startVoiceKg = useCallback(() => {
    if (listening) {
      abort();
      return;
    }
    start({
      onFinal: (text) => {
        if (!text.trim()) {
          setVoiceHint({ tone: "warn", text: "Chưa có câu thoại — đọc một số kg." });
          return;
        }
        const nums = numbersFromDimVoiceTranscript(text);
        if (nums[0] != null) {
          setDirect(String(nums[0]));
          setTab("direct");
          setVoiceHint({ tone: "ok", text: "Đã điền kg từ giọng nói — kiểm tra số trước khi lưu." });
          return;
        }
        setVoiceHint({
          tone: "warn",
          text: "Chưa trích được số — thử « 185 phẩy 5 » hoặc đọc từng chữ số.",
        });
      },
      onErrorMessage: (m) => setVoiceHint({ tone: "err", text: m }),
    });
  }, [abort, listening, start]);

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (tab === "direct") {
      const t = direct.trim();
      if (t === "") {
        onSave({ dimWeightKg: null, dimLines: null, dimDivisor: null });
        return;
      }
      const n = parseKgInput(t);
      if (n === null) {
        window.alert("Nhập số kg ≥ 0 hoặc để trống để xóa DIM.");
        return;
      }
      onSave({ dimWeightKg: n, dimLines: null, dimDivisor: null });
      return;
    }
    if (lines.length > 0 && totalDim != null) {
      onSave({ dimWeightKg: totalDim, dimLines: lines, dimDivisor: divisor });
      return;
    }
    const t = direct.trim();
    if (t !== "") {
      const n = parseKgInput(t);
      if (n !== null) {
        onSave({ dimWeightKg: n, dimLines: null, dimDivisor: null });
        return;
      }
    }
    window.alert("Thêm ít nhất một dòng D×R×C×kiện, hoặc chuyển tab Nhập kg.");
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
          <p className="mt-0.5 truncate font-mono text-xs text-apple-secondary">{row.awb}</p>

          <div className="mt-3 flex rounded-xl bg-black/[0.05] p-0.5">
            <button
              type="button"
              onClick={() => setTab("calc")}
              className={`min-w-0 flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                tab === "calc" ? "bg-white text-apple-label shadow-sm" : "text-apple-secondary"
              }`}
            >
              Tính khối
            </button>
            <button
              type="button"
              onClick={() => setTab("direct")}
              className={`min-w-0 flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                tab === "direct" ? "bg-white text-apple-label shadow-sm" : "text-apple-secondary"
              }`}
            >
              Nhập kg
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {tab === "calc" ? (
            <div className="space-y-4">
              <DimVoiceHero
                variant="calc"
                speechOk={speechOk}
                listening={listening}
                liveCaption={liveCaption}
                hint={voiceHint}
                onMicPress={startVoiceCalc}
              />

              <div>
                <label htmlFor="dim-combo" className="text-xs font-semibold text-apple-secondary">
                  Một dòng (cm + kiện)
                </label>
                <input
                  id="dim-combo"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={combo}
                  onChange={(e) => setCombo(normalizeDimComboInput(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "," || e.key === "\u060C") {
                      e.preventDefault();
                      const el = e.currentTarget;
                      const start = el.selectionStart ?? combo.length;
                      const end = el.selectionEnd ?? combo.length;
                      const ins = "×";
                      const next = combo.slice(0, start) + ins + combo.slice(end);
                      setCombo(next);
                      const pos = start + ins.length;
                      requestAnimationFrame(() => {
                        el.setSelectionRange(pos, pos);
                      });
                    }
                  }}
                  placeholder="VD: 120×50×30×4"
                  className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                />
                <p className="mt-1 text-[10px] leading-snug text-apple-tertiary">
                  Phím <span className="font-semibold text-apple-secondary">,</span> trên bàn phím số = nhập{" "}
                  <span className="font-semibold text-apple-secondary">×</span>. 4 số = D×R×C×kiện; nhiều nhóm nối
                  tiếp; chỉ 3 số → kiện = 1.
                </p>
                <button
                  type="button"
                  onClick={addFromCombo}
                  className="mt-2 w-full rounded-xl bg-apple-blue py-2.5 text-sm font-semibold text-white active:scale-[0.99]"
                >
                  ➕ Thêm vào danh sách
                </button>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-apple-secondary">Hệ số cm³/kg</p>
                <div className="mt-1 flex gap-1.5">
                  {DIM_DIVISORS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDivisor(d)}
                      className={`min-w-0 flex-1 rounded-xl py-2 text-xs font-bold tabular-nums ${
                        divisor === d
                          ? "bg-apple-blue text-white"
                          : "border border-black/[0.08] bg-white text-apple-label"
                      }`}
                    >
                      ÷{d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-apple-secondary">Các nhóm kiện</p>
                  <span className="text-[10px] text-apple-tertiary">{lines.length} dòng</span>
                </div>
                {lines.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-black/[0.12] py-6 text-center text-xs text-apple-tertiary">
                    Chưa có dòng — dùng mic phía trên, ô nhập, hoặc nút thêm.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {lines.map((line, idx) => {
                      const sub = lineDimKg(line, divisor);
                      return (
                        <li
                          key={`${idx}-${line.lCm}-${line.wCm}-${line.hCm}-${line.pcs}`}
                          className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.08] bg-black/[0.02] px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs font-semibold text-apple-label">
                              {line.lCm}×{line.wCm}×{line.hCm}{" "}
                              <span className="text-apple-secondary">×{line.pcs} kt</span>
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium tabular-nums text-apple-secondary">
                              → {sub != null ? `${sub} kg` : "—"} <span className="text-apple-tertiary">÷{divisor}</span>
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

              <div className="rounded-xl border border-apple-blue/25 bg-apple-blue/5 px-3 py-2.5">
                <p className="text-[10px] font-medium text-apple-secondary">Tổng DIM</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-apple-label">
                  {totalDim != null ? `${totalDim} kg` : "—"}
                </p>
                <p className="mt-0.5 text-[10px] text-apple-tertiary">÷{divisor} · cộng tất cả dòng</p>
              </div>

              {row.kg != null ? (
                <p className="text-[11px] text-apple-secondary">
                  Trọng G khai: <span className="font-semibold text-apple-label">{row.kg} kg</span>
                  {totalDim != null && totalDim > row.kg ? (
                    <span className="text-apple-tertiary"> — tổng DIM cao hơn G</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <DimVoiceHero
                variant="direct"
                speechOk={speechOk}
                listening={listening}
                liveCaption={liveCaption}
                hint={voiceHint}
                onMicPress={startVoiceKg}
              />

              <div>
                <label htmlFor="dim-kg-direct" className="text-xs font-semibold text-apple-secondary">
                  Trọng lượng thể tích (kg)
                </label>
                <input
                  id="dim-kg-direct"
                  type="text"
                  inputMode="decimal"
                  value={direct}
                  onChange={(e) => setDirect(e.target.value)}
                  placeholder="VD: 185.5"
                  className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                />
                <p className="mt-1 text-[10px] text-apple-tertiary">
                  Chỉ nhập một số — không lưu chi tiết từng kiện.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-black/[0.06] p-4 pt-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="min-w-0 flex-1 rounded-full bg-apple-blue px-3 py-2.5 text-sm font-semibold text-white hover:bg-apple-blue-hover"
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
