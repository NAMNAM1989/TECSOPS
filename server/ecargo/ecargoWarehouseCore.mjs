/** Pure helpers — ngày/giờ hàng vào kho eCargo (VN), test được ngoài Playwright. */

export function todayAtVietnamTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function tomorrowIsoFromVietnamDate(vietnamDate) {
  const [year, month, day] = vietnamDate.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  current.setUTCDate(current.getUTCDate() + 1);
  return `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
}

/** Khung giờ chuẩn eCargo SCSC — 24 slot mỗi giờ. */
export function buildStandardArrivalTimeSlots() {
  const slots = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const start = `${String(hour).padStart(2, "0")}:00`;
    const end = `${String(hour + 1).padStart(2, "0")}:00`;
    slots.push(`${start} - ${end}`);
  }
  return slots;
}

export function parseSlotStartHour(slotText) {
  const match = /^(\d{1,2}):/.exec(String(slotText || ""));
  return match ? Number(match[1]) : -1;
}

/**
 * Chọn slot vào kho sớm nhất còn hợp lệ — mặc định cách giờ hiện tại ≥ bufferMinutes.
 * @param {string[]} slots
 * @param {{ hour: number, minute: number }} vnNow
 * @param {{ bufferMinutes?: number }} [opts]
 */
export function pickWarehouseTimeSlot(slots, vnNow, opts = {}) {
  const bufferMinutes = opts.bufferMinutes ?? 60;
  if (!slots?.length) return "";
  const nowMinutes = vnNow.hour * 60 + vnNow.minute;
  const next = slots.find((slot) => {
    const startHour = parseSlotStartHour(slot);
    return startHour >= 0 && startHour * 60 >= nowMinutes + bufferMinutes;
  });
  return next ?? slots[slots.length - 1];
}

/**
 * Kế hoạch điền form chính — khớp extension SCSC (sau 20h → ngày mai + 07:00–08:00).
 * @param {{ warehouse?: { timeRule?: { after20h?: { timeSlot?: string } } } }} cfg
 * @param {Date} [now]
 */
export function buildWarehouseArrivalPlan(cfg, now = new Date()) {
  const vn = todayAtVietnamTime(now);
  const after20Slot = cfg?.warehouse?.timeRule?.after20h?.timeSlot ?? "07:00 - 08:00";
  const slots = buildStandardArrivalTimeSlots();

  if (vn.hour >= 20) {
    return {
      arrivalDate: tomorrowIsoFromVietnamDate(vn.date),
      timeSlot: after20Slot,
    };
  }

  return {
    arrivalDate: vn.date,
    timeSlot: pickWarehouseTimeSlot(slots, vn),
  };
}
