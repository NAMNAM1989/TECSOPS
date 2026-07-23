import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import { isTcsWarehouse } from "../constants/warehouses";
import { awbDigitsKey } from "../utils/awbFormat";
import {
  buildTcsPortalJob,
  shipmentsEligibleForTcsPortal,
  shipmentsToMarkReceptionCompleted,
} from "../utils/tcsPortalJob";
import {
  downloadPdfFromAgent,
  fetchTcsSessionStatus,
  agentOfflineHint,
  bootstrapTcsWorkspace,
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
  fillEsidViaExtension,
  openTcsExtensionTab,
  pingTcsExtension,
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
  /** Chỉ thao tác 1 lô (từ menu dòng) */
  focusShipment?: Shipment | null;
  onMarkReceptionCompleted?: (shipmentIds: string[]) => void | Promise<void>;
  /** Sau quét: báo số lô ready / đã cập nhật Ops (để đổi lọc bảng) */
  onReceptionScanDone?: (info: {
    readyCount: number;
    updatedCount: number;
    readyAwbs: string[];
  }) => void;
  /** Poll agent khi toolbar hiển thị */
  active?: boolean;
};

export function useTcsPortalActions({
  sessionYmd,
  rows,
  customerDirectory = [],
  focusShipment = null,
  onMarkReceptionCompleted,
  onReceptionScanDone,
  active = true,
}: TcsPortalActionsOpts) {
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
  const [results, setResults] = useState<TcsAgentJobResultRow[]>([]);
  const [downloadedCount, setDownloadedCount] = useState(0);
  /** Sau Điền: trạng thái + nút HOÀN TẤT trên cùng workspace. */
  const [lastDeclarePreview, setLastDeclarePreview] =
    useState<EsidDeclarePreviewState | null>(null);
  const workspaceEligible = useMemo(
    () => shipmentsEligibleForTcsPortal(rows, sessionYmd),
    [rows, sessionYmd]
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
    const result = await pingTcsExtension();
    setExtension(result);
    return result;
  }, []);

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
    const s = online.session || (await fetchTcsSessionStatus());
    setSession(s);
    if (!s?.open) {
      setError("Workspace TCS chưa khởi tạo — bấm Login để đăng nhập và quét sẵn theo ngày.");
      return false;
    }
    if (!s?.logged_in) {
      setError("Cần login TCS — nhập CAPTCHA trên Chrome rồi thử lại.");
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
          ready.map((item) => item.awb)
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
    [onMarkReceptionCompleted, onReceptionScanDone, rows, sessionYmd]
  );

  const loginWithExtension = useCallback(
    async (credentials: {
      username: string;
      password: string;
      remember: boolean;
    }) => {
      setError("");
      setMessage("");
      setBusy(true);
      setBusyLabel(`Extension đang đồng bộ TCS ngày ${sessionYmd}…`);
      const started = performance.now();
      try {
        const configuredAgentBase = getTcsAgentBaseUrl();
        const extensionAgentBase =
          typeof window !== "undefined"
            ? new URL(configuredAgentBase, window.location.origin).toString()
            : configuredAgentBase;
        const result = await bootstrapTcsExtension({
          ...credentials,
          session_date: sessionYmd,
          awbs: workspaceEligible.map((shipment) => awbDigitsKey(shipment.awb)),
          agent_base_url: extensionAgentBase,
        });
        setExtension(result);
        if (!result.ok) {
          setError(result.message || result.error || "Extension đồng bộ TCS thất bại");
          return result;
        }
        const ready = result.ready || [];
        const updatedCount = await applyReadyItemsToOps(ready);
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        setMessage(
          `Extension TCS sẵn sàng · ${seconds}s · cache ${
            result.workspace?.cache_count ?? result.cache_count ?? 0
          } AWB · ${ready.length} hoàn thành tiếp nhận` +
            (updatedCount ? ` · cập nhật Ops ${updatedCount} lô` : "")
        );
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Extension đồng bộ TCS thất bại");
        return null;
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [applyReadyItemsToOps, sessionYmd, workspaceEligible]
  );

  const login = useCallback(async () => {
    setError("");
    setMessage("");
    setBusy(true);
    setBusyLabel(`Đăng nhập và quét ESID ngày ${sessionYmd}…`);
    const t0 = performance.now();
    try {
      const online = await pingTcsAgent();
      setHealth(online);
      if (!online?.ok) {
        setError(agentOfflineHint(getTcsAgentBaseUrl()));
        return;
      }
      // Máy kho headed → visible; cloud headless → API-first (không ép Xvfb)
      const wantVisible = online.headless === false;
      const res = await bootstrapTcsWorkspace(
        sessionYmd,
        workspaceEligible.map((s) => awbDigitsKey(s.awb)),
        { visible: wantVisible }
      );
      if (!res.ok) {
        setSession(res);
        setError(res.message || "Không khởi tạo được workspace TCS");
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
        `Workspace TCS sẵn sàng · ${sec}s · cache ${res.workspace?.cache_count ?? 0} AWB` +
          ` · ${ready.length} hoàn thành tiếp nhận` +
          (updatedCount ? ` · cập nhật Ops ${updatedCount} lô` : "")
      );
      if (res.scan_ok === false && res.scan_error) {
        setError(`Đã login nhưng quét ngày chưa xong: ${res.scan_error}`);
      }
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [
    applyReadyItemsToOps,
    refreshHealth,
    sessionYmd,
    workspaceEligible,
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
        setError("Chỉ kho TECS-TCS mới tải PDF ESID.");
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
      setBusyLabel(`Tải PDF …${digits.slice(-8)} — dùng cache ngày…`);
      const t0 = performance.now();
      try {
        if (!(await ensureSessionReady())) return;
        const res = await submitTcsPortalJob(payload);
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
        const hotNote = res.hot_path ? " · cache" : " · fallback";
        const pdfName = row0?.pdf_name || row0?.downloaded_file || "";
        const saved = pdfName ? await downloadPdfFromAgent(pdfName) : false;
        setDownloadedCount(saved || pdfName ? 1 : 0);
        const shortName = pdfName ? String(pdfName).replace(/^.*[/\\]/, "") : "";
        setMessage(
          saved
            ? `Tải PDF …${digits.slice(-8)} · ${sec}s${hotNote} — đã tải ${shortName} về máy`
            : pdfName
              ? `Tải PDF …${digits.slice(-8)} · ${sec}s${hotNote} — file sẵn sàng, bấm «Tải PDF»`
              : `Tải PDF …${digits.slice(-8)} · ${sec}s${hotNote}`
        );
        void refreshHealth();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi job ESID");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [ensureSessionReady, refreshHealth, sessionYmd]
  );

  /** Điền ESID trên page KHAI BÁO cố định của workspace Playwright. */
  const fillEsidDeclareFor = useCallback(
    async (shipment: Shipment) => {
      setError("");
      setMessage("");
      if (!isTcsWarehouse(shipment.warehouse)) {
        setError("Chỉ kho TECS-TCS mới điền khai báo ESID.");
        return;
      }
      const digits = awbDigitsKey(shipment.awb);
      if (digits.length !== 11) {
        setError("AWB phải đủ 11 số để điền ESID.");
        return;
      }
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
        const ext = await pingTcsExtension();
        setExtension(ext);
        let executor: "extension" | "playwright" = "playwright";
        let res;
        if (ext.ok && ext.workspace?.logged_in) {
          executor = "extension";
          setBusyLabel(`Extension đang điền trực quan …${digits.slice(-8)}…`);
          res = await fillEsidViaExtension(payload);
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
    [customerDirectory, ensureSessionReady, health?.headless, refreshHealth]
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
          const opened = await openTcsExtensionTab();
          setExtension(opened);
          if (!opened.ok) {
            setError(opened.message || "Không mở được tab TCS của extension");
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
    [ensureSessionReady, lastDeclarePreview, refreshHealth]
  );

  const sessionLabel = busy
    ? "Đang xử lý"
    : extension?.ok && extension.workspace?.logged_in
      ? "Ext đã login"
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
    login,
    loginWithExtension,
    downloadEsidFor,
    fillEsidDeclareFor,
    submitEsidDeclare,
    lastDeclarePreview,
    clearDeclarePreview,
    /** false = Chrome thật trên máy kho */
    agentHeadless: health?.headless ?? session?.headless,
    workspace:
      (extensionWorkspaceActive
        ? (extension?.workspace as TcsExtensionWorkspace | undefined)
        : health?.workspace) ?? null,
    refreshHealth,
    refreshExtension,
    clearFocusHint: focusShipment
      ? `Chỉ AWB ${awbDigitsKey(focusShipment.awb) || focusShipment.awb}`
      : "",
  };
}

export type TcsPortalActions = ReturnType<typeof useTcsPortalActions>;
