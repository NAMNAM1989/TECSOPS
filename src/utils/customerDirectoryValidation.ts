import type {
  CustomerDirectoryEntry,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
  CustomerSavedVehicle,
} from "../types/customerDirectory";
import { clampCustomerDirectoryEntry } from "./customerDirectoryProfile";
import { normalizeAgentCode } from "./customerProfileInputFormat";
import {
  CUSTOMER_SHORT_CODE_MAX,
  isValidCustomerSyncCode,
  normalizeCustomerShortCode,
  normalizeCustomerSyncCode,
} from "./customerCodeOps";
import { formatVehicleLicensePlate } from "./customerVehicleCore";
import { VEHICLE_PLATE_MIN } from "./vehiclePlateNormalize";

export type CustomerProfileSection =
  | "identity"
  | "note"
  | "shipper"
  | "consignee"
  | "goods"
  | "vehicle";

export type CustomerFieldError = {
  section: CustomerProfileSection;
  itemId?: string;
  field: string;
  message: string;
};

export type CustomerValidationResult = {
  valid: boolean;
  errors: CustomerFieldError[];
  summary: string;
};

const AGENT_CODE_RE = /^[A-Z0-9][A-Z0-9._-]*$/;

function ok(): CustomerValidationResult {
  return { valid: true, errors: [], summary: "" };
}

function fail(errors: CustomerFieldError[]): CustomerValidationResult {
  return {
    valid: false,
    errors,
    summary: errors[0]?.message ?? "Dữ liệu không hợp lệ.",
  };
}

function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidAgentCode(raw: string): boolean {
  const code = normalizeAgentCode(raw);
  return code.length >= 1 && code.length <= 40 && AGENT_CODE_RE.test(code);
}

export function isValidVnPhone(raw: string): boolean {
  const d = phoneDigits(raw);
  if (!d) return true;
  return d.length >= 9 && d.length <= 11;
}

/** CCCD 12 so hoac CMND 9 so. */
export function isValidNationalId(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (!d) return true;
  return d.length === 9 || d.length === 12;
}

export function isValidLicensePlate(raw: string): boolean {
  const plate = formatVehicleLicensePlate(raw);
  return plate.length >= VEHICLE_PLATE_MIN;
}

export function isSavedShipperEmpty(s: CustomerSavedShipper): boolean {
  return !(
    s.shipperName.trim() ||
    s.shipperAddress.trim() ||
    s.shipperPhone.trim() ||
    s.shipperEmail.trim() ||
    s.taxCode.trim() ||
    s.label.trim()
  );
}

export function isSavedConsigneeEmpty(c: CustomerSavedConsignee): boolean {
  return !(
    c.consigneeName.trim() ||
    c.consigneeAddress.trim() ||
    c.consigneePhone.trim() ||
    c.consigneeEmail.trim() ||
    c.notifyName.trim() ||
    c.label.trim()
  );
}

export function isSavedGoodsEmpty(g: CustomerSavedGoods): boolean {
  return !(g.goodsDescription.trim() || g.label.trim());
}

export function isSavedVehicleEmpty(v: CustomerSavedVehicle): boolean {
  return !(v.licensePlate.trim() || v.driverName.trim() || v.driverId.trim());
}

function validateIdentity(
  entry: CustomerDirectoryEntry,
  allEntries: readonly CustomerDirectoryEntry[]
): CustomerFieldError[] {
  const errors: CustomerFieldError[] = [];
  const code = normalizeAgentCode(entry.code);
  const name = entry.name.trim();
  const shortCode = normalizeCustomerShortCode(entry.shortCode ?? "");

  if (!name) {
    errors.push({ section: "identity", field: "name", message: "Tên khách không được để trống." });
  }

  if (!code) {
    errors.push({
      section: "identity",
      field: "code",
      message: "Customer Code bắt buộc (VD: GLO — 2–5 chữ A–Z).",
    });
  } else if (code.length <= 5 && !isValidCustomerSyncCode(code)) {
    errors.push({
      section: "identity",
      field: "code",
      message: "Customer Code phải gồm 2–5 chữ cái A–Z (VD: GLO, ABC).",
    });
  } else if (!isValidAgentCode(code)) {
    errors.push({
      section: "identity",
      field: "code",
      message: "Mã chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.",
    });
  } else {
    const key = code.toLowerCase();
    const dup = allEntries.find((e) => e.id !== entry.id && e.code.trim().toLowerCase() === key);
    if (dup) {
      errors.push({
        section: "identity",
        field: "code",
        message: `Mã «${code}» đã tồn tại (khách «${dup.name || dup.code}»).`,
      });
    }
  }

  if (shortCode.length > CUSTOMER_SHORT_CODE_MAX) {
    errors.push({
      section: "identity",
      field: "shortCode",
      message: `Short Code tối đa ${CUSTOMER_SHORT_CODE_MAX} ký tự.`,
    });
  }

  if (!entry.id.trim()) {
    errors.push({ section: "identity", field: "id", message: "Thiếu id khách — thử thêm dòng mới." });
  }

  return errors;
}

function validateShippers(entry: CustomerDirectoryEntry): CustomerFieldError[] {
  const errors: CustomerFieldError[] = [];
  const list = entry.savedShippers ?? [];
  const nonEmpty = list.filter((s) => !isSavedShipperEmpty(s));

  if (list.length > 0 && nonEmpty.length === 0) {
    errors.push({
      section: "shipper",
      field: "_section",
      message: "Nhập tên người gửi hoặc xóa dòng trống.",
    });
  }

  for (const s of list) {
    if (isSavedShipperEmpty(s)) continue;
    if (!s.shipperName.trim()) {
      errors.push({
        section: "shipper",
        itemId: s.id,
        field: "shipperName",
        message: "Tên in phiếu bắt buộc.",
      });
    }
    if (!isValidVnPhone(s.shipperPhone)) {
      errors.push({
        section: "shipper",
        itemId: s.id,
        field: "shipperPhone",
        message: "Số điện thoại không hợp lệ (9–11 số).",
      });
    }
  }

  return errors;
}

function validateConsignees(entry: CustomerDirectoryEntry): CustomerFieldError[] {
  const errors: CustomerFieldError[] = [];
  for (const c of entry.savedConsignees ?? []) {
    if (isSavedConsigneeEmpty(c)) continue;
    if (!c.consigneeName.trim()) {
      errors.push({
        section: "consignee",
        itemId: c.id,
        field: "consigneeName",
        message: "Tên người nhận bắt buộc.",
      });
    }
    if (!isValidVnPhone(c.consigneePhone)) {
      errors.push({
        section: "consignee",
        itemId: c.id,
        field: "consigneePhone",
        message: "Số điện thoại không hợp lệ (9–11 số).",
      });
    }
  }
  return errors;
}

function validateGoods(entry: CustomerDirectoryEntry): CustomerFieldError[] {
  const errors: CustomerFieldError[] = [];
  for (const g of entry.savedGoods ?? []) {
    if (isSavedGoodsEmpty(g)) {
      errors.push({
        section: "goods",
        itemId: g.id,
        field: "goodsDescription",
        message: "Nhập mô tả tên hàng hoặc xóa dòng trống.",
      });
      continue;
    }
    if (!g.goodsDescription.trim()) {
      errors.push({
        section: "goods",
        itemId: g.id,
        field: "goodsDescription",
        message: "Mô tả in phiếu bắt buộc.",
      });
    }
  }
  return errors;
}

function validateVehicles(entry: CustomerDirectoryEntry): CustomerFieldError[] {
  const errors: CustomerFieldError[] = [];
  const plates = new Map<string, string>();

  for (const v of entry.savedVehicles ?? []) {
    if (isSavedVehicleEmpty(v)) {
      errors.push({
        section: "vehicle",
        itemId: v.id,
        field: "licensePlate",
        message: "Nhập biển số hoặc xóa dòng trống.",
      });
      continue;
    }

    const plate = formatVehicleLicensePlate(v.licensePlate);
    if (!isValidLicensePlate(v.licensePlate)) {
      errors.push({
        section: "vehicle",
        itemId: v.id,
        field: "licensePlate",
        message: `Biển số cần ít nhất ${VEHICLE_PLATE_MIN} ký tự hợp lệ.`,
      });
    } else if (plate) {
      const prev = plates.get(plate);
      if (prev) {
        errors.push({
          section: "vehicle",
          itemId: v.id,
          field: "licensePlate",
          message: "Biển số bị trùng trong cùng khách.",
        });
      } else {
        plates.set(plate, v.id);
      }
    }

    if (!isValidNationalId(v.driverId)) {
      errors.push({
        section: "vehicle",
        itemId: v.id,
        field: "driverId",
        message: "CCCD/CMND phải 9 hoặc 12 số.",
      });
    }

    const hasDriver = Boolean(v.driverName.trim());
    const hasId = Boolean(v.driverId.replace(/\D/g, ""));
    if (hasDriver !== hasId) {
      errors.push({
        section: "vehicle",
        itemId: v.id,
        field: hasDriver ? "driverId" : "driverName",
        message: "Cần nhập cả tên tài xế và CCCD.",
      });
    }
  }

  return errors;
}

function validateSavedIds(entry: CustomerDirectoryEntry): CustomerFieldError[] {
  const errors: CustomerFieldError[] = [];
  const code = entry.code.trim() || entry.name.trim() || "khách";

  const checkDup = (
    section: CustomerProfileSection,
    items: { id: string }[],
    label: string
  ) => {
    const seen = new Set<string>();
    for (const item of items) {
      const k = item.id.trim().toLowerCase();
      if (!k) {
        errors.push({ section, field: "id", message: `${label} thiếu id.` });
        continue;
      }
      if (seen.has(k)) {
        errors.push({
          section,
          itemId: item.id,
          field: "id",
          message: `Khách «${code}»: id ${label} bị trùng.`,
        });
      }
      seen.add(k);
    }
  };

  checkDup("shipper", entry.savedShippers ?? [], "Shipper");
  checkDup("consignee", entry.savedConsignees ?? [], "CNEE");
  checkDup("goods", entry.savedGoods ?? [], "tên hàng");
  checkDup("vehicle", entry.savedVehicles ?? [], "xe");

  return errors;
}

/** Kiem tra mot phan cua mot khach. */
export function validateCustomerEntrySection(
  entry: CustomerDirectoryEntry,
  section: CustomerProfileSection,
  allEntries: readonly CustomerDirectoryEntry[]
): CustomerValidationResult {
  let errors: CustomerFieldError[] = [];

  errors = errors.concat(validateIdentity(entry, allEntries));

  if (section === "shipper") errors = errors.concat(validateShippers(entry));
  if (section === "consignee") errors = errors.concat(validateConsignees(entry));
  if (section === "goods") errors = errors.concat(validateGoods(entry));
  if (section === "vehicle") errors = errors.concat(validateVehicles(entry));

  if (section !== "note") {
    errors = errors.concat(validateSavedIds(entry));
  }

  return errors.length ? fail(errors) : ok();
}

/** Kiểm tra toàn bộ một khách trước khi lưu. */
export function validateCustomerEntry(
  entry: CustomerDirectoryEntry,
  allEntries: readonly CustomerDirectoryEntry[]
): CustomerValidationResult {
  const errors = dedupeErrors([
    ...validateIdentity(entry, allEntries),
    ...validateShippers(entry),
    ...validateConsignees(entry),
    ...validateGoods(entry),
    ...validateVehicles(entry),
    ...validateSavedIds(entry),
  ]);
  return errors.length ? fail(errors) : ok();
}

/** Kiem tra ca danh sach (ma trung giua cac khach). */
export function validateCustomerDirectory(
  entries: readonly CustomerDirectoryEntry[]
): CustomerValidationResult {
  const errors: CustomerFieldError[] = [];
  const seenCode = new Map<string, string>();

  for (const entry of entries) {
    const r = validateCustomerEntry(entry, entries);
    errors.push(...r.errors);

    const k = entry.code.trim().toLowerCase();
    if (k && seenCode.has(k)) {
      errors.push({
        section: "identity",
        field: "code",
        message: `Mã «${entry.code}» bị trùng — mỗi mã chỉ dùng một lần.`,
      });
    }
    if (k) seenCode.set(k, entry.id);
  }

  const unique = dedupeErrors(errors);
  return unique.length ? fail(unique) : ok();
}

function dedupeErrors(errors: CustomerFieldError[]): CustomerFieldError[] {
  const seen = new Set<string>();
  const out: CustomerFieldError[] = [];
  for (const e of errors) {
    const key = `${e.section}|${e.itemId ?? ""}|${e.field}|${e.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function getFieldValidationError(
  errors: readonly CustomerFieldError[],
  section: CustomerProfileSection,
  field: string,
  itemId?: string
): string | undefined {
  return errors.find(
    (e) =>
      e.section === section &&
      e.field === field &&
      (itemId === undefined || e.itemId === itemId)
  )?.message;
}

/** Chuẩn hóa trước khi lưu — bỏ dòng trống; Short Code mặc định = Customer Code (2–5 chữ). */
export function normalizeCustomerEntryForSave(
  entry: CustomerDirectoryEntry,
  _allEntries: readonly CustomerDirectoryEntry[] = []
): CustomerDirectoryEntry {
  const code = normalizeAgentCode(entry.code);
  const shortCode =
    normalizeCustomerShortCode(entry.shortCode ?? "") ||
    (isValidCustomerSyncCode(code) ? normalizeCustomerSyncCode(code) : "");
  return clampCustomerDirectoryEntry({
    ...entry,
    code,
    shortCode,
    savedShippers: (entry.savedShippers ?? []).filter((s) => !isSavedShipperEmpty(s)),
    savedConsignees: (entry.savedConsignees ?? []).filter((c) => !isSavedConsigneeEmpty(c)),
    savedGoods: (entry.savedGoods ?? []).filter((g) => !isSavedGoodsEmpty(g)),
    savedVehicles: (entry.savedVehicles ?? []).filter((v) => !isSavedVehicleEmpty(v)),
  });
}
