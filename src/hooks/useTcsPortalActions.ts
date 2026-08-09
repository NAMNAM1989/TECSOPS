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
  fillEsidViaExtension,
  openTcsExtensionTab,
  pingTcsExtension,
  scanTcsExtensionDate,
  type TcsExtensionWorkspace,
  type TcsExtResult,
} from "../utils/tcsChromeExtension";

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
};

export function useTcsPortalActions({
  sessionYmd,
  rows,
  customerDirectory = [],
  onMarkReceptionCompleted,
  onReceptionScanDone,
  active = true,
  portalWarehouse: portalWarehouseProp = "TECS-TCS",
}: TcsPortalActionsOpts) {
  const portalWarehouse: TcsPortalWarehouse =
    asTcsPortalWarehouse(portalWarehouseProp) || "TECS-TCS";
  const extOpts = useMemo(
    () => ({ warehouse: portalWarehouse }),
    [portalWarehouse]
  );
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
    const h = await pingTcsAgent();
    if (busyRef.current) return;
    if (!h?.ok) {
      // Giữ session cũ nếu chỉ mất 1 lần ping (tránh nhấp nháy Offline)
      setHealth((prev) => (prev?.ok ? prev : h));
      return;
    }
    setHealth(h);
    if (h.session) setSession(h.session);
    else setSession(await fetchTcsSessionStatus());
  }, []);

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

  const ensureSessionReady = useCallback(async (): Promise<boolean> => {
    // Fast-path: đã login từ poll gần đây — bỏ 2 RTT ping/status trước mỗi PDF
    if (health?.ok && session?.open && session?.logged_in) {
      return true;
    }
    const online = await pingTcsAgent();
    setHealth(online);
    if (!online?.ok) {
      setError(agentOfflineHint(getTcsAgentBaseUrl()));
      return false;
    }
    let s = online.session || (await fetchTcsSessionStatus());
    setSession(s);
    // Ext Đồng bộ chỉ login tab Chrome user — agent Playwright có thể chưa mở.
    // Tự mở session khi tải PDF / điền (không bắt user bấm Login riêng).
    if (!s?.open || !s?.logged_in) {
      const wantVisible = online.headless === false;
      setBusyLabel(
        wantVisible
          ? "Đang mở Chrome agent TCS (PDF cần Playwright)…"
          : "Đang khởi tạo phiên agent TCS…"
      );
      const opened = await openTcsAgentSession({ visible: wantVisible });
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
          "Không mở được Chrome agent — kiểm tra máy kho / npm run tcs:agent:real."
      );
      return false;
    }
    if (!s?.logged_in) {
      setError(
        "Agent Chrome đang ở trang login — nhập CAPTCHA trên cửa sổ agent rồi bấm Tải PDF lại. " +
          "(Đồng bộ Ext và agent là hai phiên Chrome khác nhau.)"
      );
      await refreshHealth();
      return false;
    }
    return true;
  }, [health?.ok, refreshHealth, session?.logged_in, session?.open]);

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
        // Nền: warmup agent (PDF) — không quét
        const warmup = (async () => {
          if (portalWarehouse !== "TECS-TCS") return;
          const online = await pingTcsAgent(2500);
          if (!online?.ok) return;
          setHealth(online);
          const wantVisible = online.headless === false;
          const sess = online.session;
          if (!sess?.open || !sess?.logged_in) {
            const opened = await openTcsAgentSession({ visible: wantVisible });
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
      setMessage(
        `Quét ${portalWarehouse} · ${seconds}s · ${ready.length} HT tiếp nhận trên TCS` +
          (updatedCount
            ? ` · cập nhật Ops ${updatedCount} lô`
            : pendingAwbs.length === 0
              ? " · không còn lô cần cập nhật"
              : " · không có lô mới cần cập nhật")
      );
      const readyAwbs = ready
        .map((item) => String(item.awb || "").replace(/\D/g, "").slice(0, 11))
        .filter((d) => d.length === 11);
      if (portalWarehouse === "TECS-TCS" && readyAwbs.length) {
        const warmup = (async () => {
          const online = await pingTcsAgent(2500);
          if (!online?.ok) return;
          const pref = await prefetchTcsPdfs(readyAwbs, { limit: 5 });
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

  /** Fallback Playwright: mở/login agent (kho TECS-TCS). */
  const login = useCallback(async () => {
    setError("");
    setMessage("");
    if (portalWarehouse === "TCS") {
      setError(
        "Kho TCS cần Chrome Ext riêng (profile Chrome TCS). Không dùng agent Playwright cho kho này."
      );
      return;
    }
    setBusy(true);
    setBusyLabel("Đăng nhập agent Playwright…");
    try {
      const online = await pingTcsAgent();
      setHealth(online);
      if (!online?.ok) {
        setError(agentOfflineHint(getTcsAgentBaseUrl()));
        return;
      }
      const wantVisible = online.headless === false;
      const opened = await openTcsAgentSession({ visible: wantVisible });
      setSession(opened);
      if (!opened?.open || !opened?.logged_in) {
        setError(
          opened?.message ||
            "Agent chưa login — nhập CAPTCHA trên cửa sổ agent rồi thử lại."
        );
        return;
      }
      setMessage("Agent Playwright đã đăng nhập (TECS-TCS) — bấm Quét tiếp nhận khi cần.");
      await refreshHealth();
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [portalWarehouse, refreshHealth]);

  /** Fallback Playwright: bootstrap + quét (chỉ TECS-TCS). */
  const scanReceptionWithAgent = useCallback(async () => {
    setError("");
    setMessage("");
    if (portalWarehouse === "TCS") {
      setError("Kho TCS: cài Ext kho TCS và bấm Đăng nhập / Quét trên Ext.");
      return;
    }
    setBusy(true);
    const pendingAwbs = pendingReception.map((s) => awbDigitsKey(s.awb));
    setBusyLabel(
      pendingAwbs.length
        ? `Agent quét ${pendingAwbs.length} AWB chưa HT tiếp nhận…`
        : `Agent quét ngày ${sessionYmd}…`
    );
    const t0 = performance.now();
    try {
      const online = await pingTcsAgent();
      setHealth(online);
      if (!online?.ok) {
        setError(agentOfflineHint(getTcsAgentBaseUrl()));
        return;
      }
      const wantVisible = online.headless === false;
      const res = await bootstrapTcsWorkspace(sessionYmd, pendingAwbs, {
        visible: wantVisible,
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
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [
    applyReadyItemsToOps,
    pendingReception,
    portalWarehouse,
    refreshHealth,
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
        // PDF cache trên agent không cần Chrome đã login — chỉ cần agent online
        if (health?.ok) {
          /* keep */
        } else {
          const online = await pingTcsAgent();
          setHealth(online);
          if (!online?.ok) {
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
          // Ext đã Đồng bộ ≠ agent Playwright sẵn sàng — tự mở/login agent rồi thử lại
          setBusyLabel(`Mở phiên agent rồi tải PDF …${digits.slice(-8)}…`);
          if (!(await ensureSessionReady())) return;
          res = await submitTcsPortalJob(payload);
          for (let i = 0; i < 40 && res.error === "BUSY"; i++) {
            setBusyLabel(`Tải PDF …${digits.slice(-8)} — chờ agent…`);
            await new Promise((r) => window.setTimeout(r, 250));
            res = await submitTcsPortalJob(payload);
          }
        }
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        if (!res.ok) {
          setError(res.message || res.error || "Agent lỗi");
          return;
        }
        setResults(res.results || []);
        const row0 = (res.results || [])[0];
        const status = row0?.normalized_status || "";
        if (status !== "DOWNLOADED") {
          setError(row0?.error_message || status || "ESID thất bại");
          return;
        }
        const cacheHit = Boolean(res.cache_hit || row0?.cache_hit);
        const hotNote = cacheHit
          ? " · tức thì (cache)"
          : res.hot_path
            ? " · hot"
            : " · cold";
        const pdfName = row0?.pdf_name || row0?.downloaded_file || "";
        const saved = pdfName ? await downloadPdfFromAgent(pdfName) : false;
        setDownloadedCount(pdfName ? 1 : 0);
        const shortName = pdfName ? String(pdfName).replace(/^.*[/\\]/, "") : "";
        if (!pdfName) {
          setError(`Tải PDF …${digits.slice(-8)} · ${sec}s${hotNote} — agent không trả tên file`);
          return;
        }
        if (!saved) {
          setError(
            `Tải PDF …${digits.slice(-8)} · ${sec}s${hotNote} — không tải được về máy. Bấm «Tải PDF» bên dưới hoặc kiểm tra agent.`
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
    [ensureSessionReady, health?.ok, refreshHealth, sessionYmd]
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
        const ext = await pingTcsExtension({ warehouse: rowPortal });
        setExtension(ext);
        let executor: "extension" | "playwright" = "playwright";
        let res;
        if (ext.ok && ext.workspace?.logged_in) {
          executor = "extension";
          setBusyLabel(
            `${tcsExtLabel(rowPortal)} đang điền …${digits.slice(-8)}…`
          );
          res = await fillEsidViaExtension(payload, { warehouse: rowPortal });
          setExtension(res);
        } else {
          if (!(await ensureSessionReady())) return;
          res = await declareFillTcsEsid(payload);
          for (let i = 0; i < 40 && res.error === "BUSY"; i++) {
            setBusyLabel(`Điền ESID …${digits.slice(-8)} — chờ workspace…`);
            await new Promise((r) => window.setTimeout(r, 250));
            res = await declareFillTcsEsid(payload);
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
        const v = res.values || {};
        const bits = [
          v.flightNo ? `CB ${String(v.flightNo)}` : null,
          v.codFds ? `→ ${String(v.codFds)}` : null,
          v.qtyPcs != null && String(v.qtyPcs) !== "" ? `${String(v.qtyPcs)} pcs` : null,
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
      health?.headless,
      portalWarehouse,
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
        });
        for (let i = 0; i < 40 && res.error === "BUSY"; i++) {
          setBusyLabel(`HOÀN TẤT ESID …${target.awb.slice(-8)} — chờ…`);
          await new Promise((r) => window.setTimeout(r, 250));
          res = await declareSubmitTcsEsid({
            awb: target.awb,
            shipment_id: target.shipmentId || undefined,
            confirm_submit: true,
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
    downloadEsidFor,
    fillEsidDeclareFor,
    submitEsidDeclare,
    lastDeclarePreview,
    clearDeclarePreview,
    /** Kho portal đang gắn Ext/channel. */
    portalWarehouse,
    extLabel: tcsExtLabel(portalWarehouse),
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
