import { useEffect, useState } from "react";
import { EsidSettingsMenu } from "./EsidSettingsMenu";
import { PortalExtStatusChip } from "./PortalExtStatusChip";
import { NEED_EXT_PC, PORTAL_BAR_UI } from "./portalBarUi";
import type { TcsPortalActions } from "../hooks/useTcsPortalActions";
import type { Shipment } from "../types/shipment";
import { useToast } from "../ui";
import { OverflowMenu, type OverflowMenuItem } from "../ui/OverflowMenu";
import { awbDigitsKey } from "../utils/awbFormat";
import { isTcsWarehouse } from "../constants/warehouses";
import {
  loadTcsExtLoginPrefs,
  saveTcsExtLoginPrefs,
} from "../utils/tcsExtLoginPrefs";
import {
  shouldOpenExtLoginAfterScanFailure,
  shouldPromptExtLoginBeforeScan,
} from "../utils/tcsPortalScanGate";
import { tcsLoginCtaLabel } from "../utils/tcsLoginCtaLabel";
import { tcsExtPresence } from "../utils/tcsChromeExtension";

type Props = {
  tcs: TcsPortalActions;
  compact?: boolean;
  /** Viewport ≤767 — không Đăng Nhập TCS / Quét; báo cần Ext trên PC */
  isMobile?: boolean;
  /** Lô đang chọn — overflow Điền / PDF */
  preferredShipment?: Shipment | null;
};

function extChipTitle(
  presence: ReturnType<typeof tcsExtPresence>,
  extLabel: string,
  isMobile: boolean
): string {
  if (presence === "logged_in") return `${extLabel} online · đã Đăng Nhập TCS`;
  if (presence === "ready") {
    return `${extLabel} online · chưa Đăng Nhập TCS — bấm «Đăng Nhập TCS»`;
  }
  return isMobile
    ? "Chrome Ext chỉ trên PC — điện thoại không Đăng Nhập TCS / Quét được"
    : `Chưa thấy ${extLabel}. Cài từ «Tải Ext» (TCS + SCSC), Reload Ext, F5 Ops.`;
}

export function TcsPortalInlineBar({
  tcs,
  compact = false,
  isMobile = false,
  preferredShipment = null,
}: Props) {
  const toast = useToast();
  const btnLogin = `${PORTAL_BAR_UI.btnBase} ${PORTAL_BAR_UI.btnPrimary}`;
  const btnSubmit = `${PORTAL_BAR_UI.btnBase} bg-emerald-600 text-white shadow-ui-sm hover:bg-emerald-700`;

  const portalWh = tcs.portalWarehouse;
  const extLabel = tcs.extLabel;
  const extOk = Boolean(tcs.extension?.ok);
  const extLoggedIn = Boolean(extOk && tcs.extension?.workspace?.logged_in);
  const canOperate = !isMobile && extOk;
  const loggedIn = extLoggedIn;
  const showLoginBtn = !isMobile && (!compact || !loggedIn);
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

  const presence = tcsExtPresence(tcs.extension);
  const fillTarget =
    preferredShipment && isTcsWarehouse(preferredShipment.warehouse)
      ? preferredShipment
      : null;
  const fillAwb = fillTarget ? awbDigitsKey(fillTarget.awb) : "";
  const canFillOrPdf = Boolean(canOperate && loggedIn && fillTarget && fillAwb.length === 11);

  const scanLabel =
    tcs.pendingReceptionCount > 0
      ? `Quét (${tcs.pendingReceptionCount})`
      : "Quét tiếp nhận";
  const overflowItems: OverflowMenuItem[] = [
    {
      id: "scan",
      label: scanLabel,
      description: isMobile
        ? NEED_EXT_PC
        : "Đối soát HT trên TCS rồi cập nhật status Ops. Không tạo phiếu ESID.",
      disabled: tcs.busy || !canOperate,
      onSelect: () => {
        void doScan();
      },
    },
    {
      id: "fill",
      label: "Điền ESID",
      description: isMobile
        ? NEED_EXT_PC
        : !fillTarget
          ? "Chọn một lô kho TCS / TECS-TCS trên bảng."
          : fillAwb.length !== 11
            ? "AWB phải đủ 11 số."
            : !loggedIn
              ? "Đăng Nhập TCS trước khi Điền."
              : `Điền phiếu ESID cho AWB ${fillTarget.awb}.`,
      disabled: tcs.busy || !canFillOrPdf,
      onSelect: () => {
        if (!fillTarget) return;
        void tcs.fillEsidDeclareFor(fillTarget);
      },
    },
    {
      id: "pdf",
      label: "Tải PDF ESID",
      description: isMobile
        ? NEED_EXT_PC
        : !fillTarget
          ? "Chọn một lô kho TCS / TECS-TCS trên bảng."
          : fillAwb.length !== 11
            ? "AWB phải đủ 11 số."
            : !loggedIn
              ? "Đăng Nhập TCS trước khi tải PDF."
              : `Tải PDF ESID cho AWB ${fillTarget.awb}.`,
      disabled: tcs.busy || !canFillOrPdf,
      onSelect: () => {
        if (!fillTarget) return;
        void tcs.downloadEsidFor(fillTarget);
      },
    },
  ];

  const preview = tcs.lastDeclarePreview;

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-0.5" : "gap-1"}`}>
      <div
        className={`${PORTAL_BAR_UI.toolbar} ${
          compact
            ? ""
            : "rounded-xl border border-ui-border bg-ui-surface px-1.5 py-1 shadow-ui-sm sm:flex-nowrap"
        }`}
        role="toolbar"
        aria-label={`Cổng TCS · ${portalWh}`}
      >
        <PortalExtStatusChip
          presence={isMobile ? "offline" : presence}
          title={extChipTitle(isMobile ? "offline" : presence, extLabel, isMobile)}
          testId="ops-ext-status"
        />

        {showLoginBtn ? (
          <button
            type="button"
            className={btnLogin}
            disabled={tcs.busy}
            onClick={() => {
              if (!tcsUsername.trim() && !extLoggedIn && !compact) {
                setShowExtLogin(true);
                return;
              }
              void doLogin();
            }}
            title="Đăng Nhập TCS — Ext trên PC kho thực thi (App-click → Ext)."
          >
            {tcsLoginCtaLabel()}
          </button>
        ) : null}

        <OverflowMenu
          label="Quét / Điền / PDF"
          compact={compact}
          align="right"
          items={overflowItems}
        />

        <EsidSettingsMenu disabled={tcs.busy} compact={compact} />

        {tcs.busy ? (
          <span className="truncate text-[11px] font-semibold text-ui-info">
            {tcs.busyLabel || "…"}
          </span>
        ) : null}
      </div>

      {isMobile && !tcs.busy ? (
        <p className={PORTAL_BAR_UI.hint} data-testid="ops-ext-mobile-hint">
          Cần Ext trên PC — Đăng Nhập TCS / Quét / Điền / PDF chỉ trên máy đã cài
          Ext TCS + SCSC.
        </p>
      ) : null}

      {!compact && !isMobile && !canOperate && !tcs.busy ? (
        <p className={PORTAL_BAR_UI.hint}>
          {extOk
            ? `Ext sẵn sàng — bấm «Đăng Nhập TCS».`
            : `Cần ${extLabel} trên PC kho (menu «Tải Ext»). Bấm trên Ops → Ext thực thi.`}
        </p>
      ) : null}

      {!compact && !isMobile && canOperate && !tcs.busy ? (
        <p className={PORTAL_BAR_UI.hint}>
          App → Ext PC: Đăng Nhập TCS → menu ⋮ → Điền / Tải PDF. Quét chỉ cập nhật
          HT Ops.
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
            className="min-h-11 min-w-0 rounded-xl border border-sky-500/25 bg-white px-2.5 py-1 text-[13px] text-ui-text outline-none focus:border-sky-500"
          />
          <input
            value={tcsPassword}
            onChange={(event) => setTcsPassword(event.target.value)}
            placeholder={`Mật khẩu ${portalWh}`}
            type="password"
            autoComplete="current-password"
            className="min-h-11 min-w-0 rounded-xl border border-sky-500/25 bg-white px-2.5 py-1 text-[13px] text-ui-text outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            className={btnLogin}
            disabled={!tcsUsername.trim() || !tcsPassword || tcs.busy}
          >
            {tcsLoginCtaLabel()}
          </button>
          <p className="text-[11px] text-ui-text-muted sm:col-span-3">
            Form cho Chrome Ext trên PC. App-click → Ext thực thi trên tab TCS.
          </p>
          <label className="flex min-h-11 items-center gap-2 text-[11px] text-ui-text-muted sm:col-span-3">
            <input
              type="checkbox"
              className="h-4 w-4 accent-ui-primary"
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
            <p className="min-w-0 text-[11px] font-medium text-ui-danger" role="alert">
              {tcs.error}
            </p>
          ) : tcs.message ? (
            <p className="min-w-0 truncate text-[11px] font-medium text-emerald-800">
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
            <p className="min-w-0 text-[11px] font-semibold text-emerald-950">
              Form đã điền · AWB {preview.awb}
              {preview.valuesSummary ? ` · ${preview.valuesSummary}` : ""}
            </p>
            <button
              type="button"
              className="min-h-11 px-2 text-[12px] font-semibold text-ui-text-muted underline"
              onClick={tcs.clearDeclarePreview}
              disabled={tcs.busy}
            >
              Đóng
            </button>
          </div>

          <p className="text-[11px] font-medium leading-snug text-emerald-950">
            Form trên tab Chrome Ext — kiểm tra rồi HOÀN TẤT trực tiếp trên TCS.
          </p>

          {preview.warnings[0] ? (
            <p className="text-[11px] font-medium text-amber-950">
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
