import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import { isTcsWarehouse } from "../constants/warehouses";
import { awbDigitsKey } from "../utils/awbFormat";
import {
  asTcsPortalWarehouse,
  canFillEsidForPortal,
  shipmentsPendingReceptionScan,
  shipmentsToMarkReceptionCompleted,
  type TcsPortalWarehouse,
} from "../utils/tcsPortalJob";
import { loadTcsExtLoginPrefs, tcsExtLabel } from "../utils/tcsExtLoginPrefs";
import type {
  TcsAgentHealth,
  TcsAgentJobResultRow,
  TcsAgentSession,
  TcsEsidScanItem,
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
  subscribeTcsExtensionReady,
  tcsEsidExtServesWarehouse,
  type TcsExtensionWorkspace,
  type TcsExtResult,
} from "../utils/tcsChromeExtension";
import {
  getPortalExecutorPolicy,
  getPortalVisualControl,
  setPortalVisualControl,
} from "../utils/portalExecutorPolicy";
import { portalBusyUserMessage } from "../utils/tcsPortalScanGate";
import { notifyError, notifySuccess } from "../ui/notify";

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

const NEED_EXT_PC =
  "Cần Chrome Ext trên PC (TCS + SCSC, menu «Tải Ext»). Điện thoại không Đăng Nhập TCS / Quét / Điền được.";

export type EsidDeclarePreviewState = {
  awb: string;
  shipmentId: string;
  warnings: string[];
  valuesSummary: string;
  executor: "extension" | "playwright";
  /** Kho đã Điền — HOÀN TẤT mở đúng Ext kho này. */
  warehouse: TcsPortalWarehouse;
};

export type TcsPortalActionsOpts = {
  sessionYmd: string;
  rows: readonly Shipment[];
  customerDirectory?: readonly CustomerDirectoryEntry[];
  onMarkReceptionCompleted?: (shipmentIds: string[]) => void | Promise<void>;
  onReceptionScanDone?: (info: {
    readyCount: number;
    updatedCount: number;
    readyAwbs: string[];
  }) => void;
  active?: boolean;
  /**
   * Kho portal đang thao tác trên Ops — quyết định Ext/channel + phạm vi bootstrap.
   * Mã kho dữ liệu TECS-TCS dùng Ext TCS (không còn chrome-extension/ legacy).
   */
  portalWarehouse?: Warehouse;
  /** @deprecated Không còn portal-worker / agent. */
  preferRemotePortal?: boolean;
  /** Viewport ≤767 — UI báo cần Ext trên PC. */
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
  void preferRemotePortal;
  const portalWarehouse: TcsPortalWarehouse =
    asTcsPortalWarehouse(portalWarehouseProp) || "TECS-TCS";
  const extOpts = useMemo(
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
  const [extension, setExtension] = useState<TcsExtResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<TcsAgentJobResultRow[]>([]);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [lastDeclarePreview, setLastDeclarePreview] =
    useState<EsidDeclarePreviewState | null>(null);

  const pendingReception = useMemo(
    () =>
      shipmentsPendingReceptionScan(rows, sessionYmd, {
        warehouse: portalWarehouse,
      }),
    [rows, sessionYmd, portalWarehouse]
  );

  const refreshExtension = useCallback(async () => {
    const result = await pingTcsExtension({ warehouse: portalWarehouse });
    setExtension(result);
    return result;
  }, [portalWarehouse]);

  const prevPortalWhRef = useRef<TcsPortalWarehouse | null>(null);
  useEffect(() => {
    const prev = prevPortalWhRef.current;
    prevPortalWhRef.current = portalWarehouse;
    if (!prev || prev === portalWarehouse) return;
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

  useEffect(() => {
    if (!active) return;
    return subscribeTcsExtensionReady((info) => {
      if (!tcsEsidExtServesWarehouse(info.portalWarehouse, portalWarehouse)) {
        return;
      }
      void refreshExtension();
    });
  }, [active, portalWarehouse, refreshExtension]);

  const refreshPortalWorker = useCallback(async () => null, []);
  const refreshHealth = useCallback(async () => undefined, []);

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
        const result = await bootstrapTcsExtension(
          {
            ...credentials,
            session_date: sessionYmd,
            awbs: [],
            login_only: true,
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
    [extOpts, portalWarehouse, sessionYmd]
  );

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
      const expectedUser = loadTcsExtLoginPrefs(portalWarehouse).username;
      const result = await scanTcsExtensionDate(
        {
          session_date: sessionYmd,
          awbs: pendingAwbs,
          expected_username: expectedUser || undefined,
        },
        extOpts
      );
      setExtension(result);
      if (!result.ok) {
        const busyMsg = portalBusyUserMessage(result);
        if (busyMsg) {
          setError(busyMsg);
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
      const receptionTotal = Number(result.reception_total ?? ready.length);
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
    extOpts,
    pendingReception,
    portalWarehouse,
    sessionYmd,
  ]);

  const login = useCallback(async () => {
    setError("");
    setMessage("");
    const extPing = await pingTcsExtension({ warehouse: portalWarehouse });
    setExtension(extPing);
    const msg = isMobile
      ? NEED_EXT_PC
      : `Cần Chrome Ext kho ${portalWarehouse} (${tcsExtLabel(portalWarehouse)}). ` +
        "Bấm «Tải Ext» trên toolbar, mở đúng profile Chrome, rồi Đăng Nhập TCS lại.";
    setError(msg);
    notifyError(msg, "Không Đăng Nhập TCS được");
  }, [isMobile, portalWarehouse]);

  const scanReceptionWithAgent = useCallback(async () => {
    setError("");
    setMessage("");
    const msg = isMobile
      ? NEED_EXT_PC
      : `Cần Chrome Ext kho ${portalWarehouse} để Quét. Bấm «Tải Ext» rồi Đăng Nhập TCS trước.`;
    setError(msg);
    notifyError(msg, "Không Quét được");
  }, [isMobile, portalWarehouse]);

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

      setBusy(true);
      const t0 = performance.now();
      try {
        const ext = await pingTcsExtension({ warehouse: rowPortal });
        setExtension(ext);
        if (!ext.ok) {
          setError(
            isMobile
              ? NEED_EXT_PC
              : `Cần Chrome Ext kho ${rowPortal} để tải PDF. Bấm «Tải Ext» rồi Đăng Nhập TCS trước.`
          );
          return;
        }
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
          return;
        }
        if (!res.ok) {
          setError(res.message || res.error || "Tải PDF Ext thất bại");
          return;
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
          return;
        }
        setMessage(`Tải PDF Ext …${digits.slice(-8)} · ${sec}s — ${pdfName}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi tải PDF ESID");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [isMobile]
  );

  const fillEsidDeclareFor = useCallback(
    async (shipment: Shipment) => {
      setError("");
      setMessage("");
      if (isMobile) {
        setError("Điền ESID chỉ trên PC — cần Chrome Ext (TCS + SCSC).");
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
        const ext = await pingTcsExtension({ warehouse: rowPortal });
        setExtension(ext);
        if (!ext.ok || !ext.workspace?.logged_in) {
          setError(
            !ext.ok
              ? `Cần ${tcsExtLabel(rowPortal)} online để Điền trên tab Chrome.`
              : `Đăng Nhập TCS ${tcsExtLabel(rowPortal)} trước khi Điền.`
          );
          return;
        }
        setBusyLabel(`${tcsExtLabel(rowPortal)} đang điền …${digits.slice(-8)}…`);
        const res = await fillEsidViaExtension(payload, { warehouse: rowPortal });
        setExtension(res);
        const busyFill = portalBusyUserMessage(res);
        if (busyFill) {
          setError(busyFill);
          return;
        }
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        if (!res.ok) {
          setError(res.message || res.error || "Điền ESID thất bại — kiểm tra Ext.");
          return;
        }
        const warn = [...resolved.warnings, ...(res.warnings || [])].filter(Boolean);
        const warnNote = warn.length ? ` · ${warn[0]}` : "";
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
          shipmentId: String(shipment.id || ""),
          warnings: warn,
          valuesSummary: bits.join(" · "),
          executor: "extension",
          warehouse: rowPortal,
        });
        setMessage(
          `Extension đã điền trực quan …${digits.slice(-8)}${custNote}${partyNote} · ${sec}s — kiểm tra tab TCS rồi tự HOÀN TẤT.${warnNote}`
        );
        notifySuccess("Đã điền ESID trên tab Chrome Ext", rowPortal);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi điền ESID");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [customerDirectory, isMobile, portalWarehouse]
  );

  const clearDeclarePreview = useCallback(() => {
    setLastDeclarePreview(null);
  }, []);

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
      try {
        const submitWh =
          asTcsPortalWarehouse(target.warehouse) || portalWarehouse;
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi HOÀN TẤT ESID");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [lastDeclarePreview, portalWarehouse]
  );

  const sessionLabel = busy
    ? "Đang xử lý"
    : extension?.ok && extension.workspace?.logged_in
      ? `${tcsExtLabel(portalWarehouse)} đã login`
      : extension?.ok
        ? `${tcsExtLabel(portalWarehouse)} — cần Đăng Nhập TCS`
        : isMobile
          ? "Cần Ext trên PC"
          : "Cần Chrome Ext";

  const extensionWorkspaceActive =
    extension?.workspace?.logged_in === true ||
    Boolean(extension?.workspace?.phase && extension.workspace.phase !== "IDLE");

  const health: TcsAgentHealth | null = null;
  const session: TcsAgentSession | null = null;

  return {
    busy,
    busyLabel,
    message,
    error,
    health,
    extension,
    portalWorker: null as null,
    session,
    sessionLabel,
    results,
    downloadedCount,
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
    portalWarehouse,
    extLabel: tcsExtLabel(portalWarehouse),
    executorPolicy,
    visualControl,
    setVisualControl,
    playwrightLocal: false,
    setPlaywrightLocal: (_on: boolean) => undefined,
    preferRemotePortal: false,
    agentHeadless: undefined as boolean | undefined,
    workspace: extensionWorkspaceActive
      ? (extension?.workspace as TcsExtensionWorkspace | undefined) ?? null
      : null,
    refreshHealth,
  };
}

export type TcsPortalActions = ReturnType<typeof useTcsPortalActions>;
