import type { ThermalLabelFieldDef } from "./thermalLabelFieldCatalog";
import type { ThermalLabelSlotValues } from "./thermalLabelValues";

type Props = {
  labelWidthMm: number;
  labelHeightMm: number;
  fields: ThermalLabelFieldDef[];
  values: ThermalLabelSlotValues;
  showCoords: boolean;
  selectedKey: string | null;
  overrideKeys: Set<string>;
  onSelectField: (key: string) => void;
  onStartDrag: (e: React.PointerEvent, def: ThermalLabelFieldDef) => void;
};

export function ThermalLabelMmView({
  labelWidthMm,
  labelHeightMm,
  fields,
  values,
  showCoords,
  selectedKey,
  overrideKeys,
  onSelectField,
  onStartDrag,
}: Props) {
  return (
    <div
      className="relative border border-black bg-white shadow-inner"
      style={{ width: `${labelWidthMm}mm`, height: `${labelHeightMm}mm` }}
    >
      {showCoords ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(to right, #999 1px, transparent 1px), linear-gradient(to bottom, #999 1px, transparent 1px)",
            backgroundSize: "10mm 10mm",
          }}
        />
      ) : null}
      {fields.map((def) => {
        const text = (values[def.key] ?? "").trim();
        if (!text && !showCoords) return null;
        const selected = selectedKey === def.key;
        const customized = overrideKeys.has(def.key);
        return (
          <div
            key={def.key}
            role="button"
            tabIndex={0}
            onPointerDown={(e) => {
              onSelectField(def.key);
              if (showCoords) onStartDrag(e, def);
            }}
            className={`absolute overflow-hidden border font-mono font-bold leading-none text-black ${
              showCoords
                ? selected
                  ? "z-20 cursor-grab border-apple-blue bg-apple-blue/10 ring-2 ring-apple-blue/40"
                  : customized
                    ? "z-10 cursor-grab border-amber-500/70 bg-amber-50/80"
                    : "z-10 cursor-grab border-dashed border-black/25 bg-white/50"
                : "pointer-events-none border-transparent"
            }`}
            style={{
              left: `${def.x}mm`,
              top: `${def.y}mm`,
              width: `${def.hitW}mm`,
              minHeight: `${def.hitH}mm`,
              fontSize: `${def.fontMm}mm`,
              whiteSpace: "pre-wrap",
            }}
            title={def.label}
          >
            {text || (showCoords ? `(${def.label})` : "")}
            {showCoords ? (
              <span className="absolute -top-3 left-0 whitespace-nowrap text-[8px] font-normal text-apple-secondary">
                {def.x},{def.y}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
