import { useEffect, useRef, useState } from "react";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import {
  mergeAirlineLookupMaps,
  overridesFromEffectiveMaps,
} from "../utils/airlineLabelOverridesCore";
import {
  DEFAULT_AIRLINE_BY_AWB_PREFIX,
  DEFAULT_AIRLINE_BY_FLIGHT_PREFIX,
} from "../constants/airlineLabelDefaults";
import { OPS, opsInput } from "../styles/opsModalStyles";

type Props = {
  open: boolean;
  onClose: () => void;
  value: AirlineLabelOverrides | undefined;
  saving?: boolean;
  onSave: (next: AirlineLabelOverrides) => void | Promise<void>;
};

type EditableRow = { id: string; key: string; name: string };

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

/** id ổn định theo key (danh sách từ bảng gốc); dòng mới dùng uuid */
function recordToRows(rec: Record<string, string>, idPrefix: "awb" | "flt"): EditableRow[] {
  return Object.entries(rec)
    .map(([key, name]) => ({ id: `${idPrefix}:${key}`, key, name }))
    .sort((a, b) => {
      if (idPrefix === "awb") {
        const na = parseInt(a.key.replace(/\D/g, ""), 10);
        const nb = parseInt(b.key.replace(/\D/g, ""), 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      }
      return a.key.localeCompare(b.key);
    });
}

function rowsToEffectiveAwb(rows: EditableRow[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const r of rows) {
    const d = r.key.replace(/\D/g, "");
    if (d.length === 0) continue;
    const k = d.slice(0, 3).padStart(3, "0");
    const n = r.name.replace(/\s+/g, " ").trim();
    if (!n) continue;
    o[k] = n.slice(0, 80);
  }
  return o;
}

function rowsToEffectiveFlight(rows: EditableRow[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    if (k.length < 2) continue;
    const n = r.name.replace(/\s+/g, " ").trim();
    if (!n) continue;
    o[k] = n.slice(0, 80);
  }
  return o;
}

export function AirlineLabelSettingsModal({ open, onClose, value, saving, onSave }: Props) {
  const [awbRows, setAwbRows] = useState<EditableRow[]>([]);
  const [flightRows, setFlightRows] = useState<EditableRow[]>([]);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      if (!wasOpen.current) {
        const { byAwb, byFlight } = mergeAirlineLookupMaps(value);
        setAwbRows(recordToRows(byAwb, "awb"));
        setFlightRows(recordToRows(byFlight, "flt"));
      }
    }
    wasOpen.current = open;
  }, [open, value]);

  if (!open) return null;

  const buildPayload = (): AirlineLabelOverrides =>
    overridesFromEffectiveMaps(rowsToEffectiveAwb(awbRows), rowsToEffectiveFlight(flightRows));

  const handleSave = () => void onSave(buildPayload());

  const resetToFactoryDefaults = () => {
    setAwbRows(recordToRows({ ...DEFAULT_AIRLINE_BY_AWB_PREFIX }, "awb"));
    setFlightRows(recordToRows({ ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX }, "flt"));
  };

  const defaultAwbCount = Object.keys(DEFAULT_AIRLINE_BY_AWB_PREFIX).length;
  const defaultFltCount = Object.keys(DEFAULT_AIRLINE_BY_FLIGHT_PREFIX).length;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/30 p-3 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="airline-label-settings-title"
    >
      <div className={`max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-[28px] border shadow-apple-md ${OPS.modal} ${OPS.border}`}>
        <div className={`flex items-start justify-between border-b px-5 py-4 ${OPS.border}`}>
          <div>
            <h2 id="airline-label-settings-title" className={`text-[19px] font-semibold tracking-tight ${OPS.title}`}>
              Tên hãng trên tem
            </h2>
            <p className={`mt-1 text-xs leading-relaxed ${OPS.secondary}`}>
              Danh sách đầy đủ theo bảng hệ thống ({defaultAwbCount} mã AWB + {defaultFltCount} prefix chuyến) và mọi hãng bạn đã thêm.
              Sửa tên hoặc thêm dòng mới. <span className={`font-semibold ${OPS.title}`}>Lưu</span> chỉ ghi tên hãng thay đổi so với mặc định.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-full p-2 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] ${OPS.muted}`}
            aria-label="Đóng"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[min(70vh,560px)] space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className={`text-[11px] font-bold uppercase tracking-wide ${OPS.secondary}`}>
                Theo 3 số đầu AWB ({awbRows.length} dòng)
              </h3>
              <button
                type="button"
                onClick={() => setAwbRows((r) => [...r, { id: `new:${newId()}`, key: "", name: "" }])}
                className={OPS.btnSmallAccent}
              >
                + Thêm mã AWB
              </button>
            </div>
            <div className="space-y-2">
              {awbRows.map((row, idx) => (
                <div
                  key={row.id}
                  className={`flex flex-wrap items-center gap-2 rounded-2xl border px-2 py-2 ${OPS.border} ${OPS.panelSoft}`}
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="978"
                    maxLength={3}
                    value={row.key}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "").slice(0, 3);
                      setAwbRows((rows) => rows.map((x, i) => (i === idx ? { ...x, key: d } : x)));
                    }}
                    className={`w-16 text-center font-mono text-sm font-semibold ${opsInput}`}
                  />
                  <input
                    type="text"
                    placeholder="Tên hãng in trên tem"
                    maxLength={80}
                    value={row.name}
                    onChange={(e) => {
                      const t = e.target.value;
                      setAwbRows((rows) => rows.map((x, i) => (i === idx ? { ...x, name: t } : x)));
                    }}
                    className={`min-w-[10rem] flex-1 text-sm font-semibold ${OPS.inputLg}`}
                  />
                  <button
                    type="button"
                    onClick={() => setAwbRows((rows) => rows.filter((_, i) => i !== idx))}
                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/15"
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className={`text-[11px] font-bold uppercase tracking-wide ${OPS.secondary}`}>
                Theo prefix chuyến ({flightRows.length} dòng)
              </h3>
              <button
                type="button"
                onClick={() => setFlightRows((r) => [...r, { id: `new:${newId()}`, key: "", name: "" }])}
                className={OPS.btnSmallAccent}
              >
                + Thêm prefix
              </button>
            </div>
            <div className="space-y-2">
              {flightRows.map((row, idx) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="VJ"
                    maxLength={3}
                    value={row.key}
                    onChange={(e) => {
                      const k = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
                      setFlightRows((rows) => rows.map((x, i) => (i === idx ? { ...x, key: k } : x)));
                    }}
                    className={`w-16 text-center font-mono text-sm font-semibold uppercase ${opsInput}`}
                  />
                  <input
                    type="text"
                    placeholder="Tên hãng in trên tem"
                    maxLength={80}
                    value={row.name}
                    onChange={(e) => {
                      const t = e.target.value;
                      setFlightRows((rows) => rows.map((x, i) => (i === idx ? { ...x, name: t } : x)));
                    }}
                    className={`min-w-[12rem] flex-1 text-sm font-semibold ${OPS.inputLg}`}
                  />
                  <button
                    type="button"
                    onClick={() => setFlightRows((rows) => rows.filter((_, i) => i !== idx))}
                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/15"
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className={`flex flex-col gap-2 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${OPS.border}`}>
          <button
            type="button"
            onClick={resetToFactoryDefaults}
            disabled={saving}
            className={`disabled:opacity-50 ${OPS.btnResetAmber}`}
          >
            Khôi phục bảng gốc (hủy mọi ghi đè)
          </button>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={`rounded-full border px-5 py-2.5 text-sm font-semibold disabled:opacity-50 ${OPS.tabIdle}`}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-apple-blue-hover disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
