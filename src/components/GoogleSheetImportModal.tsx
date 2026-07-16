import { useCallback, useEffect, useMemo, useState } from "react";
import { isSheetRowSelectable, type SheetBookSyncResult, type SheetBookSyncRow } from "../types/googleSheetBook";
import { applyBookGoogleSheetRows, syncBookGoogleSheet } from "../utils/googleSheetBookApi";
import { warehouseLabel } from "../constants/warehouses";
import type { Warehouse } from "../types/shipment";
import { useIsMobile } from "../hooks/useIsMobile";
import { MOBILE } from "../styles/mobileOpsStyles";

type Props = {
  sessionYmd: string;
  open: boolean;
  onClose: () => void;
  onApplied: (appliedCount: number, serverState?: unknown) => void;
};

export function GoogleSheetImportModal({ sessionYmd, open, onClose, onApplied }: Props) {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [sync, setSync] = useState<SheetBookSyncResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const runSync = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await syncBookGoogleSheet(sessionYmd, { refresh });
      setSync(result);
      const next = new Set<number>();
      for (const row of result.rows) {
        if (isSheetRowSelectable(row)) next.add(row.index);
      }
      setSelected(next);
    } catch (e) {
      setSync(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionYmd]);

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setSync(null);
      setError(null);
      setSelected(new Set());
      return;
    }
    void runSync();
  }, [open, runSync]);

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectableRows = useMemo(
    () => (sync?.rows ?? []).filter(isSheetRowSelectable),
    [sync]
  );

  const onApply = async () => {
    if (!sync || selected.size === 0) return;
    setApplying(true);
    setError(null);
    try {
      const result = await applyBookGoogleSheetRows(
        sync.sessionDate,
        [...selected],
        sync.sheetTab,
        sync.spreadsheetId
      );
      onApplied(result.appliedCount + (result.updatedCount ?? 0), result.state);
      if (result.errorCount > 0) {
        setError(
          `Đã nhập ${result.appliedCount} · cập nhật ${result.updatedCount ?? 0} lô. ${result.errorCount} lỗi: ${result.errors.map((x) => x.awb).join(", ")}`
        );
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  const shellClass = isMobile
    ? `${MOBILE.sheet} flex max-h-[92vh] w-full flex-col overflow-hidden border-t bg-white shadow-[0_-12px_48px_rgba(0,0,0,0.2)] dark:border-white/10 dark:bg-ops-surface`
    : "flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900";

  return (
    <div
      className={`fixed inset-0 z-[480] flex bg-black/40 p-0 ${isMobile ? "flex-col justify-end" : "items-end justify-center sm:items-center sm:p-4"}`}
      onClick={onClose}
    >
      <div
        className={shellClass}
        role="dialog"
        aria-labelledby="sheet-import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="min-w-0 flex-1">
            <h2 id="sheet-import-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Nhập từ Google Sheet
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              BOOK HẰNG NGÀY · tab{" "}
              <span className="font-mono text-zinc-700 dark:text-zinc-300">{sync?.sheetTab ?? "…"}</span> ·
              chỉ lô ngày{" "}
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                {sync?.sessionFlightDate ?? "…"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Đóng
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
          <button
            type="button"
            disabled={loading}
            onClick={() => void runSync(true)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Đang kéo Sheet…" : "Kéo Sheet lại"}
          </button>
          {sync && (
            <span className="text-xs leading-snug text-zinc-500">
              {sync.total} lô · {sync.newCount ?? 0} mới
              {(sync.updateCount ?? 0) > 0 ? ` · ${sync.updateCount} cập nhật` : ""}
              {(sync.sheetDuplicateCount ?? 0) > 0
                ? ` · ${sync.sheetDuplicateCount} trùng Sheet`
                : ""}
              {(sync.awbTakenCount ?? 0) > 0 ? ` · ${sync.awbTakenCount} AWB đã có` : ""}
              {sync.skippedByDate > 0 ? ` · bỏ ${sync.skippedByDate} ngày khác` : ""}
            </span>
          )}
        </div>

        {error && (
          <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2 sm:px-2">
          {loading && !sync ? (
            <p className="p-4 text-sm text-zinc-500">Đang kéo dữ liệu từ Google Sheet…</p>
          ) : null}
          {!sync && !loading && !error && (
            <p className="p-4 text-sm text-zinc-500">Chưa có dữ liệu — bấm «Kéo Sheet lại».</p>
          )}
          {sync && sync.rows.length === 0 && (
            <p className="p-4 text-sm text-zinc-500">Tab Sheet không có lô AWB hợp lệ cho ngày này.</p>
          )}
          {sync && sync.rows.length > 0 && isMobile ? (
            <ul className="space-y-2 px-1 pb-2">
              {sync.rows.map((row) => (
                <SheetRowCard
                  key={`${row.index}-${row.awb}`}
                  row={row}
                  checked={selected.has(row.index)}
                  onToggle={toggle}
                />
              ))}
            </ul>
          ) : null}
          {sync && sync.rows.length > 0 && !isMobile ? (
            <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-700">
                  <th className="w-8 p-2" />
                  <th className="p-2">AWB</th>
                  <th className="p-2">Chuyến</th>
                  <th className="p-2">DEST</th>
                  <th className="p-2">Kho</th>
                  <th className="p-2">Kiện/Kg</th>
                  <th className="p-2">Khách</th>
                  <th className="p-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {sync.rows.map((row) => (
                  <SheetRowTable
                    key={`${row.index}-${row.awb}`}
                    row={row}
                    checked={selected.has(row.index)}
                    onToggle={toggle}
                  />
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setSelected(new Set(selectableRows.map((r) => r.index)))}
            className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Chọn tất cả mới
          </button>
          <button
            type="button"
            disabled={applying || selected.size === 0}
            onClick={() => void onApply()}
            className={`rounded-lg bg-apple-blue px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 ${isMobile ? "min-h-11 flex-1 sm:flex-none" : ""}`}
          >
            {applying ? "Đang nhập…" : `Nhập / cập nhật ${selected.size} lô`}
          </button>
        </footer>
      </div>
    </div>
  );
}

function syncStatusLabel(row: SheetBookSyncRow) {
  if (row.syncStatus === "duplicate") return { text: "Đã khớp", cls: "text-zinc-500" };
  if (row.syncStatus === "sheet_duplicate") {
    return { text: "Trùng Sheet", cls: "text-red-700 dark:text-red-300" };
  }
  if (row.syncStatus === "awb_taken") {
    return { text: "AWB đã có", cls: "text-red-700 dark:text-red-300" };
  }
  if (row.syncStatus === "update") return { text: "Cập nhật", cls: "text-amber-700 dark:text-amber-300" };
  return { text: "Mới", cls: "text-emerald-700 dark:text-emerald-300" };
}

function rowBlockHint(row: SheetBookSyncRow): string | null {
  if (row.syncStatus === "sheet_duplicate" && row.sheetDuplicateOfIndex != null) {
    return `AWB trùng dòng Sheet #${row.sheetDuplicateOfIndex + 1} — chỉ giữ dòng đầu`;
  }
  if (row.syncStatus === "awb_taken") {
    return `AWB đã có phiên ${row.takenSessionDate ?? "khác"} — không thêm mới`;
  }
  return null;
}

function SheetRowCard({
  row,
  checked,
  onToggle,
}: {
  row: SheetBookSyncRow;
  checked: boolean;
  onToggle: (index: number) => void;
}) {
  const wh = row.warehouse as Warehouse;
  const whLabel = warehouseLabel[wh] ?? row.warehouse;
  const disabled = !isSheetRowSelectable(row);
  const status = syncStatusLabel(row);
  const blockHint = rowBlockHint(row);

  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onToggle(row.index)}
        className={`w-full rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
          disabled
            ? "border-zinc-200/80 bg-zinc-50 opacity-60 dark:border-zinc-700 dark:bg-zinc-900/50"
            : checked
              ? "border-emerald-400/60 bg-emerald-50/90 ring-1 ring-emerald-400/30 dark:border-emerald-500/40 dark:bg-emerald-500/10"
              : "border-black/[0.08] bg-white dark:border-white/10 dark:bg-ops-elevated"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
              checked && !disabled
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800"
            }`}
            aria-hidden
          >
            {checked && !disabled ? "✓" : ""}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{row.awb}</span>
              <span className={`text-[10px] font-semibold uppercase ${status.cls}`}>{status.text}</span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
              {row.flight}
              {row.flightDate ? ` / ${row.flightDate}` : ""} · {row.dest} · {whLabel}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
              {row.pcs != null || row.kg != null ? `${row.pcs ?? "—"} kiện / ${row.kg ?? "—"} kg` : "— kiện/kg"}
              {row.customer ? ` · ${row.customer}` : ""}
              {!row.customerKnown && row.customer ? (
                <span className="ml-1 text-amber-600" title="Chưa khớp danh bạ">
                  ?
                </span>
              ) : null}
            </p>
            {row.needsUpdate && row.existingWarehouse && row.existingWarehouse !== row.warehouse ? (
              <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                Web đang {row.existingWarehouse} → Sheet {whLabel}
              </p>
            ) : null}
            {blockHint ? (
              <p className="mt-1 text-[10px] text-red-700 dark:text-red-300">{blockHint}</p>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

function SheetRowTable({
  row,
  checked,
  onToggle,
}: {
  row: SheetBookSyncRow;
  checked: boolean;
  onToggle: (index: number) => void;
}) {
  const wh = row.warehouse as Warehouse;
  const whLabel = warehouseLabel[wh] ?? row.warehouse;
  const disabled = !isSheetRowSelectable(row);
  const blockHint = rowBlockHint(row);
  return (
    <tr
      className={`border-b border-zinc-100 dark:border-zinc-800 ${disabled ? "opacity-50" : ""}`}
    >
      <td className="p-2 text-center">
        <input
          type="checkbox"
          disabled={disabled}
          checked={checked}
          onChange={() => onToggle(row.index)}
          aria-label={`Chọn ${row.awb}`}
        />
      </td>
      <td className="p-2 font-mono">{row.awb}</td>
      <td className="p-2">
        {row.flight}
        {row.flightDate ? `/${row.flightDate}` : ""}
      </td>
      <td className="p-2">{row.dest}</td>
      <td className="p-2">
        {whLabel}
        {row.needsUpdate && row.existingWarehouse && row.existingWarehouse !== row.warehouse ? (
          <span className="ml-1 text-amber-700" title={`Trên web: ${row.existingWarehouse}`}>
            ← {row.existingWarehouse}
          </span>
        ) : null}
      </td>
      <td className="p-2">
        {row.pcs != null || row.kg != null ? `${row.pcs ?? "—"} / ${row.kg ?? "—"}` : "—"}
      </td>
      <td className="p-2 max-w-[120px] truncate" title={row.customer}>
        {row.customer}
        {!row.customerKnown && row.customer ? (
          <span className="ml-1 text-amber-600" title="Chưa khớp danh bạ">
            ?
          </span>
        ) : null}
      </td>
      <td className="p-2">
        {row.syncStatus === "duplicate" ? (
          <span className="text-zinc-500">Đã khớp</span>
        ) : row.syncStatus === "sheet_duplicate" ? (
          <span className="text-red-700" title={blockHint ?? undefined}>
            Trùng Sheet
          </span>
        ) : row.syncStatus === "awb_taken" ? (
          <span className="text-red-700" title={blockHint ?? undefined}>
            AWB đã có
          </span>
        ) : row.syncStatus === "update" ? (
          <span className="text-amber-700">Cập nhật</span>
        ) : (
          <span className="text-emerald-700">Mới</span>
        )}
      </td>
    </tr>
  );
}
