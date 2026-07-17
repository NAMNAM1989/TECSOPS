import { useCallback, useEffect, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import { isTcsWarehouse } from "../constants/warehouses";
import { awbDigitsKey } from "../utils/awbFormat";
import {
  buildTcsPortalJob,
  OPS_STATUS_READY_FOR_PDF,
  shipmentsEligibleForTcsPortal,
  shipmentsToMarkReceptionCompleted,
} from "../utils/tcsPortalJob";
import {
  downloadPdfFromAgent,
  fetchTcsSessionStatus,
  getTcsAgentBaseUrl,
  openTcsAgentSession,
  pingTcsAgent,
  scanTcsEsidReception,
  submitTcsPortalJob,
  type TcsAgentHealth,
  type TcsAgentJobResultRow,
  type TcsAgentSession,
  type TcsEsidScanItem,
} from "../utils/tcsPortalAgentApi";

export type TcsPortalActionsOpts = {
  sessionYmd: string;
  rows: readonly Shipment[];
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
  focusShipment = null,
  onMarkReceptionCompleted,
  onReceptionScanDone,
  active = true,
}: TcsPortalActionsOpts) {
  const [health, setHealth] = useState<TcsAgentHealth | null>(null);
  const [session, setSession] = useState<TcsAgentSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [readyItems, setReadyItems] = useState<TcsEsidScanItem[]>([]);
  const [scanTotal, setScanTotal] = useState(0);
  const [opsStatusUpdated, setOpsStatusUpdated] = useState(0);
  const [results, setResults] = useState<TcsAgentJobResultRow[]>([]);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [printDryRun, setPrintDryRun] = useState(false);

  const sourceRows = useMemo(() => {
    if (focusShipment) return [focusShipment];
    return rows;
  }, [rows, focusShipment]);

  const eligible = useMemo(
    () => shipmentsEligibleForTcsPortal(sourceRows, sessionYmd),
    [sourceRows, sessionYmd]
  );

  /** Ready = quét ESID + lô Ops đã HOÀN THÀNH TIẾP NHẬN (không cần quét lại sau reload). */
  const readyAwbSet = useMemo(() => {
    const set = new Set(
      readyItems.map((i) => awbDigitsKey(i.awb)).filter((d) => d.length === 11)
    );
    for (const s of eligible) {
      if (!OPS_STATUS_READY_FOR_PDF.has(s.status)) continue;
      const d = awbDigitsKey(s.awb);
      if (d.length === 11) set.add(d);
    }
    return set;
  }, [eligible, readyItems]);

  const refreshHealth = useCallback(async () => {
    const h = await pingTcsAgent();
    setHealth(h);
    if (h?.session) setSession(h.session);
    else setSession(await fetchTcsSessionStatus());
  }, []);

  useEffect(() => {
    if (!active) return;
    void refreshHealth();
    const t = window.setInterval(() => void refreshHealth(), 15000);
    return () => window.clearInterval(t);
  }, [active, refreshHealth]);

  const ensureSessionReady = useCallback(async (): Promise<boolean> => {
    const online = await pingTcsAgent();
    setHealth(online);
    if (!online?.ok) {
      setError(`Agent Offline (${getTcsAgentBaseUrl()}). Chạy: npm run tcs:agent:real`);
      return false;
    }
    let s = await fetchTcsSessionStatus();
    setSession(s);
    if (!s?.open) {
      setBusyLabel("Đang mở Chrome…");
      const opened = await openTcsAgentSession();
      if (!opened.ok) {
        setError(opened.message || "Không mở được Chrome");
        return false;
      }
      setSession(opened);
      s = await fetchTcsSessionStatus();
      setSession(s);
    }
    if (!s?.logged_in) {
      setError("Cần login TCS — nhập CAPTCHA trên Chrome rồi thử lại.");
      await refreshHealth();
      return false;
    }
    return true;
  }, [refreshHealth]);

  const login = useCallback(async () => {
    setError("");
    setMessage("");
    setBusy(true);
    setBusyLabel("Đăng nhập…");
    const t0 = performance.now();
    try {
      const online = await pingTcsAgent();
      setHealth(online);
      if (!online?.ok) {
        setError(`Agent Offline (${getTcsAgentBaseUrl()}). Chạy: npm run tcs:agent:real`);
        return;
      }
      const res = await openTcsAgentSession();
      if (!res.ok) {
        setError(res.message || "Không mở được Chrome");
        return;
      }
      setSession(res);
      await refreshHealth();
      const sec = ((performance.now() - t0) / 1000).toFixed(1);
      setMessage(
        res.logged_in
          ? `Đã login TCS (${sec}s)`
          : `Chrome đã mở — nhập CAPTCHA rồi bấm Quét (${sec}s)`
      );
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [refreshHealth]);

  const scan = useCallback(async () => {
    setError("");
    setMessage("");
    setResults([]);
    setDownloadedCount(0);
    if (!eligible.length) {
      setError("Không có lô TECS-TCS đủ AWB 11 số trong phiên.");
      return;
    }
    setBusy(true);
    setBusyLabel("Quét ESID…");
    const t0 = performance.now();
    try {
      if (!(await ensureSessionReady())) return;
      const awbs = eligible.map((s) => awbDigitsKey(s.awb));
      setBusyLabel(`Quét ESID ngày ${sessionYmd}…`);
      // Lọc theo ngày bay trên ESID (= ngày phiên Ops) — không gõ từng AWB
      const res = await scanTcsEsidReception(awbs, sessionYmd);
      const sec = ((performance.now() - t0) / 1000).toFixed(1);
      if (!res.ok) {
        setError(res.message || res.error || "Quét ESID thất bại");
        setReadyItems(res.ready || []);
        setScanTotal(res.total ?? 0);
        return;
      }
      // Ghép ready từ mảng ready + items có normalized RECEPTION_COMPLETED
      const readyByFlag = res.ready || [];
      const readyByStatus = (res.items || []).filter(
        (i) =>
          i.ready ||
          i.normalized_status === "RECEPTION_COMPLETED" ||
          /hoàn thành tiếp nhận|hoan thanh tiep nhan/i.test(
            `${i.tcs_status || ""} ${i.raw || ""}`
          )
      );
      const readyMap = new Map<string, TcsEsidScanItem>();
      for (const r of [...readyByFlag, ...readyByStatus]) {
        const d = awbDigitsKey(r.awb);
        if (d.length === 11) readyMap.set(d, { ...r, awb: d, ready: true });
      }
      const ready = [...readyMap.values()];
      setReadyItems(ready);
      setScanTotal(res.total ?? awbs.length);

      let updatedCount = 0;
      if (ready.length && onMarkReceptionCompleted) {
        setBusyLabel("Cập nhật trạng thái Ops…");
        const toMark = shipmentsToMarkReceptionCompleted(
          sourceRows,
          sessionYmd,
          ready.map((r) => r.awb)
        );
        if (toMark.length) {
          await onMarkReceptionCompleted(toMark.map((s) => s.id));
          updatedCount = toMark.length;
        }
      }
      setOpsStatusUpdated(updatedCount);

      let msg = `Quét ESID xong ${sec}s · ${ready.length}/${res.total ?? awbs.length} hoàn thành tiếp nhận`;
      if (updatedCount > 0) {
        msg += ` · đã gán HOÀN THÀNH TIẾP NHẬN cho ${updatedCount} lô trên Ops`;
      } else if (ready.length > 0) {
        msg += " · Ops đã đúng trạng thái (không cần đổi)";
      } else {
        msg += " · chưa có lô sẵn sàng trên TCS";
      }
      setMessage(msg);
      onReceptionScanDone?.({
        readyCount: ready.length,
        updatedCount,
        readyAwbs: ready.map((r) => r.awb),
      });
      void refreshHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi quét ESID");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [
    eligible,
    ensureSessionReady,
    onMarkReceptionCompleted,
    onReceptionScanDone,
    refreshHealth,
    sessionYmd,
    sourceRows,
  ]);

  const runJob = useCallback(
    async (kind: "DOWNLOAD" | "PRINT") => {
      setError("");
      if (!readyAwbSet.size) {
        setError("Chưa có lô sẵn sàng (Quét ESID hoặc Ops đã HOÀN THÀNH TIẾP NHẬN).");
        return;
      }
      const payload = buildTcsPortalJob(sourceRows, {
        sessionYmd,
        action: kind,
        dryRun: kind === "PRINT" ? printDryRun : false,
        mock: false,
        onlyCompleted: false,
        awbDigitsFilter: readyAwbSet,
      });
      if (!payload.rows.length) {
        setError("Không khớp AWB ready với danh sách Ops.");
        return;
      }
      setBusy(true);
      setBusyLabel(kind === "PRINT" ? "Đang in ESID…" : "Đang tải PDF ESID…");
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
        const pdfRows = (res.results || []).filter((r) => r.pdf_name || r.downloaded_file);
        const n = res.downloaded_count ?? pdfRows.length;
        setDownloadedCount(n);
        // Tự mở PDF ESID vừa tải (tối đa 5 tab để tránh spam)
        for (const row of pdfRows.slice(0, 5)) {
          downloadPdfFromAgent(row.pdf_name || row.downloaded_file || "");
        }
        setMessage(
          kind === "PRINT"
            ? `In ESID xong ${sec}s · ${n} phiếu${printDryRun ? " (dry-run — chưa gửi máy in)" : ""}`
            : `PDF ESID xong ${sec}s · ${n} file`
        );
        void refreshHealth();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi job");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [ensureSessionReady, printDryRun, readyAwbSet, refreshHealth, sessionYmd, sourceRows]
  );

  const downloadReady = useCallback(() => runJob("DOWNLOAD"), [runJob]);
  const printReady = useCallback(() => runJob("PRINT"), [runJob]);

  /** Menu dòng: PDF / In ESID cho đúng 1 AWB */
  const runJobForShipment = useCallback(
    async (shipment: Shipment, kind: "DOWNLOAD" | "PRINT") => {
      setError("");
      setMessage("");
      if (!isTcsWarehouse(shipment.warehouse)) {
        setError("Chỉ kho TECS-TCS mới tải/in ESID.");
        return;
      }
      const digits = awbDigitsKey(shipment.awb);
      if (digits.length !== 11) {
        setError("AWB phải đủ 11 số để tải/in ESID.");
        return;
      }
      const payload = buildTcsPortalJob([shipment], {
        sessionYmd: String(shipment.sessionDate || sessionYmd).trim() || sessionYmd,
        action: kind,
        dryRun: kind === "PRINT" ? printDryRun : false,
        mock: false,
        onlyCompleted: false,
        awbDigitsFilter: new Set([digits]),
      });
      if (!payload.rows.length) {
        setError("Không tạo được job ESID cho AWB này.");
        return;
      }
      setBusy(true);
      setBusyLabel(
        kind === "PRINT"
          ? `In ESID …${digits.slice(-8)} (mở hộp in trên Chrome)`
          : `PDF ESID …${digits.slice(-8)}`
      );
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
        const okStatus = status === "DOWNLOADED" || status === "PRINTED";
        if (!okStatus) {
          setError(row0?.error_message || status || "ESID thất bại");
          return;
        }
        if (kind === "PRINT") {
          setDownloadedCount(0);
          setMessage(
            `In ESID …${digits.slice(-8)} · ${sec}s — hộp thoại in đã mở trên Chrome TCS, hãy chọn máy in và bấm In`
          );
        } else {
          const pdfRows = (res.results || []).filter((r) => r.pdf_name || r.downloaded_file);
          const n = res.downloaded_count ?? pdfRows.length;
          setDownloadedCount(n);
          for (const r of pdfRows.slice(0, 3)) {
            downloadPdfFromAgent(r.pdf_name || r.downloaded_file || "");
          }
          setMessage(`PDF ESID …${digits.slice(-8)} · ${sec}s · ${n} file`);
        }
        void refreshHealth();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi job ESID");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [ensureSessionReady, printDryRun, refreshHealth, sessionYmd]
  );

  const downloadEsidFor = useCallback(
    (shipment: Shipment) => runJobForShipment(shipment, "DOWNLOAD"),
    [runJobForShipment]
  );
  const printEsidFor = useCallback(
    (shipment: Shipment) => runJobForShipment(shipment, "PRINT"),
    [runJobForShipment]
  );

  const downloadPdf = useCallback((name: string) => {
    downloadPdfFromAgent(name);
  }, []);

  const sessionLabel = !health?.ok
    ? "Offline"
    : !session?.open
      ? "Chưa mở"
      : session.logged_in
        ? "Đã login"
        : "Cần CAPTCHA";

  return {
    eligibleCount: eligible.length,
    readyCount: readyAwbSet.size,
    scanTotal,
    opsStatusUpdated,
    busy,
    busyLabel,
    message,
    error,
    health,
    session,
    sessionLabel,
    printDryRun,
    setPrintDryRun,
    results,
    downloadedCount,
    focusShipment,
    login,
    scan,
    downloadReady,
    printReady,
    downloadEsidFor,
    printEsidFor,
    downloadPdf,
    refreshHealth,
    clearFocusHint: focusShipment
      ? `Chỉ AWB ${awbDigitsKey(focusShipment.awb) || focusShipment.awb}`
      : "",
  };
}

export type TcsPortalActions = ReturnType<typeof useTcsPortalActions>;
