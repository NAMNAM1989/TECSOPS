import { useEffect, useState } from "react";
import {
  fetchAiStatus,
  requestImprovementReport,
  trackAiEvent,
  type AiImprovementPriority,
  type AiImprovementReportResult,
  type AiOpsStatus,
  type AiUiFinding,
} from "../utils/aiOpsClient";
import { copyTextToClipboard } from "../utils/copyTextToClipboard";

type Props = {
  open: boolean;
  onClose: () => void;
};

const PRIORITY_TONE: Record<string, string> = {
  P0: "bg-rose-100 text-rose-900 ring-rose-200",
  P1: "bg-amber-100 text-amber-950 ring-amber-200",
  P2: "bg-slate-100 text-slate-800 ring-slate-200",
};

function CopyButton({
  label,
  text,
  eventName,
}: {
  label: string;
  text: string;
  eventName?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  if (!text.trim()) return null;
  return (
    <button
      type="button"
      className="rounded-lg border border-teal-300 bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-900 hover:bg-teal-100"
      onClick={() => {
        void copyTextToClipboard(text).then((ok) => {
          setState(ok ? "ok" : "fail");
          if (ok && eventName) trackAiEvent(eventName, { chars: text.length });
          window.setTimeout(() => setState("idle"), 1600);
        });
      }}
    >
      {state === "ok" ? "Đã copy ✓" : state === "fail" ? "Copy lỗi" : label}
    </button>
  );
}

function PriorityCard({ item }: { item: AiImprovementPriority }) {
  const [showPrompt, setShowPrompt] = useState(false);
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${PRIORITY_TONE[item.priority] || PRIORITY_TONE.P2}`}
        >
          {item.priority}
        </span>
        <span className="text-[13px] font-bold text-slate-900">{item.title}</span>
      </div>
      {item.evidence ? (
        <p className="mb-1 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-700">Bằng chứng: </span>
          {item.evidence}
        </p>
      ) : null}
      {item.proposal ? (
        <p className="mb-1 text-[11px] text-slate-700">
          <span className="font-semibold">Đề xuất: </span>
          {item.proposal}
        </p>
      ) : null}
      {item.estimatedImpact ? (
        <p className="mb-1.5 text-[10px] font-medium text-teal-800">{item.estimatedImpact}</p>
      ) : null}
      {item.targetFiles?.length ? (
        <p className="mb-1.5 font-mono text-[10px] text-slate-500">
          {item.targetFiles.join(" · ")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <CopyButton
          label="Copy prompt Cursor"
          text={item.cursorPrompt || ""}
          eventName="ai.cursor_prompt.copy"
        />
        {item.cursorPrompt ? (
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
            onClick={() => setShowPrompt((v) => !v)}
          >
            {showPrompt ? "Ẩn prompt" : "Xem prompt"}
          </button>
        ) : null}
      </div>
      {showPrompt && item.cursorPrompt ? (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-800">
          {item.cursorPrompt}
        </pre>
      ) : null}
    </li>
  );
}

function UiFindingCard({ item }: { item: AiUiFinding }) {
  return (
    <li className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-2.5">
      <p className="text-[11px] font-bold text-indigo-950">
        <span className="rounded bg-indigo-100 px-1 py-0.5 text-[9px] uppercase tracking-wide text-indigo-800">
          {item.area}
        </span>{" "}
        {item.observation}
      </p>
      {item.painPoint ? (
        <p className="mt-1 text-[10px] text-indigo-900/80">
          <span className="font-semibold">Pain: </span>
          {item.painPoint}
        </p>
      ) : null}
      {item.relatedComponents?.length ? (
        <p className="mt-1 font-mono text-[9px] text-indigo-800/70">
          {item.relatedComponents.join(" · ")}
        </p>
      ) : null}
    </li>
  );
}

export function AiImprovementReportModal({ open, onClose }: Props) {
  const [status, setStatus] = useState<AiOpsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AiImprovementReportResult | null>(null);
  const [depth, setDepth] = useState<"deep" | "standard">("deep");

  useEffect(() => {
    if (!open) return;
    setError("");
    let cancelled = false;
    void fetchAiStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const runReport = async () => {
    setBusy(true);
    setError("");
    trackAiEvent("ai.improvement_report.start", { depth, days: 7 });
    try {
      const out = await requestImprovementReport(7, depth);
      if (!out.ok) {
        setError(out.error || "Không tạo được báo cáo");
        setResult(null);
        trackAiEvent("ai.improvement_report.fail", {
          error: String(out.code || out.error || "fail").slice(0, 80),
        });
      } else {
        setResult(out);
        trackAiEvent("ai.improvement_report.ok", {
          depth: out.depth || depth,
          priorities: out.report?.priorities?.length ?? 0,
          uiFindings: out.report?.uiFindings?.length ?? 0,
        });
      }
      const s = await fetchAiStatus();
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setBusy(false);
    }
  };

  const priorities = result?.report?.priorities ?? [];
  const uiFindings = result?.report?.uiFindings ?? [];
  const bundle = result?.report?.cursorBundlePrompt || "";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-improve-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-ui-surface shadow-xl ring-1 ring-ui-border">
        <header className="flex items-start justify-between gap-2 border-b border-ui-border px-4 py-3">
          <div>
            <h2 id="ai-improve-title" className="m-0 text-[15px] font-bold text-ui-text">
              Đề xuất AI (Gemini)
            </h2>
            <p className="mt-0.5 text-[11px] text-ui-text-muted">
              Nghiên cứu UI Ops + telemetry → đề xuất + prompt dán Cursor. Không tự sửa dữ liệu
              hay submit hải quan.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            disabled={busy}
          >
            Đóng
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-700">
            {status == null ? (
              <span>Đang kiểm tra Gemini…</span>
            ) : status.configured ? (
              <span>
                Gemini sẵn sàng · model{" "}
                <span className="font-mono font-semibold">{status.model}</span>
                {" · "}
                {status.eventCount7d} event / 7 ngày
              </span>
            ) : (
              <span>
                Chưa cấu hình <span className="font-mono">GEMINI_API_KEY</span>. Thêm vào{" "}
                <span className="font-mono">.env.local</span> (local) hoặc Railway Variables rồi
                restart server.
              </span>
            )}
          </div>

          <div
            className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1"
            role="tablist"
            aria-label="Độ sâu phân tích AI"
          >
            {(
              [
                ["deep", "Nghiên cứu UI sâu"],
                ["standard", "Nhanh"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={depth === id}
                disabled={busy}
                onClick={() => setDepth(id)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                  depth === id
                    ? "bg-teal-700 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500">
            {depth === "deep"
              ? "Deep: phân tích catalog UI (Ops/eCargo/Sheet/filter) + sinh prompt Cursor từng mục (~1 phút)."
              : "Standard: đề xuất nhanh hơn, prompt Cursor ngắn hơn."}
          </p>

          <button
            type="button"
            disabled={busy || status?.configured === false}
            onClick={() => void runReport()}
            className="w-full rounded-xl bg-teal-700 px-3 py-2.5 text-[13px] font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? depth === "deep"
                ? "Gemini đang nghiên cứu UI…"
                : "Gemini đang phân tích…"
              : "Tạo báo cáo + prompt Cursor"}
          </button>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-900"
            >
              {error}
            </p>
          ) : null}

          {result?.ok && result.report ? (
            <>
              <section>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Tóm tắt
                  </h3>
                  {bundle ? (
                    <CopyButton
                      label="Copy gói prompt Cursor (P0)"
                      text={bundle}
                      eventName="ai.cursor_bundle.copy"
                    />
                  ) : null}
                </div>
                <p className="text-[12px] leading-relaxed text-slate-800">
                  {result.report.summary}
                </p>
                {result.generatedAt ? (
                  <p className="mt-1 text-[10px] text-slate-400">
                    {new Date(result.generatedAt).toLocaleString("vi-VN")} ·{" "}
                    {result.aggregate?.total ?? 0} event
                    {result.depth ? ` · ${result.depth}` : ""}
                  </p>
                ) : null}
              </section>

              {uiFindings.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Nghiên cứu UI
                  </h3>
                  <ul className="space-y-2">
                    {uiFindings.map((f) => (
                      <UiFindingCard key={f.id} item={f} />
                    ))}
                  </ul>
                </section>
              ) : null}

              <section>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Ưu tiên nâng cấp · prompt Cursor
                </h3>
                {priorities.length === 0 ? (
                  <p className="text-[12px] text-slate-500">Chưa có mục ưu tiên.</p>
                ) : (
                  <ul className="space-y-2">
                    {priorities.map((p) => (
                      <PriorityCard key={p.id} item={p} />
                    ))}
                  </ul>
                )}
              </section>

              {result.report.doNotAutomate?.length ? (
                <section>
                  <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Không tự động hóa
                  </h3>
                  <ul className="list-inside list-disc text-[11px] text-slate-600">
                    {result.report.doNotAutomate.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
