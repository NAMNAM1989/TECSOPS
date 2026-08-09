import { useEffect, useState } from "react";
import { EsidSettingsMenu } from "./EsidSettingsMenu";
import type { TcsPortalActions } from "../hooks/useTcsPortalActions";
import { downloadPdfFromAgent } from "../utils/tcsPortalAgentApi";
import {
  loadTcsExtLoginPrefs,
  saveTcsExtLoginPrefs,
} from "../utils/tcsExtLoginPrefs";
import { OverflowMenu } from "../ui";

type Props = {
  tcs: TcsPortalActions;
  /** Gọn cho mobile */
  compact?: boolean;
};

export function TcsPortalInlineBar({ tcs, compact = false }: Props) {
  const btn =
    "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-45 active:scale-[0.98]";
  const btnLogin = `${btn} bg-ui-primary text-white hover:bg-ui-primary-hover shadow-sm`;
  const btnScan = `${btn} border border-sky-600/40 bg-sky-50 text-sky-900 hover:bg-sky-100`;
  const btnSubmit = `${btn} bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm`;

  const headed = tcs.agentHeadless === false;
  const portalWh = tcs.portalWarehouse;
  const extLabel = tcs.extLabel;
  const extLoggedIn = Boolean(tcs.extension?.ok && tcs.extension.workspace?.logged_in);
  const [showExtLogin, setShowExtLogin] = useState(false);
  const [tcsUsername, setTcsUsername] = useState("");
  const [tcsPassword, setTcsPassword] = useState("");
  const [rememberTcs, setRememberTcs] = useState(true);
  const [extBusy, setExtBusy] = useState(false);

  useEffect(() => {
    const prefs = loadTcsExtLoginPrefs(portalWh);
    setTcsUsername(prefs.username);
    setRememberTcs(prefs.remember);
    setTcsPassword("");
    setShowExtLogin(false);
  }, [portalWh]);

  const downloadChromeExt = async () => {
    setExtBusy(true);
    try {
      const apiPath =
        portalWh === "TCS"
          ? "/api/tcs-extension-direct"
          : "/api/tcs-extension";
      const res = await fetch(apiPath, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        version?: string;
        download_url?: string;
        error?: string;
        filename?: string;
      };
      if (!res.ok || !data.ok || !data.download_url) {
        throw new Error(
          data.error ||
            (portalWh === "TCS"
              ? "Chưa đóng gói Ext kho TCS — load unpacked thư mục chrome-extension-tcs."
              : "Không lấy được gói Chrome Ext")
        );
      }
      const version = String(data.version || "").trim();
      const a = document.createElement("a");
      a.href = data.download_url;
      a.download =
        data.filename ||
        (portalWh === "TCS"
          ? version
            ? `tecsops-chrome-extension-tcs-v${version}.zip`
            : "tecsops-chrome-extension-tcs.zip"
          : version
            ? `tecsops-chrome-extension-v${version}.zip`
            : "tecsops-chrome-extension.zip");
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Tải Chrome Ext thất bại");
    } finally {
      setExtBusy(false);
    }
  };

  const doLogin = async () => {
    if (tcs.busy) return;
    let ext = (await tcs.refreshExtension?.()) || tcs.extension;
    if (!ext?.ok) {
      await new Promise((r) => window.setTimeout(r, 350));
      ext = (await tcs.refreshExtension?.()) || tcs.extension;
    }
    const user = tcsUsername.trim();
    const pass = tcsPassword;

    if (ext?.ok) {
      saveTcsExtLoginPrefs(portalWh, {
        username: user,
        remember: rememberTcs,
      });
      const result = await tcs.loginWithExtension({
        username: user,
        password: pass,
        remember: rememberTcs,
      });
      if (result?.error === "CREDENTIALS_REQUIRED") {
        setShowExtLogin(true);
        return;
      }
      if (result?.ok) {
        setShowExtLogin(false);
        setTcsPassword("");
      }
      return;
    }

    // Không có Ext: TECS-TCS → agent local; kho TCS → ĐN máy kho (Railway worker)
    await tcs.login();
  };

  const doScan = async () => {
    if (tcs.busy) return;
    let ext = (await tcs.refreshExtension?.()) || tcs.extension;
    if (!ext?.ok) {
      await new Promise((r) => window.setTimeout(r, 350));
      ext = (await tcs.refreshExtension?.()) || tcs.extension;
    }
    if (ext?.ok) {
      if (!ext.workspace?.logged_in) {
        setShowExtLogin(true);
        window.alert("Bấm «Đăng nhập» trước khi Quét tiếp nhận.");
        return;
      }
      await tcs.scanReceptionWithExtension();
      return;
    }
    await tcs.scanReceptionWithAgent();
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

  const statusLabel = extLoggedIn
    ? `${extLabel} đã login`
    : tcs.session?.logged_in
      ? "Agent sẵn sàng"
      : tcs.health?.ok || tcs.extension?.ok
        ? "Chờ đăng nhập"
        : "TCS offline";

  const advancedItems = [
    {
      id: "ext",
      label: extBusy ? "Đang tải Ext…" : `Tải ${extLabel}`,
      description:
        portalWh === "TCS"
          ? "Ext riêng kho TCS · cài trên Chrome profile TCS"
          : "Ext TECS-TCS ESID · Chrome profile TECS (tách khỏi kho TCS)",
      disabled: extBusy || tcs.busy,
      onSelect: () => {
        void downloadChromeExt();
      },
    },
  ];

  const shortStatus = extLoggedIn
    ? "Đã ĐN"
    : tcs.session?.logged_in
      ? "Agent"
      : tcs.health?.ok || tcs.extension?.ok
        ? "Chờ ĐN"
        : "Offline";

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-0.5" : "gap-1"}`}>
      <div
        className={`flex min-w-0 flex-wrap items-center gap-1 ${
          compact
            ? ""
            : "rounded-lg border border-ui-border bg-ui-surface px-1.5 py-1 shadow-sm sm:flex-nowrap"
        }`}
        role="toolbar"
        aria-label={`Cổng TCS · ${portalWh}`}
      >
        <span
          className="shrink-0 rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-700"
          title={
            portalWh === "TCS"
              ? "Kho TCS — Ext + Chrome profile riêng"
              : "Kho TECS-TCS — Ext hub + Chrome profile TECS"
          }
        >
          {portalWh === "TCS" ? "Kho TCS" : "TECS-TCS"}
        </span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            extLoggedIn || tcs.session?.logged_in
              ? "bg-emerald-500/15 text-emerald-800"
              : tcs.health?.ok || tcs.extension?.ok
                ? "bg-amber-500/15 text-amber-900"
                : "bg-slate-500/15 text-slate-700"
          }`}
          title={statusLabel}
        >
          {compact ? shortStatus : statusLabel}
        </span>

        {workspace?.phase ? (
          <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-800">
            {workspace.phase}
          </span>
        ) : null}

        <button
          type="button"
          className={btnLogin}
          disabled={tcs.busy || (!tcs.health?.ok && !tcs.extension?.ok)}
          onClick={() => {
            // Ext có thể đã nhớ MK — thử login; thiếu user thì mở form.
            if (!tcsUsername.trim() && !extLoggedIn) {
              setShowExtLogin(true);
              return;
            }
            void doLogin();
          }}
          title="Chỉ đăng nhập portal kho đang chọn (không quét). Dùng Chrome profile riêng từng kho."
        >
          {compact ? "ĐN" : "Đăng nhập"}
        </button>

        <button
          type="button"
          className={btnScan}
          disabled={tcs.busy || (!tcs.health?.ok && !tcs.extension?.ok)}
          onClick={() => {
            void doScan();
          }}
          title={
            tcs.pendingReceptionCount > 0
              ? `Quét tiếp nhận — đối soát ${tcs.pendingReceptionCount} AWB chưa HT tiếp nhận (kho ${portalWh})`
              : `Quét tiếp nhận ngày phiên — chỉ cập nhật lô chưa RECEPTION_COMPLETED (kho ${portalWh})`
          }
        >
          {compact
            ? "Quét"
            : tcs.pendingReceptionCount > 0
              ? `Quét (${tcs.pendingReceptionCount})`
              : "Quét tiếp nhận"}
        </button>

        <EsidSettingsMenu disabled={tcs.busy} compact={compact} />
        <OverflowMenu label="Nâng cao" compact items={advancedItems} align="left" />

        {tcs.busy ? (
          <span className="truncate text-[10px] font-semibold text-sky-700">
            {tcs.busyLabel || "…"}
          </span>
        ) : null}
      </div>

      {!compact && !tcs.health?.ok && !tcs.extension?.ok && !tcs.busy ? (
        <p className="px-1 text-[9px] leading-snug text-ui-text-muted">
          Offline: mở đúng Chrome profile kho {portalWh} và cài {extLabel} (menu
          Nâng cao ·{" "}
          {portalWh === "TCS" ? "chrome-extension-tcs" : "chrome-extension"}
          ). TECS-TCS và TCS phải khác profile Chrome.
        </p>
      ) : null}

      {!compact && (tcs.extension?.ok || tcs.health?.ok) && !tcs.busy ? (
        <p className="px-1 text-[9px] leading-snug text-ui-text-muted">
          Quy trình: Đăng nhập → Quét tiếp nhận → menu ⋮ lô → Điền → kiểm tra →
          HOÀN TẤT trên TCS. Quét chỉ cập nhật lô chưa HT tiếp nhận.
        </p>
      ) : null}

      {showExtLogin ? (
        <form
          className="mx-0.5 grid gap-1.5 rounded-xl border border-sky-500/25 bg-sky-50/80 p-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!tcsUsername.trim() || !tcsPassword) return;
            void doLogin();
          }}
        >
          <input
            value={tcsUsername}
            onChange={(event) => setTcsUsername(event.target.value)}
            placeholder={`Tài khoản ${portalWh}`}
            autoComplete="username"
            autoFocus
            className="min-w-0 rounded-lg border border-sky-500/25 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-sky-500"
          />
          <input
            value={tcsPassword}
            onChange={(event) => setTcsPassword(event.target.value)}
            placeholder={`Mật khẩu ${portalWh}`}
            type="password"
            autoComplete="current-password"
            className="min-w-0 rounded-lg border border-sky-500/25 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            className={btnLogin}
            disabled={!tcsUsername.trim() || !tcsPassword || tcs.busy}
          >
            Đăng nhập {portalWh === "TCS" ? "TCS" : "TECS"}
          </button>
          <p className="text-[10px] text-slate-600 sm:col-span-3">
            Tài khoản portal kho {portalWh} — dùng {extLabel} trên Chrome profile
            riêng. Sau khi đăng nhập, bấm «Quét tiếp nhận» khi cần.
          </p>
          <label className="flex items-center gap-1 text-[10px] text-slate-600 sm:col-span-3">
            <input
              type="checkbox"
              checked={rememberTcs}
              onChange={(event) => setRememberTcs(event.target.checked)}
            />
            Ghi nhớ tài khoản kho {portalWh} trên Chrome này
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
                          ""
                      ).then((ok) => {
                        if (!ok) {
                          window.alert(
                            "Không tải được PDF. Kiểm tra agent đang chạy rồi thử lại."
                          );
                        }
                      });
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
              ? "Form trên tab Chrome Ext — kiểm tra rồi HOÀN TẤT trực tiếp trên TCS."
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
