import type { Shipment } from "../../types/shipment";
import type { CustomerDirectoryEntry } from "../../types/customerDirectory";
import { isScscWarehouse } from "../../constants/warehouses";
import {
  mapBookingToScaleTicketFormData,
  type ScaleTicketFormData,
} from "../../utils/mapBookingToScaleTicketFormData";
import { debugLog } from "../../utils/debugLog";
import type { A4WeighReceiptPrinterProfile } from "../printTypes";
import { getActiveA4WeighProfile } from "../printerProfiles";
import { loadPrinterProfileStore } from "../printerProfileStorage";
import { buildScscWeighOverlayValues, renderScscWeighFieldLayer } from "./scscWeighTemplate";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export type ScscWeighPrintOpts = {
  profile?: A4WeighReceiptPrinterProfile;
  offsetXmm?: number;
  offsetYmm?: number;
  scaleX?: number;
  scaleY?: number;
  customerDirectory?: readonly CustomerDirectoryEntry[];
  mapOptions?: { skipAutoSingleConsignee?: boolean };
  calibrationTest?: boolean;
};

export type ScscWeighPrintFromFormOpts = {
  profile?: A4WeighReceiptPrinterProfile;
  offsetXmm?: number;
  offsetYmm?: number;
  scaleX?: number;
  scaleY?: number;
};

export function resolveScscWeighPrintTransform(opts?: ScscWeighPrintOpts): {
  profile: A4WeighReceiptPrinterProfile;
  offsetXmm: number;
  offsetYmm: number;
  scaleX: number;
  scaleY: number;
} {
  const store = loadPrinterProfileStore();
  const profile = opts?.profile ?? getActiveA4WeighProfile(store);
  return {
    profile,
    offsetXmm: clamp(opts?.offsetXmm ?? profile.offsetXmm, -30, 30),
    offsetYmm: clamp(opts?.offsetYmm ?? profile.offsetYmm, -30, 30),
    scaleX: clamp(opts?.scaleX ?? profile.scaleX, 0.85, 1.15),
    scaleY: clamp(opts?.scaleY ?? profile.scaleY, 0.85, 1.15),
  };
}

export function buildScscWeighReceiptDocumentHtml(
  formData: ScaleTicketFormData,
  opts?: ScscWeighPrintFromFormOpts & { overlayValues?: Record<string, string> }
): string {
  const { offsetXmm, offsetYmm, scaleX, scaleY } = resolveScscWeighPrintTransform(opts);
  const values = opts?.overlayValues ?? buildScscWeighOverlayValues(formData);
  const fieldHtml = renderScscWeighFieldLayer(values);
  const useScale = Math.abs(scaleX - 1) > 0.0001 || Math.abs(scaleY - 1) > 0.0001;
  const printTransform = useScale
    ? `translate(var(--print-offset-x, 0mm), var(--print-offset-y, 0mm)) scale(var(--print-scale-x, 1), var(--print-scale-y, 1))`
    : `translate(var(--print-offset-x, 0mm), var(--print-offset-y, 0mm))`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Phieu Can ${esc(formData.awb)}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: Arial, sans-serif;
    }

    .preview-wrapper {
      width: 100%;
      overflow: auto;
      background: #f3f4f6;
    }

    .preview-page {
      position: relative;
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      transform-origin: top left;
      overflow: hidden;
    }

    .template-layer.form-background.pdf-background {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      object-fit: cover;
      z-index: 1;
    }

    .preview-data-layer {
      position: absolute;
      inset: 0;
      z-index: 2;
    }

    .print-page {
      display: none;
      position: relative;
      width: 210mm;
      height: 297mm;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: transparent;
      --print-offset-x: ${offsetXmm.toFixed(2)}mm;
      --print-offset-y: ${offsetYmm.toFixed(2)}mm;
      --print-scale-x: ${scaleX.toFixed(4)};
      --print-scale-y: ${scaleY.toFixed(4)};
    }

    .print-data-layer {
      position: absolute;
      left: 0;
      top: 0;
      width: 210mm;
      height: 297mm;
      transform: none;
      background: transparent;
      z-index: 3;
    }

    .print-field {
      position: absolute;
      color: #000;
      background: transparent;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      visibility: visible;
    }

    @media print {
      @page {
        size: A4;
        margin: 0;
      }

      html,
      body {
        margin: 0 !important;
        padding: 0 !important;
        width: 210mm !important;
        height: 297mm !important;
        background: white !important;
      }

      .app-ui,
      .toolbar,
      .buttons,
      .modal,
      .print-settings,
      .preview-wrapper,
      .form-background,
      .pdf-background,
      .template-layer,
      iframe,
      embed,
      canvas {
        display: none !important;
        visibility: hidden !important;
      }

      .print-page {
        display: block !important;
        position: relative !important;
        width: 210mm !important;
        height: 297mm !important;
        margin: 0 !important;
        padding: 0 !important;
        transform: none !important;
        scale: none !important;
        background: transparent !important;
        overflow: hidden !important;
      }

      .print-data-layer {
        display: block !important;
        position: absolute !important;
        left: 0;
        top: 0;
        width: 210mm;
        height: 297mm;
        transform: ${printTransform} !important;
        transform-origin: top left !important;
        background: transparent !important;
      }

      .print-field,
      .print-only-data {
        display: block !important;
        visibility: visible !important;
        position: absolute !important;
        color: black !important;
        background: transparent !important;
      }

      * {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="preview-wrapper">
    <div class="preview-page">
      <img class="template-layer form-background pdf-background" src="/print-templates/scsc-weigh-template.png" alt="SCSC weigh template" />
      <div class="preview-data-layer">
        ${fieldHtml}
      </div>
    </div>
  </div>

  <div class="print-page">
    <div class="print-data-layer">
      ${fieldHtml}
    </div>
  </div>
</body>
</html>`;
}

export function printScscWeighReceiptFromFormData(
  formData: ScaleTicketFormData,
  opts?: ScscWeighPrintFromFormOpts & { overlayValues?: Record<string, string> }
): void {
  const { profile, offsetXmm, offsetYmm, scaleX, scaleY } = resolveScscWeighPrintTransform(opts);
  debugLog("print:scsc-weigh-form", {
    awb: formData.awb,
    profileId: profile.id,
    offsetMm: { x: offsetXmm, y: offsetYmm },
    scale: { x: scaleX, y: scaleY },
  });
  openPrintIframe(buildScscWeighReceiptDocumentHtml(formData, opts));
}

/**
 * In phiếu cân SCSC — giữ CSS/iframe như bản gốc; offset/scale lấy từ printer profile.
 */
export function printScscWeighReceiptHtml(s: Shipment, opts?: ScscWeighPrintOpts): void {
  if (!opts?.calibrationTest && !isScscWarehouse(s.warehouse)) {
    window.alert("Phieu can SCSC chi dung cho kho TECS-SCSC hoac KHO SCSC.");
    return;
  }

  const directory = opts?.customerDirectory ?? [];
  const formData = mapBookingToScaleTicketFormData(s, directory, opts?.mapOptions);
  const transform = resolveScscWeighPrintTransform(opts);

  debugLog("print:scsc-weigh", {
    awb: s.awb,
    profileId: transform.profile.id,
    offsetMm: { x: transform.offsetXmm, y: transform.offsetYmm },
    scale: { x: transform.scaleX, y: transform.scaleY },
  });

  const overlayValues = opts?.calibrationTest
    ? {
        shipper: "[TEST SHIPPER]",
        mawb: "000-00000000",
        consignee: "[TEST CNEE]",
        origin: "SGN",
        destination: "HAN",
        pieces: "1",
        grossWeight: "1.0",
        chargeableWeight: "1.0",
        dimensions: "TEST CALIBRATION",
      }
    : undefined;

  printScscWeighReceiptFromFormData(formData, { ...opts, overlayValues });
}

function openPrintIframe(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "none",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    window.alert("Khong tao duoc khung in.");
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return;
  }

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  win.addEventListener("afterprint", cleanup);

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      window.alert("Khong goi duoc lenh in.");
      cleanup();
    }
  };

  setTimeout(() => {
    if (iframe.contentDocument?.readyState === "complete") {
      runPrint();
    } else {
      win.addEventListener("load", runPrint, { once: true });
    }
  }, 100);

  setTimeout(cleanup, 120_000);
}
