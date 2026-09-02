import { useEffect, useMemo, useRef, useState } from "react";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import {
  buildFlightLabelMapForEditor,
  clampAirlineLabelOverrides,
  overridesFromEffectiveMaps,
} from "../utils/airlineLabelOverridesCore";
import { DEFAULT_AIRLINE_BY_FLIGHT_PREFIX } from "../constants/airlineLabelDefaults";
import { OPS } from "../styles/opsModalStyles";
import { Button, SyncStatusPill, Wordmark, useToast } from "../ui";
import type { SyncStatus } from "../hooks/useShipmentSync";

type EditableRow = { id: string; key: string; name: string };

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
}

function recordToFlightRows(rec: Record<string, string>): EditableRow[] {
  return Object.entries(rec)
    .map(([key, name]) => ({ id: `flt:${key}`, key, name }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function rowsToEffectiveFlight(rows: EditableRow[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3);
    if (k.length < 2) continue;
    const n = r.name.replace(/\s+/g, " ").trim();
    if (!n) continue;
    o[k] = n.slice(0, 80);
  }
  return o;
}

type Props = {
  value: AirlineLabelOverrides | undefined;
  flightSamples?: readonly string[];
  ready: boolean;
  syncStatus: SyncStatus;
  socketConnected: boolean;
  onSave: (next: AirlineLabelOverrides) => Promise<void>;
  onBack: () => void;
};

/** Trang cấu hình tên hãng in tem — nav `#/airlines`. */
export function AirlinesLabelsPage({
  value,
  flightSamples = [],
  ready,
  syncStatus,
  socketConnected,
  onSave,
  onBack,
}: Props) {
  const toast = useToast();
  const [flightRows, setFlightRows] = useState<EditableRow[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const preservedAwbRef = useRef<Record<string, string>>({});
  const hydrated = useRef(false);
  const addKeyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ready || hydrated.current) return;
    const clamped = clampAirlineLabelOverrides(value ?? {});
    preservedAwbRef.current = { ...clamped.byAwbPrefix };
    setFlightRows(recordToFlightRows(buildFlightLabelMapForEditor(value, flightSamples)));
    hydrated.current = true;
  }, [ready, value, flightSamples]);

  const defaultFltCount = Object.keys(DEFAULT_AIRLINE_BY_FLIGHT_PREFIX).length;

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return flightRows.map((row, idx) => ({ row, idx }));
    return flightRows
      .map((row, idx) => ({ row, idx }))
      .filter(
        ({ row }) =>
          row.key.toLowerCase().includes(needle) ||
          row.name.toLowerCase().includes(needle),
      );
  }, [flightRows, query]);

  const buildPayload = (): AirlineLabelOverrides => {
    const fromFlightUi = overridesFromEffectiveMaps({}, rowsToEffectiveFlight(flightRows));
    return clampAirlineLabelOverrides({
      byAwbPrefix: preservedAwbRef.current,
      byFlightPrefix: fromFlightUi.byFlightPrefix,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(buildPayload());
      toast.success("Đã lưu tên hãng trên tem", "Tên hãng");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được.", "Tên hãng");
    } finally {
      setSaving(false);
    }
  };

  const resetToFactoryDefaults = () => {
    preservedAwbRef.current = {};
    setFlightRows(recordToFlightRows({ ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX }));
    setQuery("");
  };

  const addPrefixRow = () => {
    setQuery("");
    setFlightRows((r) => [...r, { id: `new:${newId()}`, key: "", name: "" }]);
    queueMicrotask(() => addKeyRef.current?.focus());
  };

  const patchRow = (idx: number, patch: Partial<EditableRow>) => {
    setFlightRows((rows) => rows.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };

  const removeRow = (idx: number) => {
    setFlightRows((rows) => rows.filter((_, i) => i !== idx));
  };

  return (
    <div
      className="mx-auto min-h-screen max-w-3xl px-3 py-3 sm:px-5 sm:py-5"
      data-testid="airlines-labels-page"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-ui-border pb-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Wordmark size="sm" />
            <span className="text-sm font-semibold text-ui-text-muted">· Tên hãng</span>
          </div>
          <h1 className="m-0 text-lg font-bold tracking-tight text-ui-text">
            Tên hãng trên tem
          </h1>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-ui-text-muted">
            Prefix từ cột chuyến (vd. TR305 → TR). Sửa tên rồi Lưu — tem in sẽ dùng đúng tên đó.
            Có {defaultFltCount} prefix mặc định, các prefix đang có trên lô, và dòng bạn thêm.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <SyncStatusPill status={syncStatus} socketConnected={socketConnected} />
          <Button variant="ghost" size="sm" type="button" onClick={onBack}>
            ← Ops
          </Button>
        </div>
      </header>

      {!ready ? (
        <p className="text-sm text-ui-text-muted">Đang tải…</p>
      ) : (
        <>
          <section
            className="overflow-hidden rounded-2xl border border-ui-border/90 bg-ui-surface shadow-ui-md"
            data-testid="airlines-prefix-section"
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-ui-border/80 bg-gradient-to-b from-slate-50/90 to-white px-3 py-3 sm:px-4">
              <div className="min-w-0 flex-1">
                <h2 className="m-0 flex flex-wrap items-baseline gap-x-2 text-[13px] font-extrabold tracking-tight text-ui-navy">
                  <span>Theo prefix chuyến</span>
                  <span className="rounded-full bg-ui-surface-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-ui-text-muted ring-1 ring-ui-border/70">
                    {flightRows.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-[11px] text-ui-text-muted">
                  2–3 ký tự đầu cột chuyến → tên in tem
                </p>
              </div>
              <Button variant="primary" size="sm" type="button" onClick={addPrefixRow}>
                + Thêm
              </Button>
            </div>

            <div className="border-b border-ui-border/70 px-3 py-2 sm:px-4">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Lọc prefix hoặc tên hãng…"
                aria-label="Lọc prefix"
                className={`w-full text-sm ${OPS.input}`}
              />
            </div>

            <div
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.25rem] gap-2 border-b border-ui-border/70 bg-ui-surface-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ui-text-muted sm:px-4"
              role="row"
            >
              <span>Prefix</span>
              <span>Tên in trên tem</span>
              <span className="sr-only">Xóa</span>
            </div>

            <div className="max-h-[min(62vh,36rem)] overflow-y-auto" role="list">
              {filteredRows.length === 0 ? (
                <p className={`m-3 ${OPS.empty}`}>
                  {query.trim()
                    ? "Không khớp bộ lọc."
                    : "Chưa có prefix — bấm + Thêm."}
                </p>
              ) : (
                filteredRows.map(({ row, idx }, visibleI) => {
                  const isLastNew =
                    !row.key &&
                    !row.name &&
                    idx === flightRows.length - 1 &&
                    row.id.startsWith("new:");
                  return (
                    <div
                      key={row.id}
                      role="listitem"
                      className="group grid grid-cols-[4.5rem_minmax(0,1fr)_2.25rem] items-center gap-2 border-b border-ui-border/50 px-3 py-1.5 transition last:border-b-0 hover:bg-teal-500/[0.04] sm:px-4 sm:py-1.5"
                    >
                      <input
                        ref={isLastNew ? addKeyRef : undefined}
                        type="text"
                        placeholder="VN"
                        maxLength={3}
                        value={row.key}
                        onChange={(e) => {
                          const k = e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                            .slice(0, 3);
                          patchRow(idx, { key: k });
                        }}
                        className="w-full rounded-lg border border-ui-border/80 bg-ui-surface-muted px-1.5 py-1.5 text-center font-mono text-[13px] font-bold uppercase tracking-wide text-ui-navy outline-none transition focus:border-ui-primary/50 focus:bg-white focus:ring-1 focus:ring-ui-primary/25"
                        title="Prefix lấy từ cột chuyến (2–3 ký tự đầu)"
                        aria-label={`Prefix dòng ${visibleI + 1}`}
                      />
                      <input
                        type="text"
                        placeholder="Tên hãng in trên tem"
                        maxLength={80}
                        value={row.name}
                        onChange={(e) => patchRow(idx, { name: e.target.value })}
                        className="min-w-0 w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[13px] font-semibold text-ui-text outline-none transition placeholder:font-medium placeholder:text-ui-text-muted/70 hover:border-ui-border/60 focus:border-ui-primary/40 focus:bg-white focus:ring-1 focus:ring-ui-primary/20"
                        aria-label={`Tên tem dòng ${visibleI + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-base leading-none text-ui-text-muted opacity-70 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                        title="Xóa dòng"
                        aria-label={`Xóa ${row.key || "dòng trống"}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {query.trim() && filteredRows.length > 0 ? (
              <p className="border-t border-ui-border/70 px-3 py-2 text-[10px] font-medium text-ui-text-muted sm:px-4">
                Hiển thị {filteredRows.length} / {flightRows.length} dòng
              </p>
            ) : null}
          </section>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={resetToFactoryDefaults}
              disabled={saving}
              className={`disabled:opacity-50 ${OPS.btnResetAmber}`}
            >
              Khôi phục bảng gốc
            </button>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button variant="ghost" type="button" disabled={saving} onClick={onBack}>
                Hủy
              </Button>
              <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? "Đang lưu…" : "Lưu"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
