import type { WeighSlipDraft } from "../types/weighSlip";
import { rawAwbDigits } from "./awbFormat";

export type WeighSlipValidationResult = {
  ok: boolean;
  errors: Record<string, string>;
};

const DIM_LINE_RE = /^\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*x\s*\d+\s*$/i;

function checkDimensions(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  for (const line of lines) {
    const stripped = line.replace(/^\d+\.\s*/, "");
    if (!DIM_LINE_RE.test(stripped)) {
      return "Mỗi dòng kích thước: L x W x H x PCS (VD: 60 x 40 x 30 x 2)";
    }
  }
  return null;
}

export function validateWeighSlip(
  draft: WeighSlipDraft,
  opts?: { requireAll?: boolean }
): WeighSlipValidationResult {
  const requireAll = opts?.requireAll ?? false;
  const errors: Record<string, string> = {};

  const mawbDigits = rawAwbDigits(draft.mawbNo);
  if (requireAll && mawbDigits.length < 11) {
    errors.mawbNo = "MAWB cần 11 chữ số (dạng 000-0000 0000)";
  }

  const dest = draft.destinationAirport.trim().toUpperCase();
  if (requireAll && dest.length !== 3) {
    errors.destinationAirport = "Sân bay đích: 3 ký tự IATA";
  } else if (dest && !/^[A-Z]{3}$/.test(dest)) {
    errors.destinationAirport = "Chỉ chữ cái A–Z, đúng 3 ký tự";
  }

  if (requireAll && (draft.pieces == null || draft.pieces < 1 || !Number.isInteger(draft.pieces))) {
    errors.pieces = "Số kiện: số nguyên ≥ 1";
  } else if (draft.pieces != null && (!Number.isInteger(draft.pieces) || draft.pieces < 0)) {
    errors.pieces = "Số kiện phải là số nguyên không âm";
  }

  if (requireAll && (draft.grossWeight == null || draft.grossWeight <= 0)) {
    errors.grossWeight = "Cân gross > 0";
  }
  if (requireAll && (draft.chargeableWeight == null || draft.chargeableWeight <= 0)) {
    errors.chargeableWeight = "Cân tính cước > 0";
  }

  const dimErr = checkDimensions(draft.dimensions);
  if (dimErr) errors.dimensions = dimErr;

  if (requireAll && !draft.shipperName.trim()) {
    errors.shipperName = "Nhập tên shipper";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function emptyWeighSlipDraft(): WeighSlipDraft {
  return {
    templateName: "scsc_a4_v1",
    customerId: "",
    customerConsigneeId: "",
    legacyShipmentId: "",
    mawbNo: "",
    hawbNo: "",
    shipperName: "",
    shipperAddress: "",
    shipperContact: "",
    shipperEmailFax: "",
    shipperTaxCode: "",
    consigneeName: "",
    consigneeAddress: "",
    consigneeTaxAccount: "",
    notifyAgentName: "",
    notifyAgentAddress: "",
    notifyAgentContact: "",
    notifyOther: "",
    destinationAirport: "",
    flightNo: "",
    flightDate: "",
    hawbCountStatus: "",
    goodsDescription: "",
    hsCode: "",
    pieces: null,
    grossWeight: null,
    chargeableWeight: null,
    dimensions: "",
    handlingInstruction: "",
    internalNote: "",
  };
}
