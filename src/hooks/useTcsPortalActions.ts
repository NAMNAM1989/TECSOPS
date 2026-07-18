import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  prepareTcsEsid,
  scanTcsEsidReception,
  submitTcsPortalJob,
  type TcsAgentHealth,
  type TcsAgentJobResultRow,
  type TcsAgentSession,
  type TcsEsidScanItem,
} from "../utils/tcsPortalAgentApi";

const PREPARED_TTL_MS = 120_000;

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
  /** Tránh poll /health ghi đè Offline khi đang chờ job dài trên agent */
  const busyRef = useRef(false);
  busyRef.current = busy;
  const [readyItems, setReadyItems] = useState<TcsEsidScanItem[]>([]);
  const [scanTotal, setScanTotal] = useState(0);
  const [opsStatusUpdated, setOpsStatusUpdated] = useState(0);
  const [results, setResults] = useState<TcsAgentJobResultRow[]>([]);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [printDryRun, setPrintDryRun] = useState(false);
  /** AWB đã pre-warm (menu ⋮) — hot-path PDF/In ~1–3s */
  const [preparedAwb, setPreparedAwb] = useState("");
  const preparedAtRef = useRef(0);
  const prepareTimerRef = useRef<number | null>(null);
  const prepareInFlightRef = useRef("");

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
      setBusyLabel(
        kind === "PRINT" ? "Đang mở hộp in ESID…" : "PDF ESID: mở hộp Save PDF trên Chrome…"
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
        const n = res.ok_count ?? (res.results || []).length;
        setDownloadedCount(0);
        setMessage(
          kind === "PRINT"
            ? `In ESID: đã mở hộp in trên Chrome · ${n} phiếu · ${sec}s — tự chọn máy in và bấm In${printDryRun ? " (dry-run)" : ""}`
            : `PDF ESID: đã mở hộp Save PDF trên Chrome · ${n} phiếu · ${sec}s — chọn Save as PDF và tự bấm Save`
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

  const isPreparedHot = useCallback(
    (digits: string) => {
      if (!digits || digits !== preparedAwb) return false;
      return Date.now() - preparedAtRef.current < PREPARED_TTL_MS;
    },
    [preparedAwb]
  );

  /** Pre-warm khi mở menu ⋮ — fire-and-forget, lỗi im lặng */
  const prepareEsidFor = useCallback(
    (shipment: Shipment) => {
      if (!isTcsWarehouse(shipment.warehouse)) return;
      if (busyRef.current) return;
      const digits = awbDigitsKey(shipment.awb);
      if (digits.length !== 11) return;
      if (isPreparedHot(digits)) return;
      if (prepareInFlightRef.current === digits) return;

      if (prepareTimerRef.current != null) {
        window.clearTimeout(prepareTimerRef.current);
      }
      prepareTimerRef.current = window.setTimeout(() => {
        prepareTimerRef.current = null;
        if (busyRef.current) return;
        if (isPreparedHot(digits)) return;
        prepareInFlightRef.current = digits;
        const ymd = String(shipment.sessionDate || sessionYmd).trim() || sessionYmd;
        void prepareTcsEsid(digits, ymd)
          .then((res) => {
            if (res.ok && res.prepared) {
              setPreparedAwb(digits);
              preparedAtRef.current = Date.now();
            }
          })
          .catch(() => {
            /* im lặng — cold-path vẫn chạy khi bấm PDF */
          })
          .finally(() => {
            if (prepareInFlightRef.current === digits) prepareInFlightRef.current = "";
          });
      }, 150);
    },
    [isPreparedHot, sessionYmd]
  );

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
      const hot = isPreparedHot(digits) || prepareInFlightRef.current === digits;
      setBusy(true);
      setBusyLabel(
        kind === "PRINT"
          ? hot
            ? `In ESID …${digits.slice(-8)} (mở hộp in trên Chrome)`
            : `In ESID …${digits.slice(-8)} (đang tìm ESID rồi mở hộp in…)`
          : hot
            ? `PDF ESID …${digits.slice(-8)} (mở hộp Save PDF — bạn tự bấm Save)`
            : `PDF ESID …${digits.slice(-8)} (đang tìm ESID rồi mở Save…)`
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
        setDownloadedCount(0);
        setPreparedAwb("");
        preparedAtRef.current = 0;
        const hotNote = res.hot_path ? " · hot" : "";
        if (kind === "PRINT") {
          setMessage(
            `In ESID …${digits.slice(-8)} · ${sec}s${hotNote} — hộp thoại in đã mở trên Chrome TCS, hãy chọn máy in và bấm In`
          );
        } else {
          setMessage(
            `PDF ESID …${digits.slice(-8)} · ${sec}s${hotNote} — hộp Save PDF đã mở trên Chrome TCS: chọn Save as PDF, tên file gợi ý theo AWB, rồi tự bấm Save`
          );
        }
        void refreshHealth();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi job ESID");
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [ensureSessionReady, isPreparedHot, printDryRun, refreshHealth, sessionYmd]
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

  const sessionLabel = busy
    ? "Đang xử lý"
    : !health?.ok
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
    prepareEsidFor,
    preparedAwb,
    downloadPdf,
    refreshHealth,
    clearFocusHint: focusShipment
      ? `Chỉ AWB ${awbDigitsKey(focusShipment.awb) || focusShipment.awb}`
      : "",
  };
}

export type TcsPortalActions = ReturnType<typeof useTcsPortalActions>;
