import type { A4WeighReceiptPrinterProfile } from "../printTypes";
import type { ScscFieldDef } from "./scscWeighTemplate";
import { layoutScscGoods } from "./scscGoodsFontFit";
import { layoutScscOtherRequirements, SCSC_OTHER_REQ_BOX } from "./scscOtherRequirementsFontFit";

/** Nhãn ô tổng vận đơn phụ trên phiếu SCSC (không in số/mã HAWB). */
export function formatScscHawbStatusLabel(hawbRaw: string | undefined | null): string {
  return hawbRaw?.trim() ? "01 HAWB" : "NO HAWB";
}

function applyFitLayout(
  fields: ScscFieldDef[],
  values: Record<string, string>,
  key: string,
  layout: ReturnType<typeof layoutScscGoods>
): { fields: ScscFieldDef[]; values: Record<string, string> } {
  const fieldsOut = fields.map((def) => {
    if (def.key !== key) return def;
    return {
      ...def,
      fontMm: layout.fontMm,
      multiline: layout.multiline,
      lineHeightMm: layout.lineHeightMm,
      heightMm: layout.heightMm,
    };
  });
  return {
    fields: fieldsOut,
    values: { ...values, [key]: layout.displayText },
  };
}

export function enrichScscPrintForRender(
  fields: ScscFieldDef[],
  values: Record<string, string>
): { fields: ScscFieldDef[]; values: Record<string, string> } {
  let next = { fields, values };
  const goodsDef = next.fields.find((f) => f.key === "goods");
  if (goodsDef) {
    next = applyFitLayout(
      next.fields,
      next.values,
      "goods",
      layoutScscGoods(next.values.goods ?? "", goodsDef.width)
    );
  }
  const otherDef = next.fields.find((f) => f.key === "otherRequirements");
  if (otherDef) {
    next = applyFitLayout(
      next.fields,
      next.values,
      "otherRequirements",
      layoutScscOtherRequirements(next.values.otherRequirements ?? "", otherDef.width)
    );
  }
  return next;
}

export const SCSC_PARTY_LINE_GAP_MM_DEFAULT = 6;
export const SCSC_PARTY_ADDRESS_FONT_MM_DEFAULT = 3;
export const SCSC_PARTY_NAME_FONT_MM_DEFAULT = 4;
export const SCSC_PARTY_CONTACT_FONT_MM_DEFAULT = 3;
/** Tên CNEE — cỡ nhỏ hơn để không bị cắt trong ô. */
const CNEE_NAME_FONT_MM = 3;
/** Agent: tên nhỏ hơn 1mm; địa chỉ & liên hệ cố định 3mm. */
const AGENT_NAME_FONT_OFFSET_MM = 1;
const AGENT_ADDRESS_FONT_MM = 3;
const AGENT_CONTACT_FONT_MM = 3;

function agentNameFontMm(nameFontMm: number): number {
  return Math.round(Math.max(2, nameFontMm - AGENT_NAME_FONT_OFFSET_MM) * 10) / 10;
}

const SHIPPER_TOP_MM = 30;
const AGENT_TOP_MM = 70;
const CNEE_TOP_MM = 100;
/** Tên người nhận (CNEE) — mép trái A4. */
const CNEE_NAME_LEFT_MM = 50;
const PARTY_RIGHT_EDGE_MM = 120;
const ADDR2_LEFT_MM = 10;

export type ScscWeighLayout = {
  partyLineGapMm: number;
  partyAddressFontMm: number;
  partyNameFontMm: number;
  partyContactFontMm: number;
};

export type ScscPartyBlockCoords = {
  name: { x: number; y: number; width: number; fontMm: number };
  addressLine1: { x: number; y: number; width: number; fontMm: number };
  addressLine2: { x: number; y: number; width: number; fontMm: number };
  phone: { x: number; y: number; width: number; fontMm: number };
  email: { x: number; y: number; width: number; fontMm: number };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Gợi ý cỡ chữ địa chỉ vừa một dòng trong `lineGapMm` (line-height = gap). */
export function suggestAddressFontForLineGap(lineGapMm: number): number {
  return round1(clamp(lineGapMm * 0.5, 2.5, 5.5));
}

export function resolveScscWeighLayout(profile?: A4WeighReceiptPrinterProfile | null): ScscWeighLayout {
  const partyLineGapMm = clamp(
    profile?.partyLineGapMm ?? SCSC_PARTY_LINE_GAP_MM_DEFAULT,
    4,
    12
  );
  const partyAddressFontMm = clamp(
    profile?.partyAddressFontMm ?? suggestAddressFontForLineGap(partyLineGapMm),
    2.5,
    5.5
  );
  const partyNameFontMm = clamp(
    profile?.partyNameFontMm ?? SCSC_PARTY_NAME_FONT_MM_DEFAULT,
    3,
    6
  );
  const partyContactFontMm = clamp(
    profile?.partyContactFontMm ?? SCSC_PARTY_CONTACT_FONT_MM_DEFAULT,
    2.5,
    5.5
  );
  return { partyLineGapMm, partyAddressFontMm, partyNameFontMm, partyContactFontMm };
}

function buildPartyBlock(topMm: number, layout: ScscWeighLayout): ScscPartyBlockCoords {
  const g = layout.partyLineGapMm;
  const addrFont = layout.partyAddressFontMm;
  const nameFont = layout.partyNameFontMm;
  const contactFont = layout.partyContactFontMm;
  return {
    name: { x: 40, y: topMm, width: 80, fontMm: nameFont },
    addressLine1: { x: 40, y: topMm + g, width: 80, fontMm: addrFont },
    addressLine2: {
      x: ADDR2_LEFT_MM,
      y: topMm + g * 2,
      width: PARTY_RIGHT_EDGE_MM - ADDR2_LEFT_MM,
      fontMm: addrFont,
    },
    phone: { x: 30, y: topMm + g * 3, width: 30, fontMm: contactFont },
    email: { x: 80, y: topMm + g * 3, width: 40, fontMm: contactFont },
  };
}

export function buildScscPartyBlocks(layout: ScscWeighLayout) {
  const shipper = {
    ...buildPartyBlock(SHIPPER_TOP_MM, layout),
    taxCode: {
      x: 60,
      y: SHIPPER_TOP_MM + layout.partyLineGapMm * 3,
      width: 60,
      fontMm: layout.partyContactFontMm,
    },
  };
  const agentBase = buildPartyBlock(AGENT_TOP_MM, layout);
  const agent = {
    ...agentBase,
    name: { ...agentBase.name, fontMm: agentNameFontMm(agentBase.name.fontMm) },
    addressLine1: { ...agentBase.addressLine1, fontMm: AGENT_ADDRESS_FONT_MM },
    addressLine2: { ...agentBase.addressLine2, fontMm: AGENT_ADDRESS_FONT_MM },
    phone: { ...agentBase.phone, fontMm: AGENT_CONTACT_FONT_MM },
    email: { ...agentBase.email, fontMm: AGENT_CONTACT_FONT_MM },
    taxCode: {
      x: 60,
      y: AGENT_TOP_MM + layout.partyLineGapMm * 3,
      width: 60,
      fontMm: AGENT_CONTACT_FONT_MM,
    },
  };
  const cneeBase = buildPartyBlock(CNEE_TOP_MM, layout);
  const cnee = {
    ...cneeBase,
    name: {
      ...cneeBase.name,
      x: CNEE_NAME_LEFT_MM,
      width: PARTY_RIGHT_EDGE_MM - CNEE_NAME_LEFT_MM,
      fontMm: CNEE_NAME_FONT_MM,
    },
    notify: {
      x: 60,
      y: CNEE_TOP_MM + layout.partyLineGapMm * 3,
      width: 60,
      fontMm: layout.partyContactFontMm,
    },
  };
  return { shipper, agent, cnee };
}

const SCSC_AWB_BLOCK = {
  awb: { x: 140, y: 35, fontMm: 5, width: 68 },
  hawb: { x: 140, y: 40.5, fontMm: 4, width: 68 },
} as const;

const SCSC_DEST_TOP_MM = 138;
const SCSC_DEST_LEFT_MM = 170;
const SCSC_DEST_FONT_MM = 5;
const SCSC_FLIGHT_FONT_MM = 4;
/** Một dòng dưới DEST (cỡ DEST 5mm). */
const SCSC_FLIGHT_TOP_MM = SCSC_DEST_TOP_MM + 6;

const SCSC_GOODS_TOP_MM = 160;
const SCSC_GOODS_LEFT_MM = 35;
const SCSC_GOODS_WIDTH_MM = 110 - 35;

const SCSC_HAWB_STATUS_TOP_MM = 145;
const SCSC_HAWB_STATUS_LEFT_MM = 60;
const SCSC_HAWB_STATUS_WIDTH_MM = 36;
const SCSC_HAWB_STATUS_FONT_MM = 6;

const A4_PAGE_HEIGHT_MM = 297;
const SCSC_SENDER_LEFT_MM = 140;
/** Mép trên ô họ tên — cách mép dưới A4 40mm. */
const SCSC_SENDER_NAME_TOP_MM = A4_PAGE_HEIGHT_MM - 40;
const SCSC_SENDER_LINE_GAP_MM = 6;
const SCSC_SENDER_FONT_MM = 3;
const SCSC_SENDER_WIDTH_MM = 55;
const SCSC_SENDER_PHONE_TOP_MM = SCSC_SENDER_NAME_TOP_MM + SCSC_SENDER_LINE_GAP_MM;

function partyAddressField(
  key: string,
  box: { x: number; y: number; width: number; fontMm: number },
  lineGapMm: number,
  extra?: Partial<ScscFieldDef>
): ScscFieldDef {
  return {
    key,
    x: box.x,
    y: box.y,
    width: box.width,
    fontMm: box.fontMm,
    lineHeightMm: lineGapMm,
    align: "center",
    ...extra,
  };
}

export function buildScscWeighPrintFields(layout: ScscWeighLayout): ScscFieldDef[] {
  const { shipper, agent, cnee } = buildScscPartyBlocks(layout);
  const gap = layout.partyLineGapMm;

  return [
    { key: "shipper", x: shipper.name.x, y: shipper.name.y, width: shipper.name.width, fontMm: shipper.name.fontMm, bold: true },
    partyAddressField("shipperAddress1", shipper.addressLine1, gap),
    partyAddressField("shipperAddress2", shipper.addressLine2, gap),
    { key: "shipperPhone", x: shipper.phone.x, y: shipper.phone.y, width: shipper.phone.width, fontMm: shipper.phone.fontMm },
    { key: "shipperEmail", x: shipper.email.x, y: shipper.email.y, width: shipper.email.width, fontMm: shipper.email.fontMm },
    { key: "shipperTaxCode", x: shipper.taxCode.x, y: shipper.taxCode.y, width: shipper.taxCode.width, fontMm: shipper.taxCode.fontMm },
    { key: "agentName", x: agent.name.x, y: agent.name.y, width: agent.name.width, fontMm: agent.name.fontMm, bold: true },
    partyAddressField("agentAddress1", agent.addressLine1, gap),
    partyAddressField("agentAddress2", agent.addressLine2, gap),
    { key: "agentPhone", x: agent.phone.x, y: agent.phone.y, width: agent.phone.width, fontMm: agent.phone.fontMm },
    { key: "agentEmail", x: agent.email.x, y: agent.email.y, width: agent.email.width, fontMm: agent.email.fontMm },
    { key: "agentTaxCode", x: agent.taxCode.x, y: agent.taxCode.y, width: agent.taxCode.width, fontMm: agent.taxCode.fontMm },
    { key: "mawb", x: SCSC_AWB_BLOCK.awb.x, y: SCSC_AWB_BLOCK.awb.y, width: SCSC_AWB_BLOCK.awb.width, fontMm: SCSC_AWB_BLOCK.awb.fontMm, bold: true },
    { key: "hawb", x: SCSC_AWB_BLOCK.hawb.x, y: SCSC_AWB_BLOCK.hawb.y, width: SCSC_AWB_BLOCK.hawb.width, fontMm: SCSC_AWB_BLOCK.hawb.fontMm, bold: true },
    { key: "consignee", x: cnee.name.x, y: cnee.name.y, width: cnee.name.width, fontMm: cnee.name.fontMm, bold: true },
    partyAddressField("consigneeAddress1", cnee.addressLine1, gap),
    partyAddressField("consigneeAddress2", cnee.addressLine2, gap),
    { key: "consigneePhone", x: cnee.phone.x, y: cnee.phone.y, width: cnee.phone.width, fontMm: cnee.phone.fontMm },
    { key: "consigneeEmail", x: cnee.email.x, y: cnee.email.y, width: cnee.email.width, fontMm: cnee.email.fontMm },
    { key: "notify", x: cnee.notify.x, y: cnee.notify.y, width: cnee.notify.width, fontMm: cnee.notify.fontMm },
    {
      key: "destination",
      x: SCSC_DEST_LEFT_MM,
      y: SCSC_DEST_TOP_MM,
      width: 40,
      fontMm: SCSC_DEST_FONT_MM,
      bold: true,
    },
    {
      key: "flightDate",
      x: SCSC_DEST_LEFT_MM,
      y: SCSC_FLIGHT_TOP_MM,
      width: 40,
      fontMm: SCSC_FLIGHT_FONT_MM,
    },
    {
      key: "totalHawbs",
      x: SCSC_HAWB_STATUS_LEFT_MM,
      y: SCSC_HAWB_STATUS_TOP_MM,
      width: SCSC_HAWB_STATUS_WIDTH_MM,
      fontMm: SCSC_HAWB_STATUS_FONT_MM,
      align: "center",
    },
    {
      key: "goods",
      x: SCSC_GOODS_LEFT_MM,
      y: SCSC_GOODS_TOP_MM,
      width: SCSC_GOODS_WIDTH_MM,
      fontMm: 4,
      bold: true,
    },
    { key: "pieces", x: 8, y: 168.5, width: 24, fontPt: 9.5, align: "center", bold: true },
    { key: "grossWeight", x: 113, y: 168.5, width: 41, fontPt: 9.5, align: "center", bold: true },
    { key: "chargeableWeight", x: 154, y: 168.5, width: 46, fontPt: 9.5, align: "center", bold: true },
    { key: "dimensions", x: 9, y: 182.5, width: 188, fontPt: 7.8, multiline: true },
    {
      key: "senderName",
      x: SCSC_SENDER_LEFT_MM,
      y: SCSC_SENDER_NAME_TOP_MM,
      width: SCSC_SENDER_WIDTH_MM,
      fontMm: SCSC_SENDER_FONT_MM,
      lineHeightMm: SCSC_SENDER_LINE_GAP_MM,
    },
    {
      key: "senderPhone",
      x: SCSC_SENDER_LEFT_MM,
      y: SCSC_SENDER_PHONE_TOP_MM,
      width: SCSC_SENDER_WIDTH_MM,
      fontMm: SCSC_SENDER_FONT_MM,
      lineHeightMm: SCSC_SENDER_LINE_GAP_MM,
    },
    {
      key: "otherRequirements",
      x: SCSC_OTHER_REQ_BOX.leftMm,
      y: SCSC_OTHER_REQ_BOX.topMm,
      width: SCSC_OTHER_REQ_BOX.rightMm - SCSC_OTHER_REQ_BOX.leftMm,
      fontMm: SCSC_OTHER_REQ_BOX.maxFontMm,
      heightMm: SCSC_OTHER_REQ_BOX.bottomMm - SCSC_OTHER_REQ_BOX.topMm,
    },
  ];
}
