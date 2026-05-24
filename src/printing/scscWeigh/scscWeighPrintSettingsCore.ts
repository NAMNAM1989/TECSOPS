import type { Warehouse } from "../../types/shipment";
import type {
  ScscWeighPrintSettings,
  ScscWeighSenderBlock,
  ScscWeighWarehouseKey,
} from "../../types/scscWeighPrintSettings";
import { SCSC_WEIGH_WAREHOUSE_KEYS } from "../../types/scscWeighPrintSettings";
import { isScscWarehouse } from "../../constants/warehouses";

const LIMITS = {
  senderName: 60,
  senderPhone: 24,
} as const;

function clip(s: unknown, max: number): string {
  return String(s ?? "").slice(0, max);
}

/** Giới hạn độ dài khi đang gõ — không trim (giữ dấu cách). */
export function clipScscSenderBlock(raw: unknown): ScscWeighSenderBlock {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    senderName: clip(o.senderName, LIMITS.senderName),
    senderPhone: clip(o.senderPhone, LIMITS.senderPhone),
  };
}

export function clampScscSenderBlock(raw: unknown): ScscWeighSenderBlock {
  const clipped = clipScscSenderBlock(raw);
  return {
    senderName: clipped.senderName.trim(),
    senderPhone: clipped.senderPhone.trim(),
  };
}

export function defaultScscWeighPrintSettings(): ScscWeighPrintSettings {
  const empty = clampScscSenderBlock({});
  return {
    senders: {
      "TECS-SCSC": { ...empty },
      "KHO-SCSC": { ...empty },
    },
  };
}

/** Migrate `{ senderName, senderPhone }` cũ → senders theo kho. */
export function clampScscWeighPrintSettings(raw: unknown): ScscWeighPrintSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if ("senderName" in o || "senderPhone" in o) {
    const legacy = clampScscSenderBlock(o);
    return {
      senders: {
        "TECS-SCSC": { ...legacy },
        "KHO-SCSC": { ...legacy },
      },
    };
  }
  const sendersRaw = o.senders && typeof o.senders === "object" ? (o.senders as Record<string, unknown>) : {};
  return {
    senders: {
      "TECS-SCSC": clampScscSenderBlock(sendersRaw["TECS-SCSC"]),
      "KHO-SCSC": clampScscSenderBlock(sendersRaw["KHO-SCSC"]),
    },
  };
}

export function isScscWeighWarehouseKey(w: string): w is ScscWeighWarehouseKey {
  return (SCSC_WEIGH_WAREHOUSE_KEYS as readonly string[]).includes(w);
}

export function resolveScscWeighWarehouseKey(warehouse: Warehouse): ScscWeighWarehouseKey {
  if (warehouse === "KHO-SCSC") return "KHO-SCSC";
  return "TECS-SCSC";
}

export function resolveScscSenderForWarehouse(
  settings: ScscWeighPrintSettings,
  warehouse: Warehouse
): ScscWeighSenderBlock {
  const key = isScscWarehouse(warehouse) ? resolveScscWeighWarehouseKey(warehouse) : "TECS-SCSC";
  return settings.senders[key];
}

export function patchScscSenderForWarehouse(
  settings: ScscWeighPrintSettings,
  warehouse: ScscWeighWarehouseKey,
  patch: Partial<ScscWeighSenderBlock>
): ScscWeighPrintSettings {
  return {
    senders: {
      ...settings.senders,
      [warehouse]: clipScscSenderBlock({ ...settings.senders[warehouse], ...patch }),
    },
  };
}
