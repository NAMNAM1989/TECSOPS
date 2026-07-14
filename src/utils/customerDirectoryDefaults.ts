import type {
  CustomerDirectoryEntry,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
} from "../types/customerDirectory";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function resolveDefaultShipper(entry: CustomerDirectoryEntry | undefined): CustomerSavedShipper | undefined {
  const list = entry?.savedShippers ?? [];
  if (!list.length) return undefined;
  const defId = entry?.defaultShipperId?.trim();
  if (defId) return list.find((x) => norm(x.id) === norm(defId));
  if (list.length === 1) return list[0];
  return undefined;
}

export function resolveDefaultConsignee(entry: CustomerDirectoryEntry | undefined): CustomerSavedConsignee | undefined {
  const list = entry?.savedConsignees ?? [];
  if (!list.length) return undefined;
  const defId = entry?.defaultConsigneeId?.trim();
  if (defId) return list.find((x) => norm(x.id) === norm(defId));
  if (list.length === 1) return list[0];
  return undefined;
}

export function resolveDefaultGoods(entry: CustomerDirectoryEntry | undefined): CustomerSavedGoods | undefined {
  const list = entry?.savedGoods ?? [];
  if (!list.length) return undefined;
  const defId = entry?.defaultGoodsId?.trim();
  if (defId) return list.find((x) => norm(x.id) === norm(defId));
  if (list.length === 1) return list[0];
  return undefined;
}

export function profileOptionLabel(label: string, primary: string, fallbackId: string): string {
  const lab = label.trim();
  const pri = primary.trim();
  if (lab && pri) return `${lab} — ${pri}`;
  return pri || lab || fallbackId;
}
