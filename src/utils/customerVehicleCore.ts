import type { CustomerDirectoryEntry, CustomerSavedVehicle } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import {
  clampCustomerDirectoryEntry,
  clampCustomerSavedVehicle,
  emptyCustomerSavedVehicle,
} from "./customerDirectoryProfile";
import { findCustomerEntry } from "./mapBookingToScaleTicketFormData";
import { normalizeEcargoVehicleInput, ECARGO_VEHICLE_MIN } from "./ecargoKhoScscCore";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Tra khách theo lô (id → mã → tên). */
export function findCustomerByShipment(
  row: Pick<Shipment, "customerId" | "customerCode" | "customer">,
  directory: readonly CustomerDirectoryEntry[]
): CustomerDirectoryEntry | undefined {
  return findCustomerEntry(row as Shipment, directory);
}

/** Danh sách xe của khách — đã clamp, giữ thứ tự lưu. */
export function getCustomerVehicles(entry: CustomerDirectoryEntry | undefined): CustomerSavedVehicle[] {
  return entry?.savedVehicles ?? [];
}

/** Xe có ★ mặc định (defaultVehicleId hoặc duy nhất). */
export function getDefaultCustomerVehicle(
  entry: CustomerDirectoryEntry | undefined
): CustomerSavedVehicle | undefined {
  const list = getCustomerVehicles(entry);
  if (!list.length) return undefined;
  const defId = entry?.defaultVehicleId?.trim();
  if (defId) {
    const hit = list.find((v) => norm(v.id) === norm(defId));
    if (hit) return hit;
  }
  if (list.length === 1) return list[0];
  return undefined;
}

export function isCustomerVehicleDefault(
  entry: CustomerDirectoryEntry | undefined,
  vehicle: CustomerSavedVehicle
): boolean {
  if (!entry) return false;
  const defId = entry.defaultVehicleId?.trim();
  if (defId) return norm(defId) === norm(vehicle.id);
  return (entry.savedVehicles?.length ?? 0) === 1 && entry.savedVehicles?.[0]?.id === vehicle.id;
}

/** Chuẩn hóa biển số cho ô eCargo (uppercase, bỏ ký tự lạ). */
export function formatVehicleLicensePlate(raw: string): string {
  return normalizeEcargoVehicleInput(raw);
}

/** Giá trị `vehicleInput` lưu trên lô / gửi eCargo. */
export function buildVehicleEcargoInput(vehicle: Pick<CustomerSavedVehicle, "licensePlate">): string {
  return formatVehicleLicensePlate(vehicle.licensePlate);
}

export function vehicleDisplayLabel(v: CustomerSavedVehicle): string {
  const plate = v.licensePlate.trim();
  const driver = v.driverName.trim();
  const id = v.driverId.trim();
  const driverPart = driver && id ? `${driver} · CCCD ${id}` : driver || (id ? `CCCD ${id}` : "");
  if (plate && driverPart) return `${plate} · ${driverPart}`;
  return plate || driverPart || "—";
}

export function filterCustomerVehicles(
  vehicles: readonly CustomerSavedVehicle[],
  query: string
): CustomerSavedVehicle[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...vehicles];
  return vehicles.filter((v) => {
    const hay = [v.licensePlate, v.driverName, v.driverId].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

export type UpsertCustomerVehicleParams = {
  customerId: string;
  licensePlate: string;
  driverName: string;
  driverId: string;
  setAsDefault: boolean;
};

/**
 * Thêm hoặc cập nhật xe trong danh bạ khách (từ màn eCargo hoặc hồ sơ).
 * Khớp theo biển số đã chuẩn hóa; nếu chưa có thì thêm mới.
 */
export function upsertCustomerVehicleInDirectory(
  directory: readonly CustomerDirectoryEntry[],
  params: UpsertCustomerVehicleParams
): CustomerDirectoryEntry[] {
  const plate = formatVehicleLicensePlate(params.licensePlate);
  if (!plate) return [...directory];

  return directory.map((entry) => {
    if (entry.id !== params.customerId) return entry;
    const list = [...(entry.savedVehicles ?? [])];
    const idx = list.findIndex((v) => formatVehicleLicensePlate(v.licensePlate) === plate);
    const nextVehicle = clampCustomerSavedVehicle({
      id: idx >= 0 ? list[idx]!.id : emptyCustomerSavedVehicle().id,
      licensePlate: plate,
      driverName: params.driverName.trim(),
      driverId: params.driverId.replace(/\D/g, ""),
    });
    if (idx >= 0) list[idx] = nextVehicle;
    else list.push(nextVehicle);

    const defaultVehicleId = params.setAsDefault
      ? nextVehicle.id
      : entry.defaultVehicleId === nextVehicle.id
        ? nextVehicle.id
        : entry.defaultVehicleId;

    return clampCustomerDirectoryEntry({
      ...entry,
      savedVehicles: list,
      defaultVehicleId,
    });
  });
}

export type EcargoVehiclePrefillResult = {
  customer?: CustomerDirectoryEntry;
  vehicles: CustomerSavedVehicle[];
  defaultVehicle?: CustomerSavedVehicle;
  vehicleInput: string;
  driverName: string;
  driverId: string;
  /** Xe/tài xế lấy từ hồ sơ khách (★ mặc định), chưa có trên lô eCargo. */
  appliedFromDefault: boolean;
  matchedProfileVehicle: boolean;
};

/** Giá trị khởi tạo form eCargo khi mở modal (tránh flash). */
export function resolveEcargoVehiclePrefill(
  row: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  savedVehicleInput: string,
  savedDriver?: { driverName?: string; driverId?: string }
): EcargoVehiclePrefillResult {
  const customer = findCustomerByShipment(row, directory);
  const vehicles = getCustomerVehicles(customer);
  const defaultVehicle = getDefaultCustomerVehicle(customer);
  const saved = formatVehicleLicensePlate(savedVehicleInput);

  if (saved) {
    const matched = vehicles.find((v) => formatVehicleLicensePlate(v.licensePlate) === saved);
    return {
      customer,
      vehicles,
      defaultVehicle,
      vehicleInput: saved,
      driverName: matched?.driverName?.trim() || savedDriver?.driverName?.trim() || "",
      driverId: matched?.driverId?.trim() || savedDriver?.driverId?.trim() || "",
      appliedFromDefault: false,
      matchedProfileVehicle: Boolean(matched),
    };
  }

  if (defaultVehicle) {
    const plate = buildVehicleEcargoInput(defaultVehicle);
    return {
      customer,
      vehicles,
      defaultVehicle,
      vehicleInput: plate,
      driverName: defaultVehicle.driverName?.trim() || "",
      driverId: defaultVehicle.driverId?.trim() || "",
      appliedFromDefault: Boolean(plate || defaultVehicle.driverName?.trim()),
      matchedProfileVehicle: true,
    };
  }

  return {
    customer,
    vehicles,
    defaultVehicle,
    vehicleInput: "",
    driverName: savedDriver?.driverName?.trim() || "",
    driverId: savedDriver?.driverId?.trim() || "",
    appliedFromDefault: false,
    matchedProfileVehicle: false,
  };
}

/** Áp xe/tài xế mặc định từ danh bạ khách lên map eCargo của lô (nếu lô chưa có hoặc thiếu tài xế). */
export function computeEcargoSeedFromCustomer(
  row: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  existing?: { vehicleInput?: string; driverName?: string; driverId?: string }
): {
  prefill: EcargoVehiclePrefillResult;
  patch: { vehicleInput: string; driverName?: string; driverId?: string } | null;
} {
  const prefill = resolveEcargoVehiclePrefill(
    row,
    directory,
    existing?.vehicleInput ?? "",
    existing
  );
  const savedVehicle = formatVehicleLicensePlate(existing?.vehicleInput ?? "");
  const savedDriverName = existing?.driverName?.trim() ?? "";

  const shouldSeedVehicle =
    !savedVehicle && prefill.vehicleInput.length >= ECARGO_VEHICLE_MIN;
  const shouldSeedDriver =
    Boolean(prefill.driverName.trim() || prefill.driverId.trim()) &&
    (!savedDriverName || shouldSeedVehicle);

  if (!shouldSeedVehicle && !shouldSeedDriver) {
    return { prefill, patch: null };
  }

  return {
    prefill,
    patch: {
      vehicleInput: shouldSeedVehicle ? prefill.vehicleInput : savedVehicle,
      ...(shouldSeedDriver || shouldSeedVehicle
        ? {
            driverName: prefill.driverName.trim() || undefined,
            driverId: prefill.driverId.trim() || undefined,
          }
        : {}),
    },
  };
}
