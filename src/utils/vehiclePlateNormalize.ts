/** Chuẩn hóa biển số / mã xe (chỉ chữ+số, upper). */
export function normalizeVehiclePlateInput(raw: string): string {
  return String(raw ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Độ dài tối thiểu sau khi chuẩn hóa. */
export const VEHICLE_PLATE_MIN = 4;
