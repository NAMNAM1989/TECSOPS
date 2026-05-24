import { useEffect, useState } from "react";
import {
  fetchUnmatchedCustomerReport,
  type UnmatchedCustomerReport,
  type UnmatchedCustomerRow,
} from "../utils/fetchAppStateRows";
import { CD } from "./customerDirectory/customerDirectoryStyles";

type Props = {
  open: boolean;
  onClose: () => void;
  onApplySuggestions: (rows: UnmatchedCustomerRow[]) => Promise<{ updated: number; failed: number }>;
};

export function UnmatchedCustomerReportModal({ open, onClose, onApplySuggestions }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState<UnmatchedCustomerReport | null>(null);

  useEffect(() => {
    if (!open) return;
    void reloadReport();
  }, [open]);

  async function reloadReport() {
    setLoading(true);
    return fetchUnmatchedCustomerReport()
      .then((r) => setReport(r))
      .finally(() => setLoading(false));
  }

  async function applyAllSuggestions() {
    if (!report) return;
    const rows = report.rows.filter((r) => r.suggestedCustomerId);
    if (rows.length === 0) {
      window.alert("Không có dòng nào có gợi ý để áp dụng.");
      return;
    }
    if (!window.confirm(`Áp dụng gợi ý customer_id cho ${rows.length} dòng?`)) return;
    setApplying(true);
    try {
      const result = await onApplySuggestions(rows);
      window.alert(`Đã cập nhật ${result.updated} dòng. Thất bại: ${result.failed}.`);
      await reloadReport();
    } finally {
      setApplying(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/25 p-3 backdrop-blur-xl sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[24px] border shadow-apple-md ${CD.modal} ${CD.border}`}>
        <div className={`flex items-center justify-between border-b px-5 py-4 ${CD.border}`}>
          <div>
            <h3 className={`text-[19px] font-semibold tracking-tight ${CD.title}`}>
              Báo cáo shipment chưa map customer_id
            </h3>
            <p className={`text-xs ${CD.secondary}`}>
              Đối soát trực tiếp trong app, không cần mở file CSV.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-full p-2 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] ${CD.muted}`}
            aria-label="Đóng"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {loading ? (
            <p className={`text-sm ${CD.secondary}`}>Đang tải báo cáo...</p>
          ) : report ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-sm ${CD.secondary}`}>
                  Tổng lô: <span className={`font-semibold ${CD.title}`}>{report.totalRows}</span> ·
                  Chưa map: <span className="font-semibold text-red-600 dark:text-red-300"> {report.unmatchedCount}</span>
                </p>
                <button
                  type="button"
                  disabled={applying}
                  onClick={() => void applyAllSuggestions()}
                  className="rounded-full bg-apple-blue px-4 py-1.5 text-xs font-semibold text-white disabled:cursor-wait disabled:bg-apple-tertiary"
                >
                  {applying ? "Đang áp dụng..." : "Áp dụng gợi ý match"}
                </button>
              </div>
              <div className={`max-h-[58vh] overflow-auto rounded-2xl ${CD.tableWrap}`}>
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-apple-bg/95 dark:bg-black/40">
                    <tr className={`border-b text-left ${CD.tableHead}`}>
                      <th className="px-2 py-2">AWB</th>
                      <th className="px-2 py-2">Ngày/Kho</th>
                      <th className="px-2 py-2">Khách trên lô</th>
                      <th className="px-2 py-2">Gợi ý match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td className="px-2 py-4 text-center text-emerald-700 dark:text-emerald-300" colSpan={4}>
                          Không còn shipment nào bị unmatched.
                        </td>
                      </tr>
                    ) : (
                      report.rows.map((r) => (
                        <tr key={r.id} className={CD.tableRow}>
                          <td className={`px-2 py-2 font-mono ${CD.tableCell}`}>{r.awb}</td>
                          <td className={`px-2 py-2 ${CD.secondary}`}>
                            {r.sessionDate} · {r.warehouse}
                          </td>
                          <td className="px-2 py-2">
                            <div className={`font-semibold ${CD.tableCell}`}>{r.customer || "—"}</div>
                            <div className={`font-mono text-[11px] ${CD.muted}`}>
                              code: {r.customerCode || "—"}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            {r.suggestedCustomerId ? (
                              <>
                                <div className={`font-semibold ${CD.tableCell}`}>
                                  {r.suggestedCustomerCode} · {r.suggestedCustomerName}
                                </div>
                                <div className={`font-mono text-[11px] ${CD.muted}`}>
                                  id: {r.suggestedCustomerId}
                                </div>
                              </>
                            ) : (
                              <span className="text-red-600 dark:text-red-300">Không có gợi ý tự động</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-red-600 dark:text-red-300">Không tải được báo cáo unmatched.</p>
          )}
        </div>
      </div>
    </div>
  );
}
