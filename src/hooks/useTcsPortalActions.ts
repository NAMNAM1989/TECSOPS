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
import { tcsExtLabel } from "../utils/tcsExtLoginPrefs";
import {
  downloadPdfFromAgent,
  fetchTcsSessionStatus,
  agentOfflineHint,
  bootstrapTcsWorkspace,
  openTcsAgentSession,
  getTcsAgentBaseUrl,
  pingTcsAgent,
  pickEsidScanReadyItems,
  prefetchTcsPdfs,
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
  openTcsExtensionTab,
  pingTcsExtension,
  scanTcsExtensionDate,
  type TcsExtensionWorkspace,
  type TcsExtResult,
} from "../utils/tcsChromeExtension";
import {
  downloadPortalJobArtifact,
  fetchPortalWorkerStatus,
  runPortalJob,
  type PortalWorkerStatus,
} from "../utils/portalRemoteJobs";
import {
  getPortalExecutorPolicy,
  resolvePortalExecutorOrder,
} from "../utils/portalExecutorPolicy";

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
  /** Poll agent khi toolbar hiển thị */
  active?: boolean;
  /**
   * Kho portal đang thao tác trên Ops — quyết định Ext/channel + phạm vi bootstrap.
   * Mặc định TECS-TCS (Ext hub).
   */
  portalWarehouse?: Warehouse;
  /**
   * true = ưu tiên hàng đợi Railway+worker (phone / ngoài WiFi).
   * Desktop trong kho vẫn dùng Ext khi có.
   */
  preferRemotePortal?: boolean;
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
  const [health, setHealth] = useState<TcsAgentHealth | null>(null);
  const [extension, setExtension] = useState<TcsExtResult | null>(null);
  const [session, setSession] = useState<TcsAgentSession | null>(null);
  const [portalWorker, setPortalWorker] = useState<PortalWorkerStatus | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  /** Tránh poll /health ghi đè Offline khi đang chờ job dài trên agent */
  const busyRef = useRef(false);
  busyRef.current = busy;
  /** Warmup agent sau Đồng bộ Ext — tải PDF chờ promise này */
  const agentWarmupRef = useRef(Promise.resolve());
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
    if (!h?.ok) {
      // Giữ session cũ nếu chỉ mất 1 lần ping (tránh nhấp nháy Offline)
      setHealth((prev) => (prev?.ok ? prev : h));
      return;
    }
    setHealth(h);
    if (h.session) setSession(h.session);
    else setSession(await fetchTcsSessionStatus(agentOpts));
  }, [agentOpts]);

  useEffect(() => {
    if (!active) return;
    void refreshHealth();
    const t = window.setInterval(() => void refreshHealth(), 15000);
    return () => window.clearInterval(t);
  }, [active, refreshHealth]);

  const refreshExtension = useCallback(async () => {
    const result = await pingTcsExtension({ warehouse: portalWarehouse });
    setExtension(result);
    return result;
  }, [portalWarehouse]);

  useEffect(() => {
    if (!active) return;
    void refreshExtension();
    const timer = window.setInterval(() => void refreshExtension(), 10_000);
    return () => window.clearInterval(timer);
  }, [active, refreshExtension]);

  const refreshPortalWorker = useCallback(async () => {
    if (portalWarehouse !== "TCS" && portalWarehouse !== "TECS-TCS") return null;
    const status = await fetchPortalWorkerStatus(portalWarehouse);
    setPortalWorker(status);
    return status;
  }, [portalWarehouse]);

  useEffect(() => {
    if (!active) return;
    if (portalWarehouse !== "TCS" && portalWarehouse !== "TECS-TCS") return;
    void refreshPortalWorker();
    const timer = window.setInterval(() => void refreshPortalWorker(), 8_000);
    return () => window.clearInterval(timer);
  }, [active, portalWarehouse, refreshPortalWorker]);

  const ensureSessionReady = useCallback(async (): Promise<boolean> => {
    // Fast-path: đã login từ poll gần đây — bỏ 2 RTT ping/status trước mỗi PDF
    if (health?.ok && session?.open && session?.logged_in) {
      return true;
    }
    const online = await pingTcsAgent(3500, agentOpts);
    setHealth(online);
    if (!online?.ok) {
      setError(agentOfflineHint(getTcsAgentBaseUrl()));
      return false;
    }
    let s = online.session || (await fetchTcsSessionStatus(agentOpts));
    setSession(s);
    // Ext Đồng bộ chỉ login tab Chrome user — agent Playwright có thể chưa mở.
    // Tự mở session khi tải PDF / điền (không bắt user bấm Login riêng).
    if (!s?.open || !s?.logged_in) {
      const wantVisible = online.headless === false;
      setBusyLabel(
        wantVisible
          ? `Đang mở Chrome agent ${portalWarehouse} (PDF/Điền)…`
          : `Đang khởi tạo phiên agent ${portalWarehouse}…`
      );
      const opened = await openTcsAgentSession({
        visible: wantVisible,
        warehouse: portalWarehouse,
      });
      if (opened.ok === false && opened.error === "AGENT_OFFLINE") {
        setError(opened.message || agentOfflineHint(getTcsAgentBaseUrl()));
        return false;
      }
      s = opened;
      setSession(opened);
      setHealth((prev) =>
        prev
          ? { ...prev, ok: true, session: opened }
          : { ok: true, session: opened }
      );
    }
    if (!s?.open) {
      setError(
        (s?.message && String(s.message).trim()) ||
          `Không mở được Chrome agent ${portalWarehouse} — chạy portal:start:both trên máy kho.`
      );
      return false;
    }
    if (!s?.logged_in) {
      setError(
        "Agent Chrome đang ở trang login — nhập CAPTCHA trên cửa sổ agent rồi thử lại. " +
          "(Ext và agent là hai phiên Chrome khác nhau.)"
      );
      await refreshHealth();
      return false;
    }
    return true;
  }, [
    agentOpts,
    health?.ok,
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
      setError("");
      setMessage("");
      setBusy(true);
      setBusyLabel(`${tcsExtLabel(portalWarehouse)} đang đăng nhập…`);
      const started = performance.now();
      try {
        const configuredAgentBase = getTcsAgentBaseUrl();
        const extensionAgentBase =
          typeof window !== "undefined"
            ? new URL(configuredAgentBase, window.location.origin).toString()
            : configuredAgentBase;
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
          setError(
            result.message ||
              result.error ||
              `${tcsExtLabel(portalWarehouse)} đăng nhập thất bại`
          );
          return result;
        }
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        setMessage(
          `${tcsExtLabel(portalWarehouse)} đã đăng nhập · ${seconds}s · kho ${portalWarehouse}` +
            ` · dùng Chrome profile riêng cho kho này`
        );
        // Nền: warmup agent đúng kho (PDF / fallback) — cả TECS-TCS và TCS
        const warmup = (async () => {
          const online = await pingTcsAgent(2500, { warehouse: portalWarehouse });
          if (!online?.ok) return;
          setHealth(online);
          const wantVisible = online.headless === false;
          const sess = online.session;
          if (!sess?.open || !sess?.logged_in) {
            const opened = await openTcsAgentSession({
              visible: wantVisible,
              warehouse: portalWarehouse,
            });
            if (opened.open) {
              setSession(opened);
              setHealth((prev) =>
                prev ? { ...prev, session: opened } : { ok: true, session: opened }
              );
            }
          }
        })().catch(() => {
          /* warmup nền */
        });
        agentWarmupRef.current = warmup;
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
    [extOpts, portalWarehouse, sessionYmd]
  );

  /** Quét tiếp nhận trên Ext đã login — chỉ AWB chưa RECEPTION_COMPLETED. */
  const scanReceptionWithExtension = useCallback(async () => {
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
      const result = await scanTcsExtensionDate(
        { session_date: sessionYmd, awbs: pendingAwbs },
        extOpts
      );
      setExtension(result);
      if (!result.ok) {
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
      const readyAwbs = ready
        .map((item) => String(item.awb || "").replace(/\D/g, "").slice(0, 11))
        .filter((d) => d.length === 11);
      if (readyAwbs.length) {
        const warmup = (async () => {
          const online = await pingTcsAgent(2500, {
            warehouse: portalWarehouse,
          });
          if (!online?.ok) return;
          const pref = await prefetchTcsPdfs(readyAwbs, {
            limit: Math.min(12, readyAwbs.length),
            warehouse: portalWarehouse,
          });
          if (pref.ok && (pref.prefetched || 0) > 0) {
            setMessage((prev) =>
              `${prev || ""} · prefetch ${pref.prefetched} PDF`.trim()
            );
          }
        })().catch(() => undefined);
        agentWarmupRef.current = warmup;
      }
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
    extOpts,
    pendingReception,
    portalWarehouse,
    sessionYmd,
  ]);

  /**
   * ĐN khi không có Ext (bar đã thử Ext trước).
   * Policy auto: preferRemote → worker; else agent local đúng kho (TECS-TCS / TCS).
   */
  const login = useCallback(async () => {
    setError("");
    setMessage("");
    const order = resolvePortalExecutorOrder("login", {
      policy: executorPolicy,
      preferRemote: preferRemotePortal,
    });
    const tryRemote = order.includes("remote");
    const tryAgent = order.includes("agent");

    if (tryRemote && (preferRemotePortal || !tryAgent)) {
      setBusy(true);
      setBusyLabel(`ĐN máy kho ${portalWarehouse} (từ xa)…`);
      try {
        const ws = await refreshPortalWorker();
        if (!ws?.worker_configured) {
          setError(
            "Server chưa PORTAL_WORKER_SECRET — thêm env Railway rồi chạy portal:worker trên PC."
          );
          return;
        }
        if (!ws.online) {
          setError(
            `Máy kho ${portalWarehouse} offline — bật PC, agent + npm run portal:worker (PORTAL_WAREHOUSE=${portalWarehouse}).`
          );
          return;
        }
        const job = await runPortalJob({
          warehouse: portalWarehouse,
          type: "login",
          payload: { visible: true },
          timeoutMs: 120_000,
          onTick: (j) => {
            if (j.status === "queued") setBusyLabel("Chờ máy kho nhận lệnh ĐN…");
            if (j.status === "claimed") {
              setBusyLabel(`Máy kho đang ĐN ${portalWarehouse}…`);
            }
          },
        });
        await refreshPortalWorker();
        if (job.status === "error") {
          setError(job.error || "ĐN máy kho thất bại");
          return;
        }
        setMessage(
          String(
            job.result?.message ||
              `Đã ĐN ${portalWarehouse} trên máy kho — phone có thể Quét / Tải PDF`
          )
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "ĐN từ xa thất bại");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
      return;
    }

    if (!tryAgent) {
      setError(
        `Không có đường ĐN (policy=${executorPolicy}). Cài Ext kho ${portalWarehouse} hoặc bật agent/worker.`
      );
      return;
    }

    setBusy(true);
    setBusyLabel(`Đăng nhập agent ${portalWarehouse}…`);
    try {
      const online = await pingTcsAgent(3500, agentOpts);
      setHealth(online);
      if (!online?.ok) {
        // Fallback remote nếu agent local offline
        if (tryRemote) {
          const ws = await refreshPortalWorker();
          if (ws?.online) {
            setBusyLabel(`ĐN máy kho ${portalWarehouse} (từ xa)…`);
            const job = await runPortalJob({
              warehouse: portalWarehouse,
              type: "login",
              payload: { visible: true },
              timeoutMs: 120_000,
            });
            await refreshPortalWorker();
            if (job.status === "error") {
              setError(job.error || "ĐN máy kho thất bại");
              return;
            }
            setMessage(
              String(
                job.result?.message ||
                  `Đã ĐN ${portalWarehouse} trên máy kho`
              )
            );
            return;
          }
        }
        setError(agentOfflineHint(getTcsAgentBaseUrl()));
        return;
      }
      const wantVisible = online.headless === false;
      const opened = await openTcsAgentSession({
        visible: wantVisible,
        warehouse: portalWarehouse,
      });
      setSession(opened);
      if (!opened?.open || !opened?.logged_in) {
        setError(
          opened?.message ||
            "Agent chưa login — nhập CAPTCHA trên cửa sổ agent rồi thử lại."
        );
        return;
      }
      setMessage(
        `Agent Playwright đã đăng nhập (${portalWarehouse}) — bấm Quét tiếp nhận khi cần.`
      );
      await refreshHealth();
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [
    agentOpts,
    executorPolicy,
    portalWarehouse,
    preferRemotePortal,
    refreshHealth,
    refreshPortalWorker,
  ]);

  /** Quét khi không Ext — auto: agent local; phone: remote. */
  const scanReceptionWithAgent = useCallback(async () => {
    setError("");
    setMessage("");
    const order = resolvePortalExecutorOrder("scan", {
      policy: executorPolicy,
      preferRemote: preferRemotePortal,
    });
    const useRemoteFirst =
      order[0] === "remote" ||
      (preferRemotePortal && order.includes("remote"));

    if (useRemoteFirst) {
      setBusy(true);
      const pendingAwbs = pendingReception.map((s) => awbDigitsKey(s.awb));
      setBusyLabel(
        pendingAwbs.length
          ? `Máy kho quét ${pendingAwbs.length} AWB…`
          : `Máy kho quét ngày ${sessionYmd}…`
      );
      const t0 = performance.now();
      try {
        const job = await runPortalJob({
          warehouse: portalWarehouse,
          type: "scan",
          payload: { session_date: sessionYmd, awbs: pendingAwbs },
          timeoutMs: 180_000,
          onTick: (j) => {
            if (j.status === "queued") setBusyLabel("Chờ máy kho nhận lệnh Quét…");
            if (j.status === "claimed") setBusyLabel("Máy kho đang quét ESID…");
          },
        });
        if (job.status === "error") {
          setError(job.error || "Quét từ xa thất bại");
          return;
        }
        const ready = pickEsidScanReadyItems({
          ready: (job.result?.ready as TcsEsidScanItem[]) || [],
          items: (job.result?.items as TcsEsidScanItem[]) || [],
        });
        const updatedCount = await applyReadyItemsToOps(ready);
        await refreshPortalWorker();
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        setMessage(
          `Quét máy kho · ${sec}s · ${ready.length} HT` +
            (updatedCount ? ` · cập nhật Ops ${updatedCount} lô` : "")
        );
        const readyAwbs = ready
          .map((item) => String(item.awb || "").replace(/\D/g, "").slice(0, 11))
          .filter((d) => d.length === 11);
        if (readyAwbs.length && !preferRemotePortal) {
          agentWarmupRef.current = prefetchTcsPdfs(readyAwbs, {
            limit: Math.min(12, readyAwbs.length),
            warehouse: portalWarehouse,
          }).then(() => undefined);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Quét từ xa thất bại");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
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
        if (order.includes("remote")) {
          setBusy(false);
          setBusyLabel("");
          // fallback remote
          setBusy(true);
          setBusyLabel(`Máy kho quét ${portalWarehouse}…`);
          const job = await runPortalJob({
            warehouse: portalWarehouse,
            type: "scan",
            payload: { session_date: sessionYmd, awbs: pendingAwbs },
            timeoutMs: 180_000,
          });
          if (job.status === "error") {
            setError(job.error || "Quét từ xa thất bại");
            return;
          }
          const ready = pickEsidScanReadyItems({
            ready: (job.result?.ready as TcsEsidScanItem[]) || [],
            items: (job.result?.items as TcsEsidScanItem[]) || [],
          });
          const updatedCount = await applyReadyItemsToOps(ready);
          const sec = ((performance.now() - t0) / 1000).toFixed(1);
          setMessage(
            `Quét máy kho · ${sec}s · ${ready.length} HT` +
              (updatedCount ? ` · cập nhật Ops ${updatedCount} lô` : "")
          );
          return;
        }
        setError(agentOfflineHint(getTcsAgentBaseUrl()));
        return;
      }
      const wantVisible = online.headless === false;
      const res = await bootstrapTcsWorkspace(sessionYmd, pendingAwbs, {
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
      setMessage(
        `Quét agent · ${sec}s · ${ready.length} HT tiếp nhận` +
          (updatedCount ? ` · cập nhật Ops ${updatedCount} lô` : "")
      );
      if (res.scan_ok === false && res.scan_error) {
        setError(`Quét ngày chưa xong: ${res.scan_error}`);
      }
      const readyAwbs = ready
        .map((item) => String(item.awb || "").replace(/\D/g, "").slice(0, 11))
        .filter((d) => d.length === 11);
      if (readyAwbs.length) {
        agentWarmupRef.current = prefetchTcsPdfs(readyAwbs, {
          limit: Math.min(12, readyAwbs.length),
          warehouse: portalWarehouse,
        }).then(() => undefined);
      }
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [
    agentOpts,
    applyReadyItemsToOps,
    executorPolicy,
    pendingReception,
    portalWarehouse,
    preferRemotePortal,
    refreshHealth,
    refreshPortalWorker,
    sessionYmd,
  ]);


  /**
   * Menu dòng — 1 AWB: mở phiếu (AWB# 8 số) rồi tự Tải PDF ESID.
   * Không phụ thuộc Quét ESID. (Đã bỏ In ESID — dùng PDF rồi in từ file.)
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

      // Policy auto: PDF ưu tiên agent → Ext → remote (phone: remote trước)
      const pdfOrder = resolvePortalExecutorOrder("pdf", {
        policy: executorPolicy,
        preferRemote: preferRemotePortal,
      });

      const tryPdfRemote = async (t0: number) => {
        setBusyLabel(`Máy kho ${rowPortal} tải PDF …${digits.slice(-8)}…`);
        const ws = await refreshPortalWorker();
        if (!ws?.online) {
          setError(
            `Máy kho ${rowPortal} offline — chạy portal:worker + agent đúng tài khoản kho trên PC 24/7.`
          );
          return false;
        }
        const job = await runPortalJob({
          warehouse: rowPortal,
          type: "pdf",
          payload: {
            awb: digits,
            shipment_id: String(shipment.id || ""),
          },
          timeoutMs: 180_000,
          onTick: (j) => {
            if (j.status === "queued") setBusyLabel("Chờ máy kho nhận lệnh PDF…");
            if (j.status === "claimed") {
              setBusyLabel(`Máy kho đang lấy PDF …${digits.slice(-8)}…`);
            }
          },
        });
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        if (job.status === "error") {
          setError(job.error || "Tải PDF máy kho thất bại");
          return false;
        }
        const pdfName =
          String(job.result?.pdf_name || job.artifact_name || "").replace(
            /^.*[/\\]/,
            ""
          ) || `${digits.slice(0, 3)}-${digits.slice(3)}_ESID.pdf`;
        const saved = await downloadPortalJobArtifact(job.id, pdfName);
        setDownloadedCount(1);
        setResults([
          {
            stt: 1,
            awb: digits,
            action: "DOWNLOAD",
            normalized_status: "DOWNLOADED",
            pdf_name: pdfName,
            downloaded_file: pdfName,
            print_status: "REMOTE_WORKER",
            tcs_status_raw: `Máy kho ${rowPortal}`,
            shipment_id: String(shipment.id || ""),
          },
        ]);
        if (!saved) {
          setError(
            `PDF sẵn trên server …${digits.slice(-8)} · ${sec}s — không kích hoạt tải.`
          );
          setMessage(`File: ${pdfName}`);
          return false;
        }
        setMessage(
          `Tải PDF ${rowPortal} …${digits.slice(-8)} · ${sec}s — ${pdfName}`
        );
        await refreshPortalWorker();
        return true;
      };

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
        if (!res.ok) return false;
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
          return false;
        }
        setMessage(`Tải PDF Ext …${digits.slice(-8)} · ${sec}s — ${pdfName}`);
        return true;
      };

      if (pdfOrder[0] === "remote") {
        setBusy(true);
        const t0 = performance.now();
        try {
          await tryPdfRemote(t0);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Lỗi tải PDF từ xa");
        } finally {
          setBusy(false);
          setBusyLabel("");
        }
        return;
      }

      const payload = buildTcsPortalJob([shipment], {
        sessionYmd: String(shipment.sessionDate || sessionYmd).trim() || sessionYmd,
        action: "DOWNLOAD",
        dryRun: false,
        mock: false,
        onlyCompleted: false,
        warehouse: rowPortal,
        awbDigitsFilter: new Set([digits]),
      });
      // Agent tìm phiếu chỉ bằng AWB# — bỏ session_date để không lọc ngày
      payload.session_date = "";
      payload.sessionDate = "";
      if (!payload.rows.length) {
        setError("Không tạo được job ESID cho AWB này.");
        return;
      }
      setBusy(true);
      setBusyLabel(`Tải PDF …${digits.slice(-8)}…`);
      const t0 = performance.now();
      try {
        // Chờ warmup sau Đồng bộ Ext (open/prefetch) — tránh race BUSY
        setBusyLabel(`Chờ agent sẵn sàng …${digits.slice(-8)}…`);
        await agentWarmupRef.current.catch(() => undefined);
        setBusyLabel(`Tải PDF …${digits.slice(-8)}…`);
        // PDF cache trên agent — chỉ cần agent online đúng kho
        if (!health?.ok) {
          const online = await pingTcsAgent(3500, { warehouse: rowPortal });
          setHealth(online);
          if (!online?.ok) {
            if (pdfOrder.includes("extension") && (await tryPdfExt(t0))) return;
            if (pdfOrder.includes("remote") && (await tryPdfRemote(t0))) return;
            setError(agentOfflineHint(getTcsAgentBaseUrl()));
            return;
          }
        }
        let res = await submitTcsPortalJob(payload);
        for (let i = 0; i < 40 && res.error === "BUSY"; i++) {
          setBusyLabel(`Tải PDF …${digits.slice(-8)} — chờ agent…`);
          await new Promise((r) => window.setTimeout(r, 250));
          res = await submitTcsPortalJob(payload);
        }
        if (
          !res.ok &&
          (res.error === "NEEDS_LOGIN" || res.error === "NO_BROWSER")
        ) {
          setBusyLabel(`Mở phiên agent rồi tải PDF …${digits.slice(-8)}…`);
          if (!(await ensureSessionReady())) {
            if (pdfOrder.includes("extension") && (await tryPdfExt(t0))) return;
            if (pdfOrder.includes("remote") && (await tryPdfRemote(t0))) return;
            return;
          }
          res = await submitTcsPortalJob(payload);
          for (let i = 0; i < 40 && res.error === "BUSY"; i++) {
            setBusyLabel(`Tải PDF …${digits.slice(-8)} — chờ agent…`);
            await new Promise((r) => window.setTimeout(r, 250));
            res = await submitTcsPortalJob(payload);
          }
        }
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        if (!res.ok || (res.results || [])[0]?.normalized_status !== "DOWNLOADED") {
          if (pdfOrder.includes("extension") && (await tryPdfExt(t0))) return;
          if (pdfOrder.includes("remote") && (await tryPdfRemote(t0))) return;
          const row0f = (res.results || [])[0];
          setError(
            res.message ||
              res.error ||
              row0f?.error_message ||
              "Agent tải PDF thất bại"
          );
          return;
        }
        setResults(res.results || []);
        const row0 = (res.results || [])[0];
        const cacheHit = Boolean(res.cache_hit || row0?.cache_hit);
        const hotNote = cacheHit
          ? " · tức thì (cache)"
          : res.hot_path
            ? " · hot"
            : " · cold";
        const pdfName = row0?.pdf_name || row0?.downloaded_file || "";
        const saved = pdfName
          ? await downloadPdfFromAgent(pdfName, { warehouse: rowPortal })
          : false;
        setDownloadedCount(pdfName ? 1 : 0);
        const shortName = pdfName ? String(pdfName).replace(/^.*[/\\]/, "") : "";
        if (!pdfName) {
          setError(
            `Tải PDF …${digits.slice(-8)} · ${sec}s${hotNote} — agent không trả tên file`
          );
          return;
        }
        if (!saved) {
          setError(
            `Tải PDF …${digits.slice(-8)} · ${sec}s${hotNote} — không tải được về máy.`
          );
          setMessage(`File sẵn sàng: ${shortName}`);
          return;
        }
        setMessage(
          `Tải PDF …${digits.slice(-8)} · ${sec}s${hotNote} — đã tải ${shortName} về máy`
        );
        if (!cacheHit) {
          void refreshHealth();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi job ESID");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [
      ensureSessionReady,
      executorPolicy,
      health?.ok,
      preferRemotePortal,
      refreshHealth,
      refreshPortalWorker,
      sessionYmd,
    ]
  );

  /** Điền ESID từng lô — đúng kho đang thao tác + đã HT tiếp nhận. */
  const fillEsidDeclareFor = useCallback(
    async (shipment: Shipment) => {
      setError("");
      setMessage("");
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
        const fillOrder = resolvePortalExecutorOrder("fill", {
          policy: executorPolicy,
          preferRemote: preferRemotePortal,
        });
        const ext = await pingTcsExtension({ warehouse: rowPortal });
        setExtension(ext);
        let executor: "extension" | "playwright" = "playwright";
        let res: Awaited<ReturnType<typeof declareFillTcsEsid>> | TcsExtResult;

        const tryExt =
          fillOrder.includes("extension") &&
          ext.ok &&
          Boolean(ext.workspace?.logged_in);

        if (tryExt) {
          executor = "extension";
          setBusyLabel(
            `${tcsExtLabel(rowPortal)} đang điền …${digits.slice(-8)}…`
          );
          res = await fillEsidViaExtension(payload, { warehouse: rowPortal });
          setExtension(res);
        } else {
          res = {
            ok: false,
            error: "SKIP_EXT",
            message: "Bỏ qua Ext",
            version: "",
          } as TcsExtResult;
        }

        // Ext fail / không có Ext → agent (cả TECS-TCS và TCS)
        if (
          (!res.ok || res.error === "SKIP_EXT") &&
          fillOrder.includes("agent")
        ) {
          executor = "playwright";
          setBusyLabel(`Agent ${rowPortal} điền …${digits.slice(-8)}…`);
          if (!(await ensureSessionReady())) return;
          res = await declareFillTcsEsid(payload, { warehouse: rowPortal });
          for (let i = 0; i < 40 && res.error === "BUSY"; i++) {
            setBusyLabel(`Điền ESID …${digits.slice(-8)} — chờ workspace…`);
            await new Promise((r) => window.setTimeout(r, 250));
            res = await declareFillTcsEsid(payload, { warehouse: rowPortal });
          }
        }
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        if (!res.ok) {
          setError(res.message || res.error || "Điền ESID thất bại");
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
      portalWarehouse,
      preferRemotePortal,
      refreshHealth,
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
        if (target.executor === "extension") {
          const opened = await openTcsExtensionTab(extOpts);
          setExtension(opened);
          if (!opened.ok) {
            setError(
              opened.message ||
                `Không mở được tab TCS của ${tcsExtLabel(portalWarehouse)}`
            );
            return;
          }
          setMessage(
            `Đã mở tab TCS cho AWB …${target.awb.slice(-8)} — kiểm tra và bấm HOÀN TẤT trực tiếp trên TCS.`
          );
          return;
        }
        if (!(await ensureSessionReady())) return;
        let res = await declareSubmitTcsEsid({
          awb: target.awb,
          shipment_id: target.shipmentId || undefined,
          confirm_submit: true,
          warehouse: portalWarehouse,
        });
        for (let i = 0; i < 40 && res.error === "BUSY"; i++) {
          setBusyLabel(`HOÀN TẤT ESID …${target.awb.slice(-8)} — chờ…`);
          await new Promise((r) => window.setTimeout(r, 250));
          res = await declareSubmitTcsEsid({
            awb: target.awb,
            shipment_id: target.shipmentId || undefined,
            confirm_submit: true,
            warehouse: portalWarehouse,
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

  const sessionLabel = busy
    ? "Đang xử lý"
    : preferRemotePortal && portalWorker?.logged_in
      ? "Máy kho đã ĐN"
      : preferRemotePortal && portalWorker?.online
        ? "Máy kho online"
        : extension?.ok && extension.workspace?.logged_in
          ? `${tcsExtLabel(portalWarehouse)} đã login`
          : !health?.ok
            ? "Offline"
            : !session?.open
              ? "Chưa mở"
              : session.logged_in
                ? "Đã login"
                : "Cần CAPTCHA";

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
    portalWorker,
    session,
    sessionLabel,
    results,
    downloadedCount,
    /** @deprecated dùng loginWithExtension / login — giữ tên cũ cho chỗ gọi Playwright. */
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
    preferRemotePortal,
    /** false = Chrome thật trên máy kho */
    agentHeadless: health?.headless ?? session?.headless,
    workspace:
      (extensionWorkspaceActive
        ? (extension?.workspace as TcsExtensionWorkspace | undefined)
        : health?.workspace) ?? null,
    refreshHealth,
  };
}

export type TcsPortalActions = ReturnType<typeof useTcsPortalActions>;
