import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
} from "react";
import {
  isSheetRowSelectable,
  type SheetBookSyncResult,
  type SheetBookSyncRow,
} from "../types/googleSheetBook";
import {
  applyBookGoogleSheetRows,
  fetchBookSheetConfig,
  syncBookGoogleSheet,
} from "../utils/googleSheetBookApi";
import { parseGoogleSheetLink } from "../utils/googleSheetUrl";
import {
  emptyWarehouseRecord,
  normalizeWarehouse,
  warehouseLabel,
  WAREHOUSE_ORDER,
} from "../constants/warehouses";
import type { Warehouse } from "../types/shipment";
import { useIsMobile } from "../hooks/useIsMobile";
import { MOBILE } from "../styles/mobileOpsStyles";
import { Banner, Button } from "../ui";

export type SheetImportAppliedMeta = {
  appliedByWarehouse: Partial<Record<Warehouse, number>>;
  preferredWarehouse: Warehouse | null;
  errorCount?: number;
  errors?: { awb: string; error: string }[];
};

type Props = {
  sessionYmd: string;
  open: boolean;
  /** Kho đang xem trên OPS — ưu tiên chọn / lọc dòng Sheet cùng kho. */
  activeWarehouse?: Warehouse;
  /** @deprecated Prefetch không còn dùng — bắt buộc URL mỗi lần. */
  sheetSyncPrefetchRef?: MutableRefObject<{
    sessionYmd: string;
    promise: Promise<SheetBookSyncResult>;
  } | null>;
  onClose: () => void;
  onApplied: (
    appliedCount: number,
    serverState?: unknown,
    meta?: SheetImportAppliedMeta,
  ) => void;
};

const SHEET_URL_STORAGE_KEY = "tecsops.sheetBookUrl";

type WarehouseFilter = Warehouse | "ALL";

function rowWarehouse(row: SheetBookSyncRow): Warehouse {
  return normalizeWarehouse(row.warehouse);
}

function countByWarehouse(
  rows: { warehouse?: string }[],
): Partial<Record<Warehouse, number>> {
  const out: Partial<Record<Warehouse, number>> = {};
  for (const r of rows) {
    const wh = normalizeWarehouse(r.warehouse);
    out[wh] = (out[wh] ?? 0) + 1;
  }
  return out;
}

function preferredWarehouseFromCounts(
  counts: Partial<Record<Warehouse, number>>,
  active: Warehouse,
): Warehouse | null {
  const activeCount = counts[active] ?? 0;
  if (activeCount > 0) return active;
  let best: Warehouse | null = null;
  let bestN = 0;
  for (const wh of WAREHOUSE_ORDER) {
    const n = counts[wh] ?? 0;
    if (n > bestN) {
      best = wh;
      bestN = n;
    }
  }
  return best;
}

export function GoogleSheetImportModal({
  sessionYmd,
  open,
  activeWarehouse = "TECS-TCS",
  sheetSyncPrefetchRef,
  onClose,
  onApplied,
}: Props) {
  const isMobile = useIsMobile();
  const [sheetUrl, setSheetUrl] = useState(() => {
    try {
      return localStorage.getItem(SHEET_URL_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [sync, setSync] = useState<SheetBookSyncResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [applyErrors, setApplyErrors] = useState<
    { awb: string; error: string }[]
  >([]);
  const [showErrors, setShowErrors] = useState(false);
  const [warehouseFilter, setWarehouseFilter] =
    useState<WarehouseFilter>("ALL");

  /** Luôn chọn mọi dòng nhập được (cả TCS + SCSC) — không giới hạn theo chip lọc xem. */
  const selectAllImportable = useCallback((result: SheetBookSyncResult) => {
    const next = new Set<number>();
    for (const row of result.rows) {
      if (isSheetRowSelectable(row)) next.add(row.index);
    }
    return next;
  }, []);

  const selectImportableInFilter = useCallback(
    (result: SheetBookSyncResult, filter: WarehouseFilter) => {
      if (filter === "ALL") return selectAllImportable(result);
      const next = new Set<number>();
      for (const row of result.rows) {
        if (!isSheetRowSelectable(row)) continue;
        if (rowWarehouse(row) !== filter) continue;
        next.add(row.index);
      }
      return next;
    },
    [selectAllImportable],
  );

  const fetchAndSelect = useCallback(
    async (refresh: boolean) => {
      if (loading || applying) return;
      const parsed = parseGoogleSheetLink(sheetUrl);
      if (!parsed.ok) {
        setError(parsed.error);
        setSync(null);
        return;
      }
      try {
        localStorage.setItem(SHEET_URL_STORAGE_KEY, sheetUrl.trim());
      } catch {
        /* ignore */
      }
      if (sheetSyncPrefetchRef) sheetSyncPrefetchRef.current = null;
      setLoading(true);
      setError(null);
      setApplyErrors([]);
      setShowErrors(false);
      try {
        const result = await syncBookGoogleSheet(sessionYmd, {
          spreadsheetId: parsed.spreadsheetId,
          sheetGid: parsed.sheetGid,
          refresh,
        });
        // Chuẩn hóa URL theo tab đã resolve (bỏ gid tab ngày khác lưu trong localStorage).
        if (result.spreadsheetId) {
          const resolvedGid = String(result.sheetGid || "").trim();
          const cleanUrl = resolvedGid
            ? `https://docs.google.com/spreadsheets/d/${result.spreadsheetId}/edit?gid=${resolvedGid}#gid=${resolvedGid}`
            : `https://docs.google.com/spreadsheets/d/${result.spreadsheetId}/edit`;
          setSheetUrl(cleanUrl);
          try {
            localStorage.setItem(SHEET_URL_STORAGE_KEY, cleanUrl);
          } catch {
            /* ignore */
          }
        }
        setSync(result);
        setSelected(selectAllImportable(result));
      } catch (e) {
        setSync(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [sessionYmd, sheetUrl, sheetSyncPrefetchRef, selectAllImportable, loading, applying],
  );

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setSync(null);
      setError(null);
      setApplyErrors([]);
      setShowErrors(false);
      setSelected(new Set());
      return;
    }
    setWarehouseFilter("ALL");
  }, [open, sessionYmd]);

  useEffect(() => {
    if (!open || sheetUrl.trim()) return;
    void fetchBookSheetConfig()
      .then((cfg) => {
        setSheetUrl((prev) => prev.trim() || cfg.shareUrl || "");
      })
      .catch(() => {
        /* user tự dán URL */
      });
  }, [open, sheetUrl]);

  const applyWarehouseFilter = (next: WarehouseFilter) => {
    setWarehouseFilter(next);
    // Chỉ lọc danh sách xem — giữ nguyên selection (tránh bỏ sót SCSC khi đang xem TCS).
  };

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const visibleRows = useMemo(() => {
    const rows = sync?.rows ?? [];
    if (warehouseFilter === "ALL") return rows;
    return rows.filter((r) => rowWarehouse(r) === warehouseFilter);
  }, [sync, warehouseFilter]);

  const warehouseCounts = useMemo(() => {
    const rows = sync?.rows ?? [];
    const total = emptyWarehouseRecord(() => 0);
    const selectable = emptyWarehouseRecord(() => 0);
    for (const r of rows) {
      const wh = rowWarehouse(r);
      total[wh] += 1;
      if (isSheetRowSelectable(r)) selectable[wh] += 1;
    }
    return { total, selectable };
  }, [sync]);

  const selectedBreakdown = useMemo(() => {
    const out = emptyWarehouseRecord(() => 0);
    if (!sync) return out;
    for (const row of sync.rows) {
      if (!selected.has(row.index)) continue;
      out[rowWarehouse(row)] += 1;
    }
    return out;
  }, [sync, selected]);

  const selectedOutsideFilter =
    warehouseFilter !== "ALL" &&
    WAREHOUSE_ORDER.some(
      (wh) => wh !== warehouseFilter && selectedBreakdown[wh] > 0,
    );

  const onApply = async () => {
    if (!sync || selected.size === 0 || applying || loading) return;
    setApplying(true);
    setError(null);
    setApplyErrors([]);
    try {
      const result = await applyBookGoogleSheetRows(
        sync.sessionDate,
        [...selected],
        sync.sheetTab,
        sync.spreadsheetId,
        sync.sheetGid
      );
      const touched = [...(result.applied ?? []), ...(result.updated ?? [])];
      const appliedByWarehouse = countByWarehouse(touched);
      const preferred =
        preferredWarehouseFromCounts(appliedByWarehouse, activeWarehouse) ??
        activeWarehouse;
      const errs = result.errors ?? [];
      onApplied(
        result.appliedCount + (result.updatedCount ?? 0),
        result.state,
        {
          appliedByWarehouse,
          preferredWarehouse: preferred,
          errorCount: result.errorCount,
          errors: errs,
        },
      );
      if (result.errorCount > 0) {
        setApplyErrors(errs);
        setShowErrors(true);
        setError(
          `Nhập một phần: ${result.appliedCount} mới · ${result.updatedCount ?? 0} cập nhật · ${result.errorCount} lỗi.`,
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
    ? `${MOBILE.sheet} flex max-h-[92vh] w-full flex-col overflow-hidden border-t bg-white shadow-[0_-12px_48px_rgba(0,0,0,0.2)]`
    : "flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl";

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
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2
              id="sheet-import-title"
              className="text-base font-semibold text-zinc-900"
            >
              Nhập từ Google Sheet
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              BOOK HẰNG NGÀY · tab{""}
              <span className="font-mono text-zinc-700">
                {sync?.sheetTab ?? "…"}
              </span>{" "}
              · chỉ lô ngày{""}
              <span className="font-semibold text-zinc-700">
                {sync?.sessionFlightDate ?? "…"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            Đóng
          </button>
        </header>

        <div className="space-y-2 border-b border-ui-border px-4 py-2">
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-semibold text-ui-text-muted">
              URL Google Sheet (bắt buộc mỗi lần)
            </span>
            <input
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              disabled={loading || applying}
              className="w-full rounded-lg border border-ui-border bg-ui-surface px-2.5 py-2 text-xs outline-none focus:border-ui-primary/50 focus:ring-2 focus:ring-ui-focus disabled:opacity-50"
            />
            <p className="mt-1 text-[10px] leading-snug text-ui-text-muted">
              Dán link tab đang mở trên Google (có gid) hoặc link file. Share «Anyone with the link
              can view». Bấm «Tải dòng» sau khi dán.
            </p>
          </label>
          <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={loading || applying || !sheetUrl.trim()}
            onClick={() => void fetchAndSelect(Boolean(sync))}
          >
            {loading ? "Đang kéo Sheet…" : sync ? "Kéo Sheet lại" : "Tải dòng"}
          </Button>
          <div
            className="flex flex-wrap gap-1"
            role="tablist"
            aria-label="Lọc kho Sheet"
          >
            {(
              [
                ["ALL", "Tất cả"],
                ...WAREHOUSE_ORDER.map(
                  (wh) => [wh, warehouseLabel[wh]] as const,
                ),
              ] as const
            ).map(([id, label]) => {
              const active = warehouseFilter === id;
              const count =
                id === "ALL"
                  ? (sync?.total ?? 0)
                  : (warehouseCounts.total[id as Warehouse] ?? 0);
              const canPick =
                id === "ALL"
                  ? (sync?.importable ?? 0)
                  : (warehouseCounts.selectable[id as Warehouse] ?? 0);
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => applyWarehouseFilter(id)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                    active
                      ? "bg-dashboard-primary text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {label} · {count}
                  {canPick > 0 && !active ? (
                    <span className="ml-1 text-emerald-700">+{canPick}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {sync && (
            <span className="text-xs leading-snug text-zinc-500">
              {sync.total} lô · {sync.newCount ?? 0} mới
              {(sync.updateCount ?? 0) > 0
                ? ` · ${sync.updateCount} cập nhật`
                : ""}
              {(sync.sheetDuplicateCount ?? 0) > 0
                ? ` · ${sync.sheetDuplicateCount} trùng Sheet`
                : ""}
              {(sync.awbTakenCount ?? 0) > 0
                ? ` · ${sync.awbTakenCount} AWB đã có`
                : ""}
              {sync.skippedByDate > 0
                ? ` · bỏ ${sync.skippedByDate} ngày khác`
                : ""}
            </span>
          )}
          {sync?.sheetTabMismatch ? (
            <p className="w-full text-[10px] font-medium text-amber-800">
              Tab Sheet «{sync.sheetTab}» khác ngày phiên Ops
              {sync.expectedSheetTab ? ` (kỳ vọng «${sync.expectedSheetTab}»)` : ""}. Lô vẫn nhập vào
              phiên {sync.sessionDate}.
            </p>
          ) : null}
          </div>
        </div>

        {error ? (
          <div className="mx-4 mt-3">
            <Banner
              tone={applyErrors.length > 0 ? "warning" : "danger"}
              title={applyErrors.length > 0 ? "Nhập một phần" : "Lỗi"}
              action={
                applyErrors.length > 0 ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold underline"
                    onClick={() => setShowErrors((v) => !v)}
                  >
                    {showErrors ? "Ẩn lỗi" : "Xem lỗi"}
                  </button>
                ) : undefined
              }
            >
              {error}
            </Banner>
            {showErrors && applyErrors.length > 0 ? (
              <ul className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-ui-border bg-ui-surface px-2 py-1.5 text-[11px] text-ui-text">
                {applyErrors.map((e, i) => (
                  <li key={`${e.awb}-${i}`} className="py-0.5">
                    <span className="font-mono font-semibold">{e.awb}</span>
                    {" — "}
                    {e.error}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2 sm:px-2">
          {loading && !sync ? (
            <p className="p-4 text-sm text-zinc-500">
              Đang kéo dữ liệu từ Google Sheet…
            </p>
          ) : null}
          {!sync && !loading && !error && (
            <p className="p-4 text-sm text-zinc-500">
              Dán URL Sheet rồi bấm «Tải dòng».
            </p>
          )}
          {sync && visibleRows.length === 0 && (
            <p className="p-4 text-sm text-zinc-500">
              {warehouseFilter === "ALL"
                ? "Tab Sheet không có lô AWB hợp lệ cho ngày này."
                : `Không có lô ${warehouseLabel[warehouseFilter]} trên Sheet ngày này.`}
            </p>
          )}
          {sync && visibleRows.length > 0 && isMobile ? (
            <ul className="space-y-2 px-1 pb-2">
              {visibleRows.map((row) => (
                <SheetRowCard
                  key={`${row.index}-${row.awb}`}
                  row={row}
                  checked={selected.has(row.index)}
                  onToggle={toggle}
                />
              ))}
            </ul>
          ) : null}
          {sync && visibleRows.length > 0 && !isMobile ? (
            <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
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
                {visibleRows.map((row) => (
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

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {selected.size > 0 ? (
            <span className="mr-auto text-[10px] text-zinc-500">
              Chọn {selected.size} lô
              {WAREHOUSE_ORDER.filter((wh) => selectedBreakdown[wh] > 0)
                .map(
                  (wh) => ` · ${warehouseLabel[wh]} ${selectedBreakdown[wh]}`,
                )
                .join("")}
              {selectedOutsideFilter ? " (có lô kho khác đang ẩn)" : ""}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (!sync) return;
              setSelected(selectImportableInFilter(sync, warehouseFilter));
            }}
            className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Chọn tất cả mới
            {warehouseFilter !== "ALL"
              ? ` · ${warehouseLabel[warehouseFilter]}`
              : ""}
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
  if (row.syncStatus === "duplicate")
    return { text: "Đã khớp", cls: "text-zinc-500" };
  if (row.syncStatus === "sheet_duplicate") {
    return { text: "Trùng Sheet", cls: "text-red-700" };
  }
  if (row.syncStatus === "awb_taken") {
    return { text: "AWB đã có", cls: "text-red-700" };
  }
  if (row.syncStatus === "update")
    return { text: "Cập nhật", cls: "text-amber-700" };
  return { text: "Mới", cls: "text-emerald-700" };
}

function rowBlockHint(row: SheetBookSyncRow): string | null {
  if (
    row.syncStatus === "sheet_duplicate" &&
    row.sheetDuplicateOfIndex != null
  ) {
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
  const wh = rowWarehouse(row);
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
            ? "border-zinc-200/80 bg-zinc-50 opacity-60"
            : checked
              ? "border-emerald-400/60 bg-emerald-50/90 ring-1 ring-emerald-400/30"
              : "border-black/[0.08] bg-white"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
              checked && !disabled
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-zinc-300 bg-white"
            }`}
            aria-hidden
          >
            {checked && !disabled ? "✓" : ""}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <span className="font-mono text-sm font-bold text-zinc-900">
                {row.awb}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase ${status.cls}`}
              >
                {status.text}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-600">
              {row.flight}
              {row.flightDate ? ` / ${row.flightDate}` : ""} · {row.dest} ·{" "}
              {whLabel}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
              {row.pcs != null || row.kg != null
                ? `${row.pcs ?? "—"} kiện / ${row.kg ?? "—"} kg`
                : "— kiện/kg"}
              {row.customer ? ` · ${row.customer}` : ""}
              {!row.customerKnown && row.customer ? (
                <span className="ml-1 text-amber-600" title="Chưa khớp danh bạ">
                  ?
                </span>
              ) : null}
            </p>
            {row.needsUpdate &&
            row.existingWarehouse &&
            row.existingWarehouse !== row.warehouse ? (
              <p className="mt-1 text-[10px] text-amber-700">
                Web đang {row.existingWarehouse} → Sheet {whLabel}
              </p>
            ) : null}
            {blockHint ? (
              <p className="mt-1 text-[10px] text-red-700">{blockHint}</p>
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
  const wh = rowWarehouse(row);
  const whLabel = warehouseLabel[wh] ?? row.warehouse;
  const disabled = !isSheetRowSelectable(row);
  const blockHint = rowBlockHint(row);
  return (
    <tr className={`border-b border-zinc-100 ${disabled ? "opacity-50" : ""}`}>
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
        {row.needsUpdate &&
        row.existingWarehouse &&
        row.existingWarehouse !== row.warehouse ? (
          <span
            className="ml-1 text-amber-700"
            title={`Trên web: ${row.existingWarehouse}`}
          >
            ← {row.existingWarehouse}
          </span>
        ) : null}
      </td>
      <td className="p-2">
        {row.pcs != null || row.kg != null
          ? `${row.pcs ?? "—"} / ${row.kg ?? "—"}`
          : "—"}
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
