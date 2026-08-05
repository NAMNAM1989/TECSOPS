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
/** Tên hàng cố định khi đăng ký eCargo — không lấy từ hồ sơ khách. */
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

/** Tên hàng eCargo — luôn GARMENTS (đăng ký nhanh). */
export function resolveEcargoGoodsContent(
  _s?: Shipment,
  _customers?: CustomerDirectoryEntry[]
): string {
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
    goodsContent: ECARGO_DEFAULT_GOODS,
    shc: "KHÔNG CÓ",
    customIdent: "",
  };
}

export function pickSavedVehicleForEcargo(
  vehicle: CustomerSavedVehicle,
  fallbackVehicleType: EcargoVehicleType
): Extract<EcargoVehiclePick, { source: "saved" }> {
  return {
    source: "saved",
    vehicleId: vehicle.id,
    licensePlate: normalizeVehiclePlateInput(vehicle.licensePlate),
    driverName: vehicle.driverName,
    driverId: vehicle.driverId,
    driverIdType: normalizeEcargoIdType(vehicle.driverIdType) as EcargoIdType,
    vehicleType: normalizeEcargoVehicleType(
      vehicle.vehicleType || fallbackVehicleType
    ) as EcargoVehicleType,
    label: vehicle.label?.trim() || undefined,
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
  const plate = normalizeVehiclePlateInput(pick.licensePlate);
  const plates = plate.split(";").filter(Boolean);
  if (!plates.length) return "Thiếu biển số xe";
  for (const p of plates) {
    if (p.length < ECARGO_PLATE_MIN) {
      return `Biển số «${p}» phải ≥ ${ECARGO_PLATE_MIN} ký tự (viết liền)`;
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

  const vehicleErr = validateEcargoVehiclePick(opts.vehicle);
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

  // Mặc định theo ngày bay (cho phép cùng ngày). Chỉ sửa format sai/trống.
  const scscShipments = opts.shipments.filter((s) => isEcargoScscWarehouse(s.warehouse));
  const fromFlights = resolveEcargoArrivalDateFromShipments(scscShipments);
  if (fromFlights.warning) warnings.push(fromFlights.warning);
  const requestedArrival = String(opts.arrivalDate || "").trim();
  const arrivalDate = ensureEcargoArrivalDate(
    requestedArrival || fromFlights.arrivalDate,
    new Date(),
    fromFlights.arrivalDate
  );
  if (requestedArrival && requestedArrival !== arrivalDate) {
    warnings.push(
      `Ngày hàng vào «${requestedArrival}» không hợp lệ → dùng ${arrivalDate}`
    );
  }

  const plate = normalizeVehiclePlateInput(opts.vehicle.licensePlate);
  const vehicleQuantity = Math.max(1, plate.split(";").filter(Boolean).length);

  return {
    payload: {
      url: ECARGO_VCT_CREATE_URL,
      header: {
        agentName: prepared.name,
        agentPicName: prepared.agentPicName,
        agentPicIdType: prepared.agentPicIdType,
        agentPicId: prepared.agentPicId,
        arrivalDate,
        arrivalTime: String(opts.arrivalTime ?? prepared.defaultArrivalSlot ?? "8"),
        vehicleType: opts.vehicle.vehicleType,
        vehicleQuantity,
        vehicleNo: plate,
        driverName: normalizeEcargoPersonName(opts.vehicle.driverName),
        driverIdType: opts.vehicle.driverIdType,
        driverId: normalizeEcargoIdNumber(opts.vehicle.driverId),
        email: prepared.email,
        mobilePhone: prepared.mobilePhone,
      },
      awbs,
      submit: false,
    },
    warnings,
  };
}
