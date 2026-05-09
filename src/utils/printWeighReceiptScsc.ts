import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { isScscWarehouse } from "../constants/warehouses";
import { ensureScscConsigneeForPrint } from "./ensureScscConsigneeForPrint";
import { mapBookingToScaleTicketFormData, type ScaleTicketFormData } from "./mapBookingToScaleTicketFormData";
import { debugLog } from "./debugLog";

type ScscPrintCalibration = {
  offsetXmm: number;
  offsetYmm: number;
};

type FieldDef = {
  key: string;
  x: number;
  y: number;
  width: number;
  fontPt?: number;
  align?: "left" | "center" | "right";
  multiline?: boolean;
  bold?: boolean;
};

const PRINT_OFFSET_X_STORAGE_KEY = "printOffsetX";
const PRINT_OFFSET_Y_STORAGE_KEY = "printOffsetY";

const DEFAULT_PRINT_CALIBRATION: ScscPrintCalibration = {
  offsetXmm: 0,
  offsetYmm: 0,
};

const PRINT_FIELDS: readonly FieldDef[] = [
  { key: "shipper", x: 8, y: 26.2, width: 116, fontPt: 8.4, bold: true },
  { key: "shipperAddress", x: 8, y: 32.2, width: 116, fontPt: 7, multiline: true },
  { key: "shipperPhone", x: 8, y: 38.8, width: 56, fontPt: 7 },
  { key: "shipperEmail", x: 67, y: 38.8, width: 57, fontPt: 7 },
  { key: "agentName", x: 8, y: 51.5, width: 116, fontPt: 7.8, bold: true },
  { key: "agentAddress", x: 8, y: 58.7, width: 116, fontPt: 7, multiline: true },
  { key: "agentPhone", x: 8, y: 72.4, width: 56, fontPt: 7 },
  { key: "agentEmail", x: 67, y: 72.4, width: 57, fontPt: 7 },
  { key: "agentTaxCode", x: 8, y: 78.2, width: 116, fontPt: 7 },
  { key: "mawb", x: 130, y: 28, width: 70, fontPt: 9.5, bold: true },

  { key: "consignee", x: 8, y: 99.6, width: 116, fontPt: 8.2, bold: true },
  { key: "consigneeAddress", x: 8, y: 106.5, width: 116, fontPt: 7, multiline: true },
  { key: "consigneePhone", x: 8, y: 120.1, width: 56, fontPt: 7 },
  { key: "consigneeEmail", x: 67, y: 120.1, width: 57, fontPt: 7 },
  { key: "notify", x: 8, y: 128.3, width: 116, fontPt: 7.3 },

  { key: "origin", x: 150, y: 142, width: 44, fontPt: 11, align: "center", bold: true },
  { key: "destination", x: 150, y: 150.5, width: 44, fontPt: 11, align: "center", bold: true },

  { key: "totalHawbs", x: 8, y: 158.5, width: 48, fontPt: 8, align: "center" },
  { key: "flightDate", x: 112, y: 158.5, width: 88, fontPt: 9, align: "center", bold: true },

  { key: "pieces", x: 8, y: 168.5, width: 24, fontPt: 9.5, align: "center", bold: true },
  { key: "goods", x: 37, y: 168.5, width: 70, fontPt: 8.5, bold: true },
  { key: "grossWeight", x: 113, y: 168.5, width: 41, fontPt: 9.5, align: "center", bold: true },
  { key: "chargeableWeight", x: 154, y: 168.5, width: 46, fontPt: 9.5, align: "center", bold: true },

  { key: "dimensions", x: 9, y: 182.5, width: 188, fontPt: 7.8, multiline: true },
];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toFiniteNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readCalibrationFromStorage(): ScscPrintCalibration {
  try {
    const rawX = window.localStorage.getItem(PRINT_OFFSET_X_STORAGE_KEY);
    const rawY = window.localStorage.getItem(PRINT_OFFSET_Y_STORAGE_KEY);
    return {
      offsetXmm: clamp(toFiniteNumber(rawX, 0), -30, 30),
      offsetYmm: clamp(toFiniteNumber(rawY, 0), -30, 30),
    };
  } catch {
    return DEFAULT_PRINT_CALIBRATION;
  }
}

export function getScscPrintCalibration(): ScscPrintCalibration {
  return readCalibrationFromStorage();
}

export function saveScscPrintCalibration(offsetXmm: number, offsetYmm: number): void {
  window.localStorage.setItem(
    PRINT_OFFSET_X_STORAGE_KEY,
    String(clamp(toFiniteNumber(offsetXmm, 0), -30, 30))
  );
  window.localStorage.setItem(
    PRINT_OFFSET_Y_STORAGE_KEY,
    String(clamp(toFiniteNumber(offsetYmm, 0), -30, 30))
  );
}

export function resetScscPrintCalibration(): void {
  window.localStorage.setItem(PRINT_OFFSET_X_STORAGE_KEY, "0");
  window.localStorage.setItem(PRINT_OFFSET_Y_STORAGE_KEY, "0");
}

export function canPrintWeighReceiptScsc(s: Shipment): boolean {
  return isScscWarehouse(s.warehouse);
}

function fieldStyle(def: FieldDef): string {
  const align = def.align ? `text-align:${def.align};` : "";
  const ws = def.multiline ? "white-space:pre-line;line-height:1.2;" : "white-space:nowrap;";
  const fw = def.bold ? "font-weight:700;" : "";
  const fs = `font-size:${(def.fontPt ?? 8.5).toFixed(2)}pt;`;
  return `left:${def.x.toFixed(2)}mm;top:${def.y.toFixed(2)}mm;width:${def.width.toFixed(
    2
  )}mm;${fs}${align}${ws}${fw}`;
}

function renderFieldLayer(values: Record<string, string>): string {
  return PRINT_FIELDS.map((def) => {
    const val = values[def.key] ?? "";
    return `<div class="print-field print-only-data" style="${fieldStyle(def)}">${esc(val)}</div>`;
  }).join("\n");
}

function buildPrintOverlayValues(fd: ScaleTicketFormData): Record<string, string> {
  return {
    shipper: fd.shipperName,
    shipperAddress: fd.shipperAddress,
    shipperPhone: fd.shipperPhone,
    shipperEmail: fd.shipperEmail,
    agentName: fd.agentName,
    agentAddress: fd.agentAddress,
    agentPhone: fd.agentPhone,
    agentEmail: fd.agentEmail,
    agentTaxCode: fd.agentTaxCode,
    mawb: fd.awb,
    consignee: fd.consigneeName || "",
    consigneeAddress: fd.consigneeAddress,
    consigneePhone: fd.consigneePhone,
    consigneeEmail: fd.consigneeEmail,
    notify: fd.notifyName,
    origin: fd.origin,
    destination: fd.destination,
    totalHawbs: fd.hawbDisplay,
    flightDate: fd.flightLinePrint,
    pieces: fd.totalPieces,
    goods: fd.goodsDescription,
    grossWeight: fd.grossWeight,
    chargeableWeight: fd.chargeableWeight,
    dimensions: fd.dimensionsText,
  };
}

export function printWeighReceiptScsc(
  s: Shipment,
  opts?: {
    offsetXmm?: number;
    offsetYmm?: number;
    customerDirectory?: readonly CustomerDirectoryEntry[];
    /** Truyền từ bước chọn CNEE trước khi in. */
    mapOptions?: { skipAutoSingleConsignee?: boolean };
  }
): void {
  if (!isScscWarehouse(s.warehouse)) {
    window.alert("Phieu can SCSC chi dung cho kho TECS-SCSC hoac KHO SCSC.");
    return;
  }

  const directory = opts?.customerDirectory ?? [];
  const formData = mapBookingToScaleTicketFormData(s, directory, opts?.mapOptions);

  const calibrationStored = readCalibrationFromStorage();
  const offsetXmm = clamp(toFiniteNumber(opts?.offsetXmm, calibrationStored.offsetXmm), -30, 30);
  const offsetYmm = clamp(toFiniteNumber(opts?.offsetYmm, calibrationStored.offsetYmm), -30, 30);

  debugLog("print:scsc-weigh", {
    awb: s.awb,
    warehouse: s.warehouse,
    customerId: s.customerId,
    customerCode: s.customerCode,
    directorySize: directory.length,
    shipperName: formData.shipperName,
    hawbDisplay: formData.hawbDisplay,
    offsetMm: { x: offsetXmm, y: offsetYmm },
  });

  const values = buildPrintOverlayValues(formData);

  const fieldHtml = renderFieldLayer(values);

  const html = `<!DOCTYPE html>
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
      transform: none;
      scale: none;
      --print-offset-x: ${offsetXmm.toFixed(2)}mm;
      --print-offset-y: ${offsetYmm.toFixed(2)}mm;
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
        transform: translate(var(--print-offset-x, 0mm), var(--print-offset-y, 0mm)) !important;
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
      // ignore
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

/** In phiếu cân — nếu khách có nhiều CNEE lưu sẵn mà booking chưa chọn, hiện modal chọn trước khi in. */
export async function printWeighReceiptScscWithConsigneeChoice(
  s: Shipment,
  opts?: {
    offsetXmm?: number;
    offsetYmm?: number;
    customerDirectory?: readonly CustomerDirectoryEntry[];
  }
): Promise<void> {
  const directory = opts?.customerDirectory ?? [];
  const ctx = await ensureScscConsigneeForPrint(s, directory);
  if (!ctx) return;
  printWeighReceiptScsc(ctx.shipment, {
    ...opts,
    mapOptions: { skipAutoSingleConsignee: ctx.skipAutoSingleConsignee },
  });
}
