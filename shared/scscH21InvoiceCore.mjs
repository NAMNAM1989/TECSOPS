/**
 * Invoice H21 SCSC — sinh dòng ngẫu nhiên, số INV, footer, validate (shared client/server).
 */
import { invoiceLineFromCatalogItem, normalizeScscH21CatalogItem, resolveH21UnitFactorKg } from "./scscH21CatalogNormalize.mjs";
import {
  filterCatalogByH21Family,
  pickCatalogItemsGrouped,
} from "./scscH21InvoiceGroups.mjs";

/** @typedef {() => number} Rng */

/** @param {Rng} [rng] */
export function createSeededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function str(v, max = 200) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function roundKg3(n) {
  return Math.round(n * 1000) / 1000;
}

function sumLineKg(lines) {
  let kg = 0;
  for (const l of lines) kg += num(l.weightKg) ?? 0;
  return roundKg3(kg);
}

function applyAllocatedQty(line, quantity, factor) {
  const qty = Math.max(0, Math.floor(quantity));
  return {
    ...line,
    quantity: qty,
    weightKg: roundKg3(qty * factor),
    amount: Math.round(qty * (num(line.unitPrice) ?? 0) * 10000) / 10000,
  };
}

/**
 * Hạ quantity / bỏ dòng từ cuối cho đến khi Σ kg ≤ cap (KG lô / tờ khai).
 * @param {{ line: object, factor: number }[]} allocated
 * @param {number} capKg
 */
function clampAllocatedLinesToCap(allocated, capKg) {
  const cap = roundKg3(capKg);
  const out = allocated.map((x) => ({ line: x.line, factor: x.factor }));
  while (out.length) {
    if (sumLineKg(out.map((x) => x.line)) <= cap) break;
    const last = out[out.length - 1];
    const othersKg = sumLineKg(out.slice(0, -1).map((x) => x.line));
    const room = cap - othersKg;
    const maxQty = Math.floor((room + 1e-9) / last.factor);
    if (maxQty >= 1) {
      last.line = applyAllocatedQty(last.line, maxQty, last.factor);
      if (sumLineKg(out.map((x) => x.line)) <= cap) break;
      out.pop();
      continue;
    }
    out.pop();
  }
  return out.map((x) => x.line);
}

/**
 * INV NO: mã KH + chuyến + ngày bay. Tách nhiều tờ khai → suffix -1, -2.
 * Chỉ là **gợi ý** — ưu tiên số nhập tay (`invoiceNo` trên tờ khai).
 * @param {{ customerCode?: string, flight?: string, flightDate?: string }} shipment
 * @param {{ code?: string } | null | undefined} [customerEntry]
 * @param {number | { seq?: number, total?: number }} [seqOrOpts]
 */
export function buildH21InvoiceNo(shipment, customerEntry, seqOrOpts) {
  const code = str(
    shipment?.customerCode || customerEntry?.code || "",
    40
  )
    .toUpperCase()
    .replace(/\s+/g, "");
  const flight = str(shipment?.flight || "", 24)
    .toUpperCase()
    .replace(/\s+/g, "");
  const flightDate = str(shipment?.flightDate || "", 12).toUpperCase();
  if (!code || !flight || !flightDate) return "";
  const base = `${code}-${flight}/${flightDate}`;
  let seq = 0;
  let total = 0;
  if (typeof seqOrOpts === "number") {
    seq = seqOrOpts;
  } else if (seqOrOpts && typeof seqOrOpts === "object") {
    seq = Number(seqOrOpts.seq) || 0;
    total = Number(seqOrOpts.total) || 0;
  }
  if (seq >= 1 && (seq > 1 || total > 1)) return `${base}-${seq}`;
  return base;
}

/**
 * Ưu tiên INV NO nhập tay; nếu trống mới dùng gợi ý tự động.
 * @param {string | null | undefined} manual
 * @param {{ customerCode?: string, flight?: string, flightDate?: string }} shipment
 * @param {{ code?: string } | null | undefined} [customerEntry]
 * @param {number | { seq?: number, total?: number }} [seqOrOpts]
 */
export function resolveH21InvoiceNo(manual, shipment, customerEntry, seqOrOpts) {
  const typed = str(manual, 80).trim();
  if (typed) return typed;
  return buildH21InvoiceNo(shipment, customerEntry, seqOrOpts);
}

/**
 * @param {unknown[]} catalog
 * @param {number} count
 * @param {() => number} rng
 * @param {import("./scscH21InvoiceGroups.mjs").H21CargoFamilyId} [cargoFamily]
 */
function shufflePick(catalog, count, rng, cargoFamily = "general") {
  const valid = catalog.filter((c) => {
    const item = normalizeScscH21CatalogItem(c, { keepId: true });
    return item && item.active !== false && resolveH21UnitFactorKg(item) > 0;
  });
  if (!valid.length) return [];
  const pool = filterCatalogByH21Family(valid, cargoFamily, Math.min(3, count));
  return pickCatalogItemsGrouped(pool, count, rng);
}

/**
 * Phân bổ KG tờ khai thành dòng invoice từ danh sách catalog đã chọn.
 * @param {object} opts
 * @param {unknown[]} opts.items — catalog items (đã lọc/khớp)
 * @param {number} opts.grossKg
 * @param {Rng} [opts.rng]
 * @param {{ minCoverage?: number, maxCoverage?: number }} [opts.coverage]
 */
export function allocateH21InvoiceLinesFromItems(opts) {
  const { items, grossKg } = opts;
  const rng = opts.rng ?? Math.random;
  const minCov = opts.coverage?.minCoverage ?? 0.75;
  const maxCov = opts.coverage?.maxCoverage ?? 0.9;

  if (!Number.isFinite(grossKg) || grossKg <= 0) {
    const err = new Error("Lô cần có KG thực (> 0) để phân bổ");
    err.statusCode = 400;
    err.code = "SCSC_H21_KG_REQUIRED";
    throw err;
  }

  /** @type {NonNullable<ReturnType<typeof normalizeScscH21CatalogItem>>[]} */
  const selected = [];
  const seen = new Set();
  for (const raw of items || []) {
    const item = normalizeScscH21CatalogItem(raw, { keepId: true });
    if (!item || item.active === false || !(resolveH21UnitFactorKg(item) > 0)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    selected.push(item);
  }
  if (!selected.length) {
    const err = new Error("Không có mặt hàng catalog hợp lệ để tạo dòng (cần unitFactor > 0)");
    err.statusCode = 400;
    err.code = "SCSC_H21_CATALOG_EMPTY";
    throw err;
  }

  const coverage = minCov + rng() * Math.max(0, maxCov - minCov);
  const budget = grossKg * coverage;
  const weights = selected.map(() => rng() + 0.01);
  const sumW = weights.reduce((a, b) => a + b, 0);

  /** @type {{ line: NonNullable<ReturnType<typeof invoiceLineFromCatalogItem>>, factor: number }[]} */
  const allocated = [];
  for (let i = 0; i < selected.length; i++) {
    const item = selected[i];
    const factor = resolveH21UnitFactorKg(item);
    const share = budget * (weights[i] / sumW);
    const quantity = Math.max(1, Math.round(share / factor));
    const base = invoiceLineFromCatalogItem(item);
    if (!base) continue;
    allocated.push({
      factor,
      line: applyAllocatedQty(
        {
          ...base,
          unitPrice: item.unitPrice,
        },
        quantity,
        factor
      ),
    });
  }
  return clampAllocatedLinesToCap(allocated, grossKg);
}

/**
 * Sinh N dòng invoice ngẫu nhiên từ catalog + kg thực lô.
 * @param {object} opts
 * @param {unknown[]} opts.catalog
 * @param {number} opts.lineCount
 * @param {number} opts.grossKg
 * @param {Rng} [opts.rng]
 * @param {{ minCoverage?: number, maxCoverage?: number }} [opts.coverage]
 * @param {import("./scscH21InvoiceGroups.mjs").H21CargoFamilyId} [opts.cargoFamily] — nhóm hàng (đông lạnh, TP, …)
 */
export function generateRandomH21InvoiceLines(opts) {
  const { catalog, lineCount, grossKg } = opts;
  const rng = opts.rng ?? Math.random;
  const cargoFamily = opts.cargoFamily ?? "general";
  const selected = shufflePick(catalog, lineCount, rng, cargoFamily);
  return allocateH21InvoiceLinesFromItems({
    items: selected,
    grossKg,
    rng,
    coverage: opts.coverage,
  });
}

/**
 * Footer invoice H21: Total carton = số kiện tờ khai (nhập tay / tỉ lệ lô).
 * @param {{ kg?: number | null, pcs?: number | null }} shipment
 * @param {{ weightKg?: number }[]} lines
 * @param {{ declarationKg?: number | null, declarationPcs?: number | null }} [opts]
 */
export function computeH21InvoiceFooter(shipment, lines, opts = {}) {
  const lotKg = num(shipment?.kg) ?? 0;
  const lotPcs = num(shipment?.pcs) ?? 0;
  const declRaw = num(opts.declarationKg);
  const grossKg =
    declRaw != null && declRaw > 0 ? Math.min(declRaw, lotKg || declRaw) : lotKg;

  let pcs = lotPcs;
  if (declRaw != null && declRaw > 0 && lotKg > 0 && lotPcs > 0) {
    pcs = Math.max(1, Math.round((grossKg / lotKg) * lotPcs));
  }

  const manualPcs = num(opts.declarationPcs);
  if (manualPcs != null && manualPcs > 0) {
    pcs = Math.max(0, Math.round(manualPcs));
  }

  let linesKg = 0;
  let lineAmount = 0;
  let lineQty = 0;
  for (const l of lines || []) {
    linesKg += num(l.weightKg) ?? 0;
    lineAmount += num(l.amount) ?? 0;
    lineQty += num(l.quantity) ?? 0;
  }
  linesKg = Math.round(linesKg * 1000) / 1000;
  lineAmount = Math.round(lineAmount * 100) / 100;
  const residualKg = Math.max(0, Math.round((grossKg - linesKg) * 1000) / 1000);

  const totalCartonPkgs = pcs > 0 ? pcs : 0;

  return {
    grossKg,
    lotKg,
    lotPcs,
    declarationPcs: pcs,
    linesKg,
    residualKg,
    lineAmount,
    lineQty,
    totalCartonPkgs,
    pcs,
  };
}

/**
 * @param {object} opts
 * @param {{ customerCode?: string, flight?: string, flightDate?: string, sessionDate?: string, kg?: number | null, pcs?: number | null }} opts.shipment
 * @param {{ code?: string } | null} [opts.customerEntry]
 * @param {{ shipperName?: string, shipperAddress?: string, shipperPhone?: string, sealImageData?: string | null } | null} [opts.shipper]
 * @param {{ name?: string, addressLines?: string[], phone?: string } | null} [opts.cnee]
 * @param {unknown[]} opts.lines
 * @param {number | null} [opts.declarationKg] — KG phân bổ tờ khai (chia lô)
 * @param {number | null} [opts.declarationPcs] — Số kiện tờ khai (Total carton)
 * @param {string | null} [opts.invoiceNo] — INV NO nhập tay (ưu tiên)
 * @param {number} [opts.invoiceSeq]
 * @param {number} [opts.invoiceSeqTotal]
 */
export function buildH21InvoiceDocument(opts) {
  const { shipment, customerEntry, shipper, cnee, lines, declarationKg, declarationPcs } = opts;
  const invoiceNo = resolveH21InvoiceNo(opts.invoiceNo, shipment, customerEntry, {
    seq: opts.invoiceSeq,
    total: opts.invoiceSeqTotal,
  });
  const flight = str(shipment?.flight || "").toUpperCase();
  const flightDate = str(shipment?.flightDate || "").toUpperCase();
  const footer = computeH21InvoiceFooter(shipment, lines, { declarationKg, declarationPcs });

  return {
    title: "NONCOMMERCIAL INVOICE",
    customsNote: "Value for customs purpose only",
    invoiceNo,
    dateLabel: formatInvoiceDateLabel(shipment?.sessionDate),
    flightLabel: flight && flightDate ? `${flight}/${flightDate}` : flight || flightDate,
    shipper: {
      name: str(shipper?.shipperName || ""),
      address: str(shipper?.shipperAddress || ""),
      phone: str(shipper?.shipperPhone || ""),
      sealImageData: (() => {
        const s = String(shipper?.sealImageData ?? "").trim();
        if (!s || !/^data:image\/(png|jpe?g|webp);base64,/i.test(s)) return null;
        if (s.length > 900_000) return null;
        return s;
      })(),
    },
    cnee: {
      name: str(cnee?.name || ""),
      addressLines: Array.isArray(cnee?.addressLines) ? cnee.addressLines.map((x) => str(x, 120)) : [],
      phone: str(cnee?.phone || ""),
    },
    lines: (lines || []).map((l, i) => ({
      no: i + 1,
      description: str(l.description, 800),
      origin: str(l.origin, 40) || "VIETNAM",
      quantity: num(l.quantity) ?? 0,
      uom: str(l.uom, 12) || "PCE",
      weightKg: num(l.weightKg) ?? 0,
      unitPrice: num(l.unitPrice) ?? 0,
      amount: num(l.amount) ?? 0,
    })),
    footer,
    paymentNote: "NO PAYMENT",
  };
}

/** @param {string | undefined} sessionYmd */
function formatInvoiceDateLabel(sessionYmd) {
  const raw = str(sessionYmd, 12);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      const mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const yy = String(d.getFullYear()).slice(-2);
      return `${d.getDate()}${mon[d.getMonth()]}, ${yy}`;
    }
  }
  return raw || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

/**
 * Kiểm tra trước khi xuất invoice demo.
 * @returns {string[]} danh sách lỗi
 */
export function validateH21InvoiceExport(opts) {
  const errors = [];
  const { shipment, customerEntry, shipper, cnee, lines } = opts;
  const invoiceNo = resolveH21InvoiceNo(opts.invoiceNo, shipment, customerEntry, {
    seq: opts.invoiceSeq,
    total: opts.invoiceSeqTotal,
  });
  if (!invoiceNo) {
    errors.push("Nhập INVOICE NO (hoặc đủ mã khách / chuyến / ngày bay để dùng gợi ý).");
  }
  if (!shipper?.shipperName?.trim()) errors.push("Chưa chọn Shipper tờ khai.");
  if (!cnee?.name?.trim()) errors.push("Chưa chọn CNEE trong INFO KH.");
  if (!Array.isArray(lines) || lines.length === 0) errors.push("Chưa có dòng hàng invoice.");
  const lotKg = num(shipment?.kg);
  const declRaw = num(opts.declarationKg);
  const capKg =
    declRaw != null && declRaw > 0 ? Math.min(declRaw, lotKg || declRaw) : lotKg;
  if (capKg == null || capKg <= 0) errors.push("Lô chưa có KG thực.");
  else if (Array.isArray(lines) && lines.length > 0 && sumLineKg(lines) > capKg) {
    errors.push("Tổng KG dòng invoice vượt KG tờ khai.");
  }
  return errors;
}
