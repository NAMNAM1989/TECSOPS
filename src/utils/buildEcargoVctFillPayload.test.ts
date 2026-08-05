import { describe, expect, it } from "vitest";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import {
  buildEcargoVctFillPayload,
  ECARGO_DEFAULT_GOODS,
  ECARGO_DEFAULT_KG,
  ECARGO_DEFAULT_PCS,
  resolveEcargoPiecesKg,
  shipmentToEcargoAwbLine,
  validateEcargoVehiclePick,
} from "./buildEcargoVctFillPayload";
import type { EcargoScscProfile } from "./ecargoScscProfile";
import { todayLocalYmd } from "./ecargoTextNormalize";

function baseShipment(over: Partial<Shipment> = {}): Shipment {
  return {
    id: "s1",
    stt: 1,
    sessionDate: "2026-08-03",
    awb: "232-18269159",
    flight: "VN605",
    flightDate: "04AUG",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "SIN",
    warehouse: "SCSC",
    pcs: 10,
    kg: 120,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "ACME",
    customerCode: "ACME",
    customerId: "c1",
    goodsDescriptionPrint: "CONSOLE",
    status: "RECEIVED",
    ...over,
  };
}

const profile: EcargoScscProfile = {
  id: "ecargo_1",
  name: "TECS AGENT",
  agentPicName: "NGUYEN VAN A",
  agentPicIdType: "CCCD",
  agentPicId: "001122334455",
  email: "ops@company.com",
  mobilePhone: "0901234567",
  defaultArrivalSlot: "8",
  defaultVehicleType: "OTO",
  updatedAt: "",
};

const customers: CustomerDirectoryEntry[] = [
  {
    id: "c1",
    code: "ACME",
    name: "ACME",
    savedVehicles: [
      {
        id: "v1",
        label: "Xe cố định",
        licensePlate: "50H17480",
        driverName: "Tran Van B",
        driverId: "079099001111",
        vehicleType: "OTO",
        driverIdType: "CCCD",
      },
    ],
    defaultVehicleId: "v1",
  },
];

describe("buildEcargoVctFillPayload", () => {
  it("dùng GARMENTS cố định, không lấy tên hàng hồ sơ KH", () => {
    const line = shipmentToEcargoAwbLine(baseShipment(), customers);
    expect(line).toMatchObject({
      mawbPrefix: "232",
      mawbNo: "18269159",
      flightDest: "SIN",
      goodsContent: ECARGO_DEFAULT_GOODS,
      shc: "KHÔNG CÓ",
    });
  });

  it("thiếu kiện/kg → 99 pcs / 999 kg", () => {
    expect(resolveEcargoPiecesKg({ pcs: null, kg: null })).toEqual({
      pieces: ECARGO_DEFAULT_PCS,
      weight: ECARGO_DEFAULT_KG,
      usedDefaults: true,
    });
    const line = shipmentToEcargoAwbLine(baseShipment({ pcs: null, kg: null }));
    expect(line?.pieces).toBe(99);
    expect(line?.weight).toBe(999);
    expect(line?.goodsContent).toBe("GARMENTS");
  });

  it("validate biển số ≥ 7 ký tự", () => {
    expect(
      validateEcargoVehiclePick({
        source: "oneshot",
        licensePlate: "50H1",
        driverName: "A",
        driverId: "1",
        driverIdType: "CCCD",
        vehicleType: "OTO",
      })
    ).toMatch(/≥ 7/);
  });

  it("build payload không submit", () => {
    const { payload, error } = buildEcargoVctFillPayload({
      profile,
      vehicle: {
        source: "saved",
        vehicleId: "v1",
        licensePlate: "50H17480",
        driverName: "Tran Van B",
        driverId: "079099001111",
        driverIdType: "CCCD",
        vehicleType: "OTO",
      },
      shipments: [baseShipment({ pcs: null, kg: null })],
      customers,
      arrivalDate: todayLocalYmd(),
      arrivalTime: "9",
    });
    expect(error).toBeUndefined();
    expect(payload?.submit).toBe(false);
    expect(payload?.header.agentName).toBe("TECS AGENT");
    expect(payload?.header.driverName).toBe("TRAN VAN B");
    expect(payload?.awbs).toHaveLength(1);
    expect(payload?.awbs[0]?.pieces).toBe(99);
    expect(payload?.awbs[0]?.weight).toBe(999);
    expect(payload?.awbs[0]?.goodsContent).toBe("GARMENTS");
  });

  it("ngày hàng vào = ngày bay cùng ngày — không ép ngày mai", () => {
    const { payload, error } = buildEcargoVctFillPayload({
      profile,
      vehicle: {
        source: "saved",
        vehicleId: "v1",
        licensePlate: "50H17480",
        driverName: "Tran Van B",
        driverId: "079099001111",
        driverIdType: "CCCD",
        vehicleType: "OTO",
      },
      shipments: [
        baseShipment({
          pcs: null,
          kg: null,
          flightDate: "03AUG",
          sessionDate: "2026-08-03",
        }),
      ],
      customers,
      arrivalDate: "2026-08-03",
      arrivalTime: "8",
    });
    expect(error).toBeUndefined();
    expect(payload?.header.arrivalDate).toBe("2026-08-03");
  });

  it("thiếu arrivalDate → mặc định ngày bay sớm nhất", () => {
    const { payload, error } = buildEcargoVctFillPayload({
      profile,
      vehicle: {
        source: "saved",
        vehicleId: "v1",
        licensePlate: "50H17480",
        driverName: "Tran Van B",
        driverId: "079099001111",
        driverIdType: "CCCD",
        vehicleType: "OTO",
      },
      shipments: [
        baseShipment({
          pcs: null,
          kg: null,
          flightDate: "03AUG",
          sessionDate: "2026-08-03",
        }),
      ],
      customers,
      arrivalTime: "8",
    });
    expect(error).toBeUndefined();
    expect(payload?.header.arrivalDate).toBe("2026-08-03");
  });

  it("chỉ nhận lô kho SCSC — bỏ TECS-SCSC / TCS", () => {
    const vehicle = {
      source: "saved" as const,
      vehicleId: "v1",
      licensePlate: "50H17480",
      driverName: "Tran Van B",
      driverId: "079099001111",
      driverIdType: "CCCD" as const,
      vehicleType: "OTO" as const,
    };
    const rejected = buildEcargoVctFillPayload({
      profile,
      vehicle,
      shipments: [
        baseShipment({ warehouse: "TECS-SCSC" }),
        baseShipment({ id: "tcs-1", warehouse: "TCS", awb: "232-18269160" }),
      ],
      customers,
      arrivalDate: todayLocalYmd(),
      arrivalTime: "8",
    });
    expect(rejected.payload).toBeNull();
    expect(rejected.error).toMatch(/SCSC/);
    expect(rejected.warnings.some((w) => w.includes("TECS-SCSC"))).toBe(true);

    const mixed = buildEcargoVctFillPayload({
      profile,
      vehicle,
      shipments: [
        baseShipment({ warehouse: "TECS-SCSC" }),
        baseShipment({ id: "scsc-ok", warehouse: "SCSC", awb: "232-18269161" }),
      ],
      customers,
      arrivalDate: todayLocalYmd(),
      arrivalTime: "8",
    });
    expect(mixed.error).toBeUndefined();
    expect(mixed.payload?.awbs).toHaveLength(1);
    expect(mixed.payload?.awbs[0]?.mawbNo).toBe("18269161");
  });
});
