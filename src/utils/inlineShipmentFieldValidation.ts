/** Validation dùng chung inline edit Ops Board và modal sửa lô. */

export const CNEE_PRINT_MAX_LEN = 200;

export function validateInlinePcs(value: number | null): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return "Số kiện không hợp lệ.";
  if (value < 0) return "Số kiện không được âm.";
  if (!Number.isInteger(value)) return "Số kiện phải là số nguyên.";
  return null;
}

export function validateInlineKg(value: number | null): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return "Kg không hợp lệ.";
  if (value < 0) return "Kg không được âm.";
  return null;
}

export function validateInlineDimWeightKg(value: number | null): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return "DIM kg không hợp lệ.";
  if (value < 0) return "DIM kg không được âm.";
  return null;
}

export function validateInlineCneePrint(value: string): string | null {
  const t = value.trim();
  if (t.length > CNEE_PRINT_MAX_LEN) {
    return `Tên CNEE tối đa ${CNEE_PRINT_MAX_LEN} ký tự.`;
  }
  return null;
}

export function normalizeInlineCneePrint(value: string): string {
  return value.trim().slice(0, CNEE_PRINT_MAX_LEN);
}
