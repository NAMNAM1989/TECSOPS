import { useCallback, useEffect, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import { OPS } from "../styles/opsModalStyles";
import { awbDigitsKey } from "../utils/awbFormat";
import {
  buildTcsPortalJob,
  downloadTcsPortalJobJson,
  shipmentsEligibleForTcsPortal,
  shipmentsToMarkReceptionCompleted,
  type TcsPortalAction,
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

type Props = {
  open: boolean;
  onClose: () => void;
  sessionYmd: string;
  rows: readonly Shipment[];
  singleShipment?: Shipment | null;
  /** Gán HOÀN THÀNH TIẾP NHẬN lên từng dòng Ops sau quét ESID */
  onMarkReceptionCompleted?: (shipmentIds: string[]) => void | Promise<void>;
};

export function TcsPortalModal({
  open,
  onClose,
  sessionYmd,
  rows,
  singleShipment = null,
  onMarkReceptionCompleted,
}: Props) {
  const [action, setAction] = useState<TcsPortalAction>("DOWNLOAD");
  const [dryRun, setDryRun] = useState(false);
  const [mock, setMock] = useState(false);
  const [onlyCompleted, setOnlyCompleted] = useState(false);
  const [confirmRegister, setConfirmRegister] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [health, setHealth] = useState<TcsAgentHealth | null>(null);
  const [session, setSession] = useState<TcsAgentSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [scanItems, setScanItems] = useState<TcsEsidScanItem[]>([]);
  const [readyItems, setReadyItems] = useState<TcsEsidScanItem[]>([]);
  const [results, setResults] = useState<TcsAgentJobResultRow[]>([]);
  const [reportPath, setReportPath] = useState("");
  const [docsDir, setDocsDir] = useState("");
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [opsStatusUpdated, setOpsStatusUpdated] = useState(0);

  const sourceRows = useMemo(() => {
    if (singleShipment) return [singleShipment];
    return rows;
  }, [rows, singleShipment]);

  const eligible = useMemo(
    () =>
      shipmentsEligibleForTcsPortal(sourceRows, sessionYmd, {
        onlyCompleted: action !== "REGISTER" ? onlyCompleted : false,
      }),
    [sourceRows, sessionYmd, onlyCompleted, action]
  );

  const readyAwbSet = useMemo(() => {
    const set = new Set(
      readyItems.map((i) => awbDigitsKey(i.awb)).filter((d) => d.length === 11)
    );
    for (const s of eligible) {
      if (
        s.status === "RECEPTION_COMPLETED" ||
        s.status === "COMPLETED" ||
        s.status === "WEIGH_SLIP"
      ) {
        const d = awbDigitsKey(s.awb);
        if (d.length === 11) set.add(d);
      }
    }
    return set;
  }, [eligible, readyItems]);

  const refreshHealth = useCallback(async () => {
    const h = await pingTcsAgent();
    setHealth(h);
    if (h?.session) setSession(h.session);
    else {
      const s = await fetchTcsSessionStatus();
      setSession(s);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    setScanMessage("");
    setScanItems([]);
    setReadyItems([]);
    setResults([]);
    setReportPath("");
    setDocsDir("");
    setDownloadedCount(0);
    setOpsStatusUpdated(0);
    setAction("DOWNLOAD");
    setOnlyCompleted(false);
    setMock(false);
    setDryRun(true);
    void refreshHealth();
  }, [open, refreshHealth]);

  if (!open) return null;

  const downloadPayload = buildTcsPortalJob(sourceRows, {
    sessionYmd,
    action: "DOWNLOAD",
    dryRun: true,
    mock: false,
    confirmRegister: false,
    onlyCompleted: false,
    awbDigitsFilter: readyAwbSet.size ? readyAwbSet : undefined,
  });

  const printPayload = buildTcsPortalJob(sourceRows, {
    sessionYmd,
    action: "PRINT",
    dryRun,
    mock: false,
    confirmRegister: false,
    onlyCompleted: false,
    awbDigitsFilter: readyAwbSet.size ? readyAwbSet : undefined,
  });

  const advancedPayload = buildTcsPortalJob(sourceRows, {
    sessionYmd,
    action,
    dryRun,
    mock,
    confirmRegister: action === "REGISTER" ? confirmRegister : false,
    onlyCompleted: action !== "REGISTER" ? onlyCompleted : false,
  });

  const onExportJson = () => {
    const p = readyAwbSet.size ? downloadPayload : advancedPayload;
    if (!p.rows.length) {
      setError("Không có lô TECS-TCS đủ AWB để xuất JSON.");
      return;
    }
    downloadTcsPortalJobJson(p);
  };

  const onOpenChrome = async () => {
    setError("");
    setBusy(true);
    setBusyLabel("Đang mở Chrome…");
    try {
      const res = await openTcsAgentSession();
      if (!res.ok) {
        setError(res.message || "Không mở được Chrome");
        return;
      }
      setSession(res);
      await refreshHealth();
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const ensureSessionReady = async (): Promise<boolean> => {
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
      setError(
        "Chrome đang ở trang login — nhập CAPTCHA (hoặc đợi OCR), Đăng nhập, rồi bấm Kiểm tra ESID lại."
      );
      await refreshHealth();
      return false;
    }
    return true;
  };

  const onScanEsid = async () => {
    setError("");
    setScanMessage("");
    setResults([]);
    setReportPath("");
    setDownloadedCount(0);
    if (!eligible.length) {
      setError("Không có lô TECS-TCS đủ AWB 11 số trong phiên này.");
      return;
    }
    setBusy(true);
    setBusyLabel("Đang kiểm tra ESID…");
    try {
      if (!(await ensureSessionReady())) return;
      const awbs = eligible.map((s) => awbDigitsKey(s.awb));
      setBusyLabel(`Đang quét ${awbs.length} AWB trên Danh sách ESID…`);
      const res = await scanTcsEsidReception(awbs, sessionYmd);
      if (!res.ok) {
        setError(res.message || res.error || "Quét ESID thất bại");
        setScanItems(res.items || []);
        setReadyItems(res.ready || []);
        return;
      }
      const items = res.items || [];
      const ready = res.ready || [];
      setScanItems(items);
      setReadyItems(ready);
      let statusMsg = res.message || `Đã quét ${res.total ?? 0} AWB — ${res.ready_count ?? 0} lô sẵn sàng`;
      if (onMarkReceptionCompleted && ready.length) {
        const toMark = shipmentsToMarkReceptionCompleted(
          sourceRows,
          sessionYmd,
          ready.map((r) => r.awb)
        );
        if (toMark.length) {
          await onMarkReceptionCompleted(toMark.map((s) => s.id));
          setOpsStatusUpdated(toMark.length);
          statusMsg += ` · đã cập nhật ${toMark.length} dòng Ops → HOÀN THÀNH TIẾP NHẬN`;
        } else {
          setOpsStatusUpdated(0);
        }
      }
      setScanMessage(statusMsg);
      void refreshHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi quét ESID");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const runReadyJob = async (kind: "DOWNLOAD" | "PRINT") => {
    setError("");
    if (!readyAwbSet.size) {
      setError("Chưa có lô Hoàn thành tiếp nhận — bấm Quét ESID trước.");
      return;
    }
    const payload = kind === "PRINT" ? printPayload : downloadPayload;
    if (!payload.rows.length) {
      setError("Không khớp được AWB ready với danh sách Ops.");
      return;
    }
    setBusy(true);
    setBusyLabel(kind === "PRINT" ? "Đang in phiếu…" : "Đang tải PDF…");
    try {
      if (!(await ensureSessionReady())) return;
      const res = await submitTcsPortalJob(payload);
      if (!res.ok) {
        setError(res.message || res.error || "Agent lỗi");
        return;
      }
      setResults(res.results || []);
      setReportPath(res.report_path || "");
      setDocsDir(res.docs_dir || "");
      setDownloadedCount(res.downloaded_count ?? (res.results || []).filter((r) => r.downloaded_file).length);
      void refreshHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : kind === "PRINT" ? "Lỗi in" : "Lỗi tải PDF");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const onDownloadReady = () => runReadyJob("DOWNLOAD");
  const onPrintReady = () => runReadyJob("PRINT");

  const onSubmitAdvanced = async () => {
    setError("");
    if (!advancedPayload.rows.length) {
      setError("Không có lô TECS-TCS đủ AWB trong phiên này.");
      return;
    }
    if (action === "REGISTER" && !confirmRegister) {
      setError("REGISTER cần tick xác nhận cả lô trước khi gửi.");
      return;
    }
    if (!mock && !(await ensureSessionReady())) return;
    setBusy(true);
    setBusyLabel("Đang chạy job…");
    try {
      const res = await submitTcsPortalJob(advancedPayload);
      if (!res.ok) {
        setError(res.message || res.error || "Agent lỗi");
        return;
      }
      setResults(res.results || []);
      setReportPath(res.report_path || "");
      setDocsDir(res.docs_dir || "");
      setDownloadedCount(res.downloaded_count ?? (res.results || []).filter((r) => r.downloaded_file).length);
      void refreshHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi gửi agent");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const pdfRows = results.filter((r) => r.pdf_name || r.downloaded_file);
  const sessionLabel = !health?.ok
    ? "Agent offline"
    : !session?.open
      ? "Chrome chưa mở"
      : session.logged_in
        ? "Đã login TCS"
        : "Cần login tay";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/30 p-3 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tcs-portal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[28px] border shadow-apple-md ${OPS.modal} ${OPS.border}`}>
        <div className={`flex items-start justify-between border-b px-5 py-4 ${OPS.border}`}>
          <div>
            <h2 id="tcs-portal-title" className={`text-[19px] font-semibold tracking-tight ${OPS.title}`}>
              Cổng TCS — tự động hóa
            </h2>
            <p className={`mt-1 text-xs leading-relaxed ${OPS.secondary}`}>
              1) Đăng nhập TCS → 2) Quét ESID → cập nhật trạng thái Ops → 3) PDF ESID hoặc In ESID.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-full p-2 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] ${OPS.muted}`}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="max-h-[min(70vh,560px)] space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span
              className={`rounded-md px-2 py-0.5 font-semibold ${
                health?.ok
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                  : "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
              }`}
            >
              Agent: {health?.ok ? `OK v${health.version || "?"}` : "Offline"}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 font-semibold ${
                session?.logged_in
                  ? "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              Session: {sessionLabel}
            </span>
            <button type="button" className={OPS.btnSmallAccent} onClick={() => void refreshHealth()}>
              Kiểm tra lại
            </button>
            <button
              type="button"
              className={OPS.btnSmallAccent}
              disabled={busy}
              onClick={() => void onOpenChrome()}
            >
              Mở Chrome TCS
            </button>
            <span className={OPS.muted}>{getTcsAgentBaseUrl()}</span>
          </div>
          {session?.message ? <p className={`text-[11px] ${OPS.muted}`}>{session.message}</p> : null}

          <ol className={`list-decimal space-y-0.5 pl-4 text-[11px] ${OPS.secondary}`}>
            <li>
              <span className="font-semibold">Đăng nhập:</span> Mở Chrome TCS (OCR/CAPTCHA nếu cần)
            </li>
            <li>
              <span className="font-semibold">Quét ESID:</span> kiểm tra tiếp nhận + ghi status lên bảng Ops
            </li>
            <li>
              <span className="font-semibold">PDF / In:</span> chỉ lô đã Hoàn thành tiếp nhận
            </li>
          </ol>

          <p className={`text-[12px] font-semibold ${OPS.title}`}>
            {eligible.length} AWB Ops trong phiên {sessionYmd}
            {readyItems.length ? ` · ${readyItems.length} lô sẵn sàng` : ""}
            {opsStatusUpdated ? ` · vừa cập nhật ${opsStatusUpdated} dòng` : ""}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onOpenChrome()}
              className="rounded-full border border-sky-600/40 bg-sky-50 px-4 py-2 text-[12px] font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-400/40 dark:bg-sky-950/40 dark:text-sky-100"
            >
              1. Đăng nhập TCS
            </button>
            <button
              type="button"
              disabled={busy || !eligible.length}
              onClick={() => void onScanEsid()}
              className="rounded-full bg-sky-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {busy && busyLabel.includes("quét") ? busyLabel : "2. Quét ESID"}
            </button>
            <button
              type="button"
              disabled={busy || !readyAwbSet.size}
              onClick={() => void onDownloadReady()}
              className="rounded-full bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy && busyLabel.includes("tải")
                ? busyLabel
                : `3. PDF ESID${readyAwbSet.size ? ` (${readyAwbSet.size})` : ""}`}
            </button>
            <button
              type="button"
              disabled={busy || !readyAwbSet.size}
              onClick={() => void onPrintReady()}
              className="rounded-full bg-violet-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy && busyLabel.includes("in")
                ? busyLabel
                : `In ESID${readyAwbSet.size ? ` (${readyAwbSet.size})` : ""}`}
            </button>
          </div>
          <label className={`flex items-center gap-2 text-[11px] ${OPS.secondary}`}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry-run in (bật = không gửi máy in thật)
          </label>

          {scanMessage ? (
            <p className="text-[12px] font-medium text-emerald-700 dark:text-emerald-300">{scanMessage}</p>
          ) : null}

          {readyItems.length > 0 ? (
            <div>
              <p className={`mb-1 text-[12px] font-semibold ${OPS.title}`}>
                Lô Hoàn thành tiếp nhận — đã đồng bộ Ops
              </p>
              <div className={OPS.tableWrap}>
                <div className="max-h-40 overflow-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className={OPS.tableHead}>
                      <tr>
                        <th className="px-2 py-1">AWB</th>
                        <th className="px-2 py-1">Trạng thái TCS</th>
                        <th className="px-2 py-1">Chuyến</th>
                        <th className="px-2 py-1">ESID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {readyItems.map((r) => (
                        <tr key={r.awb} className={OPS.tableRow}>
                          <td className={`px-2 py-1 font-mono ${OPS.tableCell}`}>{r.awb}</td>
                          <td className="px-2 py-1 text-emerald-700 dark:text-emerald-300">
                            {r.tcs_status || "Hoàn thành tiếp nhận"}
                          </td>
                          <td className="px-2 py-1">
                            {r.flight || "—"} {r.flight_date || ""}
                          </td>
                          <td className="px-2 py-1 font-mono">{r.esid_code || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}

          {scanItems.length > 0 && readyItems.length < scanItems.length ? (
            <details className="text-[11px]">
              <summary className={`cursor-pointer font-semibold ${OPS.secondary}`}>
                Các AWB chưa sẵn sàng ({scanItems.length - readyItems.length})
              </summary>
              <div className={`${OPS.tableWrap} mt-1`}>
                <div className="max-h-28 overflow-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className={OPS.tableHead}>
                      <tr>
                        <th className="px-2 py-1">AWB</th>
                        <th className="px-2 py-1">Status</th>
                        <th className="px-2 py-1">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanItems
                        .filter((r) => !r.ready)
                        .map((r) => (
                          <tr key={`ns-${r.awb}`} className={OPS.tableRow}>
                            <td className={`px-2 py-1 font-mono ${OPS.tableCell}`}>{r.awb}</td>
                            <td className="px-2 py-1">{r.tcs_status || r.normalized_status || "—"}</td>
                            <td className="px-2 py-1">{r.error || r.raw || "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          ) : null}

          {error ? <p className="text-[12px] font-medium text-red-600">{error}</p> : null}
          {reportPath ? (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Đã tải {downloadedCount} PDF
              {docsDir ? ` · ${docsDir}` : ""}
            </p>
          ) : null}

          {results.length > 0 ? (
            <div className={OPS.tableWrap}>
              <div className="max-h-48 overflow-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className={OPS.tableHead}>
                    <tr>
                      <th className="px-2 py-1">AWB</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const pdf = r.pdf_name || (r.downloaded_file ? r.downloaded_file.replace(/^.*[/\\]/, "") : "");
                      return (
                        <tr key={`${r.stt}-${r.awb}`} className={OPS.tableRow}>
                          <td className={`px-2 py-1 font-mono ${OPS.tableCell}`}>{r.awb}</td>
                          <td className="px-2 py-1">{r.normalized_status}</td>
                          <td className="px-2 py-1">
                            {pdf ? (
                              <button
                                type="button"
                                className="font-semibold text-sky-700 underline dark:text-sky-300"
                                onClick={() => downloadPdfFromAgent(pdf)}
                              >
                                Tải {pdf}
                              </button>
                            ) : (
                              <span className={OPS.muted}>
                                {r.error_message || r.tcs_status_raw || "—"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {pdfRows.length > 1 ? (
            <button
              type="button"
              className={OPS.btnSmallAccent}
              onClick={() => pdfRows.forEach((r) => downloadPdfFromAgent(r.pdf_name || r.downloaded_file || ""))}
            >
              Tải tất cả PDF ({pdfRows.length})
            </button>
          ) : null}

          <details
            open={showAdvanced}
            onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
          >
            <summary className={`cursor-pointer text-[12px] font-semibold ${OPS.secondary}`}>
              Tùy chọn nâng cao (mock / LOOKUP / REGISTER)
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className={`text-[12px] font-semibold ${OPS.secondary}`}>
                Tác vụ
                <select
                  className={`${OPS.input} mt-1 w-full`}
                  value={action}
                  onChange={(e) => setAction(e.target.value as TcsPortalAction)}
                >
                  <option value="DOWNLOAD">DOWNLOAD</option>
                  <option value="LOOKUP">LOOKUP</option>
                  <option value="PRINT">PRINT</option>
                  <option value="REGISTER">REGISTER</option>
                </select>
              </label>
              <div className={`flex flex-col justify-end gap-1.5 text-[12px] ${OPS.secondary}`}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} />
                  Mock TCS
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                  Dry-run in
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={onlyCompleted}
                    disabled={action === "REGISTER"}
                    onChange={(e) => setOnlyCompleted(e.target.checked)}
                  />
                  Chỉ lô Ops HOÀN THÀNH
                </label>
                {action === "REGISTER" ? (
                  <label className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200">
                    <input
                      type="checkbox"
                      checked={confirmRegister}
                      onChange={(e) => setConfirmRegister(e.target.checked)}
                    />
                    Xác nhận REGISTER cả lô
                  </label>
                ) : null}
              </div>
            </div>
            <div className="mt-2">
              <button
                type="button"
                disabled={busy || !eligible.length}
                onClick={() => void onSubmitAdvanced()}
                className={OPS.btnSmallAccent}
              >
                Gửi job nâng cao ({eligible.length} lô)
              </button>
            </div>
          </details>
        </div>

        <div className={`flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3 ${OPS.footer}`}>
          <button type="button" className={OPS.btnSmallAccent} onClick={onExportJson}>
            Tải job JSON
          </button>
          <button
            type="button"
            disabled={busy || !eligible.length}
            onClick={() => void onScanEsid()}
            className="rounded-full bg-sky-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? busyLabel || "Đang chạy…" : "Quét ESID"}
          </button>
          <button
            type="button"
            disabled={busy || !readyAwbSet.size}
            onClick={() => void onDownloadReady()}
            className="rounded-full bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            PDF ESID{readyAwbSet.size ? ` (${readyAwbSet.size})` : ""}
          </button>
          <button
            type="button"
            disabled={busy || !readyAwbSet.size}
            onClick={() => void onPrintReady()}
            className="rounded-full bg-violet-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            In ESID{readyAwbSet.size ? ` (${readyAwbSet.size})` : ""}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black/10 px-4 py-2 text-[12px] font-semibold dark:border-white/15"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
