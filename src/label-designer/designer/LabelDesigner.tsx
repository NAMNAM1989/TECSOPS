import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LabelDocumentKind, LabelTemplateV1 } from "../core/types";
import { getBuiltinTemplate } from "../core/defaultTemplates";
import { bindLabelTemplate } from "../core/bindingResolver";
import type { LabelDataContext } from "../core/types";
import { LabelMmHtmlView } from "../render/htmlMmRenderer";
import { getExtraObjects } from "../core/templatePreserve";
import { exportStagePng } from "../export/pngExport";
import { DesignerCanvas } from "./DesignerCanvas";
import { LayerPanel } from "./LayerPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { useDesignerState } from "./useDesignerState";
import { createDesignerObject, createImageObject, type FactoryKey } from "./objectFactories";

export type LabelDesignerProps = {
  open: boolean;
  initialTemplate: LabelTemplateV1;
  documentKind: LabelDocumentKind;
  sampleContext?: LabelDataContext;
  onSave: (template: LabelTemplateV1) => void;
  onClose: () => void;
};

/* ─── Button style helpers ─────────────────────────────────────── */

/** Nút trên header tối */
const btnDark =
  "select-none rounded-lg px-2.5 py-1.5 text-xs font-medium leading-none transition-all duration-100 " +
  "bg-white/[0.10] text-white/90 hover:bg-white/[0.18] hover:text-white " +
  "active:scale-[0.93] active:bg-white/[0.24] disabled:pointer-events-none disabled:opacity-35";

/** Nút chính (Lưu) */
const btnPrimary =
  "select-none rounded-lg px-3.5 py-1.5 text-xs font-semibold leading-none transition-all duration-100 " +
  "bg-blue-500 text-white hover:bg-blue-400 active:scale-[0.93] active:bg-blue-600 shadow-sm shadow-blue-900/30";

/** Nút Đóng */
const btnClose =
  "select-none rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium leading-none transition-all duration-100 " +
  "text-white/70 hover:bg-white/[0.10] hover:text-white active:scale-[0.93] active:bg-white/[0.18]";

/* ─── Toolbox items ─────────────────────────────────────────────── */

const TOOLS: { key: FactoryKey; label: string; icon: string; desc: string }[] = [
  { key: "text", label: "Văn bản", icon: "Aa", desc: "Thêm hộp chữ" },
  { key: "line", label: "Đường kẻ", icon: "╱", desc: "Đường thẳng" },
  { key: "rect", label: "Hình chữ nhật", icon: "□", desc: "Khung / viền" },
  { key: "image", label: "Hình ảnh", icon: "⊡", desc: "Upload ảnh" },
  { key: "barcode", label: "Mã vạch", icon: "▥", desc: "Barcode 1D" },
  { key: "qr", label: "Mã QR", icon: "⊞", desc: "QR Code" },
  { key: "table", label: "Bảng", icon: "⊟", desc: "Bảng có ô" },
];

export function LabelDesigner({
  open,
  initialTemplate,
  documentKind,
  sampleContext,
  onSave,
  onClose,
}: LabelDesignerProps) {
  const {
    template,
    selected,
    selectedId,
    setSelectedId,
    gridSnap,
    setGridSnap,
    gridMm,
    updateObject,
    patchSelected,
    addObject,
    deleteSelected,
    duplicateSelected,
    reorderObject,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  } = useDesignerState(initialTemplate);

  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(false);
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const boundPreview = useMemo(() => {
    if (!sampleContext) return template;
    return bindLabelTemplate(template, sampleContext);
  }, [template, sampleContext]);

  /** Mẫu gốc builtin để hiển thị tham chiếu trong sidebar */
  const builtinBound = useMemo(() => {
    const builtin = getBuiltinTemplate(documentKind);
    if (!sampleContext) return builtin;
    return bindLabelTemplate(builtin, sampleContext);
  }, [documentKind, sampleContext]);

  /** Số đối tượng thêm (extras) so với builtin */
  const extrasCount = useMemo(
    () => getExtraObjects(template, documentKind).length,
    [template, documentKind]
  );

  const handleSave = useCallback(() => {
    onSave({ ...template, updatedAt: new Date().toISOString() });
  }, [onSave, template]);

  const loadBuiltin = useCallback(() => {
    if (confirm("Tải lại mẫu mặc định? Thay đổi chưa lưu sẽ mất.")) {
      reset(getBuiltinTemplate(documentKind));
      setSelectedId(null);
    }
  }, [documentKind, reset, setSelectedId]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex flex-col bg-slate-900">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-white/[0.08] bg-slate-950/80 px-3 py-2 backdrop-blur-sm">
        {/* Title */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">{template.name}</span>
          <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-white/60">{documentKind}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {/* Undo / Redo */}
          <div className="flex items-center rounded-lg bg-white/[0.07] p-0.5">
            <button type="button" title="Hoàn tác (Ctrl+Z)" className={btnDark} disabled={!canUndo} onClick={undo}>
              ↩
            </button>
            <div className="h-4 w-px bg-white/10" />
            <button type="button" title="Làm lại (Ctrl+Y)" className={btnDark} disabled={!canRedo} onClick={redo}>
              ↪
            </button>
          </div>

          {/* Zoom */}
          <div className="flex items-center rounded-lg bg-white/[0.07] p-0.5">
            <button
              type="button"
              title="Thu nhỏ"
              className={btnDark}
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(1)))}
            >
              −
            </button>
            <button
              type="button"
              className="select-none px-2 py-1.5 text-xs font-mono text-white/70 tabular-nums hover:text-white"
              onClick={() => setZoom(1)}
              title="Về 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              title="Phóng to"
              className={btnDark}
              onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}
            >
              +
            </button>
          </div>

          {/* Snap */}
          <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/[0.14]">
            <input
              type="checkbox"
              checked={gridSnap}
              onChange={(e) => setGridSnap(e.target.checked)}
              className="h-3.5 w-3.5 accent-blue-400"
            />
            <span>Snap {gridMm}mm</span>
          </label>

          {/* Preview toggle */}
          <button
            type="button"
            className={
              preview
                ? "select-none rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium leading-none text-white transition-all duration-100 hover:bg-amber-400 active:scale-[0.93]"
                : btnDark
            }
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? "✏ Sửa" : "👁 Xem thử"}
          </button>

          {/* Mẫu gốc */}
          <button type="button" className={btnDark} onClick={loadBuiltin}>
            ↺ Mẫu gốc
          </button>

          {/* PNG export */}
          <button
            type="button"
            className={btnDark}
            onClick={() => void exportStagePng(stageContainerRef.current)}
          >
            ⬇ PNG
          </button>

          {/* Save */}
          <button type="button" className={btnPrimary} onClick={handleSave}>
            ✓ Lưu{extrasCount > 0 ? ` (${extrasCount} thêm)` : ""}
          </button>

          {/* Close */}
          <button type="button" className={btnClose} onClick={onClose}>
            ✕ Đóng
          </button>
        </div>
      </header>

      {/* ─── Body ───────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Toolbox sidebar */}
        <aside className="flex w-[140px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/[0.08] bg-slate-800/70 p-2">
          <p className="mb-0.5 px-1 text-[9px] font-semibold uppercase tracking-widest text-white/35">
            Công cụ
          </p>

          {TOOLS.map((t) => (
            <button
              key={t.key}
              type="button"
              title={t.desc}
              className={
                "group select-none flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left " +
                "transition-all duration-100 " +
                "bg-white/[0.06] hover:bg-white/[0.14] active:scale-[0.96] active:bg-white/[0.20] " +
                "border border-transparent hover:border-white/[0.08]"
              }
              onClick={() => {
                if (t.key === "image") {
                  imageInputRef.current?.click();
                  return;
                }
                addObject(createDesignerObject(t.key));
              }}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white/80 group-hover:bg-white/[0.18] group-hover:text-white transition-colors">
                {t.icon}
              </span>
              <span className="flex flex-col">
                <span className="text-[11px] font-medium leading-tight text-white/90">{t.label}</span>
                <span className="text-[9px] leading-tight text-white/40">{t.desc}</span>
              </span>
            </button>
          ))}

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") {
                  addObject(createImageObject(10, 10, reader.result));
                }
              };
              reader.readAsDataURL(file);
              e.target.value = "";
            }}
          />

          {/* Extras counter */}
          {extrasCount > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="text-[9px] font-semibold text-emerald-400">
                ✓ {extrasCount} đối tượng thêm
              </p>
              <p className="text-[8px] text-emerald-300/60">
                Sẽ overlay lên mẫu gốc khi in
              </p>
            </div>
          )}

          {/* Mẫu gốc reference */}
          <div className="mt-auto">
            <p className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-widest text-white/35">
              Mẫu gốc (tham khảo)
            </p>
            <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.04]">
              <div
                style={{
                  transform: "scale(0.32)",
                  transformOrigin: "top left",
                  width: "312.5%",
                  pointerEvents: "none",
                  lineHeight: 1,
                }}
              >
                <LabelMmHtmlView template={builtinBound} />
              </div>
            </div>
            <p className="mt-1 px-1 text-[8px] text-white/25">
              Đối tượng bạn thêm sẽ overlay lên bố cục này.
            </p>
          </div>
        </aside>

        {/* Canvas */}
        <main ref={stageContainerRef} className="relative min-w-0 flex-1 bg-slate-700">
          {preview && sampleContext ? (
            <div className="flex h-full items-center justify-center overflow-auto p-6">
              <LabelMmHtmlView template={boundPreview} />
            </div>
          ) : (
            <DesignerCanvas
              template={template}
              selectedId={selectedId}
              zoom={zoom}
              gridSnap={gridSnap}
              gridMm={gridMm}
              onSelect={setSelectedId}
              onChangeObject={updateObject}
            />
          )}
        </main>

        {/* Right panel */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-white/[0.08] bg-[#f5f5f7] p-3">
          <LayerPanel
            template={template}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={reorderObject}
          />
          <div className="my-3 border-t border-black/[0.08]" />
          <PropertiesPanel
            selected={selected}
            onPatch={patchSelected}
            onReplace={updateObject}
            onDelete={deleteSelected}
            onDuplicate={duplicateSelected}
          />
        </aside>
      </div>
    </div>,
    document.body
  );
}
