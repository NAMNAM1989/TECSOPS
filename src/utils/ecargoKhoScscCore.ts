/** Số xe + trạng thái đăng ký eCargo KHO SCSC — đồng bộ qua AppState server. */
export type EcargoKhoScscLinePersisted = {
  vehicleInput: string;
  /** Tài xế — lấy từ hồ sơ khách hoặc nhập trên modal eCargo. */
  driverName?: string;
  driverId?: string;
  /** Người dùng đánh dấu đã dán/tạo phiếu trên trang eCargo. */
  markedSubmitted?: boolean;
  updatedAt?: string;
};

export type EcargoKhoScscPersistedMap = Record<string, EcargoKhoScscLinePersisted>;

export function normalizeEcargoVehicleInput(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => /[A-Z0-9;]/.test(c))
    .join("");
}

export function clampEcargoKhoScscLine(raw: unknown): EcargoKhoScscLinePersisted | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const vehicleInput = normalizeEcargoVehicleInput(String(o.vehicleInput ?? ""));
  const driverName = typeof o.driverName === "string" ? o.driverName.trim().slice(0, 120) : undefined;
  const driverId = typeof o.driverId === "string" ? o.driverId.replace(/\D/g, "").slice(0, 20) : undefined;
  const markedSubmitted = o.markedSubmitted === true;
  const updatedAt = typeof o.updatedAt === "string" && o.updatedAt.trim() ? o.updatedAt.trim() : undefined;
  if (!vehicleInput && !markedSubmitted) return null;
  return {
    vehicleInput,
    ...(driverName ? { driverName } : {}),
    ...(driverId ? { driverId } : {}),
    ...(markedSubmitted ? { markedSubmitted: true } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function normalizeEcargoKhoScscMap(raw: unknown): EcargoKhoScscPersistedMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: EcargoKhoScscPersistedMap = {};
  for (const [id, line] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== "string" || !id.trim()) continue;
    const clamped = clampEcargoKhoScscLine(line);
    if (clamped) out[id] = clamped;
  }
  return out;
}

export const ECARGO_SCSC_CREATE_URL = "https://ecargo.scsc.vn/Export/VCTOrder/Create";

/** Độ dài tối thiểu số xe sau chuẩn hóa (khớp eCargo / extension RAR). */
export const ECARGO_VEHICLE_MIN = 7;
