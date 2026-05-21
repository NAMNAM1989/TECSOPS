import { mmFontToPt } from "./printMmUnits.mjs";

/** Mẫu SCSC A4 — đồng bộ với `src/printing/scscWeigh/scscWeighTemplateAsset.ts`. */
export const SCSC_WEIGH_A4_TEMPLATE = {
  id: "tpl-scsc-weigh-a4",
  code: "scsc-weigh-a4",
  name: "Phiếu cân SCSC A4",
  page_width_mm: 210,
  page_height_mm: 297,
  background_asset_url: "/print-templates/scsc-weigh-template.png",
};

export const SCSC_DEFAULT_PROFILE = {
  id: "prof-scsc-a4-default",
  template_id: SCSC_WEIGH_A4_TEMPLATE.id,
  name: "Mặc định SCSC A4",
  offset_x_mm: 0,
  offset_y_mm: 0,
  scale_x: 1,
  scale_y: 1,
  is_default: true,
  notes: "Seed từ layout scscWeighLayout.ts (partyLineGap 6mm)",
};

const PARTY_LINE_GAP = 6;
const PARTY_ADDR_FONT = 3;
const PARTY_NAME_FONT = 4;
const PARTY_CONTACT_FONT = 3;
const SHIPPER_TOP = 30;
const AGENT_TOP = 70;
const CNEE_TOP = 100;
const CNEE_NAME_LEFT = 50;
const PARTY_RIGHT = 120;
const ADDR2_LEFT = 10;

function partyBlock(top) {
  const g = PARTY_LINE_GAP;
  return {
    name: { x: 40, y: top, w: 80, fontMm: PARTY_NAME_FONT, bold: true },
    addr1: { x: 40, y: top + g, w: 80, fontMm: PARTY_ADDR_FONT, lineHeightMm: g },
    addr2: { x: ADDR2_LEFT, y: top + g * 2, w: PARTY_RIGHT - ADDR2_LEFT, fontMm: PARTY_ADDR_FONT, lineHeightMm: g },
    phone: { x: 30, y: top + g * 3, w: 30, fontMm: PARTY_CONTACT_FONT },
    email: { x: 80, y: top + g * 3, w: 40, fontMm: PARTY_CONTACT_FONT },
  };
}

function field(key, x, y, width, fontPt, extra = {}) {
  return {
    field_key: key,
    pos_x_mm: x,
    pos_y_mm: y,
    width_mm: width,
    font_size_pt: fontPt,
    align: "left",
    multiline: false,
    bold: false,
    line_height_mm: null,
    height_mm: null,
    max_lines: null,
    ...extra,
  };
}

function fieldMm(key, x, y, width, fontMm, extra = {}) {
  return field(key, x, y, width, mmFontToPt(fontMm), extra);
}

/** Tọa độ mặc định — khớp `buildScscWeighPrintFields()` trong frontend. */
export function buildScscWeighDefaultFields() {
  const shipper = partyBlock(SHIPPER_TOP);
  const agent = partyBlock(AGENT_TOP);
  const cnee = partyBlock(CNEE_TOP);

  return [
    fieldMm("shipper", shipper.name.x, shipper.name.y, shipper.name.w, shipper.name.fontMm, { bold: true }),
    fieldMm("shipperAddress1", shipper.addr1.x, shipper.addr1.y, shipper.addr1.w, shipper.addr1.fontMm, {
      line_height_mm: PARTY_LINE_GAP,
      align: "center",
    }),
    fieldMm("shipperAddress2", shipper.addr2.x, shipper.addr2.y, shipper.addr2.w, shipper.addr2.fontMm, {
      line_height_mm: PARTY_LINE_GAP,
      align: "center",
    }),
    fieldMm("shipperPhone", shipper.phone.x, shipper.phone.y, shipper.phone.w, shipper.phone.fontMm),
    fieldMm("shipperEmail", shipper.email.x, shipper.email.y, shipper.email.w, shipper.email.fontMm),
    fieldMm("shipperTaxCode", 60, SHIPPER_TOP + PARTY_LINE_GAP * 3, 60, PARTY_CONTACT_FONT),
    fieldMm("agentName", agent.name.x, agent.name.y, agent.name.w, 3, { bold: true }),
    fieldMm("agentAddress1", agent.addr1.x, agent.addr1.y, agent.addr1.w, 3, {
      line_height_mm: PARTY_LINE_GAP,
      align: "center",
    }),
    fieldMm("agentAddress2", agent.addr2.x, agent.addr2.y, agent.addr2.w, 3, {
      line_height_mm: PARTY_LINE_GAP,
      align: "center",
    }),
    fieldMm("agentPhone", agent.phone.x, agent.phone.y, agent.phone.w, 3),
    fieldMm("agentEmail", agent.email.x, agent.email.y, agent.email.w, 3),
    fieldMm("agentTaxCode", 60, AGENT_TOP + PARTY_LINE_GAP * 3, 60, 3),
    fieldMm("mawb", 140, 35, 68, 5, { bold: true }),
    fieldMm("hawb", 140, 40.5, 68, 4, { bold: true }),
    fieldMm("consignee", CNEE_NAME_LEFT, cnee.name.y, PARTY_RIGHT - CNEE_NAME_LEFT, 3, { bold: true }),
    fieldMm("consigneeAddress1", cnee.addr1.x, cnee.addr1.y, cnee.addr1.w, 3, {
      line_height_mm: PARTY_LINE_GAP,
      align: "center",
    }),
    fieldMm("consigneeAddress2", cnee.addr2.x, cnee.addr2.y, cnee.addr2.w, 3, {
      line_height_mm: PARTY_LINE_GAP,
      align: "center",
    }),
    fieldMm("consigneePhone", cnee.phone.x, cnee.phone.y, cnee.phone.w, 3),
    fieldMm("consigneeEmail", cnee.email.x, cnee.email.y, cnee.email.w, 3),
    fieldMm("notify", 60, CNEE_TOP + PARTY_LINE_GAP * 3, 60, 3),
    fieldMm("destination", 170, 138, 40, 5, { bold: true }),
    fieldMm("flightDate", 170, 144, 40, 4),
    fieldMm("totalHawbs", 60, 145, 36, 6, { align: "center" }),
    fieldMm("goods", 35, 160, 75, 4, { bold: true, height_mm: 8, multiline: true, max_lines: 2 }),
    field("pieces", 8, 168.5, 24, 9.5, { align: "center", bold: true }),
    field("grossWeight", 113, 168.5, 41, 9.5, { align: "center", bold: true }),
    field("chargeableWeight", 154, 168.5, 46, 9.5, { align: "center", bold: true }),
    field("dimensions", 9, 182.5, 188, 7.8, { multiline: true, max_lines: 4 }),
    fieldMm("senderName", 140, 257, 55, 3, { line_height_mm: 6 }),
    fieldMm("senderPhone", 140, 263, 55, 3, { line_height_mm: 6 }),
    fieldMm("otherRequirements", 45, 270, 125 - 45, 3, {
      height_mm: 280 - 270,
      multiline: true,
      max_lines: 6,
    }),
  ];
}

export const SCSC_WEIGH_DEFAULT_FIELDS = buildScscWeighDefaultFields();

/** Danh sách field_key hợp lệ cho editor / API. */
export const SCSC_FIELD_KEYS = SCSC_WEIGH_DEFAULT_FIELDS.map((f) => f.field_key);
