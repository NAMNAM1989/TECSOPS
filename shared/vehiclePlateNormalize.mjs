/**
 * Chuẩn hóa biển số — nguồn sự thật client + server.
 * Cho phép `;` (đã lưu trên server / clamp); bỏ ký tự khác.
 */

export const VEHICLE_PLATE_MIN = 4;

export function normalizeVehiclePlate(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9;]/g, "");
}
