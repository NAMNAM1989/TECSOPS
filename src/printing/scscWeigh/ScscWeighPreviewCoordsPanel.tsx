import { useMemo } from "react";
import type { A4WeighReceiptPrinterProfile, ScscFieldOverride } from "../printTypes";
import type { ScscFieldDef } from "./scscWeighTemplate";
import {
  nudgeScscFieldFontPatch,
  readScscFieldFont,
  roundScscPt,
  setScscFieldFontPatch,
  type ScscFieldFontUnit,
} from "./scscFieldFont";
import { roundScscMm, SCSC_FIELD_MM_LIMITS } from "./scscFieldOverrides";
import {
  applyScscPrintTransformToBounds,
  buildScscCoordsCopyText,
  formatScscCoordMm,
  getScscFieldBoundsMm,
  type ScscFieldBoundsMm,
  type ScscPrintTransformMm,
} from "./scscFieldCoords";
import { resolveScscWeighPrintTransform } from "./scscWeighPrint";
import { OPS } from "../../styles/opsModalStyles";

type Props = {
  fields: ScscFieldDef[];
  values: Record<string, string>;
  profile: A4WeighReceiptPrinterProfile;
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  showEmptyFields: boolean;
  onShowEmptyFieldsChange: (v: boolean) => void;
  overrideKeys: ReadonlySet<string>;
  onResetField: (key: string) => void;
  onNudgeField: (key: string, dxMm: number, dyMm: number) => void;
  onPatchField: (key: string, patch: ScscFieldOverride) => void;
  expanded?: boolean;
  /** `sidebar` — cột phải, preview chiếm phần còn lại. */
  layout?: "bottom" | "sidebar";
};

function hasTransform(t: ScscPrintTransformMm): boolean {
  return (
    Math.abs(t.offsetXmm) > 0.05 ||
    Math.abs(t.offsetYmm) > 0.05 ||
    Math.abs(t.scaleX - 1) > 0.0001 ||
    Math.abs(t.scaleY - 1) > 0.0001
  );
}

export function ScscWeighPreviewCoordsPanel({
  fields,
  values,
  profile,
  selectedKey,
  onSelectKey,
  showEmptyFields,
  onShowEmptyFieldsChange,
  overrideKeys,
  onResetField,
  onNudgeField,
  onPatchField,
  expanded = false,
  layout = "bottom",
}: Props) {
  const sidebar = layout === "sidebar";
  const transform = resolveScscWeighPrintTransform({ profile });
  const selectedDef = useMemo(
    () => (selectedKey ? fields.find((f) => f.key === selectedKey) ?? null : null),
    [fields, selectedKey]
  );
  const rows = useMemo(() => {
    const all = fields.map((def) => getScscFieldBoundsMm(def, values));
    return showEmptyFields ? all : all.filter((b) => b.hasValue);
  }, [fields, values, showEmptyFields]);

  const copyAll = () => {
    void navigator.clipboard?.writeText(buildScscCoordsCopyText(rows, profile.name, transform));
  };

  return (
    <div
      className={`flex min-h-0 flex-col ${
        sidebar ? `h-full ${OPS.printCoordsPanel}` : `mt-2 ${OPS.printCoordsPanel}`
      }`}
    >
      <div className={`flex flex-wrap items-center justify-between gap-2 ${OPS.printCoordsPanelHead}`}>
        <div>
          <p className={OPS.printCoordsPanelTitle}>Tọa độ ô in (mm)</p>
          <p className={OPS.printCoordsPanelHint}>
            Profile: <span className="font-medium">{profile.name}</span>
            {" · "}
            offset X={formatScscCoordMm(transform.offsetXmm)} Y={formatScscCoordMm(transform.offsetYmm)}
            {" · "}
            scale {transform.scaleX}×{transform.scaleY}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`flex cursor-pointer items-center gap-1.5 text-[10px] ${OPS.printCoordsPanelHint}`}>
            <input
              type="checkbox"
              checked={showEmptyFields}
              onChange={(e) => onShowEmptyFieldsChange(e.target.checked)}
              className="rounded"
            />
            Ô trống
          </label>
          <button
            type="button"
            onClick={() => void copyAll()}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${OPS.btnSmallAccent}`}
          >
            Sao chép tất cả
          </button>
        </div>
      </div>
      {!sidebar ? (
        <p className={`px-3 py-1.5 text-[10px] leading-snug ${OPS.printCoordsPanelHint}`}>
          Gốc: mép trái + mép trên A4 (mm). Trang preview là trắng A4 thật — căn theo form giấy in sẵn.
        </p>
      ) : null}
      {selectedDef ? (
        <SelectedFieldEditor
          def={selectedDef}
          onNudge={(dx, dy) => onNudgeField(selectedDef.key, dx, dy)}
          onPatch={(patch) => onPatchField(selectedDef.key, patch)}
        />
      ) : null}
      <div
        className={
          sidebar
            ? "min-h-0 flex-1 overflow-auto"
            : `min-h-0 overflow-auto ${expanded ? "max-h-[min(40vh,320px)]" : "max-h-40"}`
        }
      >
        <table className={`w-full border-collapse text-left text-[10px] ${OPS.secondary}`}>
          <thead className={OPS.printCoordsTableHead}>
            <tr>
              <th className="px-2 py-1 font-semibold">Ô</th>
              <th className="px-1 py-1 font-semibold">X</th>
              <th className="px-1 py-1 font-semibold">Y</th>
              <th className="px-1 py-1 font-semibold">Rộng</th>
              <th className="px-1 py-1 font-semibold">Cao</th>
              <th className="px-1 py-1 font-semibold">Chữ</th>
              <th className="w-8 px-1 py-1 font-semibold" aria-label="Thao tác" />
              {hasTransform(transform) ? (
                <>
                  <th className="px-1 py-1 font-semibold">X′</th>
                  <th className="px-1 py-1 font-semibold">Y′</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <CoordRow
                key={b.key}
                bounds={b}
                transform={transform}
                active={selectedKey === b.key}
                customized={overrideKeys.has(b.key)}
                onSelect={() => onSelectKey(selectedKey === b.key ? null : b.key)}
                onReset={() => onResetField(b.key)}
                onPatchWidth={(width) => onPatchField(b.key, { width })}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SelectedFieldEditor({
  def,
  onNudge,
  onPatch,
}: {
  def: ScscFieldDef;
  onNudge: (dxMm: number, dyMm: number) => void;
  onPatch: (patch: ScscFieldOverride) => void;
}) {
  const font = readScscFieldFont(def);
  const hasLineHeight = def.lineHeightMm != null;
  const hasBoxHeight = def.heightMm != null || def.multiline;

  return (
    <div className={`space-y-1.5 border-b px-3 py-2 ${OPS.border}`}>
      <div className="flex flex-wrap items-center gap-1">
        <span className={`mr-1 text-[10px] font-semibold ${OPS.title}`}>Vị trí:</span>
        {(
          [
            ["←", -0.5, 0],
            ["→", 0.5, 0],
            ["↑", 0, -0.5],
            ["↓", 0, 0.5],
          ] as const
        ).map(([label, dx, dy]) => (
          <button
            key={label}
            type="button"
            onClick={() => onNudge(dx, dy)}
            className={OPS.printStepperBtn}
          >
            {label}
          </button>
        ))}
        <span className={`ml-1 text-[10px] ${OPS.secondary}`}>· kéo mép phải ô trên phiếu</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MmStepper
          label="Rộng dòng"
          value={def.width}
          min={SCSC_FIELD_MM_LIMITS.width.min}
          max={SCSC_FIELD_MM_LIMITS.width.max}
          step={0.5}
          onDelta={(d) => onPatch({ width: roundScscMm(def.width + d * 0.5) })}
          onSet={(v) => onPatch({ width: roundScscMm(v) })}
        />
        <FontStepper
          label="Cỡ chữ"
          unit={font.unit}
          value={font.value}
          onDelta={(d) => onPatch(nudgeScscFieldFontPatch(def, d))}
          onSet={(unit, value) => onPatch(setScscFieldFontPatch(unit, value))}
        />
        {hasLineHeight ? (
          <MmStepper
            label="Cao dòng"
            value={def.lineHeightMm!}
            onDelta={(d) => onPatch({ lineHeightMm: roundScscMm(def.lineHeightMm! + d * 0.5) })}
          />
        ) : null}
        {hasBoxHeight ? (
          <MmStepper
            label="Cao ô"
            value={def.heightMm ?? def.lineHeightMm ?? 8}
            onDelta={(d) =>
              onPatch({
                heightMm: roundScscMm((def.heightMm ?? def.lineHeightMm ?? 8) + d * 0.5),
              })
            }
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className={`mr-1 text-[10px] font-semibold ${OPS.title}`}>Căn ngang:</span>
        {(
          [
            ["Trái", "left"],
            ["Giữa", "center"],
            ["Phải", "right"],
          ] as const
        ).map(([label, align]) => {
          const active = (def.align ?? "left") === align;
          return (
            <button
              key={align}
              type="button"
              onClick={() => onPatch({ align })}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                active ? "bg-apple-blue text-white" : OPS.printStepperBtn
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FontStepper({
  label,
  unit,
  value,
  onDelta,
  onSet,
}: {
  label: string;
  unit: ScscFieldFontUnit;
  value: number;
  onDelta: (deltaSteps: number) => void;
  onSet: (unit: ScscFieldFontUnit, value: number) => void;
}) {
  const step = unit === "mm" ? 0.5 : 0.5;
  const min = unit === "mm" ? 1.5 : 5;
  const max = unit === "mm" ? 12 : 24;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={`text-[10px] font-semibold ${OPS.title}`}>{label}:</span>
      <button
        type="button"
        onClick={() => onDelta(-1)}
        className={OPS.printStepperBtn}
        title="Giảm cỡ chữ"
      >
        A−
      </button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onSet(unit, n);
        }}
        className={OPS.printStepperInput}
      />
      <span className={`text-[10px] ${OPS.secondary}`}>{unit}</span>
      <button
        type="button"
        onClick={() => onDelta(1)}
        className={OPS.printStepperBtn}
        title="Tăng cỡ chữ"
      >
        A+
      </button>
      {unit === "pt" ? (
        <button
          type="button"
          title="Chuyển sang mm (≈ cỡ hiện tại)"
          onClick={() => onSet("mm", roundScscMm(value * 0.3528))}
          className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${OPS.btnSmallAccent}`}
        >
          → mm
        </button>
      ) : (
        <button
          type="button"
          title="Chuyển sang pt"
          onClick={() => onSet("pt", roundScscPt(value / 0.3528))}
          className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${OPS.btnSmallAccent}`}
        >
          → pt
        </button>
      )}
    </div>
  );
}

function MmStepper({
  label,
  value,
  min = 0,
  max = 200,
  step = 0.5,
  onDelta,
  onSet,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onDelta: (deltaSteps: number) => void;
  onSet?: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={`text-[10px] font-semibold ${OPS.title}`}>{label}:</span>
      <button type="button" onClick={() => onDelta(-1)} className={OPS.printStepperBtn}>
        −
      </button>
      {onSet ? (
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onSet(n);
          }}
          className={OPS.printStepperInput}
        />
      ) : (
        <span className={`min-w-[2rem] text-center text-[10px] tabular-nums ${OPS.title}`}>
          {formatScscCoordMm(value)}mm
        </span>
      )}
      <button type="button" onClick={() => onDelta(1)} className={OPS.printStepperBtn}>
        +
      </button>
      {onSet ? <span className={`text-[10px] ${OPS.secondary}`}>mm</span> : null}
    </div>
  );
}

function CoordRow({
  bounds,
  transform,
  active,
  customized,
  onSelect,
  onReset,
  onPatchWidth,
}: {
  bounds: ScscFieldBoundsMm;
  transform: ScscPrintTransformMm;
  active: boolean;
  customized: boolean;
  onSelect: () => void;
  onReset: () => void;
  onPatchWidth: (width: number) => void;
}) {
  const eff = applyScscPrintTransformToBounds(bounds, transform);
  const font =
    bounds.fontMm != null
      ? `${formatScscCoordMm(bounds.fontMm)}mm`
      : bounds.fontPt != null
        ? `${bounds.fontPt}pt`
        : "—";
  const showEff = hasTransform(transform);

  return (
    <tr
      className={`cursor-pointer border-t ${OPS.border} ${
        active ? "bg-apple-blue/15 dark:bg-sky-500/15" : "hover:bg-white/60 dark:hover:bg-white/[0.04]"
      }`}
      onClick={onSelect}
    >
      <td className={`max-w-[7rem] truncate px-2 py-1 font-medium ${OPS.title}`} title={bounds.label}>
        {bounds.label}
        {customized ? <span className="text-apple-blue dark:text-sky-300"> *</span> : null}
      </td>
      <td className="px-1 py-1 tabular-nums">{formatScscCoordMm(bounds.x)}</td>
      <td className="px-1 py-1 tabular-nums">{formatScscCoordMm(bounds.y)}</td>
      <td className="px-1 py-1 tabular-nums" onClick={(e) => e.stopPropagation()}>
        <input
          type="number"
          min={SCSC_FIELD_MM_LIMITS.width.min}
          max={SCSC_FIELD_MM_LIMITS.width.max}
          step={0.5}
          value={bounds.width}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onPatchWidth(roundScscMm(n));
          }}
          className={`w-12 rounded border px-1 py-0.5 text-[10px] tabular-nums ${OPS.printStepperInput}`}
          title="Giới hạn rộng dòng (mm)"
        />
      </td>
      <td className="px-1 py-1 tabular-nums">{bounds.height != null ? formatScscCoordMm(bounds.height) : "—"}</td>
      <td className="px-1 py-1 tabular-nums">{font}</td>
      <td className="px-1 py-1">
        {customized ? (
          <button
            type="button"
            title="Khôi phục mặc định ô này"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            className="rounded px-1 text-[10px] font-semibold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/15"
          >
            ↺
          </button>
        ) : (
          <span className={OPS.muted}>—</span>
        )}
      </td>
      {showEff ? (
        <>
          <td className={`px-1 py-1 tabular-nums ${OPS.accent}`}>{formatScscCoordMm(eff.x)}</td>
          <td className={`px-1 py-1 tabular-nums ${OPS.accent}`}>{formatScscCoordMm(eff.y)}</td>
        </>
      ) : null}
    </tr>
  );
}
