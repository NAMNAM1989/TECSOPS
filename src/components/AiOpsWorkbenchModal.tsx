import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import { Button } from "../ui";
import { requestAiFeature, trackAiEvent } from "../utils/aiOpsClient";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

type FeatureId =
  | "booking"
  | "profile"
  | "sheet"
  | "esid"
  | "ask"
  | "checklist"
  | "dim"
  | "end-day";

export type AiBookingDraft = {
  awb: string;
  hawb: string;
  flight: string;
  flightDate: string;
  cutoff: string;
  dest: string;
  warehouse: Warehouse | "";
  pcs: number | null;
  kg: number | null;
  customer: string;
  note: string;
  confidence: number;
  warnings: string[];
};

export type AiProfileDraft = {
  name: string;
  code: string;
  taxCode: string;
  address: string;
  phone: string;
  email: string;
  shipper?: Record<string, string>;
  consignee?: Record<string, string>;
  goodsDescription?: string;
  warnings?: string[];
};

export type AiDimDraft = {
  lines: { lCm: number; wCm: number; hCm: number; pcs: number }[];
  divisor: 5000 | 6000;
  warnings: string[];
};

type Props = {
  open: boolean;
  sessionDate: string;
  selectedShipment: Shipment | null;
  onClose: () => void;
  onCreateBooking: (draft: AiBookingDraft) => Promise<void>;
  onSaveProfile: (draft: AiProfileDraft) => Promise<void>;
  onApplyDim: (draft: AiDimDraft) => Promise<void>;
  onApplyEsidDraft: (draft: string) => Promise<void>;
};

const FEATURES: { id: FeatureId; label: string; hint: string }[] = [
  { id: "booking", label: "Tin → Booking", hint: "Dán email/Zalo booking để tạo draft." },
  { id: "profile", label: "Ảnh → Hồ sơ", hint: "OCR name card/hồ sơ; luôn xem trước khi lưu." },
  { id: "sheet", label: "Giải thích Sheet", hint: "Dán JSON array các dòng lỗi/mơ hồ." },
  { id: "esid", label: "Draft eSID", hint: "Dán tên hàng, điểm đến, ghi chú." },
  { id: "ask", label: "Ops Ask", hint: "Hỏi dữ liệu phiên hiện tại; snapshot đã loại PII." },
  { id: "checklist", label: "Checklist", hint: "Kiểm tra rule trên lô đang chọn." },
  { id: "dim", label: "Parse DIM", hint: "Dán DIM bẩn, ví dụ 40x30x20/2." },
  { id: "end-day", label: "Cuối ngày", hint: "Tóm tắt aggregate phiên hiện tại." },
];

const ROUTE: Record<FeatureId, string> = {
  booking: "parse-booking-text",
  profile: "parse-profile-image",
  sheet: "explain-sheet-rows",
  esid: "draft-esid-other-request",
  ask: "ops-ask",
  checklist: "anomaly-checklist",
  dim: "parse-dim-text",
  "end-day": "end-of-day-summary",
};

function readImage(event: ChangeEvent<HTMLInputElement>, onReady: (value: string) => void) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 7_500_000) {
    throw new Error("Chỉ nhận PNG/JPEG/WEBP tối đa 7.5MB.");
  }
  const reader = new FileReader();
  reader.onload = () => onReady(String(reader.result || ""));
  reader.readAsDataURL(file);
}

export function AiOpsWorkbenchModal({
  open,
  sessionDate,
  selectedShipment,
  onClose,
  onCreateBooking,
  onSaveProfile,
  onApplyDim,
  onApplyEsidDraft,
}: Props) {
  const [feature, setFeature] = useState<FeatureId>("booking");
  const [source, setSource] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const selectedFeature = FEATURES.find((item) => item.id === feature)!;

  useModalFocusTrap(open, dialogRef, onClose, 'button[aria-label="Công cụ"]');

  useEffect(() => {
    setResult(null);
    setError("");
  }, [feature]);

  const payload = useMemo<Record<string, unknown>>(() => {
    if (feature === "profile") return { imageDataUrl };
    if (feature === "sheet") {
      try {
        return { rows: JSON.parse(source) as unknown };
      } catch {
        return { rows: [] };
      }
    }
    if (feature === "esid") {
      return {
        goods: source,
        dest: selectedShipment?.dest || "",
        note: selectedShipment?.note || "",
        specialHandling: selectedShipment?.otherRequirementsPrint || "",
      };
    }
    if (feature === "ask") return { question: source, sessionDate };
    if (feature === "checklist") return selectedShipment ? { ...selectedShipment } : {};
    if (feature === "end-day") return { sessionDate };
    return { text: source };
  }, [feature, imageDataUrl, selectedShipment, sessionDate, source]);

  async function onGenerate() {
    setBusy(true);
    setError("");
    setResult(null);
    trackAiEvent(`ai_${feature}_ui_start`, { hasSelection: Boolean(selectedShipment) });
    try {
      if (feature === "sheet") {
        const rows = payload.rows;
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error("Sheet cần JSON array có ít nhất một dòng.");
        }
      }
      if (feature === "profile" && !imageDataUrl) throw new Error("Chưa chọn ảnh.");
      if (feature === "checklist" && !selectedShipment) throw new Error("Hãy chọn một lô trước.");
      const response = await requestAiFeature<unknown>(ROUTE[feature], payload);
      if (!response.ok) throw new Error(response.error || "AI không trả kết quả.");
      setResult(response.result ?? null);
      trackAiEvent(`ai_${feature}_ui_ok`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "AI thất bại.";
      setError(message);
      trackAiEvent(`ai_${feature}_ui_fail`, { message });
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!result) return;
    setConfirming(true);
    setError("");
    try {
      if (feature === "booking") await onCreateBooking(result as AiBookingDraft);
      else if (feature === "profile") await onSaveProfile(result as AiProfileDraft);
      else if (feature === "dim") await onApplyDim(result as AiDimDraft);
      else if (feature === "esid") {
        await onApplyEsidDraft(String((result as { draft?: unknown }).draft || ""));
      }
      else return;
      trackAiEvent(`ai_${feature}_confirm`);
      setResult(null);
      setSource("");
      setImageDataUrl("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không áp dụng được draft.");
    } finally {
      setConfirming(false);
    }
  }

  function updateBooking(field: keyof AiBookingDraft, value: string) {
    setResult((previous: unknown) => {
      if (!previous || typeof previous !== "object") return previous;
      const nextValue =
        field === "pcs" || field === "kg"
          ? value === "" ? null : Number(value)
          : value;
      return { ...previous, [field]: nextValue };
    });
  }

  if (!open) return null;
  const canConfirm = ["booking", "profile", "esid", "dim"].includes(feature) && Boolean(result);
  const booking = feature === "booking" ? (result as AiBookingDraft | null) : null;
  const esidDraft =
    feature === "esid" && result && typeof result === "object"
      ? String((result as { draft?: unknown }).draft || "")
      : "";

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="presentation">
      <section
        aria-label="Trợ lý AI Ops"
        aria-modal="true"
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        role="dialog"
        ref={dialogRef}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-bold text-ui-navy">Trợ lý AI Ops</h2>
            <p className="text-xs text-slate-600">Chỉ tạo draft/gợi ý — không submit portal.</p>
          </div>
          <Button aria-label="Đóng trợ lý AI" onClick={onClose} variant="ghost">Đóng</Button>
        </header>

        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 p-2" role="tablist" aria-label="Tính năng AI">
          {FEATURES.map((item) => (
            <button
              aria-selected={feature === item.id}
              className={`min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold ${
                feature === item.id ? "bg-ui-navy text-white" : "bg-slate-100 text-slate-700"
              }`}
              key={item.id}
              onClick={() => setFeature(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{selectedFeature.hint}</p>
            {feature === "profile" ? (
              <input
                accept="image/png,image/jpeg,image/webp"
                className="min-h-11 w-full rounded-xl border border-slate-300 p-2"
                onChange={(event) => {
                  try {
                    readImage(event, setImageDataUrl);
                    setError("");
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "Ảnh không hợp lệ.");
                  }
                }}
                type="file"
              />
            ) : feature === "checklist" || feature === "end-day" ? (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                {feature === "checklist"
                  ? selectedShipment
                    ? `Lô: ${selectedShipment.awb || "(chưa AWB)"} · ${selectedShipment.warehouse}`
                    : "Chưa chọn lô."
                  : `Phiên: ${sessionDate}`}
              </div>
            ) : (
              <textarea
                aria-label={`Đầu vào ${selectedFeature.label}`}
                className="min-h-44 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                onChange={(event) => setSource(event.target.value)}
                placeholder={feature === "sheet" ? '[{"AWB":"...","PCS":"..."}]' : selectedFeature.hint}
                ref={inputRef}
                value={source}
              />
            )}
            <Button disabled={busy} onClick={() => void onGenerate()}>
              {busy ? "Gemini đang xử lý…" : "Tạo draft"}
            </Button>
            {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-ui-navy">Xem trước</h3>
            {booking ? (
              <div className="grid grid-cols-2 gap-2">
                {(["awb", "hawb", "flight", "flightDate", "cutoff", "dest", "customer", "note"] as const).map((field) => (
                  <label className={field === "note" ? "col-span-2 text-xs" : "text-xs"} key={field}>
                    <span className="font-semibold uppercase text-slate-600">{field}</span>
                    <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm" onChange={(event) => updateBooking(field, event.target.value)} value={String(booking[field] ?? "")} />
                  </label>
                ))}
                {(["pcs", "kg"] as const).map((field) => (
                  <label className="text-xs" key={field}>
                    <span className="font-semibold uppercase text-slate-600">{field}</span>
                    <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm" min="0" onChange={(event) => updateBooking(field, event.target.value)} type="number" value={booking[field] ?? ""} />
                  </label>
                ))}
              </div>
            ) : esidDraft ? (
              <textarea
                aria-label="Draft other request eSID"
                className="min-h-36 w-full rounded-xl border border-slate-300 p-3 text-sm"
                onChange={(event) =>
                  setResult((previous: unknown) => ({ ...(previous as object), draft: event.target.value }))
                }
                value={esidDraft}
              />
            ) : result ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Chưa có draft.</p>
            )}
            {canConfirm ? (
              <Button disabled={confirming} onClick={() => void onConfirm()}>
                {confirming ? "Đang áp dụng…" : feature === "booking" ? "Xác nhận tạo booking" : feature === "profile" ? "Xác nhận lưu khách" : feature === "esid" ? "Áp dụng draft vào lô" : "Áp dụng DIM vào lô"}
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
