import type { DimPieceLine, Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import { WAREHOUSE_ORDER } from "../constants/warehouses";
import { formatLocalSessionDate, startOfLocalDay } from "./sessionDate";
import { SHIPMENT_STATUS_ORDER, migrateShipmentStatus } from "./shipmentWorkflowStatus";
import { normalizeDimLineEdges } from "./dimBulkFill";
import { dimDivisorFromFlight, totalDimKgFromLines } from "./volumetricDim";

const ROWS_KEY = "tecsops-shipments-v1";
const WORK_DATE_KEY = "tecsops-work-date-v1";

/** Cho phép đọc bản lưu cũ trước khi migrate status. */
const RAW_STATUS_OK = new Set<string>([
  ...SHIPMENT_STATUS_ORDER,
  "AT_RISK",
  "CUTOFF_PASSED",
  "BUILT_UP",
  "DEPARTED",
  "DELIVERED",
]);

const WAREHOUSES: Warehouse[] = [...WAREHOUSE_ORDER];

function isDimPieceLine(o: unknown): o is DimPieceLine {
  if (!o || typeof o !== "object") return false;
  const x = o as Record<string, unknown>;
  return (
    typeof x.lCm === "number" &&
    Number.isFinite(x.lCm) &&
    typeof x.wCm === "number" &&
    Number.isFinite(x.wCm) &&
    typeof x.hCm === "number" &&
    Number.isFinite(x.hCm) &&
    typeof x.pcs === "number" &&
    Number.isFinite(x.pcs) &&
    x.lCm > 0 &&
    x.wCm > 0 &&
    x.hCm > 0 &&
    x.pcs > 0 &&
    (x.estimated === undefined || typeof x.estimated === "boolean")
  );
}

function normalizeDimLines(raw: unknown): DimPieceLine[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: DimPieceLine[] = [];
  for (const item of raw) {
    if (!isDimPieceLine(item)) continue;
    out.push(
      normalizeDimLineEdges({
        lCm: item.lCm,
        wCm: item.wCm,
        hCm: item.hCm,
        pcs: Math.max(1, Math.floor(item.pcs)),
        ...(item.estimated ? { estimated: true } : {}),
      })
    );
  }
  return out.length > 0 ? out : null;
}

function isShipmentShape(o: unknown): o is Omit<Shipment, "sessionDate"> & { sessionDate?: string } {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.stt === "number" &&
    Number.isFinite(r.stt) &&
    typeof r.awb === "string" &&
    typeof r.flight === "string" &&
    typeof r.flightDate === "string" &&
    typeof r.cutoff === "string" &&
    typeof r.cutoffNote === "string" &&
    (r.note === undefined || typeof r.note === "string") &&
    typeof r.dest === "string" &&
    typeof r.customer === "string" &&
    (r.customerCode === undefined || typeof r.customerCode === "string") &&
    (r.customerId === undefined || typeof r.customerId === "string") &&
    (r.globalAgentId === undefined || typeof r.globalAgentId === "string") &&
    (r.customerGoodsId === undefined || typeof r.customerGoodsId === "string") &&
    (r.goodsDescriptionPrint === undefined || typeof r.goodsDescriptionPrint === "string") &&
    (r.otherRequirementsPrint === undefined || typeof r.otherRequirementsPrint === "string") &&
    (r.customerShipperId === undefined || typeof r.customerShipperId === "string") &&
    (r.customerConsigneeId === undefined || typeof r.customerConsigneeId === "string") &&
    (r.shipperNamePrint === undefined || typeof r.shipperNamePrint === "string") &&
    (r.shipperAddressPrint === undefined || typeof r.shipperAddressPrint === "string") &&
    (r.shipperPhonePrint === undefined || typeof r.shipperPhonePrint === "string") &&
    (r.shipperEmailPrint === undefined || typeof r.shipperEmailPrint === "string") &&
    (r.taxCodePrint === undefined || typeof r.taxCodePrint === "string") &&
    (r.agentNamePrint === undefined || typeof r.agentNamePrint === "string") &&
    (r.agentAddressPrint === undefined || typeof r.agentAddressPrint === "string") &&
    (r.agentPhonePrint === undefined || typeof r.agentPhonePrint === "string") &&
    (r.agentEmailPrint === undefined || typeof r.agentEmailPrint === "string") &&
    (r.agentTaxCodePrint === undefined || typeof r.agentTaxCodePrint === "string") &&
    (r.consigneeNamePrint === undefined || typeof r.consigneeNamePrint === "string") &&
    (r.consigneeAddressPrint === undefined || typeof r.consigneeAddressPrint === "string") &&
    (r.consigneePhonePrint === undefined || typeof r.consigneePhonePrint === "string") &&
    (r.consigneeEmailPrint === undefined || typeof r.consigneeEmailPrint === "string") &&
    (r.notifyNamePrint === undefined || typeof r.notifyNamePrint === "string") &&
    typeof r.status === "string" &&
    RAW_STATUS_OK.has(r.status) &&
    WAREHOUSES.includes(r.warehouse as Warehouse) &&
    (r.pcs === null || typeof r.pcs === "number") &&
    (r.kg === null || typeof r.kg === "number") &&
    (r.dimWeightKg === undefined || r.dimWeightKg === null || typeof r.dimWeightKg === "number") &&
    (r.dimLines === undefined || r.dimLines === null || Array.isArray(r.dimLines)) &&
    (r.dimDivisor === undefined || r.dimDivisor === null || r.dimDivisor === 6000 || r.dimDivisor === 5000)
  );
}

function legacySessionFallback(): string {
  try {
    const raw = localStorage.getItem(WORK_DATE_KEY);
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return formatLocalSessionDate(startOfLocalDay(d));
    }
  } catch {
    /* ignore */
  }
  return formatLocalSessionDate(startOfLocalDay(new Date()));
}

/** null = chưa từng lưu → dùng dữ liệu mặc định app */
export function loadRows(): Shipment[] | null {
  try {
    const raw = localStorage.getItem(ROWS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const fb = legacySessionFallback();
    const rows: Shipment[] = [];
    for (const item of parsed) {
      if (!isShipmentShape(item)) continue;
      const sd =
        typeof item.sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.sessionDate)
          ? item.sessionDate
          : fb;
      const dimDivisor =
        item.dimDivisor === 5000 || item.dimDivisor === 6000 ? item.dimDivisor : null;
      const dimLines = normalizeDimLines(item.dimLines);
      let dimWeightKg =
        item.dimWeightKg === null || typeof item.dimWeightKg === "number" ? item.dimWeightKg : null;
      if ((dimWeightKg == null || !Number.isFinite(dimWeightKg)) && dimLines?.length) {
        const flight = typeof item.flight === "string" ? item.flight : "";
        const awb = typeof item.awb === "string" ? item.awb : "";
        const div =
          dimDivisor === 5000 || dimDivisor === 6000 ? dimDivisor : dimDivisorFromFlight(flight);
        dimWeightKg = totalDimKgFromLines(dimLines, div, { flight, awb });
      }
      const base: Shipment = {
        ...(item as Shipment),
        sessionDate: sd,
        note: typeof item.note === "string" ? item.note : "",
        customerCode: typeof item.customerCode === "string" ? item.customerCode : "",
        customerId: typeof item.customerId === "string" ? item.customerId : "",
        globalAgentId:
          typeof item.globalAgentId === "string"
            ? item.globalAgentId
            : typeof item.customerAgentId === "string"
              ? item.customerAgentId
              : "",
        customerGoodsId: typeof item.customerGoodsId === "string" ? item.customerGoodsId : "",
        goodsDescriptionPrint:
          typeof item.goodsDescriptionPrint === "string" ? item.goodsDescriptionPrint : "",
        otherRequirementsPrint:
          typeof item.otherRequirementsPrint === "string" ? item.otherRequirementsPrint : "",
        customerShipperId:
          typeof item.customerShipperId === "string" ? item.customerShipperId : "",
        customerConsigneeId:
          typeof item.customerConsigneeId === "string" ? item.customerConsigneeId : "",
        shipperNamePrint: typeof item.shipperNamePrint === "string" ? item.shipperNamePrint : "",
        shipperAddressPrint: typeof item.shipperAddressPrint === "string" ? item.shipperAddressPrint : "",
        shipperPhonePrint: typeof item.shipperPhonePrint === "string" ? item.shipperPhonePrint : "",
        shipperEmailPrint: typeof item.shipperEmailPrint === "string" ? item.shipperEmailPrint : "",
        taxCodePrint: typeof item.taxCodePrint === "string" ? item.taxCodePrint : "",
        agentNamePrint: typeof item.agentNamePrint === "string" ? item.agentNamePrint : "",
        agentAddressPrint: typeof item.agentAddressPrint === "string" ? item.agentAddressPrint : "",
        agentPhonePrint: typeof item.agentPhonePrint === "string" ? item.agentPhonePrint : "",
        agentEmailPrint: typeof item.agentEmailPrint === "string" ? item.agentEmailPrint : "",
        agentTaxCodePrint: typeof item.agentTaxCodePrint === "string" ? item.agentTaxCodePrint : "",
        consigneeNamePrint: typeof item.consigneeNamePrint === "string" ? item.consigneeNamePrint : "",
        consigneeAddressPrint: typeof item.consigneeAddressPrint === "string" ? item.consigneeAddressPrint : "",
        consigneePhonePrint: typeof item.consigneePhonePrint === "string" ? item.consigneePhonePrint : "",
        consigneeEmailPrint: typeof item.consigneeEmailPrint === "string" ? item.consigneeEmailPrint : "",
        notifyNamePrint: typeof item.notifyNamePrint === "string" ? item.notifyNamePrint : "",
        dimWeightKg,
        dimLines,
        dimDivisor,
        status: item.status as ShipmentStatus,
      };
      rows.push({
        ...base,
        status: migrateShipmentStatus(base),
      });
    }
    return rows;
  } catch {
    return null;
  }
}

export function saveRows(rows: Shipment[]): void {
  try {
    localStorage.setItem(ROWS_KEY, JSON.stringify(rows));
  } catch {
    /* quota / private mode */
  }
}

