import { useEffect, useState } from "react";
import { EsidSettingsMenu } from "./EsidSettingsMenu";
import type { TcsPortalActions } from "../hooks/useTcsPortalActions";
import { useToast } from "../ui";
import {
  portalPolicyUsesAgent,
  shouldLockToExtensionVisual,
} from "../utils/portalExecutorPolicy";
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
  /** Layout nút nhỏ — desktop header cũng dùng; KHÔNG dùng để ẩn Đăng Nhập TCS/Điền */
  compact?: boolean;
  /** Viewport ≤767 — Quét ưu tiên agent; vẫn hiện CTA Đăng Nhập TCS khi chưa login / agent lỗi */
  isMobile?: boolean;
};

export function TcsPortalInlineBar({
  tcs,
  compact = false,
  isMobile = false,
}: Props) {
  const toast = useToast();
  const btn =
    `inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-45 active:scale-[0.98] ${
      compact || isMobile ? "min-h-11 touch-manipulation" : ""
    }`;
  const btnLogin = `${btn} bg-ui-primary text-white hover:bg-ui-primary-hover shadow-sm ${
    isMobile ? "min-w-[7.5rem] px-3 text-[11px]" : ""
  }`;
  const btnScan = `${btn} border border-sky-600/40 bg-sky-50 text-sky-900 hover:bg-sky-100`;
  const btnSubmit = `${btn} bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm`;
  const btnVisualOn = `${btn} border border-violet-600/50 bg-violet-50 text-violet-900 hover:bg-violet-100`;
  const btnVisualOff = `${btn} border border-ui-border bg-ui-surface text-slate-600 hover:bg-slate-50`;
  const btnPwOn = `${btn} border border-teal-600/50 bg-teal-50 text-teal-900 hover:bg-teal-100`;
  const btnPwOff = `${btn} border border-ui-border bg-ui-surface text-slate-600 hover:bg-slate-50`;

  const portalWh = tcs.portalWarehouse;
  const extLabel = tcs.extLabel;
  const usesAgent = portalPolicyUsesAgent(tcs.executorPolicy);
  const visualControl = Boolean(tcs.visualControl);
  const playwrightLocal = Boolean(tcs.playwrightLocal);
  const agentOk = Boolean(tcs.health?.ok);
  const agentLoggedIn = Boolean(
    tcs.session?.logged_in || tcs.health?.session?.logged_in
  );
  const extOk = Boolean(tcs.extension?.ok);
  const extLoggedIn = Boolean(
    extOk && tcs.extension?.workspace?.logged_in
  );
  const canOperate = isMobile
    ? usesAgent && agentOk
    : (usesAgent && agentOk) || extOk;
  const loggedIn = isMobile
    ? usesAgent && agentLoggedIn
    : extLoggedIn || (usesAgent && agentLoggedIn);
  /**
   * Mobile: luôn hiện CTA khi chưa login (kể cả agent offline) để retry Đăng Nhập TCS.
   * Desktop compact: ẩn khi đã login.
   */
  const showLoginBtn = isMobile ? !loggedIn : !compact || !loggedIn;
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

    // Phone: agent login / retry khi offline.
    if (isMobile) {
      if (!usesAgent) {
        toast.error(
          "Trên điện thoại cần agent cloud (/tcs-agent). Mở Ops trên Railway hoặc bật policy agent.",
          "Không Đăng Nhập TCS được"
        );
        return;
      }
      await tcs.login();
      return;
    }

    // PW local: Đăng Nhập TCS Playwright headed qua cầu Ext (không form Ext content-script).
    if (playwrightLocal) {
      await tcs.login();
      return;
    }

    // Desktop Ext-first.
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
        toast.warning(
          result.message ||
            "Đã điền user/password trên tab TCS. Hãy nhập CAPTCHA rồi bấm Đăng nhập trên portal.",
          "CAPTCHA"
        );
        return;
      }
      if (result.ok) {
        setShowExtLogin(false);
        setTcsPassword("");
        toast.success("Đăng Nhập TCS thành công", portalWh);
      }
      return;
    }

    // Không có Ext trên máy này. Trực quan chỉ khóa khi Ext online —
    // máy khác / chưa cài Ext phải Đăng Nhập TCS agent cloud đúng kho.
    if (
      shouldLockToExtensionVisual({
        isMobile,
        visualControl,
        extensionOnline: Boolean(ext?.ok),
        policy: tcs.executorPolicy,
      })
    ) {
      setShowExtLogin(true);
      toast.warning(
        `Chế độ trực quan: cần ${extLabel} online để Đăng Nhập TCS trên tab Chrome. Reload Ext / mở Ops trên cùng Chrome đã cài Ext. Tắt «Trực quan» nếu muốn dùng agent cloud ẩn.`,
        "Cần Chrome Ext"
      );
      return;
    }

    if (usesAgent) {
      await tcs.login();
      return;
    }

    setShowExtLogin(true);
    toast.error(
      `Cần ${extLabel} hoặc agent cloud (/tcs-agent). Desktop: cài Ext. Online: mở Ops trên Railway.`,
      "Không Đăng Nhập TCS được"
    );
  };

  const doScan = async () => {
    if (tcs.busy) return;

    // Phone: agent-only.
    if (isMobile) {
      if (usesAgent && agentOk) {
        await tcs.scanReceptionWithAgent();
        return;
      }
      toast.error(
        `Cần agent cloud để Quét kho ${portalWh} trên điện thoại. Bấm «Đăng Nhập TCS» để thử lại.`,
        "Agent offline"
      );
      return;
    }

    // PW local: Quét Playwright headed (Ext chỉ làm cầu localhost).
    if (playwrightLocal) {
      if (!extOk) {
        toast.error(
          `PW local: cần ${extLabel} online. Reload Ext + chạy npm run portal:headed:local.`,
          "PW local"
        );
        return;
      }
      await tcs.scanReceptionWithAgent();
      return;
    }

    // Desktop Ext-first.
    let ext = (await tcs.refreshExtension?.()) || tcs.extension;
    if (!ext?.ok) {
      await new Promise((r) => window.setTimeout(r, 350));
      ext = (await tcs.refreshExtension?.()) || tcs.extension;
    }
    if (ext?.ok) {
      if (shouldPromptExtLoginBeforeScan(ext)) {
        setShowExtLogin(true);
        toast.warning(
          `Bấm «Đăng Nhập TCS» đúng user kho ${portalWh} trước khi Quét` +
            (portalWh === "TCS"
              ? " (vd. namnam8012)."
              : " (vd. hanam7195).") +
            " Hai Ext dùng chung cookie TCS — đổi kho phải Đăng Nhập TCS lại.",
          "Chưa Đăng Nhập TCS"
        );
        return;
      }
      const result = await tcs.scanReceptionWithExtension();
      if (shouldOpenExtLoginAfterScanFailure(result ?? undefined)) {
        setShowExtLogin(true);
      }
      return;
    }

    if (
      shouldLockToExtensionVisual({
        isMobile,
        visualControl,
        extensionOnline: Boolean(ext?.ok),
        policy: tcs.executorPolicy,
      })
    ) {
      toast.warning(
        `Chế độ trực quan: cần ${extLabel} để Quét trên tab Chrome (không chạy agent ẩn). Reload Ext hoặc tắt «Trực quan» nếu muốn Quét bằng agent cloud.`,
        "Cần Chrome Ext"
      );
      return;
    }

    if (usesAgent) {
      await tcs.scanReceptionWithAgent();
      return;
    }

    toast.error(
      `Cần ${extLabel} hoặc agent cloud để Quét kho ${portalWh}.`,
      "Không Quét được"
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

  const portalStatusLabel = isMobile
    ? agentLoggedIn
      ? "Agent cloud đã login"
      : agentOk
        ? "Agent cloud đang khôi phục session"
        : "Agent cloud offline — bấm Đăng Nhập TCS"
    : extLoggedIn
      ? `${extLabel} đã login`
      : agentLoggedIn
        ? "Agent cloud đã login"
        : agentOk
          ? "Agent cloud — cần Đăng Nhập TCS"
          : extOk
            ? `${extLabel} — cần Đăng Nhập TCS`
            : usesAgent
              ? "Agent cloud offline"
              : "Cần Chrome Ext";

  const shortStatus = loggedIn
    ? "Đã Đăng Nhập TCS"
    : canOperate
      ? isMobile
        ? "Chờ session"
        : "Chờ Đăng Nhập TCS"
      : "Offline";

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-0.5" : "gap-1"}`}>
      <div
        className={`flex min-w-0 flex-wrap items-center gap-1 ${
          compact
            ? ""
            : "rounded-xl border border-ui-border bg-ui-surface px-1.5 py-1 shadow-ui-sm sm:flex-nowrap"
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
          title={portalStatusLabel}
        >
          {compact ? shortStatus : tcs.sessionLabel || portalStatusLabel}
        </span>

        {workspace?.phase ? (
          <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-800">
            {workspace.phase}
          </span>
        ) : null}

        {!isMobile ? (
          <button
            type="button"
            className={visualControl ? btnVisualOn : btnVisualOff}
            disabled={tcs.busy}
            title={
              visualControl
                ? "Trực quan BẬT: Quét/Điền trên tab Chrome Ext — không fallback agent ẩn. Bấm để tắt."
                : "Trực quan TẮT: có thể fallback agent cloud headless (không thấy cửa sổ). Bấm để bật."
            }
            onClick={() => tcs.setVisualControl(!visualControl)}
          >
            {compact ? (visualControl ? "TQ" : "Ẩn") : visualControl ? "Trực quan" : "Ẩn"}
          </button>
        ) : null}

        {!isMobile ? (
          <button
            type="button"
            className={playwrightLocal ? btnPwOn : btnPwOff}
            disabled={tcs.busy}
            title={
              playwrightLocal
                ? "PW local BẬT: Quét/Điền qua Playwright headed trên máy này (Ext cầu localhost). Bấm để tắt."
                : "PW local TẮT. Bật sau khi chạy npm run portal:headed:local để thấy cửa sổ Chromium."
            }
            onClick={() => {
              const next = !playwrightLocal;
              tcs.setPlaywrightLocal(next);
              if (next) {
                toast.info(
                  "1) npm run portal:headed:local · 2) Reload Ext đúng kho · 3) Đăng Nhập TCS → Quét/Điền — nhìn cửa sổ Chromium trên máy này.",
                  "PW local BẬT"
                );
              }
            }}
          >
            {compact ? (playwrightLocal ? "PW" : "PW·") : playwrightLocal ? "PW local" : "PW off"}
          </button>
        ) : null}

        {showLoginBtn ? (
          <button
            type="button"
            className={btnLogin}
            disabled={tcs.busy}
            onClick={() => {
              // Ext cần form user/pass; agent cloud dùng credential env — Đăng Nhập TCS ngay.
              if (
                !isMobile &&
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
            title={
              isMobile
                ? agentOk
                  ? "Đăng Nhập TCS qua agent cloud (OCR / credential Railway)."
                  : "Agent offline — bấm để thử Đăng Nhập TCS lại."
                : "Đăng Nhập TCS (Ext trên PC ưu tiên; agent fallback)."
            }
          >
            {isMobile && !agentOk ? "Thử Đăng Nhập TCS" : "Đăng Nhập TCS"}
          </button>
        ) : null}

        {isMobile && canOperate && !loggedIn && !tcs.busy ? (
          <span
            className="max-w-[9rem] truncate text-[9px] font-medium text-amber-800"
            title="Agent cloud tự login / OCR khi session còn — hoặc bấm Đăng Nhập TCS"
          >
            Đang khôi phục session
          </span>
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
            ? `Agent cloud offline — bấm «Đăng Nhập TCS» để thử lại. Trên Railway kiểm tra service + credential kho ${portalWh}.`
            : `Offline: cài ${extLabel} hoặc bật policy auto/agent-only để dùng Playwright cloud.`}
        </p>
      ) : null}

      {!compact && canOperate && !tcs.busy ? (
        <p className="px-1 text-[9px] leading-snug text-ui-text-muted">
          {usesAgent
            ? "Online: Đăng Nhập TCS → menu ⋮ → Điền (tạo phiếu ESID) / Tải PDF. Quét chỉ cập nhật HT trên Ops — tách riêng."
            : "Ext: Đăng Nhập TCS → menu ⋮ → Điền (tạo phiếu ESID) → HOÀN TẤT trên TCS. Quét chỉ cập nhật HT Ops."}
        </p>
      ) : null}

      {showExtLogin && !isMobile ? (
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
            Đăng Nhập TCS {portalWh === "TCS" ? "TCS" : "TECS"}
          </button>
          <p className="text-[10px] text-slate-600 sm:col-span-3">
            Form này cho Chrome Ext. Agent cloud dùng credential trên Railway
            (Variables) — bấm «Đăng Nhập TCS» khi agent online là đủ.
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
        <div
          className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-1"
          aria-live="polite"
        >
          {tcs.error ? (
            <p className="min-w-0 text-[10px] font-medium text-red-600" role="alert">
              {tcs.error}
            </p>
          ) : tcs.message ? (
            <p className="min-w-0 truncate text-[10px] font-medium text-emerald-700">
              {tcs.message}
            </p>
          ) : null}
        </div>
      )}

      {/* HOÀN TẤT chỉ PC — phone ẩn Điền nên không hiện panel. */}
      {preview && !isMobile ? (
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
