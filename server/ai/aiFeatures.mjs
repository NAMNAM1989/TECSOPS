import { generateGeminiJson } from "./geminiClient.mjs";

const WAREHOUSES = new Set(["TECS-TCS", "TECS-SCSC", "TCS", "SCSC"]);

const text = (value, max = 300) => String(value ?? "").trim().slice(0, max);
const numberOrNull = (value, max = 1_000_000) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
};
const list = (value, max = 10, itemMax = 300) =>
  (Array.isArray(value) ? value : [])
    .map((item) => text(item, itemMax))
    .filter(Boolean)
    .slice(0, max);

function normalizeBooking(raw) {
  const warehouse = text(raw?.warehouse, 20).toUpperCase();
  return {
    awb: text(raw?.awb, 20),
    hawb: text(raw?.hawb, 30),
    flight: text(raw?.flight, 12).toUpperCase(),
    flightDate: text(raw?.flightDate, 12).toUpperCase(),
    cutoff: text(raw?.cutoff, 10),
    dest: text(raw?.dest, 5).toUpperCase(),
    warehouse: WAREHOUSES.has(warehouse) ? warehouse : "",
    pcs: numberOrNull(raw?.pcs, 1_000_000),
    kg: numberOrNull(raw?.kg, 100_000_000),
    customer: text(raw?.customer, 120),
    note: text(raw?.note, 500),
    confidence: Math.max(0, Math.min(1, Number(raw?.confidence) || 0)),
    warnings: list(raw?.warnings, 8, 180),
  };
}

function normalizeProfile(raw) {
  const party = (value) => ({
    name: text(value?.name, 160),
    address: text(value?.address, 500),
    phone: text(value?.phone, 40),
    email: text(value?.email, 160),
    taxCode: text(value?.taxCode, 40),
  });
  return {
    name: text(raw?.name, 160),
    code: text(raw?.code, 40).toUpperCase().replace(/\s+/g, ""),
    taxCode: text(raw?.taxCode, 40),
    address: text(raw?.address, 500),
    phone: text(raw?.phone, 40),
    email: text(raw?.email, 160),
    shipper: party(raw?.shipper),
    consignee: party(raw?.consignee),
    goodsDescription: text(raw?.goodsDescription, 500),
    confidence: Math.max(0, Math.min(1, Number(raw?.confidence) || 0)),
    warnings: list(raw?.warnings, 8, 180),
  };
}

function normalizeSheetExplanations(raw) {
  return {
    summary: text(raw?.summary, 600),
    rows: (Array.isArray(raw?.rows) ? raw.rows : []).slice(0, 25).map((row, index) => ({
      index: Math.max(0, Math.floor(Number(row?.index) || index)),
      issue: text(row?.issue, 300),
      suggestion: text(row?.suggestion, 500),
      severity: ["info", "warning", "error"].includes(String(row?.severity))
        ? String(row.severity)
        : "info",
    })),
  };
}

function normalizeDim(raw) {
  const lines = (Array.isArray(raw?.lines) ? raw.lines : []).slice(0, 100).flatMap((line) => {
    const l = numberOrNull(line?.lCm, 1_000);
    const w = numberOrNull(line?.wCm, 1_000);
    const h = numberOrNull(line?.hCm, 1_000);
    const pcs = numberOrNull(line?.pcs, 100_000);
    return l && w && h && pcs
      ? [{ lCm: l, wCm: w, hCm: h, pcs: Math.floor(pcs) }]
      : [];
  });
  return {
    lines,
    divisor: [5_000, 6_000].includes(Number(raw?.divisor)) ? Number(raw.divisor) : 6_000,
    warnings: list(raw?.warnings, 8, 180),
  };
}

function schema(feature) {
  const schemas = {
    booking: `{"awb":"","hawb":"","flight":"","flightDate":"","cutoff":"","dest":"","warehouse":"TECS-TCS|TECS-SCSC|TCS|SCSC|","pcs":null,"kg":null,"customer":"","note":"","confidence":0,"warnings":[]}`,
    profile: `{"name":"","code":"","taxCode":"","address":"","phone":"","email":"","shipper":{"name":"","address":"","phone":"","email":"","taxCode":""},"consignee":{"name":"","address":"","phone":"","email":"","taxCode":""},"goodsDescription":"","confidence":0,"warnings":[]}`,
    sheet: `{"summary":"","rows":[{"index":0,"issue":"","suggestion":"","severity":"info|warning|error"}]}`,
    otherRequest: `{"draft":"","warnings":[]}`,
    ask: `{"answer":"","evidence":[],"warnings":[]}`,
    checklist: `{"summary":"","explanations":[{"id":"","explanation":""}]}`,
    dim: `{"lines":[{"lCm":0,"wCm":0,"hCm":0,"pcs":0}],"divisor":6000,"warnings":[]}`,
    endDay: `{"headline":"","bullets":[],"risks":[],"nextActions":[]}`,
  };
  return schemas[feature];
}

async function generateFeature(feature, user, normalize, options = {}) {
  const raw = await (options.generate || generateGeminiJson)({
    system:
      "Bạn là trợ lý Ops TECSOPS. Chỉ tạo DRAFT/GỢI Ý, không submit portal, không đổi trạng thái. Không bịa dữ liệu thiếu; dùng chuỗi rỗng/null và warnings.",
    user,
    schemaHint: schema(feature),
    ...(options.inlineData ? { inlineData: options.inlineData } : {}),
  });
  return normalize(raw);
}

export async function parseBookingText(input, options = {}) {
  const source = text(input?.text, 8_000);
  if (!source) throw new Error("Thiếu nội dung booking.");
  return generateFeature(
    "booking",
    `Trích xuất draft booking từ tin nhắn sau:\n${source}`,
    normalizeBooking,
    options,
  );
}

export async function parseProfileImage(input, options = {}) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
    String(input?.imageDataUrl || ""),
  );
  if (!match || match[2].length > 10_000_000) {
    throw new Error("Ảnh phải là PNG/JPEG/WEBP data URL và không quá 7.5MB.");
  }
  return generateFeature(
    "profile",
    "OCR ảnh hồ sơ khách/shipper/consignee thành draft. Không suy đoán trường không nhìn thấy.",
    normalizeProfile,
    { ...options, inlineData: { mimeType: match[1], data: match[2] } },
  );
}

export async function explainSheetRows(input, options = {}) {
  const rows = (Array.isArray(input?.rows) ? input.rows : []).slice(0, 25).map((row) => {
    const safe = {};
    for (const [key, value] of Object.entries(row && typeof row === "object" ? row : {})) {
      safe[text(key, 80)] = text(value, 300);
    }
    return safe;
  });
  if (!rows.length) throw new Error("Không có dòng Sheet cần giải thích.");
  return generateFeature(
    "sheet",
    `Giải thích lỗi/mơ hồ từng dòng; chỉ gợi ý, không auto-apply:\n${JSON.stringify(rows)}`,
    normalizeSheetExplanations,
    options,
  );
}

export async function draftEsidOtherRequest(input, options = {}) {
  const safe = {
    goods: text(input?.goods, 300),
    dest: text(input?.dest, 5),
    note: text(input?.note, 300),
    specialHandling: text(input?.specialHandling, 300),
  };
  return generateFeature(
    "otherRequest",
    `Soạn other_request eSID ngắn, rõ, không thêm dữ liệu ngoài input:\n${JSON.stringify(safe)}`,
    (raw) => ({ draft: text(raw?.draft, 500), warnings: list(raw?.warnings, 8, 180) }),
    options,
  );
}

export function sanitizeOpsSnapshot(state, sessionDate) {
  const rows = Array.isArray(state?.rows) ? state.rows : [];
  return rows
    .filter((row) => !sessionDate || String(row.sessionDate) === sessionDate)
    .slice(0, 500)
    .map((row) => ({
      awb: text(row.awb, 20),
      flight: text(row.flight, 12),
      flightDate: text(row.flightDate, 12),
      dest: text(row.dest, 5),
      warehouse: text(row.warehouse, 20),
      pcs: numberOrNull(row.pcs),
      kg: numberOrNull(row.kg, 100_000_000),
      customerCode: text(row.customerCode, 40),
      status: text(row.status, 40),
      note: text(row.note, 200),
    }));
}

export async function askOps(input, state, options = {}) {
  const question = text(input?.question, 1_000);
  if (!question) throw new Error("Thiếu câu hỏi Ops.");
  const sessionDate = text(input?.sessionDate, 10);
  const snapshot = sanitizeOpsSnapshot(state, sessionDate);
  return generateFeature(
    "ask",
    `Câu hỏi: ${question}\nSnapshot đã loại PII (${snapshot.length} dòng):\n${JSON.stringify(snapshot)}`,
    (raw) => ({
      answer: text(raw?.answer, 2_000),
      evidence: list(raw?.evidence, 12, 300),
      warnings: list(raw?.warnings, 8, 180),
    }),
    options,
  );
}

export function buildAnomalyRules(input) {
  const warnings = [];
  const awb = String(input?.awb || "").replace(/\D/g, "");
  if (awb.length !== 11) warnings.push({ id: "awb", severity: "error", message: "AWB chưa đủ 11 số." });
  if (!text(input?.flight, 12)) warnings.push({ id: "flight", severity: "warning", message: "Thiếu chuyến bay." });
  if (!text(input?.dest, 5)) warnings.push({ id: "dest", severity: "warning", message: "Thiếu điểm đến." });
  if (!numberOrNull(input?.pcs)) warnings.push({ id: "pcs", severity: "warning", message: "PCS chưa hợp lệ." });
  if (!numberOrNull(input?.kg, 100_000_000)) warnings.push({ id: "kg", severity: "warning", message: "KG chưa hợp lệ." });
  if (!text(input?.customerCode, 40)) warnings.push({ id: "customer", severity: "info", message: "Chưa gắn Customer Code." });
  return warnings;
}

export async function explainAnomalyChecklist(input, options = {}) {
  const rules = buildAnomalyRules(input);
  if (!rules.length) return { rules, summary: "Không phát hiện trường bắt buộc bất thường.", explanations: [] };
  const ai = await generateFeature(
    "checklist",
    `Diễn giải ngắn checklist rule sau, không thay đổi kết luận rule:\n${JSON.stringify(rules)}`,
    (raw) => ({
      summary: text(raw?.summary, 600),
      explanations: (Array.isArray(raw?.explanations) ? raw.explanations : [])
        .slice(0, rules.length)
        .map((item) => ({ id: text(item?.id, 40), explanation: text(item?.explanation, 300) })),
    }),
    options,
  );
  return { rules, ...ai };
}

export async function parseDimText(input, options = {}) {
  const source = text(input?.text, 8_000);
  if (!source) throw new Error("Thiếu nội dung DIM.");
  return generateFeature(
    "dim",
    `Parse DIM bẩn thành Dài/Rộng/Cao(cm)/số kiện. Không tự đổi đơn vị nếu không rõ:\n${source}`,
    normalizeDim,
    options,
  );
}

export function buildEndOfDayAggregate(state, sessionDate) {
  const rows = sanitizeOpsSnapshot(state, sessionDate);
  const byWarehouse = {};
  const byStatus = {};
  let pcs = 0;
  let kg = 0;
  for (const row of rows) {
    byWarehouse[row.warehouse || "?"] = (byWarehouse[row.warehouse || "?"] || 0) + 1;
    byStatus[row.status || "?"] = (byStatus[row.status || "?"] || 0) + 1;
    pcs += Number(row.pcs) || 0;
    kg += Number(row.kg) || 0;
  }
  return { sessionDate, shipments: rows.length, pcs, kg, byWarehouse, byStatus };
}

export async function summarizeEndOfDay(input, state, options = {}) {
  const sessionDate = text(input?.sessionDate, 10);
  const aggregate = buildEndOfDayAggregate(state, sessionDate);
  return generateFeature(
    "endDay",
    `Tóm tắt cuối ngày từ aggregate, không bịa số:\n${JSON.stringify(aggregate)}`,
    (raw) => ({
      aggregate,
      headline: text(raw?.headline, 300),
      bullets: list(raw?.bullets, 10, 300),
      risks: list(raw?.risks, 8, 300),
      nextActions: list(raw?.nextActions, 8, 300),
    }),
    options,
  );
}
