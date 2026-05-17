import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../../types/shipment";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";
import type { ThermalFieldOverride, ThermalLabelPrinterProfile } from "../printTypes";
import { resolveThermalProfileLabelFormat, labelSheetFormatLabel } from "../thermalLabelFormat";
import { printThermalCalibrationTspl, printThermalLabelTspl } from "./thermalLabelTspl";
import { thermalLabelDimensions } from "./thermalLabelFieldCatalog";
import {
  mergeThermalFieldOverrides,
  pruneThermalFieldOverrides,
  removeThermalFieldOverride,
  roundThermalMm,
  thermalFieldOverridesEqual,
} from "./thermalFieldOverrides";
import { buildThermalLabelSlotValues } from "./thermalLabelValues";
import { resolveThermalLabelFields, visibleThermalLabelFieldsForRender } from "./thermalLabelTsplSlots";
import { nudgeThermalFieldFontPatch } from "./thermalLabelFont";
import { pointerDeltaToLabelMm } from "./thermalPreviewDrag";
import { ThermalLabelMmView } from "./ThermalLabelMmView";

const MM_TO_PX = 96 / 25.4;

type Props = {
  open: boolean;
  profile: ThermalLabelPrinterProfile;
  shipment: Shipment;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  onSave: (profile: ThermalLabelPrinterProfile) => void;
  onClose: () => void;
};

export function ThermalLabelCalibrationEditor({
  open,
  profile,
  shipment,
  airlineLabelOverrides,
  onSave,
  onClose,
}: Props) {
  const format = resolveThermalProfileLabelFormat(profile);
  const { w: labelW, h: labelH } = thermalLabelDimensions(format);

  const [draftOverrides, setDraftOverrides] = useState(profile.thermalFieldOverrides);
  const [host, setHost] = useState(profile.host ?? "");
  const [showCoords, setShowCoords] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraftOverrides(profile.thermalFieldOverrides);
      setHost(profile.host ?? "");
      setSaveHint(null);
      setMsg(null);
    }
  }, [open, profile.id, profile.thermalFieldOverrides, profile.host]);

  const effectiveProfile = useMemo((): ThermalLabelPrinterProfile => {
    const cleaned = pruneThermalFieldOverrides(draftOverrides ?? {});
    return { ...profile, host: host.trim(), thermalFieldOverrides: cleaned };
  }, [profile, draftOverrides, host]);

  const labelPack = useMemo(
    () => buildThermalLabelSlotValues(shipment, airlineLabelOverrides),
    [shipment, airlineLabelOverrides]
  );
  const slotValues = labelPack.values;

  const allFields = useMemo(
    () => resolveThermalLabelFields(format, effectiveProfile.thermalFieldOverrides),
    [format, effectiveProfile.thermalFieldOverrides]
  );

  const fields = useMemo(
    () =>
      visibleThermalLabelFieldsForRender(format, allFields, slotValues, labelPack.hasHawb, {
        showAllSlotsForEdit: showCoords,
      }),
    [format, allFields, slotValues, labelPack.hasHawb, showCoords]
  );

  const overrideKeys = useMemo(
    () => new Set(Object.keys(pruneThermalFieldOverrides(draftOverrides ?? {}) ?? {})),
    [draftOverrides]
  );

  const dirty =
    !thermalFieldOverridesEqual(
      pruneThermalFieldOverrides(draftOverrides ?? {}),
      profile.thermalFieldOverrides
    ) || host.trim() !== (profile.host ?? "").trim();

  const patchField = useCallback((key: string, patch: ThermalFieldOverride) => {
    setDraftOverrides((prev) => mergeThermalFieldOverrides(prev, { [key]: patch }));
    setSaveHint(null);
  }, []);

  const frameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [viewScale, setViewScale] = useState(0.9);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => {
      const cw = frame.clientWidth;
      const ch = frame.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const pw = labelW * MM_TO_PX;
      const ph = labelH * MM_TO_PX;
      setViewScale(Math.min(cw / pw, ch / ph, 1.2));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [labelW, labelH, open]);

  const startDrag = useCallback(
    (e: React.PointerEvent, def: (typeof fields)[0]) => {
      if (!showCoords) return;
      e.preventDefault();
      e.stopPropagation();
      const pageEl = pageRef.current;
      if (!pageEl) return;
      setSelectedKey(def.key);
      const pageRect = pageEl.getBoundingClientRect();
      const start = { clientX: e.clientX, clientY: e.clientY, x: def.x, y: def.y };
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const { dxMm, dyMm } = pointerDeltaToLabelMm(
          ev.clientX - start.clientX,
          ev.clientY - start.clientY,
          pageRect,
          labelW,
          labelH,
          viewScale
        );
        patchField(def.key, {
          x: roundThermalMm(Math.max(0, Math.min(labelW - 4, start.x + dxMm))),
          y: roundThermalMm(Math.max(0, Math.min(labelH - 3, start.y + dyMm))),
        });
      };
      const onUp = () => {
        target.releasePointerCapture(e.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [showCoords, labelW, labelH, viewScale, patchField]
  );

  const handleSave = () => {
    onSave(effectiveProfile);
    setSaveHint("Đã lưu tọa độ tem vào profile máy in.");
  };

  const handleTestPrint = async () => {
    setMsg(null);
    const res = await printThermalCalibrationTspl(effectiveProfile);
    setMsg(res.ok ? "Đã gửi tem căn chỉnh." : res.error);
  };

  const handleTestLabel = async () => {
    setMsg(null);
    const res = await printThermalLabelTspl(shipment, effectiveProfile, airlineLabelOverrides);
    setMsg(res.ok ? "Đã in thử tem lô hiện tại." : res.error);
  };

  const selectedDef = allFields.find((f) => f.key === selectedKey);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/50 backdrop-blur-sm">
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.08] px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-apple-label">
              Căn chỉnh tem {labelSheetFormatLabel(format)} — {profile.name}
            </h3>
            <p className="text-xs text-apple-secondary">
              Bật tọa độ → kéo từng ô; A−/A+ đổi cỡ chữ. Lưu vào profile máy in.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-apple-secondary hover:bg-black/[0.05]">
            Đóng
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 lg:flex-row">
          <div ref={frameRef} className="flex min-h-[220px] flex-1 items-center justify-center rounded-xl bg-apple-bg p-3">
            <div
              ref={pageRef}
              style={{
                transform: `scale(${viewScale})`,
                transformOrigin: "center center",
              }}
            >
              <ThermalLabelMmView
                labelWidthMm={labelW}
                labelHeightMm={labelH}
                fields={fields}
                values={slotValues}
                showCoords={showCoords}
                selectedKey={selectedKey}
                overrideKeys={overrideKeys}
                onSelectField={setSelectedKey}
                onStartDrag={startDrag}
              />
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
            <label className="block text-xs font-semibold text-apple-secondary">
              IP máy in (TSPL)
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.x.x"
                className="mt-1 w-full rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-apple-label">
              <input type="checkbox" checked={showCoords} onChange={(e) => setShowCoords(e.target.checked)} />
              Tọa độ & kéo thả
            </label>

            {selectedDef ? (
              <div className="rounded-xl border border-black/[0.08] bg-apple-bg/60 p-2.5 text-xs">
                <p className="font-semibold text-apple-label">{selectedDef.label}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="text-apple-secondary">X (mm)</span>
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={labelW}
                      value={selectedDef.x}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        patchField(selectedDef.key, {
                          x: roundThermalMm(Math.max(0, Math.min(labelW - 4, n))),
                        });
                      }}
                      className="mt-0.5 w-full rounded border border-black/[0.12] px-2 py-1 font-mono"
                    />
                  </label>
                  <label className="block">
                    <span className="text-apple-secondary">Y (mm)</span>
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={labelH}
                      value={selectedDef.y}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        patchField(selectedDef.key, {
                          y: roundThermalMm(Math.max(0, Math.min(labelH - 3, n))),
                        });
                      }}
                      className="mt-0.5 w-full rounded border border-black/[0.12] px-2 py-1 font-mono"
                    />
                  </label>
                  <label className="block">
                    <span className="text-apple-secondary">Cỡ (mm)</span>
                    <input
                      type="number"
                      step={0.5}
                      min={1.5}
                      max={28}
                      value={selectedDef.fontMm}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        patchField(selectedDef.key, {
                          fontMm: roundThermalMm(Math.max(1.5, Math.min(28, n))),
                        });
                      }}
                      className="mt-0.5 w-full rounded border border-black/[0.12] px-2 py-1 font-mono"
                    />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="min-h-8 rounded border px-2.5 py-1 font-semibold"
                    onClick={() => patchField(selectedDef.key, nudgeThermalFieldFontPatch(selectedDef, -1))}
                  >
                    A−
                  </button>
                  <button
                    type="button"
                    className="min-h-8 rounded border px-2.5 py-1 font-semibold"
                    onClick={() => patchField(selectedDef.key, nudgeThermalFieldFontPatch(selectedDef, 1))}
                  >
                    A+
                  </button>
                  <button
                    type="button"
                    className="min-h-8 rounded border px-2.5 py-1 text-apple-secondary"
                    onClick={() => {
                      setDraftOverrides((prev) => removeThermalFieldOverride(prev, selectedDef.key));
                      setSelectedKey(null);
                    }}
                  >
                    Hoàn tác ô
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-apple-tertiary">Chọn một ô trên tem để chỉnh cỡ chữ.</p>
            )}

            <div className="max-h-40 overflow-y-auto rounded-xl border border-black/[0.08] text-[10px]">
              <table className="w-full">
                <thead className="sticky top-0 bg-apple-bg text-left text-apple-secondary">
                  <tr>
                    <th className="px-2 py-1">Ô</th>
                    <th className="px-2 py-1">X</th>
                    <th className="px-2 py-1">Y</th>
                    <th className="px-2 py-1">mm</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <tr
                      key={f.key}
                      className={selectedKey === f.key ? "bg-apple-blue/10" : overrideKeys.has(f.key) ? "bg-amber-50" : ""}
                      onClick={() => setSelectedKey(f.key)}
                    >
                      <td className="px-2 py-0.5 font-medium">{f.label}</td>
                      <td className="px-2 py-0.5 font-mono">{f.x}</td>
                      <td className="px-2 py-0.5 font-mono">{f.y}</td>
                      <td className="px-2 py-0.5 font-mono">{f.fontMm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {saveHint ? <p className="text-xs text-emerald-700">{saveHint}</p> : null}
            {msg ? <p className="text-xs text-apple-label">{msg}</p> : null}
            {dirty ? <p className="text-xs text-amber-800">Chưa lưu thay đổi.</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-black/[0.08] px-4 py-3">
          <button type="button" onClick={() => void handleTestPrint()} className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900">
            In thử khung
          </button>
          <button type="button" onClick={() => void handleTestLabel()} className="rounded-full border px-3 py-1.5 text-xs font-semibold">
            In thử tem lô
          </button>
          <button
            type="button"
            onClick={() => setDraftOverrides(undefined)}
            className="rounded-full border px-3 py-1.5 text-xs font-semibold text-apple-secondary"
          >
            Xóa chỉnh tay
          </button>
          <button type="button" onClick={handleSave} className="rounded-full bg-apple-blue px-3 py-1.5 text-xs font-semibold text-white">
            Lưu profile
          </button>
          <button type="button" onClick={onClose} className="ml-auto rounded-full border px-3 py-1.5 text-xs font-semibold text-apple-secondary">
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
