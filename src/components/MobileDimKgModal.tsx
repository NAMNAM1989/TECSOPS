import { useEffect, useMemo, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
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

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface MobileDimKgModalProps {
  row: Shipment;
  onClose: () => void;
  onSave: (payload: MobileDimSavePayload) => void;
}

function cloneLines(lines: DimPieceLine[] | null): DimPieceLine[] {
  if (!lines?.length) return [];
  return lines.map((l) => ({ ...l }));
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
  const [listening, setListening] = useState<"combo" | "kg" | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);

  const totalDim = useMemo(() => totalDimKgFromLines(lines, divisor), [lines, divisor]);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, []);

  const appendQuads = (parsed: DimPieceLine[]) => {
    if (parsed.length === 0) return;
    setLines((prev) => [...prev, ...parsed]);
  };

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

  const startListen = (mode: "combo" | "kg") => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      window.alert("Trình duyệt không hỗ trợ đọc giọng. Thử Chrome trên Android.");
      return;
    }
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "vi-VN";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setListening(mode);

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const text = ev.results[0]?.[0]?.transcript ?? "";
      const nums = parsePositiveNumbersFromText(text);
      if (mode === "kg") {
        if (nums[0] != null) {
          setDirect(String(nums[0]));
          setTab("direct");
        }
      } else {
        const parsed = parseDimLineQuadsFromNumbers(nums);
        if (parsed.length > 0) {
          appendQuads(parsed);
          setTab("calc");
        }
      }
    };

    rec.onerror = () => setListening(null);
    rec.onend = () => {
      setListening(null);
      recRef.current = null;
    };

    try {
      rec.start();
    } catch {
      setListening(null);
      window.alert("Không bật được mic. Kiểm tra quyền microphone.");
    }
  };

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

  const speechOk = typeof window !== "undefined" && getSpeechRecognitionCtor() != null;

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dim-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,640px)] w-full max-w-sm flex-col rounded-2xl border border-black/[0.08] bg-white shadow-xl"
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
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="dim-combo" className="text-xs font-semibold text-apple-secondary">
                    Một dòng (cm + kiện)
                  </label>
                  <button
                    type="button"
                    disabled={!speechOk}
                    onClick={() => startListen("combo")}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                      listening === "combo"
                        ? "animate-pulse border-red-300 bg-red-50 text-red-600"
                        : "border-black/[0.1] text-apple-blue disabled:opacity-40"
                    }`}
                  >
                    <span aria-hidden>🎤</span> Đọc số
                  </button>
                </div>
                <input
                  id="dim-combo"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={combo}
                  onChange={(e) => setCombo(e.target.value)}
                  placeholder="VD: 120 50 30 4"
                  className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                />
                <p className="mt-1 text-[10px] leading-snug text-apple-tertiary">
                  4 số = D×R×C×số kiện. Nhiều nhóm: 120 50 30 4 80 60 40 2. Chỉ 3 số → kiện = 1.
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
                    Chưa có dòng — dùng ô trên hoặc 🎤 đọc 4 số mỗi nhóm.
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
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="dim-kg-direct" className="text-xs font-semibold text-apple-secondary">
                    Trọng lượng thể tích (kg)
                  </label>
                  <button
                    type="button"
                    disabled={!speechOk}
                    onClick={() => startListen("kg")}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                      listening === "kg"
                        ? "animate-pulse border-red-300 bg-red-50 text-red-600"
                        : "border-black/[0.1] text-apple-blue disabled:opacity-40"
                    }`}
                  >
                    <span aria-hidden>🎤</span> Đọc kg
                  </button>
                </div>
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
