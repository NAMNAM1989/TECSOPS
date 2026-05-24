import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import { getScscWeighPrintSettingsCache } from "../printing/scscWeigh/scscWeighPrintSettingsRuntime";
import { defaultGlobalAgentCatalog } from "./globalAgentsCore";
import { isScscWarehouse } from "../constants/warehouses";
import { ensureScscConsigneeForPrint } from "./ensureScscConsigneeForPrint";
import { getActiveA4WeighProfile } from "../printing/printerProfiles";
import {
  isA4WeighProfile,
  loadPrinterProfileStore,
  syncLegacyScscOffsetsFromProfile,
  upsertPrinterProfile,
} from "../printing/printerProfileStorage";
import {
  printScscWeighCalibrationTest,
  printScscWeighReceiptPdf,
  type ScscPrintResult,
} from "./scscWeighPdfPrint";

export function canPrintWeighReceiptScsc(s: Shipment): boolean {
  return isScscWarehouse(s.warehouse);
}

export function getScscPrintCalibration(): { offsetXmm: number; offsetYmm: number } {
  const p = getActiveA4WeighProfile(loadPrinterProfileStore());
  return { offsetXmm: p.offsetXmm, offsetYmm: p.offsetYmm };
}

export function saveScscPrintCalibration(offsetXmm: number, offsetYmm: number): void {
  const store = loadPrinterProfileStore();
  const p = getActiveA4WeighProfile(store);
  if (!isA4WeighProfile(p)) return;
  const next = { ...p, offsetXmm, offsetYmm };
  upsertPrinterProfile(next);
  syncLegacyScscOffsetsFromProfile(next);
}

export function resetScscPrintCalibration(): void {
  saveScscPrintCalibration(0, 0);
  const store = loadPrinterProfileStore();
  const p = getActiveA4WeighProfile(store);
  if (!isA4WeighProfile(p)) return;
  upsertPrinterProfile({ ...p, scaleX: 1, scaleY: 1 });
}

export async function printWeighReceiptScsc(
  s: Shipment,
  opts?: {
    offsetXmm?: number;
    offsetYmm?: number;
    customerDirectory?: readonly CustomerDirectoryEntry[];
    globalAgents?: GlobalAgentCatalog;
    scscWeighPrintSettings?: ScscWeighPrintSettings;
    saveScscWeighPrintSettings?: (settings: ScscWeighPrintSettings) => void | Promise<void>;
    mapOptions?: {
      skipAutoSingleConsignee?: boolean;
      skipAutoDefaultAgent?: boolean;
      skipAutoSingleGoods?: boolean;
      skipAutoSingleShipper?: boolean;
    };
    calibrationTest?: boolean;
  }
): Promise<ScscPrintResult> {
  const store = loadPrinterProfileStore();
  const profile = getActiveA4WeighProfile(store);
  if (opts?.calibrationTest) {
    return printScscWeighCalibrationTest(s, {
      profile,
      offsetXmm: opts?.offsetXmm,
      offsetYmm: opts?.offsetYmm,
      customerDirectory: opts?.customerDirectory,
      globalAgents: opts?.globalAgents ?? defaultGlobalAgentCatalog(),
      scscWeighPrintSettings: opts?.scscWeighPrintSettings ?? getScscWeighPrintSettingsCache(),
      mapOptions: opts?.mapOptions,
    });
  }
  return printScscWeighReceiptPdf(s, {
    profile,
    offsetXmm: opts?.offsetXmm,
    offsetYmm: opts?.offsetYmm,
    customerDirectory: opts?.customerDirectory,
    globalAgents: opts?.globalAgents ?? defaultGlobalAgentCatalog(),
    scscWeighPrintSettings: opts?.scscWeighPrintSettings ?? getScscWeighPrintSettingsCache(),
    mapOptions: opts?.mapOptions,
  });
}

export async function printWeighReceiptScscWithConsigneeChoice(
  s: Shipment,
  opts?: {
    offsetXmm?: number;
    offsetYmm?: number;
    customerDirectory?: readonly CustomerDirectoryEntry[];
    globalAgents?: GlobalAgentCatalog;
    scscWeighPrintSettings?: ScscWeighPrintSettings;
    saveScscWeighPrintSettings?: (settings: ScscWeighPrintSettings) => void | Promise<void>;
  }
): Promise<ScscPrintResult | undefined> {
  const directory = opts?.customerDirectory ?? [];
  const globalAgents = opts?.globalAgents ?? defaultGlobalAgentCatalog();
  const ctx = await ensureScscConsigneeForPrint(s, directory, globalAgents, {
    scscWeighPrintSettings: opts?.scscWeighPrintSettings ?? getScscWeighPrintSettingsCache(),
    saveScscWeighPrintSettings: opts?.saveScscWeighPrintSettings,
  });
  if (!ctx) return undefined;
  return printWeighReceiptScsc(ctx.shipment, {
    ...opts,
    globalAgents,
    scscWeighPrintSettings: getScscWeighPrintSettingsCache(),
    mapOptions: {
      skipAutoSingleConsignee: ctx.skipAutoSingleConsignee,
      skipAutoDefaultAgent: ctx.skipAutoDefaultAgent,
      skipAutoSingleShipper: ctx.skipAutoSingleShipper,
      skipAutoSingleGoods: ctx.skipAutoSingleGoods,
    },
  });
}
