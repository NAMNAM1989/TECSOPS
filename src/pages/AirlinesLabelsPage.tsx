import { useEffect, useRef, useState } from "react";
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
  const [saving, setSaving] = useState(false);
  const preservedAwbRef = useRef<Record<string, string>>({});
  const hydrated = useRef(false);

  useEffect(() => {
    if (!ready || hydrated.current) return;
    const clamped = clampAirlineLabelOverrides(value ?? {});
    preservedAwbRef.current = { ...clamped.byAwbPrefix };
    setFlightRows(recordToFlightRows(buildFlightLabelMapForEditor(value, flightSamples)));
    hydrated.current = true;
  }, [ready, value, flightSamples]);

  const defaultFltCount = Object.keys(DEFAULT_AIRLINE_BY_FLIGHT_PREFIX).length;

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
  };

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-3 py-3 sm:px-5 sm:py-5" data-testid="airlines-labels-page">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-ui-border pb-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Wordmark size="sm" />
            <span className="text-sm font-semibold text-ui-text-muted">· Tên hãng</span>
          </div>
          <h1 className="m-0 text-lg font-bold tracking-tight text-ui-text">Tên hãng trên tem</h1>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-ui-text-muted">
            Prefix từ cột chuyến (vd. TR305 → TR). Sửa tên rồi Lưu — tem in sẽ dùng đúng tên đó. Có{" "}
            {defaultFltCount} prefix mặc định, các prefix đang có trên lô, và dòng bạn thêm.
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
          <section className={`rounded-2xl border p-4 shadow-ui-sm ${OPS.border} ${OPS.panelSoft}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[11px] font-bold uppercase tracking-wide text-ui-text-muted">
                Theo prefix chuyến ({flightRows.length} dòng)
              </h2>
              <button
                type="button"
                onClick={() =>
                  setFlightRows((r) => [...r, { id: `new:${newId()}`, key: "", name: "" }])
                }
                className={OPS.btnSmallAccent}
              >
                + Thêm prefix
              </button>
            </div>
            <div className="mb-2 grid grid-cols-[4rem_1fr_auto] gap-2 px-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
              <span>Prefix</span>
              <span>Tên in trên tem</span>
              <span />
            </div>
            <div className="space-y-2">
              {flightRows.map((row, idx) => (
                <div
                  key={row.id}
                  className={`flex flex-wrap items-center gap-2 rounded-2xl border px-2 py-2 ${OPS.border} bg-ui-surface`}
                >
                  <input
                    type="text"
                    placeholder="VN"
                    maxLength={3}
                    value={row.key}
                    onChange={(e) => {
                      const k = e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 3);
                      setFlightRows((rows) =>
                        rows.map((x, i) => (i === idx ? { ...x, key: k } : x)),
                      );
                    }}
                    className={`w-16 text-center font-mono text-sm font-semibold uppercase ${OPS.input}`}
                    title="Prefix lấy từ cột chuyến (2–3 ký tự đầu)"
                  />
                  <input
                    type="text"
                    placeholder="Tên hãng in trên tem"
                    maxLength={80}
                    value={row.name}
                    onChange={(e) => {
                      const t = e.target.value;
                      setFlightRows((rows) =>
                        rows.map((x, i) => (i === idx ? { ...x, name: t } : x)),
                      );
                    }}
                    className={`min-w-[12rem] flex-1 text-sm font-semibold ${OPS.inputLg}`}
                  />
                  <button
                    type="button"
                    onClick={() => setFlightRows((rows) => rows.filter((_, i) => i !== idx))}
                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>
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
