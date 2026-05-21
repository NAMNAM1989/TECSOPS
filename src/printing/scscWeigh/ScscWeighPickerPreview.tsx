import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { A4WeighReceiptPrinterProfile, ScscFieldOverride } from "../printTypes";
import type { ScscWeighPrintSettings } from "../../types/scscWeighPrintSettings";
import type { ScaleTicketFormData } from "../../utils/mapBookingToScaleTicketFormData";
import { defaultScscWeighPrintSettings } from "./scscWeighPrintSettingsCore";
import { getActiveA4WeighProfile } from "../printerProfiles";
import { pushLocalPrinterProfilesCatalog } from "../printerProfilesSync";
import {
  loadPrinterProfileStore,
  PRINTER_PROFILES_CHANGED_EVENT,
  syncLegacyScscOffsetsFromProfile,
  upsertPrinterProfile,
} from "../printerProfileStorage";
import {
  buildScscWeighOverlayValues,
  resolveScscWeighPrintLayer,
  scscFieldBoxStyle,
  type ScscFieldDef,
} from "./scscWeighTemplate";
import { formatScscCoordMm, formatScscFieldCoordSnippet, getScscFieldBoundsMm } from "./scscFieldCoords";
import { resolveScscWeighPrintTransform } from "./scscWeighPrint";
import { ScscWeighPreviewCoordsPanel } from "./ScscWeighPreviewCoordsPanel";
import {
  mergeScscFieldOverrides,
  pruneEmptyScscFieldOverrides,
  removeScscFieldOverride,
  roundScscMm,
  scscFieldOverridesEqual,
} from "./scscFieldOverrides";
import { pointerDeltaToLayoutMm } from "./scscPreviewDrag";
import {
  SCSC_A4_PAGE_HEIGHT_MM,
  SCSC_A4_PAGE_WIDTH_MM,
  SCSC_WEIGH_TEMPLATE_PNG_URL,
} from "./scscWeighTemplateAsset";

const PAGE_W_MM = SCSC_A4_PAGE_WIDTH_MM;
const PAGE_H_MM = SCSC_A4_PAGE_HEIGHT_MM;
const MM_TO_PX = 96 / 25.4;
const PAGE_W_PX = PAGE_W_MM * MM_TO_PX;
const PAGE_H_PX = PAGE_H_MM * MM_TO_PX;

type Props = {
  formData: ScaleTicketFormData;
  scscWeighPrintSettings?: ScscWeighPrintSettings;
};

function visiblePrintFields(fields: ScscFieldDef[], values: Record<string, string>): ScscFieldDef[] {
  return fields.filter((def) => {
    if (def.key !== "otherRequirements") return true;
    return Boolean((values[def.key] ?? "").trim());
  });
}

function scscDataLayerTransform(offsetXmm: number, offsetYmm: number, scaleX: number, scaleY: number): string {
  const useScale = Math.abs(scaleX - 1) > 0.0001 || Math.abs(scaleY - 1) > 0.0001;
  if (useScale) {
    return `translate(${offsetXmm}mm, ${offsetYmm}mm) scale(${scaleX}, ${scaleY})`;
  }
  if (Math.abs(offsetXmm) > 0.001 || Math.abs(offsetYmm) > 0.001) {
    return `translate(${offsetXmm}mm, ${offsetYmm}mm)`;
  }
  return "none";
}

export function ScscWeighPickerPreview({ formData, scscWeighPrintSettings }: Props) {
  const [profileTick, setProfileTick] = useState(0);
  const a4Profile = useMemo(
    () => getActiveA4WeighProfile(loadPrinterProfileStore()),
    [profileTick]
  );

  const [draftOverrides, setDraftOverrides] = useState(a4Profile.scscFieldOverrides);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  useEffect(() => {
    const onProfilesChanged = () => setProfileTick((t) => t + 1);
    window.addEventListener(PRINTER_PROFILES_CHANGED_EVENT, onProfilesChanged);
    return () => window.removeEventListener(PRINTER_PROFILES_CHANGED_EVENT, onProfilesChanged);
  }, []);

  const dirty = !scscFieldOverridesEqual(
    pruneEmptyScscFieldOverrides(draftOverrides ?? {}),
    a4Profile.scscFieldOverrides
  );

  useEffect(() => {
    if (!dirty) {
      setDraftOverrides(a4Profile.scscFieldOverrides);
    }
  }, [a4Profile.id, a4Profile.scscFieldOverrides, profileTick, dirty]);

  const effectiveProfile = useMemo((): A4WeighReceiptPrinterProfile => {
    const cleaned = pruneEmptyScscFieldOverrides(draftOverrides ?? {});
    return { ...a4Profile, scscFieldOverrides: cleaned };
  }, [a4Profile, draftOverrides]);

  const values = buildScscWeighOverlayValues(
    formData,
    scscWeighPrintSettings ?? defaultScscWeighPrintSettings()
  );
  const { fields: printFields, values: printValues } = resolveScscWeighPrintLayer(effectiveProfile, values);
  const { offsetXmm, offsetYmm, scaleX, scaleY } = resolveScscWeighPrintTransform({ profile: effectiveProfile });
  const dataTransform = scscDataLayerTransform(offsetXmm, offsetYmm, scaleX, scaleY);

  const overrideKeys = useMemo(
    () => new Set(Object.keys(pruneEmptyScscFieldOverrides(draftOverrides ?? {}) ?? {})),
    [draftOverrides]
  );

  const fieldsOnPage = useMemo(
    () => visiblePrintFields(printFields, printValues),
    [printFields, printValues]
  );

  const frameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.55);
  const [showCoords, setShowCoords] = useState(false);
  const [showEmptyFields, setShowEmptyFields] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const patchField = useCallback((key: string, patch: ScscFieldOverride) => {
    setDraftOverrides((prev) => {
      const merged = mergeScscFieldOverrides(prev, { [key]: patch });
      if (merged) return merged;
      const single = pruneEmptyScscFieldOverrides({ [key]: patch });
      return single;
    });
    setSaveHint(null);
  }, []);

  const handleSaveProfile = useCallback(() => {
    const cleaned = pruneEmptyScscFieldOverrides(draftOverrides ?? {});
    const updated: A4WeighReceiptPrinterProfile = {
      ...a4Profile,
      scscFieldOverrides: cleaned,
    };
    upsertPrinterProfile(updated);
    syncLegacyScscOffsetsFromProfile(updated);
    setDraftOverrides(cleaned);
    setSaveHint("Đã lưu — tọa độ giữ nguyên khi đồng bộ và in sau.");
    void pushLocalPrinterProfilesCatalog();
  }, [a4Profile, draftOverrides]);

  const handleDiscard = useCallback(() => {
    setDraftOverrides(a4Profile.scscFieldOverrides);
    setSaveHint(null);
  }, [a4Profile.scscFieldOverrides]);

  const handleResetAllOverrides = useCallback(() => {
    setDraftOverrides(undefined);
    setSaveHint(null);
  }, []);

  const handleResetField = useCallback((key: string) => {
    setDraftOverrides((prev) => removeScscFieldOverride(prev, key));
    if (selectedKey === key) setSelectedKey(null);
    setSaveHint(null);
  }, [selectedKey]);

  const nudgeField = useCallback(
    (key: string, dx: number, dy: number) => {
      const def = printFields.find((f) => f.key === key);
      if (!def) return;
      patchField(key, { x: roundScscMm(def.x + dx), y: roundScscMm(def.y + dy) });
    },
    [patchField, printFields]
  );

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => {
      const cw = frame.clientWidth;
      const ch = frame.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      setScale(Math.min(cw / PAGE_W_PX, ch / PAGE_H_PX));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent, def: ScscFieldDef, mode: "move" | "resize") => {
      if (!showCoords) return;
      e.preventDefault();
      e.stopPropagation();
      const pageEl = pageRef.current;
      if (!pageEl) return;
      setSelectedKey(def.key);
      const pageRect = pageEl.getBoundingClientRect();
      const start = {
        clientX: e.clientX,
        clientY: e.clientY,
        x: def.x,
        y: def.y,
        width: def.width,
      };
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const { dxMm, dyMm } = pointerDeltaToLayoutMm(
          ev.clientX - start.clientX,
          ev.clientY - start.clientY,
          pageRect,
          scaleX,
          scaleY
        );
        if (mode === "move") {
          patchField(def.key, { x: roundScscMm(start.x + dxMm), y: roundScscMm(start.y + dyMm) });
        } else {
          patchField(def.key, { width: roundScscMm(Math.max(4, start.width + dxMm)) });
        }
      };

      const onUp = () => {
        target.releasePointerCapture(e.pointerId);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },
    [patchField, scaleX, scaleY, showCoords]
  );

  const fieldsToRender = showCoords && showEmptyFields ? printFields : fieldsOnPage;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-semibold uppercase text-apple-tertiary">Xem trước phiếu in</p>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-[10px] font-semibold text-amber-950">
          <input
            type="checkbox"
            checked={showCoords}
            onChange={(ev) => {
              setShowCoords(ev.target.checked);
              if (!ev.target.checked) setSelectedKey(null);
            }}
            className="rounded"
          />
          Tọa độ &amp; chỉnh vị trí
        </label>
      </div>

      {showCoords ? (
        <div
          className={`mb-2 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[10px] ${
            dirty
              ? "border-apple-blue/30 bg-apple-blue/5"
              : "border-black/[0.06] bg-black/[0.02]"
          }`}
        >
          <span className="text-apple-secondary">
            {dirty ? "Có thay đổi chưa lưu — kéo ô trên phiếu hoặc dùng mũi tên trong bảng." : "Kéo ô để chỉnh; lưu vào profile máy in A4."}
          </span>
          {dirty ? (
            <>
              <button
                type="button"
                onClick={handleSaveProfile}
                className="rounded-full bg-apple-blue px-3 py-1 font-semibold text-white shadow-sm"
              >
                Lưu profile «{a4Profile.name}»
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                className="rounded-full border border-black/[0.12] bg-white px-3 py-1 font-semibold text-apple-label"
              >
                Hoàn tác
              </button>
            </>
          ) : null}
          {overrideKeys.size > 0 ? (
            <button
              type="button"
              onClick={handleResetAllOverrides}
              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 font-semibold text-red-800"
            >
              Xóa chỉnh tay ({overrideKeys.size})
            </button>
          ) : null}
        </div>
      ) : null}

      {saveHint ? (
        <p className="mb-2 px-1 text-[10px] font-medium text-emerald-700">{saveHint}</p>
      ) : null}

      <div
        ref={frameRef}
        className="relative min-h-[min(48vh,480px)] w-full flex-1 overflow-hidden rounded-xl border border-black/[0.1] bg-[#e8eaee] shadow-inner"
        style={{ aspectRatio: `${PAGE_W_MM} / ${PAGE_H_MM}` }}
      >
        <div
          ref={pageRef}
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: `${PAGE_W_MM}mm`,
            height: `${PAGE_H_MM}mm`,
            transform: `scale(${scale})`,
          }}
        >
          <img
            src={SCSC_WEIGH_TEMPLATE_PNG_URL}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-fill object-left-top"
          />
          {showCoords ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)
                `,
                backgroundSize: "10mm 10mm",
              }}
              aria-hidden
            />
          ) : null}
          <div
            className="absolute left-0 top-0"
            style={{
              width: `${PAGE_W_MM}mm`,
              height: `${PAGE_H_MM}mm`,
              transform: dataTransform,
              transformOrigin: "top left",
            }}
          >
            {fieldsToRender.map((def) => {
              const active = selectedKey === def.key;
              const bounds = getScscFieldBoundsMm(def, printValues);
              const baseStyle = scscFieldBoxStyle(def);
              const customized = overrideKeys.has(def.key);
              return (
                <div
                  key={def.key}
                  role={showCoords ? "button" : undefined}
                  tabIndex={showCoords ? 0 : undefined}
                  onPointerDown={showCoords ? (e) => startDrag(e, def, "move") : undefined}
                  onClick={
                    showCoords
                      ? (e) => {
                          e.stopPropagation();
                          setSelectedKey(selectedKey === def.key ? null : def.key);
                        }
                      : undefined
                  }
                  style={{
                    ...baseStyle,
                    pointerEvents: showCoords ? "auto" : "none",
                    touchAction: showCoords ? "none" : undefined,
                    outline: active
                      ? "2px solid rgba(0, 122, 255, 0.9)"
                      : showCoords
                        ? customized
                          ? "1px solid rgba(255, 149, 0, 0.85)"
                          : "1px dashed rgba(0, 122, 255, 0.45)"
                        : undefined,
                    outlineOffset: showCoords ? "-1px" : undefined,
                    backgroundColor: active
                      ? "rgba(0, 122, 255, 0.14)"
                      : showCoords
                        ? customized
                          ? "rgba(255, 149, 0, 0.12)"
                          : "rgba(255, 255, 255, 0.35)"
                        : undefined,
                    cursor: showCoords ? "move" : undefined,
                  }}
                  title={showCoords ? formatScscFieldCoordSnippet(bounds) : undefined}
                >
                  {printValues[def.key] ?? ""}
                  {showCoords ? (
                    <span
                      className="pointer-events-none absolute left-0 top-0 z-10 -translate-y-full whitespace-nowrap rounded bg-apple-blue px-1 py-px text-[7px] font-semibold leading-tight text-white shadow-sm"
                    >
                      {formatScscCoordMm(bounds.x)},{formatScscCoordMm(bounds.y)}
                      {customized ? " *" : ""}
                    </span>
                  ) : null}
                  {showCoords && active ? (
                    <span
                      role="presentation"
                      data-resize-handle="1"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startDrag(e, def, "resize");
                      }}
                      className="absolute bottom-0 right-0 z-20 h-2.5 w-2.5 cursor-ew-resize rounded-sm border border-white bg-apple-blue shadow"
                      style={{ transform: "translate(40%, 40%)" }}
                      title="Kéo để đổi rộng (mm)"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showCoords ? (
        <ScscWeighPreviewCoordsPanel
          fields={printFields}
          values={printValues}
          profile={effectiveProfile}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          showEmptyFields={showEmptyFields}
          onShowEmptyFieldsChange={setShowEmptyFields}
          overrideKeys={overrideKeys}
          onResetField={handleResetField}
          onNudgeField={nudgeField}
          onPatchField={patchField}
        />
      ) : null}

      <dl className="mt-3 shrink-0 grid grid-cols-1 gap-1.5 text-xs text-apple-secondary sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-apple-tertiary">Shipper</dt>
          <dd className="text-apple-label">{formData.shipperName || "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-apple-tertiary">Agent</dt>
          <dd className="text-apple-label">{formData.agentName || "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-apple-tertiary">CNEE</dt>
          <dd className="text-apple-label">{formData.consigneeName || "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-apple-tertiary">Tên hàng</dt>
          <dd className="text-apple-label">{formData.goodsDescription || "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
