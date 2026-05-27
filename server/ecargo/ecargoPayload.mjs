const DEFAULT_PCS = 99;
const DEFAULT_GW = 1000;
const DEFAULT_COMMODITY = "Garments";
const DEFAULT_SHC = "0";
const MAWB_NORMALIZED = /^\d{3}-\d{8}$/;
const MONTHS3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function normalizeVehicleNo(raw) {
  return String(raw ?? "")
    .toUpperCase()
    .split("")
    .filter((c) => /[A-Z0-9;]/.test(c))
    .join("");
}

export function normalizeMawb(raw) {
  const collapsed = String(raw ?? "").replace(/\s/g, "").toUpperCase();
  const digitsOnly = collapsed.replace(/\D/g, "");
  if (digitsOnly.length === 11) return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3)}`;
  return collapsed.replace(/[^0-9A-Z-]/g, "");
}

export function normalizeDestination(raw) {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function padYmd(y, mo, d) {
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseBookingDateLoose(raw, defaultYear) {
  const s0 = String(raw ?? "").trim();
  if (!s0) return "";

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s0);
  if (m) return padYmd(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s0);
  if (m) return padYmd(+m[3], +m[2], +m[1]);

  const compact = s0.replace(/\s/g, "");
  m = /^(\d{1,2})([A-Za-z]{3})(\d{4})?$/.exec(compact);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = MONTHS3.indexOf(m[2].toUpperCase());
    const year = m[3] ? parseInt(m[3], 10) : defaultYear;
    if (mon >= 0 && day >= 1 && day <= 31) return padYmd(year, mon + 1, day);
  }
  return "";
}

export function isMawbCompleteForEcargo(awbRaw) {
  return MAWB_NORMALIZED.test(normalizeMawb(awbRaw));
}

export function todayIsoVietnam() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

const SCSC_WAREHOUSES = new Set(["TECS-SCSC", "KHO-SCSC"]);

function isScscWarehouse(w) {
  return SCSC_WAREHOUSES.has(w);
}

export function getEcargoRegisterReadiness(row, vehicleRaw, viewSessionYmd) {
  if (!isScscWarehouse(row.warehouse)) {
    return { ready: false, hint: "Chỉ dùng cho kho SCSC (TECS-SCSC hoặc KHO SCSC)." };
  }
  const missing = [];
  const v = normalizeVehicleNo(vehicleRaw);
  if (v.length === 0) missing.push("số xe");
  else if (v.length < 7) missing.push(`số xe (còn ${7 - v.length} ký tự)`);
  if (!isMawbCompleteForEcargo(row.awb)) missing.push("MAWB 11 số");
  if (!row.flight?.trim()) missing.push("chuyến bay");
  const y = parseInt(String(viewSessionYmd).slice(0, 4), 10);
  const year = Number.isFinite(y) && y >= 1900 ? y : new Date().getFullYear();
  const flightDateIso = parseBookingDateLoose(row.flightDate, year);
  if (!flightDateIso) missing.push("ngày bay");
  else if (flightDateIso < todayIsoVietnam()) {
    return {
      ready: false,
      hint: "Ngày bay đã qua — eCargo không chấp nhận. Cập nhật ngày bay trên lô.",
    };
  }
  if (normalizeDestination(row.dest).length < 2) missing.push("DEST");
  if (missing.length === 0) return { ready: true, hint: "Sẵn sàng tự động đăng ký." };
  return { ready: false, hint: `Chưa đủ: ${missing.join(" · ")}` };
}

/** Booking object for Playwright automation (extension-compatible). */
export function buildEcargoBookingFromShipment(row, vehicleNormalized, viewSessionYmd, driverOverride = {}) {
  const y = parseInt(String(viewSessionYmd).slice(0, 4), 10);
  const year = Number.isFinite(y) && y >= 1900 ? y : new Date().getFullYear();
  const flightDateIso = parseBookingDateLoose(row.flightDate, year);
  const mawb = normalizeMawb(row.awb);
  const hawbRaw = row.hawb?.trim() ?? "";
  const hawb = hawbRaw.length > 0 ? hawbRaw : "0";
  const pcs = row.pcs != null && row.pcs > 0 ? row.pcs : DEFAULT_PCS;
  const grossWeight = row.kg != null && row.kg > 0 ? row.kg : DEFAULT_GW;
  const driverName = String(driverOverride.driverName ?? "").trim();
  const driverId = String(driverOverride.driverId ?? "")
    .trim()
    .replace(/\D/g, "");

  return {
    vehicleNo: normalizeVehicleNo(vehicleNormalized),
    flight: String(row.flight ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ""),
    flightDate: flightDateIso,
    destination: normalizeDestination(row.dest),
    mawb,
    hawb,
    pcs,
    grossWeight,
    commodity: DEFAULT_COMMODITY,
    shc: DEFAULT_SHC,
    opsShipmentId: row.id,
    ...(driverName ? { driverName } : {}),
    ...(driverId ? { driverId } : {}),
  };
}

export function validateEcargoBooking(booking) {
  const errors = [];
  if (!booking.vehicleNo || booking.vehicleNo.length < 7) errors.push("Số xe phải có ít nhất 7 ký tự.");
  if (!booking.flight || booking.flight.length < 3) errors.push("Thiếu số hiệu chuyến bay.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.flightDate)) errors.push("Ngày bay không hợp lệ.");
  if (!booking.destination || booking.destination.length < 2) errors.push("Thiếu DEST.");
  if (!/^\d{3}-\d{8}$/.test(booking.mawb)) errors.push("MAWB không hợp lệ.");
  if (!Number.isFinite(booking.pcs) || booking.pcs < 1 || booking.pcs > 9999) errors.push("PCS không hợp lệ.");
  if (!Number.isFinite(booking.grossWeight) || booking.grossWeight < 0.1 || booking.grossWeight > 99999) {
    errors.push("GW không hợp lệ.");
  }
  return errors;
}
