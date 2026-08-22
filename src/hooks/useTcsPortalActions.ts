import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import { isTcsWarehouse } from "../constants/warehouses";
import { awbDigitsKey } from "../utils/awbFormat";
import {
  asTcsPortalWarehouse,
  buildTcsPortalJob,
  canFillEsidForPortal,
  shipmentsPendingReceptionScan,
  shipmentsToMarkReceptionCompleted,
  type TcsPortalWarehouse,
} from "../utils/tcsPortalJob";
import { loadTcsExtLoginPrefs, tcsExtLabel } from "../utils/tcsExtLoginPrefs";
import {
  downloadPdfFromAgent,
  fetchTcsSessionStatus,
  agentOfflineHint,
  scanTcsWorkspace,
  openTcsAgentSession,
  getTcsAgentBaseUrl,
  pingTcsAgent,
  pickEsidScanReadyItems,
  declareFillTcsEsid,
  declareSubmitTcsEsid,
  submitTcsPortalJob,
  type TcsAgentHealth,
  type TcsAgentJobResultRow,
  type TcsAgentSession,
  type TcsEsidScanItem,
} from "../utils/tcsPortalAgentApi";
import { buildEsidDeclareFillPayload } from "../utils/buildEsidDeclareFillPayload";
import { resolveShipmentForEsidDeclare } from "../utils/resolveShipmentForEsidDeclare";
import {
  getActiveEsidRegistrant,
  registrantIsComplete,
} from "../utils/esidRegistrantProfile";
import { agentIsComplete, getActiveEsidAgent } from "../utils/esidAgentProfile";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  bootstrapTcsExtension,
  downloadEsidPdfViaExtension,
  fillEsidViaExtension,
  invalidateTcsExtensionSession,
  openTcsExtensionTab,
  pingTcsExtension,
  scanTcsExtensionDate,
  type TcsExtensionWorkspace,
  type TcsExtResult,
} from "../utils/tcsChromeExtension";
import {
  getPortalExecutorPolicy,
  getPortalVisualControl,
  resolvePortalExecutorOrder,
  setPortalVisualControl,
  shouldLockToExtensionVisual,
} from "../utils/portalExecutorPolicy";
import {
  getPortalPlaywrightLocal,
  setPortalPlaywrightLocal,
} from "../utils/portalPlaywrightLocal";
import { extensionOcrBaseUrl } from "../utils/tcsOcrAgentEndpoints";
import { portalBusyUserMessage } from "../utils/tcsPortalScanGate";
import {
  isTcsAgentHealthStopError,
  shouldPollTcsAgentHealth,
  TCS_AGENT_HEALTH_POLL_MS,
} from "../utils/tcsAgentHealthPoll";

function downloadPdfFromBase64(pdfName: string, base64: string): boolean {
  const name = pdfName.replace(/^.*[/\\]/, "");
  if (!name.toLowerCase().endsWith(".pdf") || !base64) return false;
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const objectUrl = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" })
    );
    try {
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return true;
    } catch {
      URL.revokeObjectURL(objectUrl);
      return false;
    }
  } catch {
    return false;
  }
}

export type EsidDeclarePreviewState = {
  awb: string;
  shipmentId: string;
  warnings: string[];
  valuesSummary: string;
  executor: "extension" | "playwright";
  /** Kho đã Điền — HOÀN TẤT phải gửi đúng agent này, không theo tab đang chọn. */
  warehouse: TcsPortalWarehouse;
};

export type TcsPortalActionsOpts = {
  sessionYmd: string;
  rows: readonly Shipment[];
  /** Danh bạ khách — resolve Shipper/CNEE khi Điền ESID */
  customerDirectory?: readonly CustomerDirectoryEntry[];
  onMarkReceptionCompleted?: (shipmentIds: string[]) => void | Promise<void>;
  /** Sau quét: báo số lô ready / đã cập nhật Ops (để đổi lọc bảng) */
  onReceptionScanDone?: (info: {
    readyCount: number;
    updatedCount: number;
    readyAwbs: string[];
  }) => void;
  /** Toolbar TCS đang hiện — chưa đủ để poll health */
  active?: boolean;
  /**
   * Kho portal đang thao tác trên Ops — quyết định Ext/channel + phạm vi bootstrap.
   * Mặc định TECS-TCS (Ext hub).
   */
  portalWarehouse?: Warehouse;
  /**
   * Deprecated — luôn bỏ qua (không còn portal-worker / máy kho từ xa).
   * Giữ prop để không phá AirCargoTracking.
   */
  preferRemotePortal?: boolean;
  /** Viewport ≤767 — auto policy = agent-only */
  isMobile?: boolean;
};

export function useTcsPortalActions({
  sessionYmd,
  rows,
  customerDirectory = [],
  onMarkReceptionCompleted,
  onReceptionScanDone,
  active = true,
  portalWarehouse: portalWarehouseProp = "TECS-TCS",
  preferRemotePortal = false,
  isMobile = false,
}: TcsPortalActionsOpts) {
  const portalWarehouse: TcsPortalWarehouse =
    asTcsPortalWarehouse(portalWarehouseProp) || "TECS-TCS";
  const extOpts = useMemo(
    () => ({ warehouse: portalWarehouse }),
    [portalWarehouse]
  );
  const agentOpts = useMemo(
    () => ({ warehouse: portalWarehouse }),
    [portalWarehouse]
  );
  const executorPolicy = getPortalExecutorPolicy();
  const [visualControl, setVisualControlState] = useState(() =>
    getPortalVisualControl()
  );
  const setVisualControl = useCallback((on: boolean) => {
    setPortalVisualControl(on);
    setVisualControlState(on);
  }, []);
  const [playwrightLocal, setPlaywrightLocalState] = useState(() =>
    getPortalPlaywrightLocal()
  );
  const setPlaywrightLocal = useCallback((on: boolean) => {
    setPortalPlaywrightLocal(on);
    setPlaywrightLocalState(on);
  }, []);
  const [health, setHealth] = useState<TcsAgentHealth | null>(null);
  const [extension, setExtension] = useState<TcsExtResult | null>(null);
  const [session, setSession] = useState<TcsAgentSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  /** Tránh poll /health ghi đè Offline khi đang chờ job dài trên agent */
  const busyRef = useRef(false);
  busyRef.current = busy;
  /** Ping miss liên tiếp — chỉ bỏ qua 1 lần (tránh nhấp nháy), không giữ forever. */
  const healthMissRef = useRef(0);
  /** Poll /health chỉ sau Đăng Nhập TCS / Quét / session mở. */
  const [agentWatch, setAgentWatch] = useState(false);
  const lastAgentActivityRef = useRef<number | null>(null);
  const beginAgentWatch = useCallback(() => {
    lastAgentActivityRef.current = Date.now();
    setAgentWatch(true);
  }, []);
  const [results, setResults] = useState<TcsAgentJobResultRow[]>([]);
  const [downloadedCount, setDownloadedCount] = useState(0);
  /** Sau Điền: trạng thái + nút HOÀN TẤT trên cùng workspace. */
  const [lastDeclarePreview, setLastDeclarePreview] =
    useState<EsidDeclarePreviewState | null>(null);
  /** AWB chưa HT tiếp nhận — gửi khi Quét (không gửi lại lô đã RECEPTION_COMPLETED). */
  const pendingReception = useMemo(
    () =>
      shipmentsPendingReceptionScan(rows, sessionYmd, {
        warehouse: portalWarehouse,
      }),
    [rows, sessionYmd, portalWarehouse]
  );

  const refreshHealth = useCallback(async () => {
    // Job dài chiếm worker: bỏ poll tạm — tránh nhãn Offline giả khi UI đang busy
    if (busyRef.current) return;
    const h = await pingTcsAgent(3500, agentOpts);
    if (busyRef.current) return;
    const scope = String(h?.warehouse_scope || "").trim();
    const scopeMismatch =
      Boolean(h?.ok) &&
      Boolean(scope) &&
      asTcsPortalWarehouse(scope) != null &&
      asTcsPortalWarehouse(scope) !== portalWarehouse;
    if (!h?.ok || scopeMismatch) {
      if (isTcsAgentHealthStopError(h?.error)) {
        healthMissRef.current = 99;
        setHealth(h);
        setSession(null);
        setAgentWatch(false);
        return;
      }
      healthMissRef.current += 1;
      // 1 miss: giữ prev cùng kho (tránh nhấp nháy). Từ miss 2 hoặc đổi kho: Offline thật.
      if (healthMissRef.current <= 1) {
        setHealth((prev) => {
          const prevScope = String(prev?.warehouse_scope || "").trim();
          const sameWh =
            !prevScope ||
            asTcsPortalWarehouse(prevScope) === portalWarehouse ||
            asTcsPortalWarehouse(prevScope) == null;
          return prev?.ok && sameWh ? prev : h;
        });
        return;
      }
      setHealth(h);
      setSession(null);
      setAgentWatch(false);
      return;
    }
    healthMissRef.current = 0;
    setHealth(h);
    if (h.session) setSession(h.session);
    else setSession(await fetchTcsSessionStatus(agentOpts));
  }, [agentOpts, portalWarehouse]);

  const healthPollOn = shouldPollTcsAgentHealth({
    toolbarActive: active,
    watching: agentWatch,
    sessionOpen: Boolean(session?.open),
    lastActivityAt: lastAgentActivityRef.current,
    healthError: health?.error,
  });

  useEffect(() => {
    if (!healthPollOn) return;
    void refreshHealth();
    const t = window.setInterval(() => {
      const still = shouldPollTcsAgentHealth({
        toolbarActive: active,
        watching: agentWatch,
        sessionOpen: Boolean(session?.open),
        lastActivityAt: lastAgentActivityRef.current,
        healthError: health?.error,
      });
      if (!still) {
        window.clearInterval(t);
        setAgentWatch(false);
        return;
      }
      void refreshHealth();
    }, TCS_AGENT_HEALTH_POLL_MS);
    return () => window.clearInterval(t);
  }, [active, agentWatch, health?.error, healthPollOn, refreshHealth, session?.open]);

  const refreshExtension = useCallback(async () => {
    const result = await pingTcsExtension({ warehouse: portalWarehouse });
    setExtension(result);
    return result;
  }, [portalWarehouse]);

  // Đổi kho: cookie tcs.com.vn dùng chung 2 Ext → invalidate CẢ HAI (không chỉ kho đích).
  // Đồng thời xoá health/session agent kho cũ — tránh UI «Chờ ĐN / READY» dính từ :8765 khi :8766 offline.
  const prevPortalWhRef = useRef<TcsPortalWarehouse | null>(null);
  useEffect(() => {
    const prev = prevPortalWhRef.current;
    prevPortalWhRef.current = portalWarehouse;
    if (!prev || prev === portalWarehouse) return;
    healthMissRef.current = 99;
    setHealth(null);
    setSession(null);
    setAgentWatch(false);
    lastAgentActivityRef.current = null;
    setLastDeclarePreview(null);
    setMessage("");
    setError("");
    setExtension((ext) =>
      ext
        ? {
            ...ext,
            workspace: {
              ...(ext.workspace || {}),
              logged_in: false,
              logged_in_username: "",
              phase: "IDLE",
              message: `Đã chuyển sang ${portalWarehouse} — Đăng Nhập TCS lại user kho này trước khi Quét`,
            } as TcsExtensionWorkspace,
          }
        : ext
    );
    void Promise.all([
      invalidateTcsExtensionSession({ warehouse: "TECS-TCS" }),
      invalidateTcsExtensionSession({ warehouse: "TCS" }),
    ]).catch(() => undefined);
  }, [portalWarehouse]);

  useEffect(() => {
    if (!active) return;
    void refreshExtension();
    const timer = window.setInterval(() => void refreshExtension(), 10_000);
    return () => window.clearInterval(timer);
  }, [active, refreshExtension]);

  /** @deprecated Không còn portal-worker / máy kho từ xa. */
  const refreshPortalWorker = useCallback(async () => null, []);

  const ensureSessionReady = useCallback(async (
    warehouse: TcsPortalWarehouse = portalWarehouse
  ): Promise<boolean> => {
    const opts = { warehouse };
    const sameWh = warehouse === portalWarehouse;
    // Fast-path: đã login từ poll gần đây — bỏ 2 RTT ping/status trước mỗi PDF
    if (sameWh && health?.ok && session?.open && session?.logged_in) {
      return true;
    }
    beginAgentWatch();
    const online = await pingTcsAgent(3500, opts);
    if (sameWh) setHealth(online);
    if (!online?.ok) {
      setError(agentOfflineHint(getTcsAgentBaseUrl()));
      return false;
    }
    let s = online.session || (await fetchTcsSessionStatus(opts));
    if (sameWh) setSession(s);
    // Ext Đồng bộ chỉ login tab Chrome user — agent Playwright có thể chưa mở.
    // Tự mở session khi tải PDF / điền (không bắt user bấm Login riêng).
    if (!s?.open || !s?.logged_in) {
      const wantVisible = playwrightLocal || online.headless === false;
      setBusyLabel(
        wantVisible
          ? `Đang mở Chrome agent ${warehouse} (PDF/Điền)…`
          : `Đang khởi tạo phiên agent ${warehouse}…`
      );
      const opened = await openTcsAgentSession({
        visible: wantVisible,
        warehouse,
      });
      if (opened.ok === false && opened.error === "AGENT_OFFLINE") {
        setError(opened.message || agentOfflineHint(getTcsAgentBaseUrl()));
        return false;
      }
      s = opened;
      if (sameWh) {
        setSession(opened);
        setHealth((prev) =>
          prev
            ? { ...prev, ok: true, session: opened }
            : { ok: true, session: opened }
        );
      }
    }
    if (!s?.open) {
      setError(
        (s?.message && String(s.message).trim()) ||
          (playwrightLocal
            ? `Không mở được agent headed local ${warehouse}. Chạy npm run portal:headed:local.`
            : `Không mở được agent cloud ${warehouse}. ` +
              "Kiểm tra Railway /tcs-agent hoặc chạy agent local.")
      );
      return false;
    }
    if (!s?.logged_in) {
      const headless = !playwrightLocal && online.headless !== false;
      setError(
        headless
          ? `Agent cloud ${warehouse} chưa login — bấm Đăng Nhập TCS kho này để OCR CAPTCHA / khôi phục session.`
          : `Agent Chrome kho ${warehouse} đang ở trang login — nhập CAPTCHA trên cửa sổ agent rồi thử lại.`
      );
      if (sameWh) await refreshHealth();
      return false;
    }
    return true;
  }, [
    agentOpts,
    beginAgentWatch,
    health?.ok,
    playwrightLocal,
    portalWarehouse,
    refreshHealth,
    session?.logged_in,
    session?.open,
  ]);

  const applyReadyItemsToOps = useCallback(
    async (ready: TcsEsidScanItem[]) => {
      let updatedCount = 0;
      if (ready.length && onMarkReceptionCompleted) {
        setBusyLabel("Cập nhật trạng thái Ops…");
        const toMark = shipmentsToMarkReceptionCompleted(
          rows,
          sessionYmd,
          ready.map((item) => item.awb),
          { warehouse: portalWarehouse }
        );
        if (toMark.length) {
          await onMarkReceptionCompleted(toMark.map((shipment) => shipment.id));
          updatedCount = toMark.length;
        }
      }
      onReceptionScanDone?.({
        readyCount: ready.length,
        updatedCount,
        readyAwbs: ready.map((item) => item.awb),
      });
      return updatedCount;
    },
    [
      onMarkReceptionCompleted,
      onReceptionScanDone,
      portalWarehouse,
      rows,
      sessionYmd,
    ]
  );

  /** Chỉ đăng nhập Ext (không quét). */
  const loginWithExtension = useCallback(
    async (credentials: {
      username: string;
      password: string;
      remember: boolean;
    }) => {
      beginAgentWatch();
      setError("");
      setMessage("");
      setBusy(true);
      setBusyLabel(`${tcsExtLabel(portalWarehouse)} đang đăng nhập…`);
      const started = performance.now();
      try {
        // Ext OCR gọi trực tiếp loopback đúng port kho — tránh proxy thiếu header.
        const extensionAgentBase = extensionOcrBaseUrl(portalWarehouse);
        const result = await bootstrapTcsExtension(
          {
            ...credentials,
            session_date: sessionYmd,
            awbs: [],
            login_only: true,
            agent_base_url: extensionAgentBase,
          },
          extOpts
        );
        setExtension(result);
        if (!result.ok) {
          const msg =
            result.message ||
            result.error ||
            `${tcsExtLabel(portalWarehouse)} đăng nhập thất bại`;
          if (result.error === "CAPTCHA_REQUIRED") {
            setMessage(msg);
            setError("");
          } else {
            setError(msg);
          }
          return result;
        }
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        setMessage(
          `${tcsExtLabel(portalWarehouse)} đã đăng nhập · ${seconds}s · kho ${portalWarehouse}` +
            ` · dùng Chrome profile riêng cho kho này`
        );
        // Cookie portal dùng chung — đánh dấu Ext kho kia stale ngay sau ĐN thành công.
        const otherWh: TcsPortalWarehouse =
          portalWarehouse === "TCS" ? "TECS-TCS" : "TCS";
        void invalidateTcsExtensionSession({ warehouse: otherWh }).catch(
          () => undefined
        );
        return result;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `${tcsExtLabel(portalWarehouse)} đăng nhập thất bại`
        );
        return null;
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [beginAgentWatch, extOpts, portalWarehouse, sessionYmd]
  );

  /** Quét tiếp nhận trên Ext đã login — chỉ AWB chưa RECEPTION_COMPLETED. */
  const scanReceptionWithExtension = useCallback(async () => {
    beginAgentWatch();
    setError("");
    setMessage("");
    setBusy(true);
    const pendingAwbs = pendingReception.map((s) => awbDigitsKey(s.awb));
    setBusyLabel(
      pendingAwbs.length
        ? `${tcsExtLabel(portalWarehouse)} quét ${pendingAwbs.length} AWB chưa HT tiếp nhận…`
        : `${tcsExtLabel(portalWarehouse)} quét ngày ${sessionYmd}…`
    );
    const started = performance.now();
    try {
      const expectedUser = loadTcsExtLoginPrefs(portalWarehouse).username;
      const result = await scanTcsExtensionDate(
        {
          session_date: sessionYmd,
          awbs: pendingAwbs,
          expected_username: expectedUser || undefined,
          agent_base_url: getTcsAgentBaseUrl(),
        },
        extOpts
      );
      setExtension(result);
      if (!result.ok) {
        const busy = portalBusyUserMessage(result);
        if (busy) {
          setError(busy);
          return result;
        }
        setError(
          result.message ||
            result.error ||
            `${tcsExtLabel(portalWarehouse)} quét thất bại`
        );
        return result;
      }
      const ready = result.ready || [];
      const updatedCount = await applyReadyItemsToOps(ready);
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const listTotal = Number(result.list_total ?? result.cache_count ?? 0);
      const receptionTotal = Number(
        result.reception_total ?? ready.length
      );
      let detail = "";
      if (updatedCount) {
        detail = ` · cập nhật Ops ${updatedCount} lô`;
      } else if (pendingAwbs.length === 0) {
        detail =
          receptionTotal > 0
            ? ` · TCS có ${receptionTotal} HT nhưng Ops không có lô kho ${portalWarehouse} chưa HT (ngày ${sessionYmd})`
            : ` · Ops không có lô kho ${portalWarehouse} cần quét (ngày ${sessionYmd})`;
      } else if (receptionTotal > 0 && ready.length === 0) {
        detail = ` · TCS ${receptionTotal} HT nhưng không khớp ${pendingAwbs.length} AWB Ops`;
      } else if (listTotal === 0) {
        detail = " · danh sách ESID trống sau lọc ngày — kiểm tra ngày phiên / bộ lọc TCS";
      } else {
        detail = " · không có lô mới cần cập nhật";
      }
      setMessage(
        `Quét ${portalWarehouse} · ${seconds}s · ${listTotal} dòng · ${receptionTotal} HT trên TCS · khớp ${ready.length}` +
          detail
      );
      return result;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `${tcsExtLabel(portalWarehouse)} quét thất bại`
      );
      return null;
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [
    applyReadyItemsToOps,
    beginAgentWatch,
    extOpts,
    pendingReception,
    portalWarehouse,
    sessionYmd,
  ]);

  /**
   * ĐN khi không có Ext (bar đã thử Ext trước).
   * Mặc định chỉ Ext — agent-only còn dùng cho debug legacy.
   */
  const login = useCallback(async () => {
    beginAgentWatch();
    setError("");
    setMessage("");
    if (playwrightLocal && !isMobile) {
      const extPing = await pingTcsExtension({ warehouse: portalWarehouse });
      setExtension(extPing);
      if (!extPing.ok) {
        setError(
          `PW local: cần ${tcsExtLabel(portalWarehouse)} online để nối agent headed. Reload Ext rồi thử lại.`
        );
        return;
      }
    } else {
      const extPing = await pingTcsExtension({ warehouse: portalWarehouse });
      setExtension(extPing);
      const order = resolvePortalExecutorOrder("login", {
        policy: executorPolicy,
        preferRemote: preferRemotePortal,
        isMobile,
        visualControl,
        extensionOnline: Boolean(extPing.ok),
      });
      const tryAgent = order.includes("agent");

      if (!tryAgent) {
        setError(
          visualControl && extPing.ok
            ? `Chế độ trực quan: Đăng Nhập TCS bằng ${tcsExtLabel(portalWarehouse)} (tab Chrome). ` +
                "Điền user/pass trên form Ext — không dùng agent ẩn."
            : `Cần Chrome Ext kho ${portalWarehouse} (${tcsExtLabel(portalWarehouse)}). ` +
                "Bấm «Tải Ext» trên toolbar, mở đúng profile Chrome, rồi Đăng Nhập TCS lại."
        );
        return;
      }
    }

    setBusy(true);
    setBusyLabel(
      playwrightLocal
        ? `Đăng nhập Playwright local ${portalWarehouse}…`
        : `Đăng nhập agent ${portalWarehouse}…`
    );
    try {
      const online = await pingTcsAgent(3500, agentOpts);
      setHealth(online);
      if (!online?.ok) {
        setError(agentOfflineHint(getTcsAgentBaseUrl()));
        return;
      }
      const wantVisible = playwrightLocal || online.headless === false;
      const opened = await openTcsAgentSession({
        visible: wantVisible,
        warehouse: portalWarehouse,
      });
      setSession(opened);
      if (!opened?.open || !opened?.logged_in) {
        const headless = !playwrightLocal && online.headless !== false;
        setError(
          opened?.message ||
            (headless
              ? "Agent cloud chưa login — OCR CAPTCHA thất bại hoặc hết session. " +
                "Kiểm tra TCS_USERNAME(_TCS)/password + volume browser_profile trên Railway, rồi Đăng Nhập TCS lại."
              : "Agent chưa login — nhập CAPTCHA trên cửa sổ Chrome agent rồi thử lại.")
        );
        return;
      }
      setMessage(
        playwrightLocal
          ? `Playwright local đã đăng nhập (${portalWarehouse}) — xem cửa sổ Chromium.`
          : `Agent cloud đã đăng nhập (${portalWarehouse}) — bấm Quét tiếp nhận khi cần.`
      );
      await refreshHealth();
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [
    agentOpts,
    executorPolicy,
    isMobile,
    playwrightLocal,
    portalWarehouse,
    preferRemotePortal,
    beginAgentWatch,
    refreshHealth,
    visualControl,
  ]);

  /** Quét qua Playwright agent (Railway online / local). */
  const scanReceptionWithAgent = useCallback(async () => {
    beginAgentWatch();
    setError("");
    setMessage("");
    const order = resolvePortalExecutorOrder("scan", {
      policy: executorPolicy,
      preferRemote: preferRemotePortal,
      isMobile,
      visualControl,
      extensionOnline: Boolean(extension?.ok),
    });
    if (!order.includes("agent")) {
      setError(
        visualControl && extension?.ok
          ? `Chế độ trực quan: Quét bằng ${tcsExtLabel(portalWarehouse)} trên tab Chrome. ` +
              "Đăng Nhập TCS Ext trước — không chạy agent ẩn."
          : `Cần Chrome Ext kho ${portalWarehouse} để Quét. Bấm «Tải Ext» rồi Đăng Nhập TCS trước.`
      );
      return;
    }

    setBusy(true);
    const pendingAwbs = pendingReception.map((s) => awbDigitsKey(s.awb));
    setBusyLabel(
      pendingAwbs.length
        ? `Agent ${portalWarehouse} quét ${pendingAwbs.length} AWB…`
        : `Agent ${portalWarehouse} quét ngày ${sessionYmd}…`
    );
    const t0 = performance.now();
    try {
      const online = await pingTcsAgent(3500, agentOpts);
      setHealth(online);
      if (!online?.ok) {
        setError(agentOfflineHint(getTcsAgentBaseUrl()));
        return;
      }
      const wantVisible = playwrightLocal || online.headless === false;
      const res = await scanTcsWorkspace(sessionYmd, pendingAwbs, {
        visible: wantVisible,
        warehouse: portalWarehouse,
      });
      if (!res.ok) {
        setSession(res);
        setError(res.message || "Không quét được workspace TCS");
        return;
      }
      setSession(res);
      setHealth({
        ...online,
        running: false,
        session: res,
        workspace: res.workspace,
      });
      const ready = pickEsidScanReadyItems(res);
      const updatedCount = await applyReadyItemsToOps(ready);
      await refreshHealth();
      const sec = ((performance.now() - t0) / 1000).toFixed(1);
      const listTotal = Number(
        res.list_total ?? res.workspace?.cache_count ?? res.total ?? 0
      );
      const receptionTotal = Number(
        res.reception_total ?? res.ready_count ?? ready.length
      );
      if (res.scan_ok === false && res.scan_error) {
        setError(`Quét ngày chưa xong: ${res.scan_error}`);
        setMessage(
          `Quét agent · ${sec}s · lỗi lọc ngày` +
            (updatedCount ? ` · cập nhật Ops ${updatedCount} lô` : "")
        );
      } else {
        setMessage(
          `Quét agent · ${sec}s · ${listTotal} dòng · ${receptionTotal} HT trên TCS · khớp ${ready.length}` +
            (updatedCount ? ` · cập nhật Ops ${updatedCount} lô` : "") +
            (pendingAwbs.length === 0 && ready.length === 0
              ? " · Ops không còn AWB chưa HT cần khớp"
              : "")
        );
      }
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [
    agentOpts,
    applyReadyItemsToOps,
    beginAgentWatch,
    executorPolicy,
    extension?.ok,
    isMobile,
    pendingReception,
    playwrightLocal,
    portalWarehouse,
    preferRemotePortal,
    refreshHealth,
    sessionYmd,
    visualControl,
  ]);


  /**
   * Menu dòng — Tải PDF ESID qua Chrome Ext (mặc định desktop).
   * Mobile: agent-only.
   */
  const downloadEsidFor = useCallback(
    async (shipment: Shipment) => {
      setError("");
      setMessage("");
      if (!isTcsWarehouse(shipment.warehouse)) {
        setError("Chỉ kho TECS-TCS / TCS mới tải PDF ESID.");
        return;
      }
      const rowPortal = asTcsPortalWarehouse(shipment.warehouse);
      if (!rowPortal) {
        setError("Kho lô không hỗ trợ portal TCS.");
        return;
      }
      const digits = awbDigitsKey(shipment.awb);
      if (digits.length !== 11) {
        setError("AWB phải đủ 11 số để tải PDF ESID.");
        return;
      }

      const extForOrder = await pingTcsExtension({ warehouse: rowPortal });
      setExtension(extForOrder);
      const pdfOrder = playwrightLocal
        ? (["agent"] as const)
        : resolvePortalExecutorOrder("pdf", {
            policy: executorPolicy,
            preferRemote: preferRemotePortal,
            isMobile,
            visualControl,
            extensionOnline: Boolean(extForOrder.ok),
          });

      const tryPdfExt = async (t0: number) => {
        const ext = await pingTcsExtension({ warehouse: rowPortal });
        setExtension(ext);
        if (!ext.ok) return false;
        setBusyLabel(
          `${tcsExtLabel(rowPortal)} đang lấy phiếu …${digits.slice(-8)}…`
        );
        const res = await downloadEsidPdfViaExtension(
          { awb: digits },
          { warehouse: rowPortal }
        );
        setExtension(res);
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        const busyPdf = portalBusyUserMessage(res);
        if (busyPdf) {
          setError(busyPdf);
          return true;
        }
        if (!res.ok) {
          setError(res.message || res.error || "Tải PDF Ext thất bại");
          return true;
        }
        const pdfName =
          String(res.pdf_name || "").replace(/^.*[/\\]/, "") ||
          `${digits.slice(0, 3)}-${digits.slice(3)}_ESID.pdf`;
        const saved = res.pdf_base64
          ? downloadPdfFromBase64(pdfName, res.pdf_base64)
          : Boolean(res.downloaded);
        setDownloadedCount(1);
        setResults([
          {
            stt: 1,
            awb: digits,
            action: "DOWNLOAD",
            normalized_status: "DOWNLOADED",
            pdf_name: pdfName,
            downloaded_file: pdfName,
            print_status: "EXT",
            tcs_status_raw: `Ext ${rowPortal}`,
            shipment_id: String(shipment.id || ""),
          },
        ]);
        if (!saved && !res.downloaded) {
          setError(
            `Tải PDF Ext …${digits.slice(-8)} · ${sec}s — không tải về máy.`
          );
          return true;
        }
        setMessage(
          `Tải PDF Ext …${digits.slice(-8)} · ${sec}s — ${pdfName}`
        );
        return true;
      };

      const tryPdfAgent = async (t0: number) => {
        const payload = buildTcsPortalJob([shipment], {
          sessionYmd:
            String(shipment.sessionDate || sessionYmd).trim() || sessionYmd,
          action: "DOWNLOAD",
          dryRun: false,
          mock: false,
          onlyCompleted: false,
          warehouse: rowPortal,
          awbDigitsFilter: new Set([digits]),
        });
        payload.session_date = "";
        payload.sessionDate = "";
        if (!payload.rows.length) {
          setError("Không tạo được job ESID cho AWB này.");
          return true;
        }
        setBusyLabel(`Tải PDF agent …${digits.slice(-8)}…`);
        if (!(await ensureSessionReady())) return false;
        let res = await submitTcsPortalJob(payload);
        for (let i = 0; i < 40 && res.error === "BUSY"; i++) {
          setBusyLabel(`Tải PDF …${digits.slice(-8)} — chờ agent…`);
          await new Promise((r) => window.setTimeout(r, 250));
          res = await submitTcsPortalJob(payload);
        }
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        if (
          !res.ok ||
          (res.results || [])[0]?.normalized_status !== "DOWNLOADED"
        ) {
          setError(
            res.message ||
              res.error ||
              (res.results || [])[0]?.error_message ||
              "Agent tải PDF thất bại"
          );
          return true;
        }
        const row0 = (res.results || [])[0];
        const pdfName = row0?.pdf_name || row0?.downloaded_file || "";
        const saved = pdfName
          ? await downloadPdfFromAgent(pdfName, { warehouse: rowPortal })
          : false;
        setResults(res.results || []);
        setDownloadedCount(pdfName ? 1 : 0);
        const shortName = pdfName
          ? String(pdfName).replace(/^.*[/\\]/, "")
          : "";
        if (!saved) {
          setError(
            `Tải PDF …${digits.slice(-8)} · ${sec}s — không tải được về máy.`
          );
          if (shortName) setMessage(`File sẵn sàng: ${shortName}`);
          return true;
        }
        setMessage(
          `Tải PDF …${digits.slice(-8)} · ${sec}s — đã tải ${shortName} về máy`
        );
        return true;
      };

      setBusy(true);
      const t0 = performance.now();
      try {
        for (const ex of pdfOrder) {
          if (ex === "extension" && (await tryPdfExt(t0))) return;
          if (ex === "agent" && (await tryPdfAgent(t0))) return;
        }
        setError(
          `Cần Chrome Ext kho ${rowPortal} để tải PDF. Bấm «Tải Ext» rồi Đăng Nhập TCS trước.`
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi tải PDF ESID");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [ensureSessionReady, executorPolicy, isMobile, playwrightLocal, preferRemotePortal, sessionYmd, visualControl]
  );

  /** Điền ESID = tạo phiếu khai báo trên TCS — độc lập với Quét HT Ops. */
  const fillEsidDeclareFor = useCallback(
    async (shipment: Shipment) => {
      setError("");
      setMessage("");
      if (isMobile) {
        setError("Điền ESID chỉ trên PC — phone dùng Quét + Tải PDF.");
        return;
      }
      const gate = canFillEsidForPortal(shipment, portalWarehouse);
      if (!gate.ok) {
        setError(gate.reason);
        return;
      }
      const rowPortal = asTcsPortalWarehouse(shipment.warehouse)!;
      const digits = awbDigitsKey(shipment.awb);
      const registrant = getActiveEsidRegistrant();
      if (!registrantIsComplete(registrant)) {
        setError(
          "Chưa đủ hồ sơ người khai (Họ tên / SĐT / CCCD). Bấm «Người khai» trên thanh TCS để lưu."
        );
        return;
      }
      const agent = getActiveEsidAgent();
      if (!agentIsComplete(agent)) {
        setError("Chưa có Agent cố định. Bấm «Agent» trên thanh TCS để nhập tên Agent.");
        return;
      }

      const resolved = resolveShipmentForEsidDeclare(shipment, customerDirectory);
      const payload = buildEsidDeclareFillPayload(resolved.shipment, registrant, agent);
      if (!payload) {
        setError("Không tạo được payload khai báo ESID.");
        return;
      }

      const custNote = resolved.customerLabel
        ? ` · khách ${resolved.customerLabel}`
        : "";
      const partyBits = [
        resolved.shipperFromProfile ? "Shipper✓" : null,
        resolved.consigneeFromProfile ? "CNEE✓" : null,
        agent.name ? "Agent✓" : null,
        resolved.goodsFromProfile ? "Hàng✓" : null,
      ].filter(Boolean);
      const partyNote = partyBits.length ? ` · ${partyBits.join(" ")}` : "";

      setBusy(true);
      const t0 = performance.now();
      try {
        setBusyLabel(`Điền ESID …${digits.slice(-8)}${custNote}…`);
        const ext = await pingTcsExtension({ warehouse: rowPortal });
        setExtension(ext);
        const fillOrder = playwrightLocal
          ? (["agent"] as const)
          : resolvePortalExecutorOrder("fill", {
              policy: executorPolicy,
              preferRemote: preferRemotePortal,
              isMobile,
              visualControl,
              extensionOnline: Boolean(ext.ok),
            });
        if (
          !playwrightLocal &&
          shouldLockToExtensionVisual({
            isMobile,
            visualControl,
            extensionOnline: Boolean(ext.ok),
            policy: executorPolicy,
          }) &&
          (!ext.ok || !ext.workspace?.logged_in)
        ) {
          setError(
            !ext.ok
              ? `Chế độ trực quan: cần ${tcsExtLabel(rowPortal)} online để xem thao tác trên Chrome.`
              : `Chế độ trực quan: Đăng Nhập TCS ${tcsExtLabel(rowPortal)} trước khi Điền (không chạy agent ẩn).`
          );
          return;
        }
        if (playwrightLocal && !ext.ok) {
          setError(
            `PW local: cần ${tcsExtLabel(rowPortal)} online để nối Playwright headed. Reload Ext + npm run portal:headed:local.`
          );
          return;
        }
        let executor: "extension" | "playwright" = "playwright";
        let res: Awaited<ReturnType<typeof declareFillTcsEsid>> | TcsExtResult =
          {
            ok: false,
            error: "NO_EXECUTOR",
            message: "Chưa thử executor",
            version: "",
          } as TcsExtResult;

        let lastAgentFail: {
          ok: false;
          error?: string;
          message?: string;
        } | null = null;
        for (const ex of fillOrder) {
          if (ex === "agent") {
            executor = "playwright";
            setBusyLabel(`Agent cloud ${rowPortal} điền …${digits.slice(-8)}…`);
            if (!(await ensureSessionReady(rowPortal))) {
              // Giữ lỗi từ ensureSessionReady; thử Ext nếu còn trong order.
              continue;
            }
            res = await declareFillTcsEsid(payload, { warehouse: rowPortal });
            for (let i = 0; i < 40 && res.error === "BUSY"; i++) {
              setBusyLabel(`Điền ESID …${digits.slice(-8)} — chờ workspace…`);
              await new Promise((r) => window.setTimeout(r, 250));
              res = await declareFillTcsEsid(payload, { warehouse: rowPortal });
            }
            if (res.ok) break;
            lastAgentFail = {
              ok: false,
              error: res.error,
              message: res.message,
            };
            continue;
          }
          if (ex === "extension") {
            if (!ext.ok || !ext.workspace?.logged_in) {
              // Không che lỗi agent bằng SKIP_EXT khi browser không có Ext.
              if (!lastAgentFail) {
                res = {
                  ok: false,
                  error: "SKIP_EXT",
                  message: !ext.ok
                    ? `Cần ${tcsExtLabel(rowPortal)} online`
                    : `Cần Đăng Nhập TCS ${tcsExtLabel(rowPortal)} trước khi Điền`,
                  version: "",
                } as TcsExtResult;
              } else {
                res = {
                  ok: false,
                  error: lastAgentFail.error || "AGENT_FILL_FAILED",
                  message:
                    lastAgentFail.message ||
                    lastAgentFail.error ||
                    "Điền ESID thất bại trên agent cloud",
                  version: "",
                } as TcsExtResult;
              }
              continue;
            }
            executor = "extension";
            setBusyLabel(
              `${tcsExtLabel(rowPortal)} đang điền …${digits.slice(-8)}…`
            );
            res = await fillEsidViaExtension(payload, { warehouse: rowPortal });
            setExtension(res);
            const busyFill = portalBusyUserMessage(res);
            if (busyFill) {
              setError(busyFill);
              return;
            }
            if (res.ok) break;
          }
        }
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        if (!res.ok) {
          setError(
            (lastAgentFail && (!ext.ok || !ext.workspace?.logged_in)
              ? lastAgentFail.message || lastAgentFail.error
              : null) ||
              res.message ||
              res.error ||
              "Điền ESID thất bại — kiểm tra agent cloud hoặc Ext."
          );
          return;
        }
        const warn = [...resolved.warnings, ...(res.warnings || [])].filter(Boolean);
        const warnNote = warn.length ? ` · ${warn[0]}` : "";
        const headed =
          executor === "playwright" &&
          (("headless" in res && res.headless === false) ||
            (!("headless" in res) && health?.headless === false));
        const v =
          "values" in res && res.values && typeof res.values === "object"
            ? res.values
            : {};
        const bits = [
          "flightNo" in v && v.flightNo ? `CB ${String(v.flightNo)}` : null,
          "codFds" in v && v.codFds ? `→ ${String(v.codFds)}` : null,
          "qtyPcs" in v && v.qtyPcs != null && String(v.qtyPcs) !== ""
            ? `${String(v.qtyPcs)} pcs`
            : null,
        ].filter(Boolean);
        setLastDeclarePreview({
          awb: digits,
          shipmentId: String(
            shipment.id || ("shipment_id" in res ? res.shipment_id : "") || ""
          ),
          warnings: warn,
          valuesSummary: bits.join(" · "),
          executor,
          warehouse: rowPortal,
        });
        setMessage(
          executor === "extension"
            ? `Extension đã điền trực quan …${digits.slice(-8)}${custNote}${partyNote} · ${sec}s — kiểm tra tab TCS rồi tự HOÀN TẤT.${warnNote}`
            : headed
            ? `Đã điền …${digits.slice(-8)}${custNote}${partyNote} · ${sec}s — xem page Khai báo → HOÀN TẤT.${warnNote}`
            : `Đã điền …${digits.slice(-8)}${custNote}${partyNote} · ${sec}s — bấm HOÀN TẤT trên Ops.${warnNote}`
        );
        void refreshHealth();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi điền ESID");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [
      customerDirectory,
      ensureSessionReady,
      executorPolicy,
      health?.headless,
      isMobile,
      playwrightLocal,
      portalWarehouse,
      preferRemotePortal,
      refreshHealth,
      visualControl,
    ]
  );

  const clearDeclarePreview = useCallback(() => {
    setLastDeclarePreview(null);
  }, []);

  /** HOÀN TẤT trên page KHAI BÁO của workspace. */
  const submitEsidDeclare = useCallback(
    async (preview?: EsidDeclarePreviewState | null) => {
      const target = preview ?? lastDeclarePreview;
      if (!target?.awb || target.awb.length !== 11) {
        setError("Không có form đã điền để HOÀN TẤT — hãy Điền lại trước.");
        return;
      }
      setError("");
      setMessage("");
      setBusy(true);
      setBusyLabel(`HOÀN TẤT ESID …${target.awb.slice(-8)}…`);
      const t0 = performance.now();
      try {
        const submitWh =
          asTcsPortalWarehouse(target.warehouse) || portalWarehouse;
        if (target.executor === "extension") {
          const opened = await openTcsExtensionTab({ warehouse: submitWh });
          setExtension(opened);
          if (!opened.ok) {
            setError(
              opened.message ||
                `Không mở được tab TCS của ${tcsExtLabel(submitWh)}`
            );
            return;
          }
          setMessage(
            `Đã mở tab TCS (${submitWh}) cho AWB …${target.awb.slice(-8)} — kiểm tra và bấm HOÀN TẤT trực tiếp trên TCS.`
          );
          return;
        }
        if (!(await ensureSessionReady(submitWh))) return;
        let res = await declareSubmitTcsEsid({
          awb: target.awb,
          shipment_id: target.shipmentId || undefined,
          confirm_submit: true,
          warehouse: submitWh,
        });
        for (let i = 0; i < 40 && res.error === "BUSY"; i++) {
          setBusyLabel(`HOÀN TẤT ESID …${target.awb.slice(-8)} — chờ…`);
          await new Promise((r) => window.setTimeout(r, 250));
          res = await declareSubmitTcsEsid({
            awb: target.awb,
            shipment_id: target.shipmentId || undefined,
            confirm_submit: true,
            warehouse: submitWh,
          });
        }
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        const warnNote = (res.warnings || [])[0] ? ` · ${res.warnings![0]}` : "";
        if (!res.ok || !res.submitted) {
          setError(res.message || res.error || "HOÀN TẤT ESID thất bại");
          return;
        }
        setMessage(`Đã HOÀN TẤT ESID …${target.awb.slice(-8)} · ${sec}s${warnNote}`);
        setLastDeclarePreview(null);
        void refreshHealth();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi HOÀN TẤT ESID");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [ensureSessionReady, extOpts, lastDeclarePreview, portalWarehouse, refreshHealth]
  );

  const agentInPolicy =
    executorPolicy === "auto" || executorPolicy === "agent-only";
  const sessionLabel = busy
    ? "Đang xử lý"
    : extension?.ok && extension.workspace?.logged_in
      ? `${tcsExtLabel(portalWarehouse)} đã login`
      : session?.logged_in || health?.session?.logged_in
        ? "Agent cloud đã login"
        : health?.ok && agentInPolicy
          ? "Agent cloud — cần Đăng Nhập TCS"
          : extension?.ok
            ? `${tcsExtLabel(portalWarehouse)} — cần Đăng Nhập TCS`
            : agentInPolicy
              ? "Agent cloud offline"
              : "Cần Chrome Ext";

  const extensionWorkspaceActive =
    extension?.workspace?.logged_in === true ||
    Boolean(extension?.workspace?.phase && extension.workspace.phase !== "IDLE");

  return {
    busy,
    busyLabel,
    message,
    error,
    health,
    extension,
    /** @deprecated Luôn null — không còn portal-worker. */
    portalWorker: null as null,
    session,
    sessionLabel,
    results,
    downloadedCount,
    /** Đăng Nhập TCS agent cloud (Railway) — đường chính khi online. */
    login,
    loginWithExtension,
    scanReceptionWithExtension,
    scanReceptionWithAgent,
    pendingReceptionCount: pendingReception.length,
    refreshExtension,
    refreshPortalWorker,
    downloadEsidFor,
    fillEsidDeclareFor,
    submitEsidDeclare,
    lastDeclarePreview,
    clearDeclarePreview,
    /** Kho portal đang gắn Ext/channel. */
    portalWarehouse,
    extLabel: tcsExtLabel(portalWarehouse),
    /** Policy hiện tại (auto/ext-only mặc định; agent-only = QA/legacy). */
    executorPolicy,
    /** true = desktop + Ext → không fallback headless ẩn (mặc định bật). */
    visualControl,
    setVisualControl,
    /** true = Playwright headed local qua cầu Ext (máy kiểm soát). */
    playwrightLocal,
    setPlaywrightLocal,
    preferRemotePortal: false,
    /** false = Chrome thật (legacy agent-only) */
    agentHeadless: health?.headless ?? session?.headless,
    workspace:
      (extensionWorkspaceActive
        ? (extension?.workspace as TcsExtensionWorkspace | undefined)
        : health?.workspace) ?? null,
    refreshHealth,
  };
}

export type TcsPortalActions = ReturnType<typeof useTcsPortalActions>;
