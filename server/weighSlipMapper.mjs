/** Map row DB → ScaleTicketFormData (đồng bộ với src/utils/mapWeighSlipRecordToScaleTicketFormData.ts) */

function compact(s) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatWeight(n) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const v = Number(n);
  if (v <= 0) return "";
  return v.toFixed(1);
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function formatFlightDatePrint(isoDate) {
  if (!isoDate) return "";
  const d = isoDate instanceof Date ? isoDate : new Date(String(isoDate));
  if (Number.isNaN(d.getTime())) return String(isoDate).trim();
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = MONTHS[d.getUTCMonth()] ?? "";
  return mon ? `${day}${mon}` : "";
}

function buildGoodsLine(row) {
  const base = compact(row.goods_description) || "GENERAL CARGO";
  const hs = compact(row.hs_code);
  const hi = compact(row.handling_instruction);
  const parts = [base.slice(0, 60)];
  if (hs) parts.push(`HS: ${hs.slice(0, 24)}`);
  if (hi) parts.push(hi.slice(0, 40));
  return parts.join(" | ").slice(0, 120);
}

function buildConsigneeAddress(row) {
  const addr = compact(row.consignee_address);
  const tax = compact(row.consignee_tax_account);
  if (tax && addr) return `${addr}\nMST/TK: ${tax}`.slice(0, 110);
  if (tax) return `MST/TK: ${tax}`.slice(0, 110);
  return addr.slice(0, 110);
}

function splitContactEmail(contact, emailFax) {
  const c = compact(contact);
  const e = compact(emailFax);
  if (e && !c) return { phone: "", email: e.slice(0, 50) };
  if (c.includes("@") && !e) return { phone: "", email: c.slice(0, 50) };
  return { phone: c.slice(0, 24), email: e.slice(0, 50) };
}

export function mapWeighSlipRowToScaleTicketFormData(row) {
  if (row.print_form_snapshot && typeof row.print_form_snapshot === "object") {
    return row.print_form_snapshot;
  }

  const shipperSplit = splitContactEmail(row.shipper_contact, row.shipper_email_fax);
  const agentSplit = splitContactEmail(row.notify_agent_contact, "");

  const flightNo = compact(row.flight_no);
  const flightDatePrint = formatFlightDatePrint(row.flight_date);
  const flightLinePrint =
    flightNo && flightDatePrint ? `${flightNo} / ${flightDatePrint}` : flightNo || flightDatePrint;

  const hawbNo = compact(row.hawb_no);
  const hawbStatus = compact(row.hawb_count_status);
  let hawbDisplay = hawbNo.slice(0, 48);
  if (!hawbDisplay) hawbDisplay = hawbStatus.slice(0, 48) || "No Hawb";

  const notifyParts = [compact(row.notify_other)].filter(Boolean);

  return {
    awb: compact(row.mawb_no),
    flightNo,
    flightDate: flightDatePrint,
    destination: compact(row.destination_airport).toUpperCase().slice(0, 3),
    origin: "SGN",
    totalPieces: row.pieces != null && row.pieces > 0 ? String(row.pieces) : "",
    grossWeight: formatWeight(row.gross_weight),
    chargeableWeight: formatWeight(row.chargeable_weight),
    customerCode: "",
    shipperName: compact(row.shipper_name).slice(0, 120),
    shipperAddress: compact(row.shipper_address).slice(0, 110),
    shipperPhone: shipperSplit.phone,
    shipperEmail: shipperSplit.email,
    taxCode: compact(row.shipper_tax_code).slice(0, 24),
    agentName: compact(row.notify_agent_name).slice(0, 45),
    agentAddress: compact(row.notify_agent_address).slice(0, 110),
    agentPhone: agentSplit.phone,
    agentEmail: agentSplit.email,
    agentTaxCode: "",
    consigneeName: compact(row.consignee_name).slice(0, 45),
    consigneeAddress: buildConsigneeAddress(row),
    consigneePhone: "",
    consigneeEmail: "",
    notifyName: notifyParts.join("\n").slice(0, 80),
    note: compact(row.internal_note),
    flightLinePrint,
    dimensionsText: String(row.dimensions ?? "").trim().slice(0, 500),
    goodsDescription: buildGoodsLine(row),
    hawbDisplay,
  };
}
