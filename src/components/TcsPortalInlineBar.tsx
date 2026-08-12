import { useEffect, useState } from "react";
import { EsidSettingsMenu } from "./EsidSettingsMenu";
import type { TcsPortalActions } from "../hooks/useTcsPortalActions";
import { portalPolicyUsesAgent } from "../utils/portalExecutorPolicy";
import {
  loadTcsExtLoginPrefs,
  saveTcsExtLoginPrefs,
} from "../utils/tcsExtLoginPrefs";
import {
  shouldOpenExtLoginAfterScanFailure,
  shouldPromptExtLoginBeforeScan,
} from "../utils/tcsPortalScanGate";

type Props = {
  tcs: TcsPortalActions;
  /** Gọn cho mobile */
  compact?: boolean;
};

export function TcsPortalInlineBar({ tcs, compact = false }: Props) {
  const btn =
    `inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-45 active:scale-[0.98] ${
      compact ? "min-h-11 min-w-11 touch-manipulation" : ""
    }`;
  const btnLogin = `${btn} bg-ui-primary text-white hover:bg-ui-primary-hover shadow-sm`;
  const btnScan = `${btn} border border-sky-600/40 bg-sky-50 text-sky-900 hover:bg-sky-100`;
  const btnSubmit = `${btn} bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm`;

  const portalWh = tcs.portalWarehouse;
  const extLabel = tcs.extLabel;
  const usesAgent = portalPolicyUsesAgent(tcs.executorPolicy);
  const agentOk = Boolean(tcs.health?.ok);
  const agentLoggedIn = Boolean(
    tcs.session?.logged_in || tcs.health?.session?.logged_in
  );
  const extOk = Boolean(tcs.extension?.ok);
  const extLoggedIn = Boolean(
    extOk && tcs.extension?.workspace?.logged_in
  );
  const canOperate = (usesAgent && agentOk) || extOk;
  const loggedIn = extLoggedIn || (usesAgent && agentLoggedIn);
  /** Ẩn ĐN khi đã login (compact). */
  const showLoginBtn = !compact || !loggedIn;
  const [showExtLogin, setShowExtLogin] = useState(false);
  const [tcsUsername, setTcsUsername] = useState("");
  const [tcsPassword, setTcsPassword] = useState("");
  const [rememberTcs, setRememberTcs] = useState(true);

  useEffect(() => {
    const prefs = loadTcsExtLoginPrefs(portalWh);
    setTcsUsername(prefs.username);
    setRememberTcs(prefs.remember);
    setTcsPassword("");
    setShowExtLogin(false);
  }, [portalWh]);

  const doLogin = async () => {
    if (tcs.busy) return;

    // Online-first: agent cloud (Railway /tcs-agent) trước.
    if (usesAgent && agentOk) {
      await tcs.login();
      return;
    }

    let ext = (await tcs.refreshExtension?.()) || tcs.extension;
    if (!ext?.ok) {
      await new Promise((r) => window.setTimeout(r, 350));
      ext = (await tcs.refreshExtension?.()) || tcs.extension;
    }

    if (ext?.ok) {
      const user = tcsUsername.trim();
      const pass = tcsPassword;
      saveTcsExtLoginPrefs(portalWh, {
        username: user,
        remember: rememberTcs,
      });
      const result = await tcs.loginWithExtension({
        username: user,
        password: pass,
        remember: rememberTcs,
      });
      if (!result) return;
      if (result.error === "CREDENTIALS_REQUIRED") {
        setShowExtLogin(true);
        return;
      }
      if (
        result.error === "CAPTCHA_REQUIRED" ||
        /CAPTCHA/i.test(String(result.message || ""))
      ) {
        setShowExtLogin(false);
        window.alert(
          result.message ||
            "Đã điền user/password trên tab TCS. Hãy nhập CAPTCHA rồi bấm Đăng nhập trên portal."
        );
        return;
      }
      if (result.ok) {
        setShowExtLogin(false);
        setTcsPassword("");
      }
      return;
    }

    if (usesAgent) {
      await tcs.login();
      return;
    }

    setShowExtLogin(true);
    window.alert(
      `Cần agent cloud (/tcs-agent) hoặc ${extLabel}.\n` +
        "Online: mở Ops trên Railway. Desktop: cài Ext hoặc chạy agent local."
    );
  };

  const doScan = async () => {
    if (tcs.busy) return;

    if (usesAgent && agentOk) {
      await tcs.scanReceptionWithAgent();
      return;
    }

    let ext = (await tcs.refreshExtension?.()) || tcs.extension;
    if (!ext?.ok) {
      await new Promise((r) => window.setTimeout(r, 350));
      ext = (await tcs.refreshExtension?.()) || tcs.extension;
    }
    if (ext?.ok) {
      if (shouldPromptExtLoginBeforeScan(ext)) {
        setShowExtLogin(true);
        window.alert(
          `Bấm «Đăng nhập» đúng user kho ${portalWh} trước khi Quét` +
            (portalWh === "TCS"
              ? " (vd. namnam8012)."
              : " (vd. hanam7195).") +
            "\nHai Ext dùng chung cookie TCS — đổi kho phải ĐN lại."
        );
        return;
      }
      const result = await tcs.scanReceptionWithExtension();
      if (shouldOpenExtLoginAfterScanFailure(result ?? undefined)) {
        setShowExtLogin(true);
      }
      return;
    }

    if (usesAgent) {
      await tcs.scanReceptionWithAgent();
      return;
    }

    window.alert(
      `Cần agent cloud hoặc ${extLabel} để Quét kho ${portalWh}.`
    );
  };

  const confirmSubmit = () => {
    const p = tcs.lastDeclarePreview;
    if (!p) return;
    const ok = window.confirm(
      `Gửi HOÀN TẤT lên TCS cho AWB ${p.awb}?\n\n` +
        (p.executor === "extension"
          ? "Kiểm tra form trên tab Chrome Ext rồi xác nhận.\n"
          : "Agent cloud (Playwright) sẽ bấm HOÀN TẤT trên form đã điền.\n") +
        "Không hoàn tác từ Ops."
    );
    if (!ok) return;
    void tcs.submitEsidDeclare(p);
  };

  const preview = tcs.lastDeclarePreview;
  const workspace = tcs.workspace;

  const statusLabel = extLoggedIn
    ? `${extLabel} đã login`
    : agentLoggedIn
      ? "Agent cloud đã login"
      : agentOk
        ? "Agent cloud — cần ĐN"
        : extOk
          ? `${extLabel} — cần ĐN`
          : usesAgent
            ? "Agent cloud offline"
            : "Cần Chrome Ext";

  const shortStatus = loggedIn
    ? "Đã ĐN"
    : canOperate
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
              ? "Kho TCS — agent cloud :8766 / Ext tuỳ chọn"
              : "Kho TECS-TCS — agent cloud :8765 / Ext tuỳ chọn"
          }
        >
          {portalWh === "TCS" ? "Kho TCS" : "TECS-TCS"}
        </span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            loggedIn
              ? "bg-emerald-500/15 text-emerald-800"
              : canOperate
                ? "bg-amber-500/15 text-amber-900"
                : "bg-slate-500/15 text-slate-700"
          }`}
          title={statusLabel}
        >
          {compact ? shortStatus : tcs.sessionLabel || statusLabel}
        </span>

        {workspace?.phase ? (
          <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-800">
            {workspace.phase}
          </span>
        ) : null}

        {showLoginBtn ? (
          <button
            type="button"
            className={btnLogin}
            disabled={tcs.busy}
            onClick={() => {
              // Ext cần form user/pass; agent cloud dùng credential env — ĐN ngay.
              if (
                !usesAgent &&
                !tcsUsername.trim() &&
                !extLoggedIn &&
                !compact
              ) {
                setShowExtLogin(true);
                return;
              }
              void doLogin();
            }}
            title="Đăng nhập portal (agent cloud Railway ưu tiên)."
          >
            {compact ? "ĐN" : "Đăng nhập"}
          </button>
        ) : null}

        <button
          type="button"
          className={btnScan}
          disabled={tcs.busy || !canOperate}
          onClick={() => {
            void doScan();
          }}
          title={
            tcs.pendingReceptionCount > 0
              ? `Quét — cập nhật status Ops HT cho ${tcs.pendingReceptionCount} AWB (kho ${portalWh}). Không tạo phiếu ESID.`
              : `Quét — đối soát HT trên TCS rồi cập nhật status Ops (kho ${portalWh}). Điền phiếu ESID dùng menu ⋮ → Điền.`
          }
        >
          {compact
            ? "Quét"
            : tcs.pendingReceptionCount > 0
              ? `Quét (${tcs.pendingReceptionCount})`
              : "Quét tiếp nhận"}
        </button>

        {/* Luôn hiện — compact trước đây ẩn mất Cài đặt ESID (Người khai · Agent) cho cả 2 kho. */}
        <EsidSettingsMenu disabled={tcs.busy} compact={compact} />

        {tcs.busy ? (
          <span className="truncate text-[10px] font-semibold text-sky-700">
            {tcs.busyLabel || "…"}
          </span>
        ) : null}
      </div>

      {!compact && !canOperate && !tcs.busy ? (
        <p className="px-1 text-[9px] leading-snug text-ui-text-muted">
          {usesAgent
            ? `Agent cloud offline — trên Railway kiểm tra service + credential kho ${portalWh}. Không cần máy kho.`
            : `Offline: cài ${extLabel} hoặc bật policy auto/agent-only để dùng Playwright cloud.`}
        </p>
      ) : null}

      {!compact && canOperate && !tcs.busy ? (
        <p className="px-1 text-[9px] leading-snug text-ui-text-muted">
          {usesAgent
            ? "Online: ĐN → menu ⋮ → Điền (tạo phiếu ESID) / Tải PDF. Quét chỉ cập nhật HT trên Ops — tách riêng."
            : "Ext: ĐN → menu ⋮ → Điền (tạo phiếu ESID) → HOÀN TẤT trên TCS. Quét chỉ cập nhật HT Ops."}
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
            Form này cho Chrome Ext. Agent cloud dùng credential trên Railway
            (Variables) — bấm «Đăng nhập» khi agent online là đủ.
          </p>
          <label className="flex items-center gap-1 text-[10px] text-slate-600 sm:col-span-3">
            <input
              type="checkbox"
              checked={rememberTcs}
              onChange={(event) => setRememberTcs(event.target.checked)}
            />
            Ghi nhớ tài khoản kho {portalWh} trên Chrome này (Ext)
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
            </p>
          ) : null}
        </div>
      )}

      {/* Preview + HOÀN TẤT sau Điền — bắt buộc cả compact (mobile/desktop đều truyền compact). */}
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
              {` · ${preview.executor === "extension" ? "extension" : "agent cloud"}`}
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
              : "Agent cloud đã điền — kiểm tra cảnh báo rồi bấm HOÀN TẤT trên Ops."}
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
                : "Agent cloud bấm HOÀN TẤT trên form đã điền"
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
