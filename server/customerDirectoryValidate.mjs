import { CUSTOMER_PROFILE_LIMITS as L } from "../shared/customerProfileLimits.mjs";
import { normalizeVehiclePlate } from "../shared/vehiclePlateNormalize.mjs";

function sliceStr(v, max) {
  const s = typeof v === "string" ? v : "";
  return s.slice(0, max);
}

/** Short Code — giữ khoảng trắng giữa từ (khớp `normalizeCustomerShortCode` phía client). */
function normalizeShortCodeLoose(v) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .slice(0, L.shortCode);
}

function normalizeCustomerTypeLoose(v) {
  const u = String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (u === "FORWARDER" || u === "DIRECT_SHIPPER" || u === "AGENT" || u === "OTHER") return u;
  if (u === "FORWARD" || u === "FWDR") return "FORWARDER";
  if (u === "DIRECT" || u === "SHIPPER" || u === "DIRECTSHIPPER") return "DIRECT_SHIPPER";
  if (u === "AG") return "AGENT";
  return "DIRECT_SHIPPER";
}

function parseDefaultRateLoose(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
  const s = String(v).trim().replace(/,/g, "").replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function accountFieldsFromItem(item, code, name) {
  const shortCode = normalizeShortCodeLoose(item.shortCode);
  const taxCode = sliceStr(item.taxCode, L.taxCode).trim();
  const address = sliceStr(item.address, L.address).trim();
  const email = sliceStr(item.email, L.email).trim();
  const phone = sliceStr(item.phone, L.phone).trim();
  const defaultRate = parseDefaultRateLoose(item.defaultRate);
  const rawType = String(item.customerType ?? "").trim();
  const customerType = rawType ? normalizeCustomerTypeLoose(rawType) : "";
  return {
    code: sliceStr(code, L.code).trim(),
    name: sliceStr(name, L.name).trim(),
    ...(shortCode ? { shortCode } : {}),
    ...(taxCode ? { taxCode } : {}),
    ...(address ? { address } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(defaultRate != null ? { defaultRate } : {}),
    ...(customerType ? { customerType } : {}),
  };
}

function normalizePartyType(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw === "SHIPPER" || raw === "CNEE" || raw === "NOTIFY" || raw === "OTHER" ? raw : "OTHER";
}

function partyTypeFromLabel(label) {
  const up = String(label || "").trim().toUpperCase();
  if (up.startsWith("SHIPPER")) return "SHIPPER";
  if (up.startsWith("CNEE") || up.startsWith("CONSIGNEE")) return "CNEE";
  if (up.startsWith("NOTIFY")) return "NOTIFY";
  return "OTHER";
}

function parsePartiesLoose(item) {
  if (Array.isArray(item.parties)) {
    return item.parties
      .filter((x) => x && typeof x === "object")
      .slice(0, L.partyCount)
      .map((x, i) => ({
        id: sliceStr(x.id, 80).trim() || `party-${i}`,
        type: normalizePartyType(x.type),
        label: sliceStr(x.label, L.partyLabel).trim(),
        content: sliceStr(x.content, L.partyContent),
      }))
      .filter((x) => x.label || x.content.trim());
  }

  if (Array.isArray(item.copySnippets)) {
    return item.copySnippets
      .filter((x) => x && typeof x === "object")
      .slice(0, L.partyCount)
      .map((x, i) => ({
        id: sliceStr(x.id, 80).trim() || `party-${i}`,
        type: partyTypeFromLabel(x.label),
        label: sliceStr(x.label, L.partyLabel).trim(),
        content: sliceStr(x.content, L.partyContent),
      }))
      .filter((x) => x.label || x.content.trim());
  }

  const legacy = [
    ["MST", item.taxId],
    ["SĐT", item.phone],
    ["EMAIL", item.email],
    ["NGƯỜI LIÊN HỆ", item.contactName],
    ["ĐỊA CHỈ", item.address],
    ["TK / THANH TOÁN", item.bankInfo],
    ["GHI CHÚ", item.detailsText ?? item.details],
  ]
    .map(([label, value]) => {
      const text = typeof value === "string" ? value.trim() : "";
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean);
  if (legacy.length) return [{ id: "legacy-info", type: "OTHER", label: "THÔNG TIN CŨ", content: legacy.join("\n") }];
  return [];
}

function parseSavedConsigneesLoose(item) {
  if (!Array.isArray(item.savedConsignees)) return [];
  const out = [];
  for (const x of item.savedConsignees) {
    if (!x || typeof x !== "object") continue;
    const sid = typeof x.id === "string" ? x.id.trim() : "";
    if (!sid) continue;
    out.push({
      id: sliceStr(sid, 80).trim(),
      label: sliceStr(x.label, L.savedConsigneeLabel).trim(),
      consigneeName: sliceStr(x.consigneeName, L.consigneeName).trim(),
      consigneeAddress: sliceStr(x.consigneeAddress, L.consigneeAddress).trim(),
      consigneePhone: sliceStr(x.consigneePhone, L.consigneePhone).trim(),
      consigneeEmail: sliceStr(x.consigneeEmail, L.consigneeEmail).trim(),
      notifyName: sliceStr(x.notifyName, L.notifyName).trim(),
    });
  }
  return out.slice(0, L.savedConsigneeCount);
}

function parseSavedShippersLoose(item) {
  if (!Array.isArray(item.savedShippers)) return [];
  const out = [];
  for (const x of item.savedShippers) {
    if (!x || typeof x !== "object") continue;
    const sid = typeof x.id === "string" ? x.id.trim() : "";
    if (!sid) continue;
    out.push({
      id: sliceStr(sid, 80).trim(),
      label: sliceStr(x.label, L.savedShipperLabel).trim(),
      shipperName: sliceStr(x.shipperName, L.shipperName).trim(),
      shipperAddress: sliceStr(x.shipperAddress, L.shipperAddress).trim(),
      shipperPhone: sliceStr(x.shipperPhone, L.shipperPhone).trim(),
      shipperEmail: sliceStr(x.shipperEmail, L.shipperEmail).trim(),
      taxCode: sliceStr(x.taxCode, L.taxCode).trim(),
    });
  }
  return out.slice(0, L.savedShipperCount);
}

function parseSavedGoodsLoose(item) {
  if (!Array.isArray(item.savedGoods)) return [];
  const out = [];
  for (const x of item.savedGoods) {
    if (!x || typeof x !== "object") continue;
    const sid = typeof x.id === "string" ? x.id.trim() : "";
    if (!sid) continue;
    out.push({
      id: sliceStr(sid, 80).trim(),
      label: sliceStr(x.label, L.savedGoodsLabel).trim(),
      goodsDescription: sliceStr(x.goodsDescription, L.savedGoodsDescription).trim(),
    });
  }
  return out.slice(0, L.savedGoodsCount);
}

function normalizeVehicleTypeLoose(v) {
  const u = String(v ?? "")
    .trim()
    .toUpperCase();
  if (u === "OTO" || u === "XEMAY" || u === "BAGAC" || u === "DIBO") return u;
  return "";
}

function normalizeDriverIdTypeLoose(v) {
  const u = String(v ?? "")
    .trim()
    .toUpperCase();
  if (u === "PASSPORT" || u === "PP") return "PP";
  if (u === "CCCD" || u === "GPLX") return u;
  return "";
}

function parseSavedVehiclesLoose(item) {
  if (!Array.isArray(item.savedVehicles)) return [];
  const out = [];
  for (const x of item.savedVehicles) {
    if (!x || typeof x !== "object") continue;
    const sid = typeof x.id === "string" ? x.id.trim() : "";
    if (!sid) continue;
    const licensePlate = sliceStr(normalizeVehiclePlate(x.licensePlate), L.savedVehicleLicensePlate);
    const driverName = sliceStr(x.driverName, L.savedVehicleDriverName).trim();
    const driverIdType = normalizeDriverIdTypeLoose(x.driverIdType);
    const driverIdRaw = sliceStr(x.driverId, L.savedVehicleDriverId).trim();
    const driverId =
      driverIdType && driverIdType !== "CCCD"
        ? driverIdRaw.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
        : driverIdRaw.replace(/\D/g, "");
    const label = sliceStr(x.label, L.savedVehicleLabel).trim();
    const vehicleType = normalizeVehicleTypeLoose(x.vehicleType);
    if (!licensePlate && !driverName && !driverId) continue;
    out.push({
      id: sliceStr(sid, 80).trim(),
      ...(label ? { label } : {}),
      licensePlate,
      driverName,
      driverId,
      ...(driverIdType ? { driverIdType } : {}),
      ...(vehicleType ? { vehicleType } : {}),
    });
  }
  return out.slice(0, L.savedVehicleCount);
}

function parseSavedDimTemplatesLoose(item) {
  if (!Array.isArray(item.savedDimTemplates)) return [];
  const out = [];
  for (const x of item.savedDimTemplates) {
    if (!x || typeof x !== "object") continue;
    const sid = typeof x.id === "string" ? x.id.trim() : "";
    if (!sid) continue;
    const lCm = Number(x.lCm);
    const wCm = Number(x.wCm);
    const hCm = Number(x.hCm);
    if (
      !Number.isFinite(lCm) ||
      lCm <= 0 ||
      !Number.isFinite(wCm) ||
      wCm <= 0 ||
      !Number.isFinite(hCm) ||
      hCm <= 0
    ) {
      continue;
    }
    const stdRaw = Number(x.stdPcsKg);
    const stdPcsKg =
      Number.isFinite(stdRaw) && stdRaw > 0 ? Math.round(stdRaw * 100) / 100 : null;
    const label =
      sliceStr(x.label, L.savedDimTemplateLabel).trim() ||
      `${Math.round(lCm)}×${Math.round(wCm)}×${Math.round(hCm)}`;
    out.push({
      id: sliceStr(sid, 80).trim(),
      label,
      lCm: Math.round(lCm),
      wCm: Math.round(wCm),
      hCm: Math.round(hCm),
      ...(stdPcsKg != null ? { stdPcsKg } : {}),
      ...(x.isDefault ? { isDefault: true } : {}),
    });
  }
  return out.slice(0, L.savedDimTemplateCount);
}

function normalizeDefaultProfileIds(
  item,
  savedShippers,
  savedConsignees,
  savedGoods,
  savedVehicles,
  savedDimTemplates = []
) {
  const shipperIds = new Set(savedShippers.map((x) => x.id));
  const cneeIds = new Set(savedConsignees.map((x) => x.id));
  const goodsIds = new Set(savedGoods.map((x) => x.id));
  const vehicleIds = new Set(savedVehicles.map((x) => x.id));
  const dimIds = new Set(savedDimTemplates.map((x) => x.id));
  let defaultShipperId = sliceStr(item.defaultShipperId, 80).trim();
  let defaultConsigneeId = sliceStr(item.defaultConsigneeId, 80).trim();
  let defaultGoodsId = sliceStr(item.defaultGoodsId, 80).trim();
  let defaultVehicleId = sliceStr(item.defaultVehicleId, 80).trim();
  let defaultDimTemplateId = sliceStr(item.defaultDimTemplateId, 80).trim();
  if (defaultShipperId && !shipperIds.has(defaultShipperId)) defaultShipperId = "";
  if (defaultConsigneeId && !cneeIds.has(defaultConsigneeId)) defaultConsigneeId = "";
  if (defaultGoodsId && !goodsIds.has(defaultGoodsId)) defaultGoodsId = "";
  if (defaultVehicleId && !vehicleIds.has(defaultVehicleId)) defaultVehicleId = "";
  if (defaultDimTemplateId && !dimIds.has(defaultDimTemplateId)) defaultDimTemplateId = "";
  if (savedShippers.length === 1) defaultShipperId = savedShippers[0].id;
  if (savedConsignees.length === 1) defaultConsigneeId = savedConsignees[0].id;
  if (savedGoods.length === 1) defaultGoodsId = savedGoods[0].id;
  if (savedVehicles.length === 1) defaultVehicleId = savedVehicles[0].id;
  if (savedDimTemplates.length === 1) defaultDimTemplateId = savedDimTemplates[0].id;
  const out = {};
  if (defaultShipperId) out.defaultShipperId = defaultShipperId;
  if (defaultConsigneeId) out.defaultConsigneeId = defaultConsigneeId;
  if (defaultGoodsId) out.defaultGoodsId = defaultGoodsId;
  if (defaultVehicleId) out.defaultVehicleId = defaultVehicleId;
  if (defaultDimTemplateId) out.defaultDimTemplateId = defaultDimTemplateId;
  return out;
}

/** Parse an toàn khi đọc state — không ném lỗi. */
export function parseCustomersLoose(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const code = typeof item.code === "string" ? item.code.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!id || !code || !name) continue;
    const savedShippers = parseSavedShippersLoose(item);
    const savedGoods = parseSavedGoodsLoose(item);
    const savedConsignees = parseSavedConsigneesLoose(item);
    const savedVehicles = parseSavedVehiclesLoose(item);
    const savedDimTemplates = parseSavedDimTemplatesLoose(item);
    out.push({
      id: sliceStr(id, 80).trim(),
      ...accountFieldsFromItem(item, code, name),
      shipperName: sliceStr(item.shipperName, L.shipperName).trim(),
      shipperAddress: sliceStr(item.shipperAddress, L.shipperAddress).trim(),
      shipperPhone: sliceStr(item.shipperPhone, L.shipperPhone).trim(),
      shipperEmail: sliceStr(item.shipperEmail, L.shipperEmail).trim(),
      taxCode: sliceStr(item.taxCode, L.taxCode).trim(),
      agentName: sliceStr(item.agentName, L.agentName).trim(),
      agentAddress: sliceStr(item.agentAddress, L.agentAddress).trim(),
      agentPhone: sliceStr(item.agentPhone, L.agentPhone).trim(),
      agentEmail: sliceStr(item.agentEmail, L.agentEmail).trim(),
      agentTaxCode: sliceStr(item.agentTaxCode, L.agentTaxCode).trim(),
      consigneeName: sliceStr(item.consigneeName, L.consigneeName).trim(),
      consigneeAddress: sliceStr(item.consigneeAddress, L.consigneeAddress).trim(),
      consigneePhone: sliceStr(item.consigneePhone, L.consigneePhone).trim(),
      consigneeEmail: sliceStr(item.consigneeEmail, L.consigneeEmail).trim(),
      notifyName: sliceStr(item.notifyName, L.notifyName).trim(),
      savedShippers,
      savedGoods,
      savedConsignees,
      savedVehicles,
      savedDimTemplates,
      parties: parsePartiesLoose(item),
      otherRequirementsPrint: sliceStr(item.otherRequirementsPrint, L.otherRequirementsPrint).trim(),
      ...(item.syncedAt != null || item.synced_at != null
        ? { syncedAt: item.syncedAt ?? item.synced_at ?? null }
        : {}),
      ...normalizeDefaultProfileIds(
        item,
        savedShippers,
        savedConsignees,
        savedGoods,
        savedVehicles,
        savedDimTemplates
      ),
    });
  }
  return out;
}

/** @param {unknown} raw */
export function validateCustomerDirectoryPayload(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("Danh sách khách hàng phải là một mảng.");
  }
  const out = [];
  const seenCode = new Map();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") {
      throw new Error(`Dòng ${i + 1}: dữ liệu không hợp lệ.`);
    }
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const code =
      typeof item.code === "string"
        ? item.code.trim().toUpperCase().replace(/\s+/g, "")
        : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!id) throw new Error(`Dòng ${i + 1}: thiếu id.`);
    if (!code) throw new Error(`Dòng ${i + 1}: mã khách hàng không được để trống.`);
    if (!name) throw new Error(`Dòng ${i + 1}: tên khách hàng không được để trống.`);
    if (code.length <= 5 && !/^[A-Z]{2,5}$/.test(code)) {
      throw new Error(
        `Dòng ${i + 1}: Customer Code phải gồm 2–5 chữ cái A–Z.`,
      );
    }
    if (
      code.length > 5 &&
      (code.length > 40 || !/^[A-Z0-9][A-Z0-9._-]*$/.test(code))
    ) {
      throw new Error(
        `Dòng ${i + 1}: mã chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.`,
      );
    }
    const k = code.toLowerCase();
    if (seenCode.has(k)) {
      throw new Error(`Mã «${code}» bị trùng — mỗi mã chỉ dùng một lần.`);
    }
    seenCode.set(k, true);
    const savedShippers = parseSavedShippersLoose(item);
    const savedGoods = parseSavedGoodsLoose(item);
    const savedConsignees = parseSavedConsigneesLoose(item);
    const savedVehicles = parseSavedVehiclesLoose(item);
    const savedDimTemplates = parseSavedDimTemplatesLoose(item);
    const seenShipper = new Set();
    for (let j = 0; j < savedShippers.length; j++) {
      const ss = savedShippers[j];
      const sk = ss.id.toLowerCase();
      if (!ss.id.trim()) {
        throw new Error(`Dòng ${i + 1}: Shipper lưu sẵn thứ ${j + 1} thiếu id.`);
      }
      if (seenShipper.has(sk)) {
        throw new Error(`Dòng ${i + 1}: id Shipper «${ss.id}» bị trùng.`);
      }
      seenShipper.add(sk);
    }
    const seenGoods = new Set();
    for (let j = 0; j < savedGoods.length; j++) {
      const g = savedGoods[j];
      const sk = g.id.toLowerCase();
      if (!g.id.trim()) {
        throw new Error(`Dòng ${i + 1}: tên hàng lưu sẵn thứ ${j + 1} thiếu id.`);
      }
      if (seenGoods.has(sk)) {
        throw new Error(`Dòng ${i + 1}: id tên hàng «${g.id}» bị trùng.`);
      }
      seenGoods.add(sk);
    }
    const seenCnee = new Set();
    for (let j = 0; j < savedConsignees.length; j++) {
      const sc = savedConsignees[j];
      const sk = sc.id.toLowerCase();
      if (!sc.id.trim()) {
        throw new Error(`Dòng ${i + 1}: CNEE lưu sẵn thứ ${j + 1} thiếu id.`);
      }
      if (seenCnee.has(sk)) {
        throw new Error(`Dòng ${i + 1}: id CNEE «${sc.id}» bị trùng.`);
      }
      seenCnee.add(sk);
    }
    const seenVehicle = new Set();
    for (let j = 0; j < savedVehicles.length; j++) {
      const sv = savedVehicles[j];
      const sk = sv.id.toLowerCase();
      if (!sv.id.trim()) {
        throw new Error(`Dòng ${i + 1}: xe lưu sẵn thứ ${j + 1} thiếu id.`);
      }
      if (seenVehicle.has(sk)) {
        throw new Error(`Dòng ${i + 1}: id xe «${sv.id}» bị trùng.`);
      }
      seenVehicle.add(sk);
    }
    const seenDim = new Set();
    for (let j = 0; j < savedDimTemplates.length; j++) {
      const dt = savedDimTemplates[j];
      const sk = dt.id.toLowerCase();
      if (!dt.id.trim()) {
        throw new Error(`Dòng ${i + 1}: mẫu DIM thứ ${j + 1} thiếu id.`);
      }
      if (seenDim.has(sk)) {
        throw new Error(`Dòng ${i + 1}: id mẫu DIM «${dt.id}» bị trùng.`);
      }
      seenDim.add(sk);
    }
    out.push({
      id: sliceStr(id, 80).trim(),
      ...accountFieldsFromItem(item, code, name),
      shipperName: sliceStr(item.shipperName, L.shipperName).trim(),
      shipperAddress: sliceStr(item.shipperAddress, L.shipperAddress).trim(),
      shipperPhone: sliceStr(item.shipperPhone, L.shipperPhone).trim(),
      shipperEmail: sliceStr(item.shipperEmail, L.shipperEmail).trim(),
      taxCode: sliceStr(item.taxCode, L.taxCode).trim(),
      agentName: sliceStr(item.agentName, L.agentName).trim(),
      agentAddress: sliceStr(item.agentAddress, L.agentAddress).trim(),
      agentPhone: sliceStr(item.agentPhone, L.agentPhone).trim(),
      agentEmail: sliceStr(item.agentEmail, L.agentEmail).trim(),
      agentTaxCode: sliceStr(item.agentTaxCode, L.agentTaxCode).trim(),
      consigneeName: sliceStr(item.consigneeName, L.consigneeName).trim(),
      consigneeAddress: sliceStr(item.consigneeAddress, L.consigneeAddress).trim(),
      consigneePhone: sliceStr(item.consigneePhone, L.consigneePhone).trim(),
      consigneeEmail: sliceStr(item.consigneeEmail, L.consigneeEmail).trim(),
      notifyName: sliceStr(item.notifyName, L.notifyName).trim(),
      savedShippers,
      savedGoods,
      savedConsignees,
      savedVehicles,
      savedDimTemplates,
      parties: parsePartiesLoose(item),
      otherRequirementsPrint: sliceStr(item.otherRequirementsPrint, L.otherRequirementsPrint).trim(),
      ...(item.syncedAt != null || item.synced_at != null
        ? { syncedAt: item.syncedAt ?? item.synced_at ?? null }
        : {}),
      ...normalizeDefaultProfileIds(
        item,
        savedShippers,
        savedConsignees,
        savedGoods,
        savedVehicles,
        savedDimTemplates
      ),
    });
  }
  return out;
}
