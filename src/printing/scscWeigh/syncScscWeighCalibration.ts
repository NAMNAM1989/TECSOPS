import type { A4WeighReceiptPrinterProfile } from "../printTypes";
import { scscDefToPrintFieldPayload } from "../../utils/printFieldConvert";
import {
  DEFAULT_SCSC_PRINT_PROFILE_ID,
  probePrintApiAvailable,
  savePrintProfileFields,
} from "../../utils/printServerApi";
import { applyScscFieldOverrides } from "./scscFieldOverrides";
import { buildScscWeighPrintFields, resolveScscWeighLayout } from "./scscWeighLayout";

/** Gom layout gốc + override người dùng — không snapshot enrich theo dữ liệu mẫu. */
export function resolveScscFieldsForServerSync(profile: A4WeighReceiptPrinterProfile) {
  const base = buildScscWeighPrintFields(resolveScscWeighLayout(profile));
  return applyScscFieldOverrides(base, profile.scscFieldOverrides);
}

/** Đẩy căn chỉnh phiếu cân lên Postgres (mẫu chung PDF) — chỉ tọa độ/cỡ user chỉnh. */
export async function syncScscWeighCalibrationToServer(
  profile: A4WeighReceiptPrinterProfile
): Promise<void> {
  if (!(await probePrintApiAvailable())) return;

  const fields = resolveScscFieldsForServerSync(profile);
  const payloads = fields.map((def, i) => scscDefToPrintFieldPayload(def, undefined, i));

  await savePrintProfileFields(DEFAULT_SCSC_PRINT_PROFILE_ID, payloads, {
    offsetXMm: profile.offsetXmm,
    offsetYMm: profile.offsetYmm,
    scaleX: profile.scaleX,
    scaleY: profile.scaleY,
  });
}
