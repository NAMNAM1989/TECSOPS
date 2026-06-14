const MONTHS3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function trim(s) {
  return String(s ?? "").trim();
}

function firstLine(s, max = 200) {
  return trim(s).split(/\r?\n/)[0].slice(0, max);
}

/** YYYY-MM-DD → 13JUN26 (ddmmmyy theo IATA CSD). */
export function sessionYmdToCsdDateToken(sessionYmd, refDate = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trim(sessionYmd));
  if (m) {
    const day = parseInt(m[3], 10);
    const mon = parseInt(m[2], 10) - 1;
    if (mon >= 0 && mon < 12 && day >= 1 && day <= 31) {
      return `${day}${MONTHS3[mon]}${m[1].slice(2)}`;
    }
  }
  return formatCsdDate(refDate);
}

/** Date → ddmmmyy */
export function formatCsdDate(d = new Date()) {
  const day = d.getDate();
  const mon = MONTHS3[d.getMonth()];
  const yy = String(d.getFullYear()).slice(2);
  return `${day}${mon}${yy}`;
}

/** Giờ local → HHmm */
export function formatCsdTime(d = new Date()) {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}${m}`;
}

function resolveGoodsDescription(row) {
  const explicit = trim(row.goodsDescriptionPrint);
  if (explicit) return explicit.slice(0, 500);
  const note = trim(row.note);
  if (note && note.length < 120) return note;
  const cust = trim(row.customer);
  if (cust) return `${cust} — GENERAL CARGO`;
  return "GENERAL CARGO";
}

function buildAdditionalInfo(row) {
  const lines = [];
  const flight = trim(row.flight);
  const fd = trim(row.flightDate);
  if (flight || fd) lines.push(`Flight: ${flight}${fd ? `/${fd}` : ""}`);
  if (row.pcs != null || row.kg != null) {
    lines.push(`Pcs/Wt: ${row.pcs ?? "—"} / ${row.kg ?? "—"} KG`);
  }
  const hawb = trim(row.hawb);
  if (hawb) lines.push(`HAWB: ${hawb}`);
  const cnee = firstLine(row.consigneeNamePrint, 120);
  if (cnee) lines.push(`CNEE: ${cnee}`);
  const cust = trim(row.customer);
  if (cust) lines.push(`Customer: ${cust}`);
  return lines.join("\n").slice(0, 800);
}

function defaultRaIdentifier(warehouse) {
  const w = trim(warehouse).toUpperCase();
  if (process.env.CSD_RA_IDENTIFIER?.trim()) return process.env.CSD_RA_IDENTIFIER.trim();
  if (w.includes("SCSC")) return "VN/RA 3/00009-01";
  return "VN/RA 3/00009-01";
}

/**
 * Map lô TECSOPS → giá trị field CSD.
 * @param {object} row shipment
 * @param {object} [opts]
 * @returns {Record<string, string>}
 */
export function buildCsdValuesFromShipment(row, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const origin = trim(opts.origin) || process.env.CSD_ORIGIN_AIRPORT?.trim() || "SGN";
  const securityStatus = trim(opts.securityStatus) || process.env.CSD_SECURITY_STATUS?.trim() || "SPX";
  const screeningMethod =
    trim(opts.screeningMethod) || process.env.CSD_SCREENING_METHOD?.trim() || "X-ray";
  const receivedFrom = trim(opts.receivedFrom) || "";
  const groundsExemption = trim(opts.groundsExemption) || "";
  const otherScreening = trim(opts.otherScreening) || "";
  const issuedByName =
    trim(opts.issuedByName) ||
    process.env.CSD_ISSUED_BY_NAME?.trim() ||
    "SECURITY OFFICER";
  const acceptedEntity = trim(opts.acceptedEntity) || "";
  const raCategoryIdentifier =
    trim(opts.raCategoryIdentifier) || defaultRaIdentifier(row.warehouse);

  const awb = trim(row.awb);
  const dest = trim(row.dest).toUpperCase();
  const sessionDate = trim(row.sessionDate);
  const issuedDate =
    trim(opts.issuedDate) ||
    (sessionDate ? sessionYmdToCsdDateToken(sessionDate, now) : formatCsdDate(now));
  const issuedTime = trim(opts.issuedTime) || formatCsdTime(now);

  const consolidationMark = trim(row.hawb) ? "X" : trim(opts.consolidationMark) || "";

  return {
    raCategoryIdentifier,
    uniqueConsignmentId: awb,
    contentsOfConsignment: resolveGoodsDescription(row),
    consolidationMark,
    origin,
    destination: dest,
    transferTransit: trim(opts.transferTransit) || "",
    securityStatus,
    receivedFrom,
    screeningMethod,
    groundsExemption,
    otherScreening,
    issuedByName,
    issuedDate,
    issuedTime,
    acceptedEntity,
    additionalSecurityInfo: buildAdditionalInfo(row),
  };
}
