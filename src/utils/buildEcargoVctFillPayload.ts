import type { CustomerDirectoryEntry, CustomerSavedVehicle } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { isEcargoScscWarehouse } from "../constants/warehouses";
import { awbDigitsKey } from "./awbFormat";
import { findCustomerEntry } from "./customerBookingResolve";
import {
  prepareEcargoProfileForFill,
  type EcargoIdType,
  type EcargoScscProfile,
  type EcargoVehicleType,
} from "./ecargoScscProfile";
import {
  ensureEcargoArrivalDate,
  normalizeEcargoIdNumber,
  normalizeEcargoPersonName,
  resolveEcargoArrivalDateFromShipments,
  resolveEcargoArrivalSlotForCreate,
} from "./ecargoTextNormalize";
import { flightDateToYmd } from "./esidDeclareFields";
import { normalizeVehiclePlateInput } from "./vehiclePlateNormalize";
import {
  normalizeEcargoIdType,
  normalizeEcargoVehicleType,
} from "../../shared/ecargoScscProfilesNormalize.mjs";

export const ECARGO_VCT_CREATE_URL = "https://ecargo.scsc.vn/Export/VCTOrder/Create";
export const ECARGO_PLATE_MIN = 7;
/** Placeholder đăng ký nhanh khi lô chưa có kiện/kg thực. */
export const ECARGO_DEFAULT_PCS = 99;
export const ECARGO_DEFAULT_KG = 999;
/** Fallback tên hàng eCargo khi lô chưa có goodsDescriptionPrint. */
export const ECARGO_DEFAULT_GOODS = "GARMENTS";

export type EcargoVehiclePick =
  | {
      source: "saved";
      vehicleId: string;
      licensePlate: string;
      driverName: string;
      driverId: string;
      driverIdType: EcargoIdType;
      vehicleType: EcargoVehicleType;
      label?: string;
    }
  | {
      source: "oneshot";
      licensePlate: string;
      driverName: string;
      driverId: string;
      driverIdType: EcargoIdType;
      vehicleType: EcargoVehicleType;
    };

export type EcargoVctAwbLine = {
  shipmentId: string;
  awb: string;
  mawbPrefix: string;
  mawbNo: string;
  hawbNo: string;
  flightNo: string;
  flightDate: string;
  flightDest: string;
  pieces: number;
  weight: number;
  goodsContent: string;
  shc: string;
  customIdent: string;
};

export type EcargoVctFillPayload = {
  url: string;
  header: {
    agentName: string;
    agentIdent?: string;
    agentCode?: string;
    agentPicName: string;
    agentPicIdType: EcargoIdType;
    agentPicId: string;
    arrivalDate: string;
    arrivalTime: string;
    vehicleType: EcargoVehicleType;
    vehicleQuantity: number;
    vehicleNo: string;
    driverName: string;
    driverIdType: EcargoIdType;
    driverId: string;
    email: string;
    mobilePhone: string;
  };
  awbs: EcargoVctAwbLine[];
  /** false = chỉ điền; true = pipeline đăng ký (ext REGISTER). */
  submit: boolean;
};

/** Tên hàng eCargo — ưu tiên mô tả hàng trên lô / hồ sơ; thiếu thì GARMENTS. */
export function resolveEcargoGoodsContent(
  s?: Shipment,
  _customers?: CustomerDirectoryEntry[]
): string {
  const fromPrint = (s?.goodsDescriptionPrint || "").trim();
  if (fromPrint) return fromPrint.slice(0, 120);
  return ECARGO_DEFAULT_GOODS;
}

export function resolveEcargoPiecesKg(s: Pick<Shipment, "pcs" | "kg">): {
  pieces: number;
  weight: number;
  usedDefaults: boolean;
} {
  const pcsRaw = s.pcs == null || Number.isNaN(Number(s.pcs)) ? 0 : Number(s.pcs);
  const kgRaw = s.kg == null || Number.isNaN(Number(s.kg)) ? 0 : Number(s.kg);
  const hasReal = pcsRaw > 0 && kgRaw > 0;
  return {
    pieces: hasReal ? Math.floor(pcsRaw) : ECARGO_DEFAULT_PCS,
    weight: hasReal ? Math.round(kgRaw * 10) / 10 : ECARGO_DEFAULT_KG,
    usedDefaults: !hasReal,
  };
}

export function shipmentToEcargoAwbLine(
  s: Shipment,
  _customers: CustomerDirectoryEntry[] = []
): EcargoVctAwbLine | null {
  const digits = awbDigitsKey(s.awb);
  if (digits.length !== 11) return null;
  const flightDate = flightDateToYmd(s.flightDate || "", s.sessionDate || "");
  if (!flightDate) return null;
  const flightNo = (s.flight || "").trim().toUpperCase();
  const dest = (s.dest || "").trim().toUpperCase();
  if (!flightNo || !dest) return null;
  const { pieces, weight } = resolveEcargoPiecesKg(s);
  return {
    shipmentId: s.id,
    awb: digits,
    mawbPrefix: digits.slice(0, 3),
    mawbNo: digits.slice(3),
    hawbNo: (s.hawb || "").trim().toUpperCase(),
    flightNo,
    flightDate,
    flightDest: dest,
    pieces,
    weight,
    goodsContent: resolveEcargoGoodsContent(s, _customers),
    shc: "KHÔNG CÓ",
    customIdent: "",
  };
}

export function pickSavedVehicleForEcargo(
  vehicle: CustomerSavedVehicle,
  fallbackVehicleType: EcargoVehicleType = "OTO"
): Extract<EcargoVehiclePick, { source: "saved" }> {
  // Xe danh bạ thường thiếu vehicleType — KHÔNG lấy defaultVehicleType hồ sơ eCargo
  // (hay bị ghi đè thành XEMAY sau lần «nhập xe lần này» xe máy). Thiếu → OTO.
  const hasOwnType = Boolean(
    String(vehicle.vehicleType ?? "")
      .trim()
  );
  return {
    source: "saved",
    vehicleId: vehicle.id,
    licensePlate: normalizeVehiclePlateInput(vehicle.licensePlate),
    driverName: vehicle.driverName,
    driverId: vehicle.driverId,
    driverIdType: normalizeEcargoIdType(vehicle.driverIdType) as EcargoIdType,
    vehicleType: normalizeEcargoVehicleType(
      vehicle.vehicleType,
      hasOwnType ? fallbackVehicleType : "OTO"
    ) as EcargoVehicleType,
    label: vehicle.label?.trim() || undefined,
  };
}

/**
 * Chỉ có biển số / thiếu TX → lấy họ tên + giấy tờ NV đại lý (agentPic*) làm mặc định.
 */
export function applyAgentDriverFallback(
  pick: EcargoVehiclePick,
  profile: Pick<
    EcargoScscProfile,
    "agentPicName" | "agentPicId" | "agentPicIdType"
  >,
): { pick: EcargoVehiclePick; usedAgentFallback: boolean } {
  const hasDriverName = Boolean(normalizeEcargoPersonName(pick.driverName));
  const hasDriverId = Boolean(normalizeEcargoIdNumber(pick.driverId));
  if (hasDriverName && hasDriverId) {
    return { pick, usedAgentFallback: false };
  }

  const agentName = normalizeEcargoPersonName(profile.agentPicName);
  const agentId = normalizeEcargoIdNumber(profile.agentPicId);
  if (!agentName || !agentId) {
    return { pick, usedAgentFallback: false };
  }

  return {
    pick: {
      ...pick,
      driverName: hasDriverName ? pick.driverName : profile.agentPicName.trim(),
      driverId: hasDriverId ? pick.driverId : String(profile.agentPicId || "").trim(),
      driverIdType: hasDriverId
        ? pick.driverIdType
        : (normalizeEcargoIdType(profile.agentPicIdType) as EcargoIdType),
    },
    usedAgentFallback: true,
  };
}

export function defaultVehiclePickForShipments(
  shipments: Shipment[],
  customers: CustomerDirectoryEntry[],
  fallbackVehicleType: EcargoVehicleType
): EcargoVehiclePick | null {
  const first = shipments[0];
  if (!first) return null;
  const entry = findCustomerEntry(first, customers);
  const vehicles = entry?.savedVehicles ?? [];
  if (!vehicles.length) return null;
  const preferred =
    (entry?.defaultVehicleId
      ? vehicles.find((v) => v.id === entry.defaultVehicleId)
      : undefined) || vehicles[0];
  if (!preferred) return null;
  return pickSavedVehicleForEcargo(preferred, fallbackVehicleType);
}

export function validateEcargoVehiclePick(pick: EcargoVehiclePick): string | null {
  // Đi bộ: eCargo không bắt buộc biển số (khớp Ext content-ecargo).
  if (pick.vehicleType !== "DIBO") {
    const plate = normalizeVehiclePlateInput(pick.licensePlate);
    const plates = plate.split(";").filter(Boolean);
    if (!plates.length) {
      return "Vui lòng nhập biển số xe trước khi đăng ký eCargo.";
    }
    for (const p of plates) {
      if (p.length < ECARGO_PLATE_MIN) {
        return `Biển số «${p}» phải ≥ ${ECARGO_PLATE_MIN} ký tự (viết liền)`;
      }
      // eCargo validateVehicle: OTO chỉ chấp nhận 7–9 ký tự
      if (pick.vehicleType === "OTO" && (p.length < 7 || p.length > 9)) {
        return `Ô tô: biển «${p}» phải 7–9 ký tự (quy tắc eCargo)`;
      }
    }
  }
  if (!normalizeEcargoPersonName(pick.driverName)) return "Thiếu họ tên tài xế";
  if (!normalizeEcargoIdNumber(pick.driverId)) return "Thiếu số giấy tờ tài xế";
  return null;
}

export function buildEcargoVctFillPayload(opts: {
  profile: EcargoScscProfile;
  vehicle: EcargoVehiclePick;
  shipments: Shipment[];
  customers: CustomerDirectoryEntry[];
  arrivalDate?: string;
  arrivalTime?: string;
}): { payload: EcargoVctFillPayload | null; error?: string; warnings: string[] } {
  const warnings: string[] = [];
  const prepared = prepareEcargoProfileForFill(opts.profile);
  if (
    !prepared.name ||
    !prepared.agentPicName ||
    !prepared.agentPicId ||
    !prepared.email ||
    !prepared.mobilePhone
  ) {
    return { payload: null, error: "Hồ sơ đại lý eCargo chưa đủ — hãy lưu thông tin đại lý trước", warnings };
  }

  const { pick: vehicle, usedAgentFallback } = applyAgentDriverFallback(
    opts.vehicle,
    prepared,
  );
  if (usedAgentFallback) {
    warnings.push(
      "Xe chỉ có biển số / thiếu TX — dùng NV đại lý làm tài xế mặc định.",
    );
  }

  const vehicleErr = validateEcargoVehiclePick(vehicle);
  if (vehicleErr) return { payload: null, error: vehicleErr, warnings };

  const awbs: EcargoVctAwbLine[] = [];
  for (const s of opts.shipments) {
    // eCargo chỉ độc lập cho kho SCSC — không nhận TECS-SCSC / TCS / TECS-TCS.
    if (!isEcargoScscWarehouse(s.warehouse)) {
      warnings.push(
        `Bỏ qua ${s.awb || s.id}: eCargo chỉ đăng ký lô kho SCSC (hiện là ${s.warehouse})`,
      );
      continue;
    }
    const line = shipmentToEcargoAwbLine(s, opts.customers);
    if (!line) {
      warnings.push(`Bỏ qua ${s.awb || s.id}: thiếu AWB 11 số / chuyến / DEST / kiện-kg / tên hàng`);
      continue;
    }
    awbs.push(line);
  }
  if (!awbs.length) {
    const detail = warnings[0] ? ` — ${warnings[0]}` : "";
    return {
      payload: null,
      error: `Không có lô hợp lệ để đăng ký eCargo${detail}`,
      warnings,
    };
  }

  // Mặc định theo ngày bay + ép quy tắc eCargo ≥90 phút trước giờ hàng vào.
  const scscShipments = opts.shipments.filter((s) => isEcargoScscWarehouse(s.warehouse));
  const fromFlights = resolveEcargoArrivalDateFromShipments(scscShipments);
  if (fromFlights.warning) warnings.push(fromFlights.warning);
  const requestedArrival = String(opts.arrivalDate || "").trim();
  const baseArrival = ensureEcargoArrivalDate(
    requestedArrival || fromFlights.arrivalDate,
    new Date(),
    fromFlights.arrivalDate
  );
  const slotResolved = resolveEcargoArrivalSlotForCreate(
    baseArrival,
    opts.arrivalTime ?? prepared.defaultArrivalSlot ?? "8",
    new Date()
  );
  if (slotResolved.reason) warnings.push(slotResolved.reason);
  const arrivalDate = slotResolved.arrivalDate;
  const arrivalTime = slotResolved.arrivalTime;

  const plate = normalizeVehiclePlateInput(vehicle.licensePlate);
  const vehicleQuantity = Math.max(1, plate.split(";").filter(Boolean).length);
  const agentIdent = String(prepared.agentIdent || "").replace(/\D/g, "");
  const agentCode = String(prepared.agentCode || "")
    .trim()
    .toUpperCase();

  return {
    payload: {
      url: ECARGO_VCT_CREATE_URL,
      header: {
        agentName: prepared.name,
        agentIdent: agentIdent || undefined,
        agentCode: agentCode || undefined,
        agentPicName: prepared.agentPicName,
        agentPicIdType: prepared.agentPicIdType,
        agentPicId: prepared.agentPicId,
        arrivalDate,
        arrivalTime,
        vehicleType: vehicle.vehicleType,
        vehicleQuantity,
        vehicleNo: plate,
        driverName: normalizeEcargoPersonName(vehicle.driverName),
        driverIdType: vehicle.driverIdType,
        driverId: normalizeEcargoIdNumber(vehicle.driverId),
        email: prepared.email,
        mobilePhone: prepared.mobilePhone,
      },
      awbs,
      submit: false,
    },
    warnings,
  };
}
