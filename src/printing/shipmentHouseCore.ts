/**
 * Model nhiều HAWB / lô — Giai đoạn 1 foundation.
 * Pure functions; chưa nối postgresStateStore / Ops UI.
 */
import type {
  HouseAllocationStatus,
  HouseAllocationSummary,
  ShipmentHouse,
} from "./labelFoundationTypes";

function compact(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hawbKey(hawb: string): string {
  return compact(hawb).toUpperCase();
}

function newHouseId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `house-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyShipmentHouse(
  shipmentId: string,
  patch: Partial<ShipmentHouse> = {}
): ShipmentHouse {
  return {
    id: patch.id ?? newHouseId(),
    shipmentId,
    hawb: compact(patch.hawb ?? ""),
    pcs: patch.pcs ?? null,
    kg: patch.kg ?? null,
    dimWeightKg: patch.dimWeightKg ?? null,
    dimLines: patch.dimLines ?? null,
    dest: compact(patch.dest ?? "").toUpperCase(),
    consigneeName: compact(patch.consigneeName ?? ""),
    goodsDescription: compact(patch.goodsDescription ?? ""),
    specialHandling: compact(patch.specialHandling ?? ""),
    templateId: patch.templateId,
    sortOrder: patch.sortOrder ?? 0,
    allocationStatus: patch.allocationStatus ?? "needs-confirmation",
  };
}

export function normalizeShipmentHouse(raw: unknown, shipmentId: string): ShipmentHouse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const hawb = typeof o.hawb === "string" ? compact(o.hawb) : "";
  if (!hawb) return null;

  let pcs: number | null = null;
  if (typeof o.pcs === "number" && Number.isInteger(o.pcs) && o.pcs >= 1) {
    pcs = o.pcs;
  } else if (o.pcs === null || o.pcs === undefined || o.pcs === "") {
    pcs = null;
  } else {
    return null;
  }

  const allocationRaw = o.allocationStatus;
  const allocationStatus: HouseAllocationStatus =
    allocationRaw === "confirmed" ||
    allocationRaw === "unassigned" ||
    allocationRaw === "needs-confirmation"
      ? allocationRaw
      : "needs-confirmation";

  const sortOrder =
    typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder)
      ? Math.max(0, Math.round(o.sortOrder))
      : 0;

  return emptyShipmentHouse(shipmentId, {
    id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : undefined,
    hawb,
    pcs,
    kg: typeof o.kg === "number" && Number.isFinite(o.kg) ? o.kg : null,
    dimWeightKg:
      typeof o.dimWeightKg === "number" && Number.isFinite(o.dimWeightKg)
        ? o.dimWeightKg
        : null,
    dimLines: Array.isArray(o.dimLines) ? (o.dimLines as ShipmentHouse["dimLines"]) : null,
    dest: typeof o.dest === "string" ? o.dest : "",
    consigneeName: typeof o.consigneeName === "string" ? o.consigneeName : "",
    goodsDescription: typeof o.goodsDescription === "string" ? o.goodsDescription : "",
    specialHandling: typeof o.specialHandling === "string" ? o.specialHandling : "",
    templateId: typeof o.templateId === "string" ? o.templateId : undefined,
    sortOrder,
    allocationStatus,
  });
}

/**
 * Migrate chuỗi `shipment.hawb` cũ → một house.
 * Không gán master pcs — để needs-confirmation.
 */
export function migrateLegacyHawbToHouses(
  shipmentId: string,
  legacyHawb: string | null | undefined,
  existing: ShipmentHouse[] = []
): ShipmentHouse[] {
  if (existing.length > 0) return existing.map((h, i) => ({ ...h, sortOrder: i }));
  const hawb = compact(legacyHawb ?? "");
  if (!hawb) return [];
  return [
    emptyShipmentHouse(shipmentId, {
      hawb,
      pcs: null,
      allocationStatus: "needs-confirmation",
      sortOrder: 0,
    }),
  ];
}

export function sumAllocatedHousePcs(houses: readonly ShipmentHouse[]): number {
  let sum = 0;
  for (const h of houses) {
    if (h.pcs != null && h.pcs >= 1) sum += h.pcs;
  }
  return sum;
}

export function validateShipmentHouses(
  houses: readonly ShipmentHouse[],
  masterPcs: number | null
): HouseAllocationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, string>();

  for (const h of houses) {
    const key = hawbKey(h.hawb);
    if (!key) {
      errors.push("HAWB trống không hợp lệ");
      continue;
    }
    const prev = seen.get(key);
    if (prev) {
      errors.push(`HAWB trùng trong cùng MAWB: ${h.hawb}`);
    } else {
      seen.set(key, h.id);
    }
    if (h.pcs != null && (!Number.isInteger(h.pcs) || h.pcs < 1)) {
      errors.push(`HAWB ${h.hawb}: pcs phải là số nguyên ≥ 1 hoặc để trống`);
    }
    if (h.allocationStatus === "needs-confirmation") {
      warnings.push(`HAWB ${h.hawb}: cần xác nhận số kiện`);
    }
  }

  const allocatedPcs = sumAllocatedHousePcs(houses);
  let unassignedPcs: number | null = null;
  if (masterPcs != null && masterPcs >= 1) {
    if (allocatedPcs > masterPcs) {
      errors.push(`Tổng house pcs (${allocatedPcs}) vượt master pcs (${masterPcs})`);
    } else {
      unassignedPcs = masterPcs - allocatedPcs;
      if (unassignedPcs > 0) {
        warnings.push(`${unassignedPcs} kiện chưa phân bổ`);
      }
    }
  }

  return {
    masterPcs,
    allocatedPcs,
    unassignedPcs,
    houses: houses.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.hawb.localeCompare(b.hawb)),
    errors,
    warnings,
  };
}

/** true nếu được phép gửi lệnh in house (không lỗi cứng). */
export function canSubmitHousePrintPlan(summary: HouseAllocationSummary): boolean {
  return summary.errors.length === 0 && summary.houses.length > 0;
}
