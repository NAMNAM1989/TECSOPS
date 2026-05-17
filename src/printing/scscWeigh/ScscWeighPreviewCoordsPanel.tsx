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
import { roundScscMm } from "./scscFieldOverrides";
import {
  applyScscPrintTransformToBounds,
  buildScscCoordsCopyText,
  formatScscCoordMm,
  getScscFieldBoundsMm,
  type ScscFieldBoundsMm,
  type ScscPrintTransformMm,
} from "./scscFieldCoords";
import { resolveScscWeighPrintTransform } from "./scscWeighPrint";

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
}: Props) {
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
    <div className="mt-2 flex min-h-0 flex-col rounded-xl border border-amber-200/80 bg-amber-50/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 px-3 py-2">
        <div>
          <p className="text-[10px] font-semibold uppercase text-amber-900">Tọa độ ô in (mm)</p>
          <p className="text-[10px] text-amber-950/70">
            Profile: <span className="font-medium">{profile.name}</span>
            {" · "}
            offset X={formatScscCoordMm(transform.offsetXmm)} Y={formatScscCoordMm(transform.offsetYmm)}
            {" · "}
            scale {transform.scaleX}×{transform.scaleY}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-amber-950">
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
            className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-950 hover:bg-amber-100"
          >
            Sao chép tất cả
          </button>
        </div>
      </div>
      <p className="px-3 py-1.5 text-[10px] leading-snug text-amber-950/75">
        Gốc: mép trái + mép trên A4. Kéo ô, chỉnh cỡ chữ (A−/A+), cao dòng / cao ô. Ô * = đã chỉnh — bấm Lưu
        profile. Tên hàng / yêu cầu khác: cỡ tay sẽ tắt tự co chữ cho ô đó.
      </p>
      {selectedDef ? (
        <SelectedFieldEditor
          def={selectedDef}
          onNudge={(dx, dy) => onNudgeField(selectedDef.key, dx, dy)}
          onPatch={(patch) => onPatchField(selectedDef.key, patch)}
        />
      ) : null}
      <div className="max-h-40 min-h-0 overflow-auto">
        <table className="w-full border-collapse text-left text-[10px]">
          <thead className="sticky top-0 bg-amber-100/90 text-amber-950">
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
    <div className="space-y-1.5 border-b border-amber-200/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] font-semibold text-amber-950">Vị trí:</span>
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
            className="min-w-[1.75rem] rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs font-bold text-amber-950 hover:bg-amber-100"
          >
            {label}
          </button>
        ))}
        <span className="ml-2 text-[10px] text-amber-950/80">Rộng: kéo chấm góc phải ô trên phiếu</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
      <span className="text-[10px] font-semibold text-amber-950">{label}:</span>
      <button
        type="button"
        onClick={() => onDelta(-1)}
        className="min-w-[1.75rem] rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs font-bold hover:bg-amber-100"
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
        className="w-14 rounded border border-amber-200 bg-white px-1 py-0.5 text-center text-[10px] tabular-nums"
      />
      <span className="text-[10px] text-amber-950">{unit}</span>
      <button
        type="button"
        onClick={() => onDelta(1)}
        className="min-w-[1.75rem] rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs font-bold hover:bg-amber-100"
        title="Tăng cỡ chữ"
      >
        A+
      </button>
      {unit === "pt" ? (
        <button
          type="button"
          title="Chuyển sang mm (≈ cỡ hiện tại)"
          onClick={() => onSet("mm", roundScscMm(value * 0.3528))}
          className="rounded border border-amber-200 px-1.5 py-0.5 text-[9px] font-semibold text-amber-900 hover:bg-amber-100"
        >
          → mm
        </button>
      ) : (
        <button
          type="button"
          title="Chuyển sang pt"
          onClick={() => onSet("pt", roundScscPt(value / 0.3528))}
          className="rounded border border-amber-200 px-1.5 py-0.5 text-[9px] font-semibold text-amber-900 hover:bg-amber-100"
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
  onDelta,
}: {
  label: string;
  value: number;
  onDelta: (deltaSteps: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] font-semibold text-amber-950">{label}:</span>
      <button
        type="button"
        onClick={() => onDelta(-1)}
        className="min-w-[1.5rem] rounded border border-amber-300 bg-white px-1 py-0.5 text-xs font-bold hover:bg-amber-100"
      >
        −
      </button>
      <span className="min-w-[2rem] text-center text-[10px] tabular-nums text-amber-950">
        {formatScscCoordMm(value)}mm
      </span>
      <button
        type="button"
        onClick={() => onDelta(1)}
        className="min-w-[1.5rem] rounded border border-amber-300 bg-white px-1 py-0.5 text-xs font-bold hover:bg-amber-100"
      >
        +
      </button>
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
}: {
  bounds: ScscFieldBoundsMm;
  transform: ScscPrintTransformMm;
  active: boolean;
  customized: boolean;
  onSelect: () => void;
  onReset: () => void;
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
      className={`cursor-pointer border-t border-amber-200/40 ${active ? "bg-apple-blue/15" : "hover:bg-white/60"}`}
      onClick={onSelect}
    >
      <td className="max-w-[7rem] truncate px-2 py-1 font-medium text-apple-label" title={bounds.label}>
        {bounds.label}
        {customized ? <span className="text-amber-600"> *</span> : null}
      </td>
      <td className="px-1 py-1 tabular-nums">{formatScscCoordMm(bounds.x)}</td>
      <td className="px-1 py-1 tabular-nums">{formatScscCoordMm(bounds.y)}</td>
      <td className="px-1 py-1 tabular-nums">{formatScscCoordMm(bounds.width)}</td>
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
            className="rounded px-1 text-[10px] font-semibold text-red-700 hover:bg-red-50"
          >
            ↺
          </button>
        ) : (
          <span className="text-apple-tertiary">—</span>
        )}
      </td>
      {showEff ? (
        <>
          <td className="px-1 py-1 tabular-nums text-amber-900">{formatScscCoordMm(eff.x)}</td>
          <td className="px-1 py-1 tabular-nums text-amber-900">{formatScscCoordMm(eff.y)}</td>
        </>
      ) : null}
    </tr>
  );
}
