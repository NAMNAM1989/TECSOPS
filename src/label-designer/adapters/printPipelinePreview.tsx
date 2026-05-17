/**
 * Preview và browser-print cho tem nhiệt.
 *
 * Mẫu gốc = LabelContent (CSS flex, đầy đủ airline / MAWB / route / số kiện).
 * Chỉ overlay các đối tượng THÊM từ designer (đường kẻ, bảng, ảnh…).
 * thermalFieldOverrides chỉ áp dụng khi in TSPL.
 */
import { createElement, Fragment, type ReactElement } from "react";
import type { Shipment } from "../../types/shipment";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";
import { LabelContent } from "../../components/PrintShippingLabel";
import { loadLabelFontScale } from "../../utils/labelFontScale";
import { loadLabelHawbRelScale, loadLabelMawbRelScale } from "../../utils/labelAwbHawbScale";
import { loadLabelCompactShowHawb } from "../../utils/labelSheetFormat";
import type { ThermalLabelPrinterProfile } from "../../printing/printTypes";
import { resolveThermalProfileLabelFormat } from "../../printing/thermalLabelFormat";
import { documentKindFromLabelFormat } from "../core/defaultTemplates";
import { getExtraObjects } from "../core/templatePreserve";
import { bindLabelObject, shouldHideObject } from "../core/bindingResolver";
import { buildShipmentLabelContext } from "../data/shipmentDataContext";
import { renderObject } from "../render/htmlMmRenderer";
import { thermalLabelDimensions } from "../../printing/thermalLabel/thermalLabelFieldCatalog";

export function buildBoundThermalPreview(
  shipment: Shipment,
  profile: ThermalLabelPrinterProfile,
  airlineLabelOverrides?: AirlineLabelOverrides | null
): ReactElement {
  const format = resolveThermalProfileLabelFormat(profile);
  const kind = documentKindFromLabelFormat(format);

  const baseLabel = createElement(LabelContent, {
    s: shipment,
    fontScale: loadLabelFontScale(),
    mawbRelScale: loadLabelMawbRelScale(),
    hawbRelScale: loadLabelHawbRelScale(),
    airlineLabelOverrides,
    sheetVariant: format === "100x50" ? "compact" : "standard",
    showHawbOnCompact: loadLabelCompactShowHawb(),
  });

  const extras = profile.labelTemplate?.objects.length
    ? getExtraObjects(profile.labelTemplate, kind)
    : [];

  if (extras.length === 0) {
    return baseLabel;
  }

  const ctx = buildShipmentLabelContext(shipment, airlineLabelOverrides);
  const boundExtras = extras
    .filter((o) => !shouldHideObject(o, ctx))
    .map((o) => bindLabelObject(o, ctx));

  const { w, h } = thermalLabelDimensions(format);

  return createElement(
    "div",
    { style: { position: "relative", width: `${w}mm`, height: `${h}mm` } },
    baseLabel,
    createElement(
      "div",
      {
        key: "overlay",
        style: {
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        },
      },
      ...boundExtras.map((o) => createElement(Fragment, { key: o.id }, renderObject(o)))
    )
  );
}
