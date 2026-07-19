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
  agentOfflineHint,
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

/** Giữ hot-path lâu hơn — bấm Tải PDF gần tức thời nếu đã mở menu ⋮ */
const PREPARED_TTL_MS = 180_000;

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
  /** AWB đã pre-warm (menu ⋮) — hot-path Tải PDF ~1–3s */
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
    if (!s?.open) {
      setBusyLabel("Đang mở Chrome…");
      const opened = await openTcsAgentSession();
      if (!opened.ok) {
        setError(opened.message || "Không mở được Chrome");
        return false;
      }
      setSession(opened);
      s = opened.logged_in != null ? opened : await fetchTcsSessionStatus();
      setSession(s);
    }
    if (!s?.logged_in) {
      setError("Cần login TCS — nhập CAPTCHA trên Chrome rồi thử lại.");
      await refreshHealth();
      return false;
    }
    return true;
  }, [health?.ok, refreshHealth, session?.logged_in, session?.open]);

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
        setError(agentOfflineHint(getTcsAgentBaseUrl()));
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

      let msg = `Quét ESID (status) ${sec}s · ${ready.length}/${res.total ?? awbs.length} hoàn thành tiếp nhận`;
      if (updatedCount > 0) {
        msg += ` · đã cập nhật Ops cho ${updatedCount} lô (không ảnh hưởng Tải/In)`;
      } else if (ready.length > 0) {
        msg += " · Ops đã đúng trạng thái";
      } else {
        msg += " · chưa có lô tiếp nhận trên TCS (ngày phiên)";
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

  /** Batch toolbar đã bỏ — Tải PDF chỉ từ menu dòng (1 AWB). Giữ stub để tương thích. */
  const downloadReady = useCallback(() => {
    setError("Tải PDF ESID chỉ chạy 1 AWB — dùng menu ⋮ trên dòng.");
  }, []);

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
      // Debounce rất ngắn — mở ⋮ là pre-warm ngay để Tải PDF ~1–2s
      prepareTimerRef.current = window.setTimeout(() => {
        prepareTimerRef.current = null;
        if (busyRef.current) return;
        if (isPreparedHot(digits)) return;
        prepareInFlightRef.current = digits;
        void prepareTcsEsid(digits)
          .then((res) => {
            if (res.ok && res.prepared) {
              setPreparedAwb(digits);
              preparedAtRef.current = Date.now();
            }
          })
          .catch(() => {
            /* im lặng — cold-path vẫn chạy khi bấm Tải PDF */
          })
          .finally(() => {
            if (prepareInFlightRef.current === digits) prepareInFlightRef.current = "";
          });
      }, 40);
    },
    [isPreparedHot]
  );

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
      const wasPreparing = prepareInFlightRef.current === digits;
      const hot = isPreparedHot(digits) || wasPreparing;
      setBusy(true);
      setBusyLabel(
        hot
          ? `Tải PDF …${digits.slice(-8)} — hot-path…`
          : `Tải PDF …${digits.slice(-8)} — tìm AWB#…`
      );
      const t0 = performance.now();
      try {
        if (!(await ensureSessionReady())) return;
        // Đợi pre-warm cùng AWB xong (agent cũng chờ) — tránh cold-path đụng prepare
        if (wasPreparing || prepareInFlightRef.current === digits) {
          setBusyLabel(`Tải PDF …${digits.slice(-8)} — đang mở phiếu…`);
          const waitUntil = Date.now() + 90_000;
          while (Date.now() < waitUntil) {
            if (isPreparedHot(digits)) break;
            if (prepareInFlightRef.current !== digits && !isPreparedHot(digits)) break;
            await new Promise((r) => window.setTimeout(r, 100));
          }
        }
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
        setPreparedAwb("");
        preparedAtRef.current = 0;
        const hotNote = res.hot_path ? " · hot" : "";
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
    [ensureSessionReady, isPreparedHot, refreshHealth, sessionYmd]
  );

  const downloadPdf = useCallback((name: string) => {
    void downloadPdfFromAgent(name);
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
    results,
    downloadedCount,
    focusShipment,
    login,
    scan,
    downloadReady,
    downloadEsidFor,
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
