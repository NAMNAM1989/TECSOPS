import { credFetch } from "../apiFetch";
import type { Warehouse } from "../types/shipment";
import type { ShipmentSearchMatchKind } from "./shipmentSearch";
import { foldSearchText } from "./searchNormalize";
import { rawAwbDigits } from "./awbFormat";

export type GlobalSearchLotHit = {
  type: "lot";
  id: string;
  sessionDate: string;
  awb: string;
  dest: string;
  warehouse: Warehouse;
  kind: ShipmentSearchMatchKind;
  label: string;
  sublabel?: string;
};

export type GlobalSearchCustomerHit = {
  type: "customer";
  id: string;
  code: string;
  name: string;
};

export type GlobalSearchH21Hit = {
  type: "h21";
  id: string;
  description: string;
  hsCode: string;
  warehouseScope: "SCSC" | "TCS";
};

export type GlobalSearchHit = GlobalSearchLotHit | GlobalSearchCustomerHit | GlobalSearchH21Hit;

export type GlobalSearchResponse = {
  hits: GlobalSearchHit[];
  from: string;
  to: string;
};

export function shouldFetchGlobalSearch(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  if (rawAwbDigits(trimmed).length >= 3) return true;
  return foldSearchText(trimmed).length >= 3;
}

export async function fetchGlobalSearch(opts: {
  q: string;
  excludeSession?: string;
  signal?: AbortSignal;
}): Promise<GlobalSearchResponse> {
  const params = new URLSearchParams();
  params.set("q", opts.q);
  if (opts.excludeSession) params.set("excludeSession", opts.excludeSession);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(`/api/search?${params}`, {
      ...credFetch,
      cache: "no-store",
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (res.status === 401 || !res.ok) {
      return { hits: [], from: "", to: "" };
    }
    const body = (await res.json()) as GlobalSearchResponse;
    return {
      hits: Array.isArray(body.hits) ? body.hits : [],
      from: typeof body.from === "string" ? body.from : "",
      to: typeof body.to === "string" ? body.to : "",
    };
  } catch {
    return { hits: [], from: "", to: "" };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

export function lotHitsFromGlobalSearch(body: GlobalSearchResponse): GlobalSearchLotHit[] {
  const warehouses: Warehouse[] = ["TECS-TCS", "TECS-SCSC", "TCS", "SCSC"];
  return body.hits.filter((h): h is GlobalSearchLotHit => {
    if (h?.type !== "lot") return false;
    return Boolean(h.id && h.sessionDate) && warehouses.includes(h.warehouse);
  });
}
