import { useEffect, useState } from "react";
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
  /** Gọn cho mobile */
  compact?: boolean;
};

type TcsDesktopInfo = {
  enabled: boolean;
  hint?: string;
};

export function TcsPortalInlineBar({ tcs, compact = false }: Props) {
  const btn =
    "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-45 active:scale-[0.98]";
  const btnGhost =
    `${btn} border border-sky-500/25 bg-sky-50/90 text-sky-900 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/50`;
  const btnScan = `${btn} bg-sky-600 text-white hover:bg-sky-700 shadow-sm`;
  const btnSubmit = `${btn} bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm`;

  const headed = tcs.agentHeadless === false;
  const headless = tcs.agentHeadless === true;
  const [desktop, setDesktop] = useState<TcsDesktopInfo>({ enabled: false });
  const [showExtLogin, setShowExtLogin] = useState(false);
  const [tcsUsername, setTcsUsername] = useState("");
  const [tcsPassword, setTcsPassword] = useState("");
  const [rememberTcs, setRememberTcs] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/tcs-desktop", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return { enabled: false as const };
        return (await res.json()) as TcsDesktopInfo;
      })
      .then((info) => {
        if (!cancelled) setDesktop({ enabled: Boolean(info.enabled), hint: info.hint });
      })
      .catch(() => {
        if (!cancelled) setDesktop({ enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          ? "Kiểm tra form trên Chrome máy kho rồi xác nhận.\n"
          : "Playwright headless sẽ bấm HOÀN TẤT trên form đã điền.\n") +
        "Không hoàn tác từ Ops."
    );
    if (!ok) return;
    void tcs.submitEsidDeclare(p);
  };

  const preview = tcs.lastDeclarePreview;
  const workspace = tcs.workspace;

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

        {workspace?.phase ? (
          <span
            className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-800 dark:text-sky-200"
            title={`Ngày ${workspace.session_date || "?"} · cache ${workspace.cache_count || 0} AWB · ${workspace.cache_age_seconds ?? "?"}s`}
          >
            {workspace.phase}
            {workspace.cache_count ? ` · ${workspace.cache_count}` : ""}
          </span>
        ) : null}

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            tcs.extension?.ok
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : "bg-slate-500/15 text-slate-600 dark:text-slate-300"
          }`}
          title={
            tcs.extension?.ok
              ? `Chrome extension v${tcs.extension.version || "?"}`
              : "Chrome extension chưa kết nối"
          }
        >
          Ext {tcs.extension?.ok ? "OK" : "—"}
        </span>

        <button
          type="button"
          className={btnGhost}
          disabled={tcs.busy}
          onClick={() => {
            if (!tcs.extension?.ok) {
              void tcs.login();
              return;
            }
            void tcs
              .loginWithExtension({
                username: "",
                password: "",
                remember: true,
              })
              .then((result) => {
                if (result?.error === "CREDENTIALS_REQUIRED") {
                  setShowExtLogin(true);
                }
              });
          }}
          title={
            tcs.extension?.ok
              ? "Đồng bộ bằng tài khoản extension đã lưu; nếu chưa có sẽ yêu cầu nhập"
              : "Không có extension: dùng Playwright để Login nếu cần và quét lại ngày"
          }
        >
          Đồng bộ TCS
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={!desktop.enabled}
          onClick={() => {
            const url =
              "/tcs-desktop/vnc.html?autoconnect=1&resize=scale&path=" +
              encodeURIComponent("tcs-desktop/websockify");
            window.open(url, "tcs-desktop", "noopener,noreferrer");
          }}
          title={
            desktop.enabled
              ? "Sửa tay qua noVNC (chậm) — chỉ khi TCS_VNC=1"
              : desktop.hint ||
                "Desktop tắt (TCS_VNC=0). Nhập liệu bằng Điền/HOÀN TẤT. Bật: TCS_VNC=1 trên Railway."
          }
        >
          Sửa tay
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
        <a
          className={btnGhost}
          href="/downloads/tecsops-chrome-extension.zip"
          download
          title="Tải extension mới nhất cho máy khác; giải nén rồi Load unpacked tại chrome://extensions"
        >
          Tải Ext
        </a>
        <EsidRegistrantSettingsButton disabled={tcs.busy} compact={compact} />
        <EsidAgentSettingsButton disabled={tcs.busy} compact={compact} />

        {tcs.busy ? (
          <span className="truncate text-[10px] font-semibold text-sky-700 dark:text-sky-300">
            {tcs.busyLabel || "…"}
          </span>
        ) : null}
      </div>

      {showExtLogin ? (
        <form
          className="mx-0.5 grid gap-1.5 rounded-xl border border-sky-500/25 bg-sky-50/80 p-2 dark:border-sky-400/20 dark:bg-sky-950/35 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!tcsUsername.trim() || !tcsPassword) return;
            setShowExtLogin(false);
            void tcs.loginWithExtension({
              username: tcsUsername.trim(),
              password: tcsPassword,
              remember: rememberTcs,
            });
            setTcsPassword("");
          }}
        >
          <input
            value={tcsUsername}
            onChange={(event) => setTcsUsername(event.target.value)}
            placeholder="Tài khoản TCS"
            autoComplete="username"
            className="min-w-0 rounded-lg border border-sky-500/25 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-sky-500 dark:bg-slate-900 dark:text-white"
          />
          <input
            value={tcsPassword}
            onChange={(event) => setTcsPassword(event.target.value)}
            placeholder="Mật khẩu TCS"
            type="password"
            autoComplete="current-password"
            className="min-w-0 rounded-lg border border-sky-500/25 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-sky-500 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            className={btnScan}
            disabled={!tcsUsername.trim() || !tcsPassword || tcs.busy}
          >
            Đồng bộ TCS
          </button>
          <label className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300 sm:col-span-3">
            <input
              type="checkbox"
              checked={rememberTcs}
              onChange={(event) => setRememberTcs(event.target.checked)}
            />
            Ghi nhớ tài khoản trên Chrome này
          </label>
        </form>
      ) : null}

      <p className="px-1 text-[9px] leading-snug text-slate-500 dark:text-slate-400">
        {tcs.extension?.ok
          ? "Đồng bộ TCS tự Login khi cần rồi quét lại ngày; Điền dùng tab extension được ghim."
          : "Đồng bộ TCS tự Login khi cần rồi quét lại ngày bằng Playwright workspace."}
        {desktop.enabled ? " «Sửa tay» = noVNC (chậm)." : ""}
      </p>

      {(tcs.message || tcs.error) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-1">
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
          aria-label="Form ESID đã điền"
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
            <p className="min-w-0 text-[10px] font-semibold text-emerald-900 dark:text-emerald-100">
              Form đã điền · AWB {preview.awb}
              {preview.valuesSummary ? ` · ${preview.valuesSummary}` : ""}
              {` · ${preview.executor === "extension" ? "extension" : "workspace"}`}
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

          <p className="text-[10px] font-medium leading-snug text-emerald-900 dark:text-emerald-100">
            {preview.executor === "extension"
              ? "Form nằm trên tab Chrome do extension ghim — kiểm tra và HOÀN TẤT trực tiếp trên TCS."
              : headed
              ? "Form trên page Khai báo của Chrome máy kho — kiểm tra rồi HOÀN TẤT."
              : "Workspace headless — kiểm tra cảnh báo rồi bấm HOÀN TẤT trên Ops."}
          </p>

          {preview.warnings[0] ? (
            <p className="text-[10px] font-medium text-amber-800 dark:text-amber-200">
              {preview.warnings[0]}
            </p>
          ) : null}

          <button
            type="button"
            className={btnSubmit}
            disabled={tcs.busy}
            onClick={confirmSubmit}
            title={
              preview.executor === "extension"
                ? "Mở tab TCS để kiểm tra và HOÀN TẤT trực tiếp"
                : "Workspace bấm HOÀN TẤT trên form đã điền"
            }
          >
            {preview.executor === "extension" ? "Mở tab TCS để HOÀN TẤT" : "HOÀN TẤT trên TCS"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
