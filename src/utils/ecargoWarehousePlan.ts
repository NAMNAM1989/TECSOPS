/** Ngày/giờ hàng vào kho + loại phương tiện eCargo SCSC (UI panel). */

export const ECARGO_VEHICLE_TYPES = ["Ô tô", "Xe máy", "Xe ba gác", "Đi bộ"] as const;
export type EcargoVehicleType = (typeof ECARGO_VEHICLE_TYPES)[number];
export const DEFAULT_ECARGO_VEHICLE_TYPE: EcargoVehicleType = "Ô tô";

export type EcargoWarehouseArrival = {
  arrivalDate: string;
  arrivalTimeSlot: string;
};

export function todayIsoVietnam(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
}

export function tomorrowIsoFromDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  current.setUTCDate(current.getUTCDate() + 1);
  return `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
}

function todayAtVietnamTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function buildEcargoArrivalTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const start = `${String(hour).padStart(2, "0")}:00`;
    const end = `${String(hour + 1).padStart(2, "0")}:00`;
    slots.push(`${start} - ${end}`);
  }
  return slots;
}

function parseSlotStartHour(slotText: string): number {
  const match = /^(\d{1,2}):/.exec(String(slotText || ""));
  return match ? Number(match[1]) : -1;
}

/** Khớp `pickWarehouseTimeSlot` trên server — cách hiện tại ≥ 6 giờ. */
export function pickEcargoWarehouseTimeSlot(
  slots: readonly string[],
  vnNow: { hour: number; minute: number },
  bufferMinutes = 360
): string {
  if (!slots.length) return "";
  const nowMinutes = vnNow.hour * 60 + vnNow.minute;
  const next = slots.find((slot) => {
    const startHour = parseSlotStartHour(slot);
    return startHour >= 0 && startHour * 60 >= nowMinutes + bufferMinutes;
  });
  return next ?? "";
}

function sanitizeEcargoWarehouseArrival(
  plan: EcargoWarehouseArrival,
  now = new Date()
): EcargoWarehouseArrival {
  const vn = todayAtVietnamTime(now);
  const defaults = buildDefaultEcargoWarehouseArrival(now);
  const slots = buildEcargoArrivalTimeSlots();

  if (plan.arrivalDate < vn.date) return defaults;

  if (plan.arrivalDate > vn.date) {
    if (isValidEcargoArrivalTimeSlot(plan.arrivalTimeSlot, slots)) return plan;
    return { arrivalDate: plan.arrivalDate, arrivalTimeSlot: defaults.arrivalTimeSlot };
  }

  const nowMinutes = vn.hour * 60 + vn.minute;
  const startHour = parseSlotStartHour(plan.arrivalTimeSlot);
  if (
    isValidEcargoArrivalTimeSlot(plan.arrivalTimeSlot, slots) &&
    startHour >= 0 &&
    startHour * 60 >= nowMinutes + 360
  ) {
    return plan;
  }

  const picked = pickEcargoWarehouseTimeSlot(slots, vn);
  if (picked) return { arrivalDate: vn.date, arrivalTimeSlot: picked };
  return defaults;
}

/** Mặc định panel — khớp `buildWarehouseArrivalPlan` (server). */
export function buildDefaultEcargoWarehouseArrival(now = new Date()): EcargoWarehouseArrival {
  const vn = todayAtVietnamTime(now);
  const slots = buildEcargoArrivalTimeSlots();
  if (vn.hour >= 20) {
    return {
      arrivalDate: tomorrowIsoFromDate(vn.date),
      arrivalTimeSlot: "07:00 - 08:00",
    };
  }
  const arrivalTimeSlot = pickEcargoWarehouseTimeSlot(slots, vn);
  if (!arrivalTimeSlot) {
    return {
      arrivalDate: tomorrowIsoFromDate(vn.date),
      arrivalTimeSlot: "07:00 - 08:00",
    };
  }
  return {
    arrivalDate: vn.date,
    arrivalTimeSlot,
  };
}

export function clampEcargoVehicleType(raw: unknown): EcargoVehicleType | undefined {
  const s = String(raw ?? "").trim();
  return (ECARGO_VEHICLE_TYPES as readonly string[]).includes(s) ? (s as EcargoVehicleType) : undefined;
}

export function isValidEcargoArrivalDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? "").trim());
}

export function isValidEcargoArrivalTimeSlot(slot: string, slots: readonly string[] = buildEcargoArrivalTimeSlots()): boolean {
  return slots.includes(String(slot ?? "").trim());
}

export function resolveEcargoWarehouseArrival(
  persisted: Partial<EcargoWarehouseArrival> | undefined,
  now = new Date()
): EcargoWarehouseArrival {
  const fallback = buildDefaultEcargoWarehouseArrival(now);
  const slots = buildEcargoArrivalTimeSlots();
  const arrivalDate = isValidEcargoArrivalDate(persisted?.arrivalDate ?? "")
    ? String(persisted!.arrivalDate).trim()
    : fallback.arrivalDate;
  const timeSlot = isValidEcargoArrivalTimeSlot(persisted?.arrivalTimeSlot ?? "", slots)
    ? String(persisted!.arrivalTimeSlot).trim()
    : fallback.arrivalTimeSlot;
  return sanitizeEcargoWarehouseArrival({ arrivalDate, arrivalTimeSlot: timeSlot }, now);
}
