import type { Shipment } from "../../types/shipment";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";
import type { ThermalLabelPrinterProfile } from "../printTypes";
import { resolveThermalProfileLabelFormat } from "../thermalLabelFormat";
import { thermalLabelDimensions } from "./thermalLabelFieldCatalog";
import { buildThermalLabelSlotValues } from "./thermalLabelValues";
import { resolveThermalLabelFields, visibleThermalLabelFieldsForRender } from "./thermalLabelTsplSlots";
import { ThermalLabelMmView } from "./ThermalLabelMmView";

type Props = {
  shipment: Shipment;
  profile: ThermalLabelPrinterProfile;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  className?: string;
};

/** Tem in/preview theo profile (tọa độ mm + cỡ chữ đã lưu). */
export function ThermalLabelCalibratedSheet({
  shipment,
  profile,
  airlineLabelOverrides,
  className = "",
}: Props) {
  const format = resolveThermalProfileLabelFormat(profile);
  const { w, h } = thermalLabelDimensions(format);
  const pack = buildThermalLabelSlotValues(shipment, airlineLabelOverrides);
  const allFields = resolveThermalLabelFields(format, profile.thermalFieldOverrides);
  const fields = visibleThermalLabelFieldsForRender(format, allFields, pack.values, pack.hasHawb);

  const sheetClass =
    format === "100x50"
      ? "label print-label-sheet lbl-sheet lbl-sheet--compact lbl-sheet--calibrated"
      : "label print-label-sheet lbl-sheet lbl-sheet--calibrated";

  return (
    <div className={`${sheetClass} ${className}`.trim()} style={{ position: "relative", width: `${w}mm`, height: `${h}mm` }}>
      <ThermalLabelMmView
        labelWidthMm={w}
        labelHeightMm={h}
        fields={fields}
        values={pack.values}
        showCoords={false}
        selectedKey={null}
        overrideKeys={new Set()}
        onSelectField={() => {}}
        onStartDrag={() => {}}
      />
    </div>
  );
}
