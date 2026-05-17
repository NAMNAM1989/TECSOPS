import type { ScscWeighPrintSettings } from "../../types/scscWeighPrintSettings";
import {
  clampScscWeighPrintSettings,
  defaultScscWeighPrintSettings,
} from "./scscWeighPrintSettingsCore";

let cache: ScscWeighPrintSettings = defaultScscWeighPrintSettings();

export function setScscWeighPrintSettingsCache(next: unknown): void {
  cache = clampScscWeighPrintSettings(next);
}

export function getScscWeighPrintSettingsCache(): ScscWeighPrintSettings {
  return cache;
}
