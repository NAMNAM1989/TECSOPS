import type { Shipment } from "../types/shipment";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import {
  mapBookingToScaleTicketFormData,
  type ScaleTicketFormData,
} from "./mapBookingToScaleTicketFormData";
import { buildScscWeighOverlayValues } from "../printing/scscWeigh/scscWeighTemplate";
import { getScscWeighPrintSettingsCache } from "../printing/scscWeigh/scscWeighPrintSettingsRuntime";
import {
  printScscWeighReceiptFromFormData,
  printScscWeighReceiptHtml,
  type ScscWeighPrintFromFormOpts,
  type ScscWeighPrintOpts,
} from "../printing/scscWeigh/scscWeighPrint";
import { isScscWarehouse } from "../constants/warehouses";
import { defaultGlobalAgentCatalog } from "./globalAgentsCore";
import {
  DEFAULT_SCSC_PRINT_PROFILE_ID,
  fetchScscWeighPdfBuffer,
  probePrintApiAvailable,
} from "./printServerApi";

export type ScscPrintVia = "pdf" | "html" | "none";

export type ScscPrintResult = {
  ok: boolean;
  via: ScscPrintVia;
  message?: string;
};

/** Mẫu dữ liệu cho editor / preview PDF. */
export const SAMPLE_SCSC_FORM_DATA: ScaleTicketFormData = {
  awb: "978-1234 5678",
  flightNo: "VJ081",
  flightDate: "18MAY",
  destination: "MEL",
  totalPieces: "3",
  grossWeight: "45.5",
  chargeableWeight: "52.0",
  customerCode: "HTS",
  shipperName: "HTS LOGISTICS CO., LTD",
  shipperAddress: "123 Nguyen Hue\nDist 1, HCMC",
  shipperPhone: "028 1234 5678",
  shipperEmail: "ops@hts.vn",
  taxCode: "0123456789",
  agentName: "FAITH LOGISTICS PTE LTD",
  agentAddress: "88 Market St\nSingapore",
  agentPhone: "+65 6123 4567",
  agentEmail: "agent@faith.sg",
  agentTaxCode: "",
  consigneeName: "FAITH LOGISTICS PTY LTD",
  consigneeAddress: "1 Queen St\nMelbourne VIC 3000",
  consigneePhone: "0399998888",
  consigneeEmail: "mel@faith.com",
  notifyName: "",
  note: "",
  flightLinePrint: "VJ081/18MAY",
  dimensionsText: "120×80×60 ×3",
  goodsDescription: "GENERAL CARGO",
  hawb: "HTS-001",
  hawbDisplay: "01 HAWB",
  otherRequirements: "",
};

/**
 * In PDF qua iframe ẩn — Scale 100%, margin None (PDFKit margin 0).
 * User chọn máy in trong hộp thoại native của trình duyệt.
 */
export async function printPdfBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "TECSOPS print";
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "none",
    visibility: "hidden",
  });
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      setTimeout(() => {
        URL.revokeObjectURL(url);
        iframe.remove();
      }, 120_000);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) throw new Error("Không mở được PDF trong iframe.");
        win.focus();
        win.print();
        cleanup();
        resolve();
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    iframe.onerror = () => {
      cleanup();
      reject(new Error("Không tải được PDF."));
    };

    iframe.src = url;
  });
}

export async function printScscWeighReceiptPdfFromFormData(
  formData: ScaleTicketFormData,
  opts?: {
    profileId?: string;
    scscWeighPrintSettings?: ScscWeighPrintSettings;
    includeBackground?: boolean;
    overlayValues?: Record<string, string>;
    htmlFallbackOpts?: ScscWeighPrintFromFormOpts;
  }
): Promise<ScscPrintResult> {
  const settings = opts?.scscWeighPrintSettings ?? getScscWeighPrintSettingsCache();
  const values = opts?.overlayValues ?? buildScscWeighOverlayValues(formData, settings);

  try {
    if (await probePrintApiAvailable()) {
      const buf = await fetchScscWeighPdfBuffer({
        profileId: opts?.profileId ?? DEFAULT_SCSC_PRINT_PROFILE_ID,
        templateCode: "scsc-weigh-a4",
        values,
        includeBackground: opts?.includeBackground ?? false,
      });
      await printPdfBlob(new Blob([buf], { type: "application/pdf" }));
      return { ok: true, via: "pdf" };
    }
  } catch (e) {
    console.warn("[print] PDF server failed:", e);
  }

  printScscWeighReceiptFromFormData(formData, {
    ...opts?.htmlFallbackOpts,
    overlayValues: opts?.overlayValues,
  });
  return {
    ok: true,
    via: "html",
    message: "In HTML (cần DATABASE_URL + migration để dùng PDF server).",
  };
}

export async function printScscWeighReceiptPdf(
  s: Shipment,
  opts?: ScscWeighPrintOpts & { profileId?: string }
): Promise<ScscPrintResult> {
  if (!opts?.calibrationTest && !isScscWarehouse(s.warehouse)) {
    window.alert("Phiếu cân SCSC chỉ dùng cho kho TECS-SCSC hoặc KHO SCSC.");
    return { ok: false, via: "none" };
  }

  const directory = opts?.customerDirectory ?? [];
  const formData = mapBookingToScaleTicketFormData(s, directory, {
    skipAutoSingleConsignee: opts?.mapOptions?.skipAutoSingleConsignee,
    skipAutoDefaultAgent: opts?.mapOptions?.skipAutoDefaultAgent,
    skipAutoSingleShipper: opts?.mapOptions?.skipAutoSingleShipper,
    skipAutoSingleGoods: opts?.mapOptions?.skipAutoSingleGoods,
    globalAgents: opts?.globalAgents ?? defaultGlobalAgentCatalog(),
  });

  const overlayValues = opts?.calibrationTest
    ? {
        shipper: "[TEST SHIPPER]",
        mawb: "000-00000000",
        hawb: "TEST-HAWB-001",
        consignee: "[TEST CNEE]",
        destination: "HAN",
        pieces: "1",
        grossWeight: "1.0",
        chargeableWeight: "1.0",
        dimensions: "TEST CALIBRATION",
      }
    : undefined;

  return printScscWeighReceiptPdfFromFormData(formData, {
    profileId: opts?.profileId,
    scscWeighPrintSettings: opts?.scscWeighPrintSettings ?? getScscWeighPrintSettingsCache(),
    overlayValues,
    htmlFallbackOpts: opts,
  });
}

/** Wrapper giữ tương thích — ưu tiên PDF, fallback HTML. */
export async function printScscWeighWithPdfFirst(
  s: Shipment,
  opts?: ScscWeighPrintOpts
): Promise<ScscPrintResult> {
  return printScscWeighReceiptPdf(s, opts);
}

/** In thử calibration — PDF nếu có server. */
export async function printScscWeighCalibrationTest(
  s: Shipment,
  opts?: ScscWeighPrintOpts
): Promise<ScscPrintResult> {
  return printScscWeighReceiptPdf(s, { ...opts, calibrationTest: true });
}

/** @deprecated Chỉ dùng khi cần ép HTML. */
export function printScscWeighReceiptHtmlOnly(s: Shipment, opts?: ScscWeighPrintOpts): void {
  printScscWeighReceiptHtml(s, opts);
}
