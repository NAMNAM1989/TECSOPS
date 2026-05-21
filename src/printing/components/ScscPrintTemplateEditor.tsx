import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { A4WeighReceiptPrinterProfile } from "../printTypes";
import type { ScaleTicketFormData } from "../../utils/mapBookingToScaleTicketFormData";
import type { PrintJobContext } from "../../utils/printServerApi";
import {
  DEFAULT_SCSC_PRINT_PROFILE_ID,
  fetchPrintJobContext,
  probePrintApiAvailable,
  savePrintProfileFields,
} from "../../utils/printServerApi";
import {
  migrateLocalScscFieldsToServer,
  printFieldsToScscDefs,
  scscDefToPrintFieldPayload,
  scscDefsSnapshotEqual,
} from "../../utils/printFieldConvert";
import { SAMPLE_SCSC_FORM_DATA } from "../../utils/scscWeighPdfPrint";
import { buildScscWeighOverlayValues, scscFieldBoxStyle, type ScscFieldDef } from "../scscWeigh/scscWeighTemplate";
import { defaultScscWeighPrintSettings } from "../scscWeigh/scscWeighPrintSettingsCore";
import {
  SCSC_A4_PAGE_HEIGHT_MM,
  SCSC_A4_PAGE_WIDTH_MM,
  SCSC_WEIGH_TEMPLATE_PNG_URL,
} from "../scscWeigh/scscWeighTemplateAsset";
import { getScscFieldBoundsMm } from "../scscWeigh/scscFieldCoords";
import { roundScscMm } from "../scscWeigh/scscFieldOverrides";
import { pointerDeltaToLayoutMm } from "../scscWeigh/scscPreviewDrag";
import { ScscWeighPreviewCoordsPanel } from "../scscWeigh/ScscWeighPreviewCoordsPanel";
import { resolveScscWeighPrintTransform } from "../scscWeigh/scscWeighPrint";
import { PRINT_NUDGE_MM } from "../../utils/printMmUnits";
import type { ScscFieldOverride } from "../printTypes";

const PAGE_W_MM = SCSC_A4_PAGE_WIDTH_MM;
const PAGE_H_MM = SCSC_A4_PAGE_HEIGHT_MM;
const MM_TO_PX = 96 / 25.4;
const PAGE_W_PX = PAGE_W_MM * MM_TO_PX;
const PAGE_H_PX = PAGE_H_MM * MM_TO_PX;

type Props = {
  open: boolean;
  onClose: () => void;
  sampleFormData?: ScaleTicketFormData;
};

function postgresProfileToA4(ctx: PrintJobContext): A4WeighReceiptPrinterProfile {
  return {
    id: ctx.profile.id,
    name: ctx.profile.name,
    type: "a4-browser",
    paper: "A4",
    offsetXmm: ctx.profile.offsetXMm,
    offsetYmm: ctx.profile.offsetYMm,
    scaleX: ctx.profile.scaleX,
    scaleY: ctx.profile.scaleY,
    templateVersion: "postgres-v1",
    scscFieldOverrides: {},
  };
}

/** Admin: chỉnh tọa độ mm trên Postgres — kéo thả + nudge ±0.5mm. */
export function ScscPrintTemplateEditor({
  open,
  onClose,
  sampleFormData = SAMPLE_SCSC_FORM_DATA,
}: Props) {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<PrintJobContext | null>(null);
  const [draftFields, setDraftFields] = useState<ScscFieldDef[]>([]);
  const [savedFields, setSavedFields] = useState<ScscFieldDef[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showEmptyFields, setShowEmptyFields] = useState(true);

  const frameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const available = await probePrintApiAvailable();
      setApiOk(available);
      if (!available) {
        setError("Cần DATABASE_URL trên server và chạy migration print_templates.");
        return;
      }
      const job = await fetchPrintJobContext({ profileId: DEFAULT_SCSC_PRINT_PROFILE_ID });
      const defs = printFieldsToScscDefs(job.fields);
      setCtx(job);
      setDraftFields(defs);
      setSavedFields(defs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  const dirty = !scscDefsSnapshotEqual(draftFields, savedFields);
  const syntheticProfile = useMemo(
    () => (ctx ? postgresProfileToA4(ctx) : null),
    [ctx]
  );

  const values = useMemo(
    () => buildScscWeighOverlayValues(sampleFormData, defaultScscWeighPrintSettings()),
    [sampleFormData]
  );

  const { scaleX, scaleY } = useMemo(() => {
    if (!syntheticProfile) {
      return { scaleX: 1, scaleY: 1 };
    }
    return resolveScscWeighPrintTransform({ profile: syntheticProfile });
  }, [syntheticProfile]);

  const patchField = useCallback((key: string, patch: ScscFieldOverride) => {
    setDraftFields((prev) =>
      prev.map((f) =>
        f.key === key
          ? {
              ...f,
              ...(patch.x != null ? { x: patch.x } : {}),
              ...(patch.y != null ? { y: patch.y } : {}),
              ...(patch.width != null ? { width: patch.width } : {}),
              ...(patch.fontPt != null ? { fontPt: patch.fontPt } : {}),
              ...(patch.fontMm != null ? { fontMm: patch.fontMm } : {}),
              ...(patch.lineHeightMm != null ? { lineHeightMm: patch.lineHeightMm } : {}),
              ...(patch.heightMm != null ? { heightMm: patch.heightMm } : {}),
            }
          : f
      )
    );
    setStatus(null);
  }, []);

  const nudgeField = useCallback(
    (key: string, dx: number, dy: number) => {
      const def = draftFields.find((f) => f.key === key);
      if (!def) return;
      patchField(key, { x: roundScscMm(def.x + dx), y: roundScscMm(def.y + dy) });
    },
    [draftFields, patchField]
  );

  const handleSave = useCallback(async () => {
    if (!ctx) return;
    setStatus("Đang lưu…");
    try {
      const payloads = draftFields.map((def, i) => {
        const existing = ctx.fields.find((f) => f.fieldKey === def.key);
        return scscDefToPrintFieldPayload(def, existing, i);
      });
      await savePrintProfileFields(ctx.profile.id, payloads);
      setSavedFields(draftFields);
      setStatus("Đã lưu tọa độ mm lên Postgres.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [ctx, draftFields]);

  const handleImportLocal = useCallback(async () => {
    if (!ctx) return;
    setStatus("Đang import từ profile local…");
    try {
      const n = await migrateLocalScscFieldsToServer(ctx.profile.id);
      await reload();
      setStatus(`Đã import ${n} ô từ profile A4 localStorage.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [ctx, reload]);

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
  }, [open]);

  const startDrag = useCallback(
    (e: React.PointerEvent, def: ScscFieldDef, mode: "move" | "resize") => {
      e.preventDefault();
      e.stopPropagation();
      const pageEl = pageRef.current;
      if (!pageEl) return;
      setSelectedKey(def.key);
      const pageRect = pageEl.getBoundingClientRect();
      const start = { clientX: e.clientX, clientY: e.clientY, x: def.x, y: def.y, width: def.width };
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
    [patchField, scaleX, scaleY]
  );

  const fieldsToRender = useMemo(() => {
    if (showEmptyFields) return draftFields;
    return draftFields.filter((def) => Boolean((values[def.key] ?? "").trim()) || def.key === "otherRequirements");
  }, [draftFields, showEmptyFields, values]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="no-print fixed inset-0 z-[100] flex flex-col bg-apple-bg">
      <header className="flex shrink-0 items-center justify-between border-b border-black/[0.08] bg-white px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-apple-label">Chỉnh mẫu phiếu cân SCSC (PDF server)</h2>
          <p className="text-xs text-apple-secondary">
            Kéo thả / mũi tên ±{PRINT_NUDGE_MM}mm · lưu tọa độ mm vào Postgres
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border px-4 py-2 text-sm font-semibold">
          Đóng
        </button>
      </header>

      {loading ? (
        <p className="p-8 text-sm text-apple-secondary">Đang tải mẫu in…</p>
      ) : apiOk === false || error ? (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">PDF server chưa sẵn sàng</p>
          <p className="mt-1">{error ?? "Thiếu DATABASE_URL hoặc chưa migration."}</p>
          <p className="mt-2 text-xs">
            Chạy:{" "}
            <code className="rounded bg-white px-1">psql $DATABASE_URL -f server/migrations/20260521_print_templates.sql</code>
          </p>
        </div>
      ) : syntheticProfile && ctx ? (
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1fr_320px]">
          <div className="flex min-h-0 flex-col gap-2">
            <div
              className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[10px] ${
                dirty ? "border-apple-blue/30 bg-apple-blue/5" : "border-black/[0.06] bg-white"
              }`}
            >
              <span className="font-semibold text-apple-label">{ctx.profile.name}</span>
              <span className="text-apple-tertiary">·</span>
              <span className="text-apple-secondary">{draftFields.length} ô · A4 {PAGE_W_MM}×{PAGE_H_MM}mm</span>
              {dirty ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    className="rounded-full bg-apple-blue px-3 py-1 font-semibold text-white"
                  >
                    Lưu lên server
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftFields(savedFields)}
                    className="rounded-full border border-black/[0.12] bg-white px-3 py-1 font-semibold"
                  >
                    Hoàn tác
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => void handleImportLocal()}
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 font-semibold text-violet-900"
              >
                Import từ profile local
              </button>
              <label className="ml-auto flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showEmptyFields}
                  onChange={(e) => setShowEmptyFields(e.target.checked)}
                  className="rounded"
                />
                Hiện ô trống
              </label>
            </div>

            {status ? <p className="px-1 text-[10px] font-medium text-emerald-700">{status}</p> : null}

            <div
              ref={frameRef}
              className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-black/[0.1] bg-[#e8eaee] shadow-inner"
            >
              <div
                ref={pageRef}
                className="absolute left-2 top-2 origin-top-left"
                style={{
                  width: `${PAGE_W_MM}mm`,
                  height: `${PAGE_H_MM}mm`,
                  transform: `scale(${scale})`,
                }}
              >
                <img
                  src={SCSC_WEIGH_TEMPLATE_PNG_URL}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-40"
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)
                    `,
                    backgroundSize: "10mm 10mm",
                  }}
                  aria-hidden
                />
                <div
                  className="absolute left-0 top-0"
                  style={{
                    width: `${PAGE_W_MM}mm`,
                    height: `${PAGE_H_MM}mm`,
                    transformOrigin: "top left",
                  }}
                >
                  {fieldsToRender.map((def) => {
                    const active = selectedKey === def.key;
                    const bounds = getScscFieldBoundsMm(def, values);
                    const baseStyle = scscFieldBoxStyle(def);
                    return (
                      <div
                        key={def.key}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => startDrag(e, def, "move")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedKey(selectedKey === def.key ? null : def.key);
                        }}
                        style={{
                          ...baseStyle,
                          outline: active ? "2px solid rgba(0,122,255,0.85)" : "1px dashed rgba(0,122,255,0.35)",
                          background: active ? "rgba(0,122,255,0.12)" : "rgba(0,122,255,0.06)",
                          cursor: "grab",
                          touchAction: "none",
                        }}
                        title={def.key}
                      >
                        <span className="pointer-events-none block truncate px-0.5 text-[6px] font-semibold leading-tight text-apple-label">
                          {(values[def.key] ?? "").trim() || def.key}
                        </span>
                        {active ? (
                          <span
                            className="absolute bottom-0 right-0 h-2 w-2 cursor-se-resize bg-apple-blue"
                            onPointerDown={(e) => startDrag(e, def, "resize")}
                          />
                        ) : null}
                        <span className="pointer-events-none absolute -top-3 left-0 text-[5px] font-bold uppercase text-apple-blue">
                          {bounds.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto rounded-xl border border-black/[0.08] bg-white p-2">
            <ScscWeighPreviewCoordsPanel
              fields={draftFields}
              values={values}
              profile={syntheticProfile}
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
              showEmptyFields={showEmptyFields}
              onShowEmptyFieldsChange={setShowEmptyFields}
              overrideKeys={new Set(draftFields.map((f) => f.key))}
              onResetField={(key) => {
                const orig = savedFields.find((f) => f.key === key);
                if (orig) patchField(key, { x: orig.x, y: orig.y, width: orig.width });
              }}
              onNudgeField={(key, dx, dy) => nudgeField(key, dx, dy)}
              onPatchField={patchField}
            />
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
