import { useEffect, useState } from "react";
import { EsidSettingsMenu } from "./EsidSettingsMenu";
import type { TcsPortalActions } from "../hooks/useTcsPortalActions";
import {
  clearTcsAgentBaseUrl,
  downloadPdfFromAgent,
  getTcsAgentBaseUrl,
  setTcsAgentBaseUrl,
} from "../utils/tcsPortalAgentApi";
import { OverflowMenu } from "../ui";

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
  const btnScan = `${btn} bg-ui-primary text-white hover:bg-ui-primary-hover shadow-sm`;
  const btnSubmit = `${btn} bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm`;

  const headed = tcs.agentHeadless === false;
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
        if (!cancelled)
          setDesktop({ enabled: Boolean(info.enabled), hint: info.hint });
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
      current.includes("/tcs-agent") ? "" : current,
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
        "Không hoàn tác từ Ops.",
    );
    if (!ok) return;
    void tcs.submitEsidDeclare(p);
  };

  const preview = tcs.lastDeclarePreview;
  const workspace = tcs.workspace;

  const statusLabel = tcs.session?.logged_in
    ? "TCS sẵn sàng"
    : tcs.health?.ok
      ? "TCS chờ đăng nhập"
      : "TCS offline";

  const advancedItems = [
    {
      id: "vnc",
      label: "Sửa tay (noVNC)",
      description: desktop.enabled ? "Mở desktop chậm" : desktop.hint || "Tắt trên môi trường này",
      disabled: !desktop.enabled,
      onSelect: () => {
        const url =
          "/tcs-desktop/vnc.html?autoconnect=1&resize=scale&path=" +
          encodeURIComponent("tcs-desktop/websockify");
        window.open(url, "tcs-desktop", "noopener,noreferrer");
      },
    },
    {
      id: "url",
      label: "URL agent",
      description: "Chỉ máy kho / LAN",
      disabled: tcs.busy,
      onSelect: configureAgentUrl,
    },
    {
      id: "ext",
      label: "Tải Chrome Ext",
      description: "Load unpacked trên máy kho",
      onSelect: () => {
        window.location.href = "/downloads/tecsops-chrome-extension.zip";
      },
    },
  ];

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-0.5" : "gap-1"}`}>
      <div
        className={`flex min-w-0 flex-wrap items-center gap-1 rounded-lg border border-ui-border bg-ui-surface px-1.5 py-1 shadow-sm ${
          compact ? "" : "sm:flex-nowrap"
        }`}
        role="toolbar"
        aria-label="Cổng TCS"
      >
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            tcs.session?.logged_in
              ? "bg-emerald-500/15 text-emerald-800"
              : tcs.health?.ok
                ? "bg-amber-500/15 text-amber-900"
                : "bg-slate-500/15 text-slate-700"
          }`}
          title={statusLabel}
        >
          {statusLabel}
        </span>

        {workspace?.phase ? (
          <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-800">
            {workspace.phase}
          </span>
        ) : null}

        <button
          type="button"
          className={btnScan}
          disabled={tcs.busy || (!tcs.health?.ok && !tcs.extension?.ok)}
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
            !tcs.health?.ok && !tcs.extension?.ok
              ? "Offline — mở máy kho / cài Ext nếu cần Đồng bộ"
              : "Đồng bộ phiên TCS"
          }
        >
          Đồng bộ
        </button>

        <EsidSettingsMenu disabled={tcs.busy} compact={compact} />
        <OverflowMenu label="Nâng cao" compact items={advancedItems} align="left" />

        {tcs.busy ? (
          <span className="truncate text-[10px] font-semibold text-sky-700">
            {tcs.busyLabel || "…"}
          </span>
        ) : null}
      </div>

      {!tcs.health?.ok && !tcs.extension?.ok && !tcs.busy ? (
        <p className="px-1 text-[9px] leading-snug text-ui-text-muted">
          Offline: Ops vẫn dùng được. Muốn Đồng bộ — mở agent máy kho hoặc cài Ext (menu Nâng cao).
        </p>
      ) : null}

      {showExtLogin ? (
        <form
          className="mx-0.5 grid gap-1.5 rounded-xl border border-sky-500/25 bg-sky-50/80 p-2 sm:grid-cols-[1fr_1fr_auto]"
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
            className="min-w-0 rounded-lg border border-sky-500/25 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-sky-500"
          />
          <input
            value={tcsPassword}
            onChange={(event) => setTcsPassword(event.target.value)}
            placeholder="Mật khẩu TCS"
            type="password"
            autoComplete="current-password"
            className="min-w-0 rounded-lg border border-sky-500/25 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            className={btnScan}
            disabled={!tcsUsername.trim() || !tcsPassword || tcs.busy}
          >
            Đồng bộ TCS
          </button>
          <label className="flex items-center gap-1 text-[10px] text-slate-600 sm:col-span-3">
            <input
              type="checkbox"
              checked={rememberTcs}
              onChange={(event) => setRememberTcs(event.target.checked)}
            />
            Ghi nhớ tài khoản trên Chrome này
          </label>
        </form>
      ) : null}

      {(tcs.message || tcs.error) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-1">
          {tcs.error ? (
            <p className="min-w-0 text-[10px] font-medium text-red-600">
              {tcs.error}
            </p>
          ) : tcs.message ? (
            <p className="min-w-0 truncate text-[10px] font-medium text-emerald-700">
              {tcs.message}
              {tcs.downloadedCount > 0 && tcs.results[0]?.pdf_name ? (
                <>
                  {" ·"}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => {
                      void downloadPdfFromAgent(
                        tcs.results[0].pdf_name ||
                          tcs.results[0].downloaded_file ||
                          "",
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
          className="mx-0.5 flex min-w-0 flex-col gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-50/70 p-2"
          role="region"
          aria-label="Form ESID đã điền"
        >
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
            <p className="min-w-0 text-[10px] font-semibold text-emerald-900">
              Form đã điền · AWB {preview.awb}
              {preview.valuesSummary ? ` · ${preview.valuesSummary}` : ""}
              {` · ${preview.executor === "extension" ? "extension" : "workspace"}`}
            </p>
            <button
              type="button"
              className="text-[10px] font-semibold text-slate-500 underline"
              onClick={tcs.clearDeclarePreview}
              disabled={tcs.busy}
            >
              Đóng
            </button>
          </div>

          <p className="text-[10px] font-medium leading-snug text-emerald-900">
            {preview.executor === "extension"
              ? "Form nằm trên tab Chrome do extension ghim — kiểm tra và HOÀN TẤT trực tiếp trên TCS."
              : headed
                ? "Form trên page Khai báo của Chrome máy kho — kiểm tra rồi HOÀN TẤT."
                : "Workspace headless — kiểm tra cảnh báo rồi bấm HOÀN TẤT trên Ops."}
          </p>

          {preview.warnings[0] ? (
            <p className="text-[10px] font-medium text-amber-800">
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
            {preview.executor === "extension"
              ? "Mở tab TCS để HOÀN TẤT"
              : "HOÀN TẤT trên TCS"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
