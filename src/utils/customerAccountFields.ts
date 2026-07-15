/** Helpers chuẩn hóa cột Excel Import Customers (10 cột). */
import type { CustomerType } from "../types/customerDirectory";
import { CUSTOMER_TYPES } from "../types/customerDirectory";

export function normalizeCustomerType(raw: unknown): CustomerType {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if ((CUSTOMER_TYPES as readonly string[]).includes(u)) return u as CustomerType;
  if (u === "FORWARD" || u === "FWDR") return "FORWARDER";
  if (u === "DIRECT" || u === "SHIPPER" || u === "DIRECTSHIPPER") return "DIRECT_SHIPPER";
  if (u === "AG") return "AGENT";
  return "DIRECT_SHIPPER";
}

export function parseDefaultRate(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  const s = String(raw).trim().replace(/,/g, "").replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

export function formatDefaultRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "";
  return String(rate);
}
