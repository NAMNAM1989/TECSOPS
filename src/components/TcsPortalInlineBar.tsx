import type { TcsPortalActions } from "../hooks/useTcsPortalActions";
import {
  clearTcsAgentBaseUrl,
  downloadPdfFromAgent,
  getTcsAgentBaseUrl,
  setTcsAgentBaseUrl,
} from "../utils/tcsPortalAgentApi";

type Props = {
  tcs: TcsPortalActions;
  onClearFocus?: () => void;
  /** Gọn cho mobile */
  compact?: boolean;
};

export function TcsPortalInlineBar({ tcs, onClearFocus, compact = false }: Props) {
  const btn =
    "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-45 active:scale-[0.98]";
  const btnGhost =
    `${btn} border border-sky-500/25 bg-sky-50/90 text-sky-900 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/50`;
  const btnScan = `${btn} bg-sky-600 text-white hover:bg-sky-700 shadow-sm`;

  const configureAgentUrl = () => {
    const current = getTcsAgentBaseUrl();
    const next = window.prompt(
      "URL agent TCS (để trống = proxy /tcs-agent qua máy đang mở Ops).\n" +
        "Máy khác trong LAN: giữ trống và mở Ops bằng IP máy kho.\n" +
        "Tuỳ chọn: http://IP-máy-kho:8765 hoặc HTTPS tunnel.",
      current.includes("/tcs-agent") ? "" : current
    );
    if (next === null) return;
    if (!next.trim()) clearTcsAgentBaseUrl();
    else setTcsAgentBaseUrl(next);
    void tcs.refreshHealth();
  };

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-0.5" : "gap-1"}`}>
      <div
        className={`flex min-w-0 flex-wrap items-center gap-1 rounded-full border border-sky-500/20 bg-gradient-to-r from-white via-white to-sky-50/80 px-1.5 py-1 shadow-sm dark:border-sky-400/20 dark:from-dashboard-surface-dark dark:via-dashboard-surface-dark dark:to-sky-950/40 ${
          compact ? "" : "sm:flex-nowrap"
        }`}
        role="toolbar"
        aria-label="Cổng TCS"
      >
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            tcs.session?.logged_in
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : tcs.health?.ok
                ? "bg-amber-500/15 text-amber-900 dark:text-amber-200"
                : "bg-slate-500/15 text-slate-700 dark:text-slate-300"
          }`}
          title={`Agent ${tcs.health?.ok ? "OK" : "offline"} · ${tcs.sessionLabel} · ${getTcsAgentBaseUrl()}`}
        >
          TCS · {tcs.sessionLabel}
        </span>

        <button type="button" className={btnGhost} disabled={tcs.busy} onClick={() => void tcs.login()}>
          Login
        </button>
        <button
          type="button"
          className={btnScan}
          disabled={tcs.busy || tcs.eligibleCount === 0}
          onClick={() => void tcs.scan()}
          title={`Lọc ESID theo ngày phiên → lô Hoàn thành tiếp nhận → cập nhật Ops. PDF/In từng lô: menu ⋮ trên dòng.`}
        >
          Quét
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={tcs.busy}
          onClick={configureAgentUrl}
          title={`URL agent: ${getTcsAgentBaseUrl()}`}
        >
          URL
        </button>

        {tcs.busy ? (
          <span className="truncate text-[10px] font-semibold text-sky-700 dark:text-sky-300">
            {tcs.busyLabel || "…"}
          </span>
        ) : null}
      </div>

      {(tcs.message || tcs.error || tcs.clearFocusHint) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-1">
          {tcs.clearFocusHint ? (
            <button
              type="button"
              onClick={onClearFocus}
              className="text-[10px] font-semibold text-sky-700 underline dark:text-sky-300"
            >
              {tcs.clearFocusHint} · bỏ chọn
            </button>
          ) : null}
          {tcs.error ? (
            <p className="min-w-0 text-[10px] font-medium text-red-600">{tcs.error}</p>
          ) : tcs.message ? (
            <p className="min-w-0 truncate text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
              {tcs.message}
              {tcs.downloadedCount > 0 && tcs.results[0]?.pdf_name ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => {
                      void downloadPdfFromAgent(
                        tcs.results[0].pdf_name || tcs.results[0].downloaded_file || ""
                      );
                    }}
                  >
                    Tải PDF
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
