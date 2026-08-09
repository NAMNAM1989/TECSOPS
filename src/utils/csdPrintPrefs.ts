import type { CsdCarrier } from "./csdForms";

const KEY = "tecsops.csd.lastTransfer.v1";

type Store = Partial<Record<CsdCarrier, string>>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadLastCsdTransfer(carrier: CsdCarrier): string {
  const v = readStore()[carrier];
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}

export function saveLastCsdTransfer(carrier: CsdCarrier, transfer: string): void {
  const t = transfer.trim().toUpperCase().slice(0, 24);
  try {
    const next = { ...readStore(), [carrier]: t };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}
