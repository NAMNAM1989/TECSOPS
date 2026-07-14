import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createElement } from "react";
import type { Shipment } from "../../types/shipment";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";
import { LabelContent, type LabelSheetVariant } from "../../components/PrintShippingLabel";
import { loadLabelFontScale } from "../../utils/labelFontScale";
import { loadLabelHawbRelScale, loadLabelMawbRelScale } from "../../utils/labelAwbHawbScale";
import { loadLabelPrintFlipCcw } from "../../utils/labelPrintMode";
import {
  loadLabelCompactShowHawb,
  loadLabelSheetFormat,
  type LabelSheetFormat,
} from "../../utils/labelSheetFormat";
import { printThermalLabelsFromIframe } from "../../utils/printThermalLabelIframe";

export { printThermalLabelsFromIframe };
export type { PrintThermalLabelsOptions } from "../../utils/printThermalLabelIframe";

export type ThermalBrowserPrintOpts = {
  format?: LabelSheetFormat;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
};

export async function printShipmentThermalBrowser(
  s: Shipment,
  opts?: ThermalBrowserPrintOpts
): Promise<void> {
  const format = opts?.format ?? loadLabelSheetFormat();
  const sheetVariant: LabelSheetVariant = format === "100x50" ? "compact" : "standard";
  const flip = loadLabelPrintFlipCcw();

  const host = document.createElement("div");
  host.className = "print-label-host hidden bg-white print:block";
  document.body.appendChild(host);

  const page = document.createElement("div");
  page.className = "print-label-page";
  const spin = document.createElement("div");
  spin.className = flip ? "print-label-spin print-label-spin--ccw" : "print-label-spin";
  const mount = document.createElement("div");
  page.appendChild(spin);
  spin.appendChild(mount);
  host.appendChild(page);

  const root = createRoot(mount);
  flushSync(() => {
    root.render(
      createElement(LabelContent, {
        s,
        fontScale: loadLabelFontScale(),
        mawbRelScale: loadLabelMawbRelScale(),
        hawbRelScale: loadLabelHawbRelScale(),
        airlineLabelOverrides: opts?.airlineLabelOverrides,
        sheetVariant,
        showHawbOnCompact: loadLabelCompactShowHawb(),
      })
    );
  });

  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  try {
    const copies = Math.max(1, s.pcs ?? 1);
    const res = await printThermalLabelsFromIframe({ format, host, copies });
    if (!res.ok) throw new Error(res.error);
  } finally {
    root.unmount();
    host.remove();
  }
}
