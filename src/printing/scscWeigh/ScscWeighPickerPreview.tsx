import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { A4WeighReceiptPrinterProfile, ScscFieldOverride } from "../printTypes";
import type { ScscWeighPrintSettings } from "../../types/scscWeighPrintSettings";
import type { ScscWeighWarehouseKey } from "../../types/scscWeighPrintSettings";
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
import { ScscWeighMmRulerFrame } from "./ScscWeighMmRulerFrame";
import { ScscWeighDragGuides, type ScscWeighDragGuide } from "./ScscWeighDragGuides";
import { syncScscWeighCalibrationToServer } from "./syncScscWeighCalibration";
import {
  mergeScscFieldUserPatch,
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
import { OPS } from "../../styles/opsModalStyles";

const PAGE_W_MM = SCSC_A4_PAGE_WIDTH_MM;
const PAGE_H_MM = SCSC_A4_PAGE_HEIGHT_MM;
const MM_TO_PX = 96 / 25.4;
const PAGE_W_PX = PAGE_W_MM * MM_TO_PX;
const PAGE_H_PX = PAGE_H_MM * MM_TO_PX;

type Props = {
  formData: ScaleTicketFormData;
  scscWeighPrintSettings?: ScscWeighPrintSettings;
  warehouse?: ScscWeighWarehouseKey;
  /** `studio` — modal in hàng ngày: thước mm, panel tọa độ mở rộng, lưu cố định. */
  mode?: "preview" | "studio";
  showSummary?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onCalibrationUiChange?: (state: { dirty: boolean; saving: boolean; justSaved: boolean }) => void;
};

export type ScscWeighPickerPreviewHandle = {
  /** Lưu căn chỉnh (local + server + PDF). `force` — luôn ghi lại trước khi in. */
  saveCalibration: (opts?: { force?: boolean }) => Promise<boolean>;
  isDirty: () => boolean;
};

function normalizedOverrides(map?: A4WeighReceiptPrinterProfile["scscFieldOverrides"]) {
  return pruneEmptyScscFieldOverrides(map ?? {}) ?? undefined;
}

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

export const ScscWeighPickerPreview = forwardRef<ScscWeighPickerPreviewHandle, Props>(function ScscWeighPickerPreview(
  {
    formData,
    scscWeighPrintSettings,
    warehouse = "TECS-SCSC",
    mode = "preview",
    showSummary = true,
    onDirtyChange,
    onCalibrationUiChange,
  },
  ref
) {
  const studio = mode === "studio";

  const [profileTick, setProfileTick] = useState(0);
  const a4Profile = useMemo(
    () => getActiveA4WeighProfile(loadPrinterProfileStore()),
    [profileTick]
  );

  const [draftOverrides, setDraftOverrides] = useState(a4Profile.scscFieldOverrides);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const onProfilesChanged = () => setProfileTick((t) => t + 1);
    window.addEventListener(PRINTER_PROFILES_CHANGED_EVENT, onProfilesChanged);
    return () => window.removeEventListener(PRINTER_PROFILES_CHANGED_EVENT, onProfilesChanged);
  }, []);

  const dirty = !scscFieldOverridesEqual(
    normalizedOverrides(draftOverrides),
    normalizedOverrides(a4Profile.scscFieldOverrides)
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onCalibrationUiChange?.({ dirty, saving, justSaved });
  }, [dirty, saving, justSaved, onCalibrationUiChange]);

  useEffect(() => {
    if (!justSaved) return;
    const t = window.setTimeout(() => setJustSaved(false), 2200);
    return () => window.clearTimeout(t);
  }, [justSaved]);

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
    scscWeighPrintSettings ?? defaultScscWeighPrintSettings(),
    warehouse
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

  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.55);
  const [showCoords, setShowCoords] = useState(studio);
  const [showEmptyFields, setShowEmptyFields] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dragGuide, setDragGuide] = useState<ScscWeighDragGuide | null>(null);

  const coordsActive = studio || showCoords;

  const printFieldsRef = useRef(printFields);
  printFieldsRef.current = printFields;

  const patchField = useCallback((key: string, patch: ScscFieldOverride) => {
    setDraftOverrides((prev) => {
      const def = printFieldsRef.current.find((f) => f.key === key);
      return mergeScscFieldUserPatch(def, prev, key, patch);
    });
    setSaveHint(null);
  }, []);

  const persistCalibration = useCallback(
    async (opts?: { force?: boolean }): Promise<boolean> => {
      if (saving) return false;
      const cleaned = normalizedOverrides(draftOverrides);
      const isDirty = !scscFieldOverridesEqual(cleaned, normalizedOverrides(a4Profile.scscFieldOverrides));
      if (!opts?.force && !isDirty) return true;

      const updated: A4WeighReceiptPrinterProfile = {
        ...a4Profile,
        scscFieldOverrides: cleaned,
      };
      upsertPrinterProfile(updated);
      syncLegacyScscOffsetsFromProfile(updated);
      setDraftOverrides(cleaned);
      setSaving(true);
      setSaveHint(null);
      try {
        const pushed = await pushLocalPrinterProfilesCatalog();
        try {
          await syncScscWeighCalibrationToServer(updated);
          setJustSaved(true);
          setSaveHint(
            studio
              ? "Đã lưu căn chỉnh — áp dụng cố định cho mọi lần in (PDF + HTML)."
              : pushed
                ? "Đã lưu — tọa độ giữ nguyên khi đồng bộ và in sau."
                : "Đã lưu local — chưa đẩy lên server (kiểm tra mạng)."
          );
          return true;
        } catch (serverErr) {
          const msg = serverErr instanceof Error ? serverErr.message : "lỗi server PDF";
          setSaveHint(
            pushed
              ? `Đã lưu profile chung — chưa ghi mẫu PDF: ${msg}`
              : `Đã lưu trên máy này — chưa đồng bộ server: ${msg}`
          );
          return pushed;
        }
      } finally {
        setSaving(false);
      }
    },
    [a4Profile, draftOverrides, saving, studio]
  );

  useImperativeHandle(
    ref,
    () => ({
      saveCalibration: persistCalibration,
      isDirty: () =>
        !scscFieldOverridesEqual(
          normalizedOverrides(draftOverrides),
          normalizedOverrides(a4Profile.scscFieldOverrides)
        ),
    }),
    [a4Profile.scscFieldOverrides, draftOverrides, persistCalibration]
  );

  const handleSaveProfile = useCallback(() => {
    void persistCalibration();
  }, [persistCalibration]);

  const handleResetField = useCallback(
    (key: string) => {
      setDraftOverrides((prev) => removeScscFieldOverride(prev, key));
      if (selectedKey === key) setSelectedKey(null);
      setSaveHint(null);
    },
    [selectedKey]
  );

  const nudgeField = useCallback(
    (key: string, dx: number, dy: number) => {
      const def = printFields.find((f) => f.key === key);
      if (!def) return;
      patchField(key, { x: roundScscMm(def.x + dx), y: roundScscMm(def.y + dy) });
    },
    [patchField, printFields]
  );

  useLayoutEffect(() => {
    if (studio) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const fit = () => {
      const cw = viewport.clientWidth;
      const ch = viewport.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      setScale(Math.min(cw / PAGE_W_PX, ch / PAGE_H_PX, 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [studio]);

  const startDrag = useCallback(
    (e: React.PointerEvent, def: ScscFieldDef, mode: "move" | "resize") => {
      if (!coordsActive) return;
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
          const x = roundScscMm(start.x + dxMm);
          const y = roundScscMm(start.y + dyMm);
          patchField(def.key, { x, y });
          setDragGuide({ mode: "move", xMm: x, yMm: y });
        } else {
          const width = roundScscMm(Math.max(4, start.width + dxMm));
          patchField(def.key, { width });
          setDragGuide({ mode: "resize", xMm: start.x, yMm: start.y, widthMm: width });
        }
      };

      const onUp = () => {
        setDragGuide(null);
        target.releasePointerCapture(e.pointerId);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },
    [coordsActive, patchField, scaleX, scaleY]
  );

  const fieldsToRender = coordsActive && showEmptyFields ? printFields : fieldsOnPage;

  const pageContent = (
    <>
      {!studio ? (
        <img
          src={SCSC_WEIGH_TEMPLATE_PNG_URL}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-fill object-left-top"
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-white" aria-hidden />
      )}
      {coordsActive ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)
              `,
              backgroundSize: "1mm 1mm",
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(0,0,0,0.12) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0,0,0,0.12) 1px, transparent 1px)
              `,
              backgroundSize: "10mm 10mm",
            }}
            aria-hidden
          />
        </>
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
              role={coordsActive ? "button" : undefined}
              tabIndex={coordsActive ? 0 : undefined}
              onPointerDown={coordsActive ? (e) => startDrag(e, def, "move") : undefined}
              onClick={
                coordsActive
                  ? (e) => {
                      e.stopPropagation();
                      setSelectedKey(selectedKey === def.key ? null : def.key);
                    }
                  : undefined
              }
              style={{
                ...baseStyle,
                pointerEvents: coordsActive ? "auto" : "none",
                touchAction: coordsActive ? "none" : undefined,
                outline: active
                  ? "2px solid rgba(0, 122, 255, 0.9)"
                  : coordsActive
                    ? customized
                      ? "1px solid rgba(255, 149, 0, 0.85)"
                      : "1px dashed rgba(0, 122, 255, 0.45)"
                    : undefined,
                outlineOffset: coordsActive ? "-1px" : undefined,
                backgroundColor: active
                  ? "rgba(0, 122, 255, 0.14)"
                  : coordsActive
                    ? customized
                      ? "rgba(255, 149, 0, 0.12)"
                      : "rgba(255, 255, 255, 0.35)"
                    : undefined,
                cursor: coordsActive ? "move" : undefined,
              }}
              title={coordsActive ? formatScscFieldCoordSnippet(bounds) : undefined}
            >
              {printValues[def.key] ?? ""}
              {coordsActive ? (
                <span className="pointer-events-none absolute left-0 top-0 z-10 -translate-y-full whitespace-nowrap rounded bg-apple-blue px-1 py-px text-[7px] font-semibold leading-tight text-white shadow-sm">
                  {formatScscCoordMm(bounds.x)},{formatScscCoordMm(bounds.y)}
                  {customized ? " *" : ""}
                </span>
              ) : null}
              {coordsActive ? (
                <span
                  role="presentation"
                  data-resize-handle="1"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedKey(def.key);
                    startDrag(e, def, "resize");
                  }}
                  className={`absolute bottom-0 right-0 z-20 cursor-ew-resize rounded-sm border border-white bg-apple-blue shadow ${
                    active ? "h-2.5 w-2.5" : "h-2 w-2 opacity-50 hover:opacity-100"
                  }`}
                  style={{ transform: "translate(40%, 40%)" }}
                  title="Kéo để chỉnh rộng dòng (mm)"
                />
              ) : null}
            </div>
          );
        })}
        {dragGuide ? (
          <ScscWeighDragGuides guide={dragGuide} pageWidthMm={PAGE_W_MM} pageHeightMm={PAGE_H_MM} />
        ) : null}
      </div>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 px-1">
        <p className={`text-[10px] font-semibold uppercase ${OPS.muted}`}>
          {studio ? "Trang trắng A4 (210×297 mm)" : "Xem trước phiếu in"}
        </p>
        {!studio ? (
          <label className={OPS.printCoordsToggle}>
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
        ) : (
          <span className={`text-[10px] ${OPS.secondary}`}>
            A4 thật · thước mm · {a4Profile.name}
          </span>
        )}
      </div>

      {coordsActive ? (
        <div
          className={`mb-2 flex flex-wrap items-center gap-2 text-[10px] ${
            dirty ? OPS.printCoordsToolbarOn : OPS.printCoordsToolbarOff
          }`}
        >
          <span className={OPS.secondary}>
            {dirty
              ? "Kéo ô trên trang trắng hoặc chỉnh bảng bên phải — rộng từng dòng: kéo mép phải, ± hoặc nhập mm."
              : studio
                ? "Không hiển thị mẫu scan — căn chỉnh ô chữ theo form giấy in sẵn + thước kẻ mm."
                : "Kéo ô để chỉnh; lưu vào profile máy in A4."}
          </span>
          {studio ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveProfile()}
              className={`rounded-full px-3 py-1 font-semibold text-white shadow-sm transition-all disabled:opacity-60 ${
                justSaved
                  ? "bg-emerald-600 ring-2 ring-emerald-400/60"
                  : dirty
                    ? "animate-pulse bg-apple-blue ring-2 ring-sky-400/70"
                    : "bg-slate-500 dark:bg-slate-600"
              }`}
            >
              {saving ? "Đang lưu…" : justSaved ? "✓ Đã lưu" : dirty ? "● Lưu căn chỉnh" : "Lưu căn chỉnh"}
            </button>
          ) : dirty ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveProfile()}
              className={`rounded-full px-3 py-1 font-semibold text-white shadow-sm disabled:opacity-60 ${
                dirty ? "animate-pulse bg-apple-blue ring-2 ring-sky-400/70" : "bg-slate-500"
              }`}
            >
              {saving ? "Đang lưu…" : `Lưu profile «${a4Profile.name}»`}
            </button>
          ) : null}
        </div>
      ) : null}

      {saveHint ? (
        <p className="mb-2 px-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">{saveHint}</p>
      ) : null}

      <div className={`flex min-h-0 flex-1 ${studio && coordsActive ? "flex-row" : "flex-col"}`}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={viewportRef}
            className={`flex w-full flex-1 items-start justify-center overflow-auto p-3 ${
              studio ? "min-h-0 bg-slate-200/50 dark:bg-black/30" : `min-h-[min(48vh,480px)] ${OPS.printPreviewFrame}`
            }`}
          >
            {studio ? (
              <ScscWeighMmRulerFrame pageWidthMm={PAGE_W_MM} pageHeightMm={PAGE_H_MM} physicalSize>
                <div ref={pageRef} className="relative h-full w-full">
                  {pageContent}
                </div>
              </ScscWeighMmRulerFrame>
            ) : (
              <div
                ref={pageRef}
                className="relative origin-top-left"
                style={{
                  width: `${PAGE_W_MM}mm`,
                  height: `${PAGE_H_MM}mm`,
                  transform: `scale(${scale})`,
                }}
              >
                {pageContent}
              </div>
            )}
          </div>

          {showSummary ? (
            <div className={`mt-3 shrink-0 grid grid-cols-1 gap-2 px-1 text-xs sm:grid-cols-2 ${OPS.secondary}`}>
              <div className={OPS.printSummaryCard}>
                <p className={`font-semibold ${OPS.muted}`}>Shipper</p>
                <p className={`mt-0.5 ${OPS.title}`}>{formData.shipperName || "—"}</p>
              </div>
              <div className={OPS.printSummaryCard}>
                <p className={`font-semibold ${OPS.muted}`}>Agent</p>
                <p className={`mt-0.5 ${OPS.title}`}>{formData.agentName || "—"}</p>
              </div>
              <div className={OPS.printSummaryCard}>
                <p className={`font-semibold ${OPS.muted}`}>CNEE</p>
                <p className={`mt-0.5 ${OPS.title}`}>{formData.consigneeName || "—"}</p>
              </div>
              <div className={OPS.printSummaryCard}>
                <p className={`font-semibold ${OPS.muted}`}>Tên hàng</p>
                <p className={`mt-0.5 ${OPS.title}`}>{formData.goodsDescription || "—"}</p>
              </div>
            </div>
          ) : null}
        </div>

        {coordsActive ? (
          <div
            className={
              studio
                ? `flex min-h-0 w-[17.5rem] shrink-0 flex-col overflow-hidden border-l py-1 pl-2 ${OPS.border}`
                : undefined
            }
          >
            <ScscWeighPreviewCoordsPanel
              layout={studio ? "sidebar" : "bottom"}
              expanded={studio}
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
          </div>
        ) : null}
      </div>
    </div>
  );
});
