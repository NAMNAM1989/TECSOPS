import { useEffect, useState } from "react";
import { EsidSettingsMenu } from "./EsidSettingsMenu";
import type { TcsPortalActions } from "../hooks/useTcsPortalActions";
import { useToast } from "../ui";
import {
  loadTcsExtLoginPrefs,
  saveTcsExtLoginPrefs,
} from "../utils/tcsExtLoginPrefs";
import {
  shouldOpenExtLoginAfterScanFailure,
  shouldPromptExtLoginBeforeScan,
} from "../utils/tcsPortalScanGate";
import { tcsLoginCtaLabel } from "../utils/tcsLoginCtaLabel";

type Props = {
  tcs: TcsPortalActions;
  compact?: boolean;
  /** Viewport ≤767 — không Đăng Nhập TCS / Quét; báo cần Ext trên PC */
  isMobile?: boolean;
};

const NEED_EXT_PC =
  "Cần Chrome Ext trên PC (menu «Tải Ext»: TCS + SCSC). Điện thoại không Đăng Nhập TCS / Quét được.";

export function TcsPortalInlineBar({
  tcs,
  compact = false,
  isMobile = false,
}: Props) {
  const toast = useToast();
  const btn =
    `inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-45 active:scale-[0.98] ${
      compact ? "min-h-11 min-w-11 touch-manipulation" : ""
    }`;
  const btnLogin = `${btn} bg-ui-primary text-white hover:bg-ui-primary-hover shadow-sm`;
  const btnScan = `${btn} border border-sky-600/40 bg-sky-50 text-sky-900 hover:bg-sky-100`;
  const btnSubmit = `${btn} bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm`;
  const btnVisualOn = `${btn} border border-violet-600/50 bg-violet-50 text-violet-900 hover:bg-violet-100`;
  const btnVisualOff = `${btn} border border-ui-border bg-ui-surface text-slate-600 hover:bg-slate-50`;

  const portalWh = tcs.portalWarehouse;
  const extLabel = tcs.extLabel;
  const visualControl = Boolean(tcs.visualControl);
  const extOk = Boolean(tcs.extension?.ok);
  const extLoggedIn = Boolean(extOk && tcs.extension?.workspace?.logged_in);
  const canOperate = !isMobile && extOk;
  const loggedIn = extLoggedIn;
  const showLoginBtn = isMobile ? true : !compact || !loggedIn;
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

    if (isMobile) {
      toast.error(NEED_EXT_PC, "Cần Ext trên PC");
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

    setShowExtLogin(true);
    toast.warning(
      `Cần ${extLabel} online để Đăng Nhập TCS trên tab Chrome. Reload Ext / mở Ops trên cùng Chrome đã cài Ext.`,
      "Cần Chrome Ext"
    );
  };

  const doScan = async () => {
    if (tcs.busy) return;

    if (isMobile) {
      toast.error(NEED_EXT_PC, "Cần Ext trên PC");
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
        toast.warning(
          `Bấm «Đăng Nhập TCS» đúng user kho ${portalWh} trước khi Quét` +
            (portalWh === "TCS"
              ? " (vd. namnam8012)."
              : " (vd. hanam7195).") +
            " Hai kho dữ liệu dùng chung Ext TCS — đổi kho phải Đăng Nhập TCS lại.",
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

    toast.warning(
      `Cần ${extLabel} để Quét trên tab Chrome. Reload Ext hoặc cài từ «Tải Ext».`,
      "Cần Chrome Ext"
    );
  };

  const confirmSubmit = () => {
    const p = tcs.lastDeclarePreview;
    if (!p) return;
    const ok = window.confirm(
      `Gửi HOÀN TẤT lên TCS cho AWB ${p.awb}?\n\n` +
        "Kiểm tra form trên tab Chrome Ext rồi xác nhận.\n" +
        "Không hoàn tác từ Ops."
    );
    if (!ok) return;
    void tcs.submitEsidDeclare(p);
  };

  const preview = tcs.lastDeclarePreview;
  const workspace = tcs.workspace;

  const portalStatusLabel = isMobile
    ? "Cần Ext trên PC"
    : extLoggedIn
      ? `${extLabel} đã login`
      : extOk
        ? `${extLabel} — cần Đăng Nhập TCS`
        : "Cần Chrome Ext";

  const shortStatus = loggedIn
    ? "Đã Đăng Nhập TCS"
    : canOperate
      ? "Chờ Đăng Nhập TCS"
      : isMobile
        ? "Cần Ext PC"
        : "Offline";

  const extPresence: "offline" | "ready" | "logged_in" = !extOk
    ? "offline"
    : extLoggedIn
      ? "logged_in"
      : "ready";
  const extChipLabel =
    extPresence === "logged_in"
      ? compact
        ? "Ext · login"
        : "Ext · đã login"
      : extPresence === "ready"
        ? compact
          ? "Ext · OK"
          : "Ext · sẵn sàng"
        : compact
          ? "Ext · off"
          : "Ext · offline";
  const extChipClass =
    extPresence === "logged_in"
      ? "bg-emerald-500/15 text-emerald-800"
      : extPresence === "ready"
        ? "bg-sky-500/15 text-sky-900"
        : "bg-slate-500/15 text-slate-600";
  const extChipTitle =
    extPresence === "logged_in"
      ? `${extLabel} online · đã Đăng Nhập TCS`
      : extPresence === "ready"
        ? `${extLabel} online · chưa Đăng Nhập TCS — bấm «Đăng Nhập TCS»`
        : isMobile
          ? "Chrome Ext chỉ trên PC — điện thoại không Đăng Nhập TCS / Quét được"
          : `Chưa thấy ${extLabel}. Cài từ «Tải Ext» (TCS + SCSC), Reload Ext, F5 Ops.`;

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
              ? "Kho dữ liệu TCS — Ext TCS trên PC"
              : "Kho dữ liệu TECS-TCS — Ext TCS trên PC (không còn agent Railway)"
          }
        >
          {portalWh === "TCS" ? "Kho TCS" : "TECS-TCS"}
        </span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${extChipClass}`}
          title={extChipTitle}
          data-testid="ops-ext-status"
          data-ext-presence={extPresence}
        >
          {extChipLabel}
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
                ? "App-click → Ext PC: bấm trên Ops, Ext trên máy kho thực thi. Bấm để tắt nhãn."
                : "Trực quan TẮT (nhãn). Đăng Nhập TCS / Quét / Điền vẫn chỉ qua Chrome Ext trên PC."
            }
            onClick={() => tcs.setVisualControl(!visualControl)}
          >
            {compact ? (visualControl ? "TQ" : "Ẩn") : visualControl ? "Trực quan" : "Ẩn"}
          </button>
        ) : null}

        {showLoginBtn ? (
          <button
            type="button"
            className={btnLogin}
            disabled={tcs.busy}
            onClick={() => {
              if (isMobile) {
                void doLogin();
                return;
              }
              if (!tcsUsername.trim() && !extLoggedIn && !compact) {
                setShowExtLogin(true);
                return;
              }
              void doLogin();
            }}
            title={
              isMobile
                ? NEED_EXT_PC
                : "Đăng Nhập TCS — Ext trên PC kho thực thi (App-click → Ext)."
            }
          >
            {tcsLoginCtaLabel()}
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
            isMobile
              ? NEED_EXT_PC
              : tcs.pendingReceptionCount > 0
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

        <EsidSettingsMenu disabled={tcs.busy} compact={compact} />

        {tcs.busy ? (
          <span className="truncate text-[10px] font-semibold text-sky-700">
            {tcs.busyLabel || "…"}
          </span>
        ) : null}
      </div>

      {!compact && isMobile && !tcs.busy ? (
        <p className="px-1 text-[9px] leading-snug text-ui-text-muted">
          Cần Ext trên PC — Đăng Nhập TCS / Quét / Điền / PDF chỉ trên máy đã cài Ext TCS + SCSC.
        </p>
      ) : null}

      {!compact && !isMobile && !canOperate && !tcs.busy ? (
        <p className="px-1 text-[9px] leading-snug text-ui-text-muted">
          {extOk
            ? `Ext sẵn sàng — bấm «Đăng Nhập TCS».`
            : `Cần ${extLabel} trên PC kho (menu «Tải Ext»). Bấm trên Ops → Ext thực thi.`}
        </p>
      ) : null}

      {!compact && !isMobile && canOperate && !tcs.busy ? (
        <p className="px-1 text-[9px] leading-snug text-ui-text-muted">
          App → Ext PC: Đăng Nhập TCS → menu ⋮ → Điền / Tải PDF. Quét chỉ cập nhật HT Ops.
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
            Form này cho Chrome Ext trên PC. Không còn agent Railway.
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
              {` · extension`}
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
            Form trên tab Chrome Ext — kiểm tra rồi HOÀN TẤT trực tiếp trên TCS.
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
            title="Mở tab TCS để kiểm tra và HOÀN TẤT trực tiếp"
          >
            Mở tab TCS để HOÀN TẤT
          </button>
        </div>
      ) : null}
    </div>
  );
}
