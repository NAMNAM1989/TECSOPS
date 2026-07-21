import { EsidRegistrantSettingsButton } from "./EsidRegistrantSettingsButton";
import { EsidAgentSettingsButton } from "./EsidAgentSettingsButton";
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
  const btnSubmit = `${btn} bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm`;

  const headed = tcs.agentHeadless === false;
  const headless = tcs.agentHeadless === true;

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

  const confirmSubmit = () => {
    const p = tcs.lastDeclarePreview;
    if (!p) return;
    const ok = window.confirm(
      `Gửi HOÀN TẤT lên TCS cho AWB ${p.awb}?\n\n` +
        (headed
          ? "Bạn đã kiểm tra form trên cửa sổ Chrome máy kho chưa?\nAgent sẽ tick đồng ý và bấm HOÀN TẤT (hoặc bạn có thể bấm tay trên Chrome).\n"
          : "Agent sẽ tick đồng ý và bấm HOÀN TẤT trên form đã điền (Chrome agent).\n") +
        `Không thể hoàn tác từ Ops.`
    );
    if (!ok) return;
    void tcs.submitEsidDeclare(p);
  };

  const preview = tcs.lastDeclarePreview;

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
          title={`Agent ${tcs.health?.ok ? "OK" : "offline"} · ${
            headed ? "HEADED" : headless ? "HEADLESS" : "?"
          } · ${tcs.sessionLabel} · ${getTcsAgentBaseUrl()}`}
        >
          TCS · {tcs.sessionLabel}
          {headed ? " · Chrome" : headless ? " · cloud" : ""}
        </span>

        <button
          type="button"
          className={btnGhost}
          disabled={tcs.busy}
          onClick={() => void tcs.login()}
          title="Tự mở trang TCS trên Chrome máy kho — không cần thao tác riêng"
        >
          Login
        </button>
        <button
          type="button"
          className={btnScan}
          disabled={tcs.busy || tcs.eligibleCount === 0}
          onClick={() => void tcs.scan()}
          title="Quét ESID (tách riêng): lọc theo ngày phiên → cập nhật status Ops. Tải PDF ESID: menu ⋮ từng dòng (1 AWB, tìm AWB# 8 số)."
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
        <EsidRegistrantSettingsButton disabled={tcs.busy} compact={compact} />
        <EsidAgentSettingsButton disabled={tcs.busy} compact={compact} />

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

      {preview ? (
        <div
          className="mx-0.5 flex min-w-0 flex-col gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-50/70 p-2 dark:border-emerald-400/20 dark:bg-emerald-950/35"
          role="region"
          aria-label="Xem trước form ESID đã điền"
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
            <p className="min-w-0 text-[10px] font-semibold text-emerald-900 dark:text-emerald-100">
              Form đã điền · AWB {preview.awb}
              {preview.valuesSummary ? ` · ${preview.valuesSummary}` : ""}
            </p>
            <button
              type="button"
              className="text-[10px] font-semibold text-slate-500 underline dark:text-slate-400"
              onClick={tcs.clearDeclarePreview}
              disabled={tcs.busy}
            >
              Đóng
            </button>
          </div>

          {headed ? (
            <p className="text-[10px] font-medium leading-snug text-emerald-900 dark:text-emerald-100">
              Kiểm tra trên <strong>cửa sổ Chrome máy kho</strong> (session thật). Có thể sửa tay rồi
              bấm HOÀN TẤT trên Chrome, hoặc dùng nút bên dưới.
            </p>
          ) : null}

          {preview.previewUrl ? (
            <a
              href={preview.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-h-56 overflow-auto rounded-lg border border-emerald-500/20 bg-white dark:bg-slate-900"
              title="Ảnh phụ — form thật nằm trên Chrome agent"
            >
              <img
                src={preview.previewUrl}
                alt={`Preview form ESID AWB ${preview.awb}`}
                className="mx-auto max-h-52 w-auto max-w-full object-contain"
              />
            </a>
          ) : null}

          {preview.warnings[0] ? (
            <p className="text-[10px] font-medium text-amber-800 dark:text-amber-200">
              {preview.warnings[0]}
            </p>
          ) : null}

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={btnSubmit}
              disabled={tcs.busy}
              onClick={confirmSubmit}
              title="Agent tick đồng ý và bấm HOÀN TẤT trên form đang mở"
            >
              HOÀN TẤT trên TCS
            </button>
            <span className="min-w-0 text-[9px] leading-snug text-slate-600 dark:text-slate-400">
              {headed
                ? "Trang TCS đã mở trên Chrome máy kho khi Login — kiểm tra form rồi HOÀN TẤT."
                : "Agent headless (cloud): chỉ xem ảnh + HOÀN TẤT trên Ops. Muốn Chrome thật: chạy agent headed trên máy kho."}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
