import type { ScscH21CatalogItem, ScscH21InvoiceLine } from "../types/scscH21Catalog";
import { scscH21DescriptionKey } from "../../shared/scscH21CatalogNormalize.mjs";
import { allocateH21InvoiceLinesFromItems } from "../../shared/scscH21InvoiceCore.mjs";
import { filterCatalogByH21Family } from "../../shared/scscH21InvoiceGroups.mjs";
import type { H21CargoFamilyId } from "./scscH21InvoiceCargoFamily";

const DESC_HEADER_RE =
  /^(ten\s*hang|tên\s*hàng|tenhang|description|goods|product|item|mat\s*hang|mặt\s*hàng|hang\s*hoa|hàng\s*hóa|noi\s*dung|nội\s*dung|desc|commodity|ten\s*sp|tên\s*sp)$/i;

const SKIP_HEADER_RE =
  /^(stt|no|no\.|#|qty|sl|so\s*luong|số\s*lượng|kg|weight|don\s*gia|đơn\s*giá|hs|hs\s*code|ma\s*hs|mã\s*hs|uom|dvt|đvt|origin|xuat\s*xu|xuất\s*xứ|amount|thanh\s*tien|thành\s*tiền|unit|price)$/i;

const NOISE_LINE_RE =
  /^(stt|no\.?|description|goods|product|item|total|tong|tổng|summary|invoice|packing\s*list|list\s*of\s*goods)$/i;

export type H21GoodsListMatch = {
  query: string;
  catalogItem: ScscH21CatalogItem;
  score: number;
};

export type H21GoodsListImportResult = {
  queries: string[];
  matches: H21GoodsListMatch[];
  unmatched: string[];
  lines: ScscH21InvoiceLine[];
};

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v).replace(/\s+/g, " ").trim();
  }
  if (typeof v === "object" && v && "result" in v) {
    return cellText((v as { result: unknown }).result);
  }
  if (typeof v === "object" && v && "text" in v) {
    return cellText((v as { text: unknown }).text);
  }
  if (typeof v === "object" && v && "richText" in v) {
    const parts = (v as { richText: { text?: string }[] }).richText;
    return parts.map((p) => p.text ?? "").join("").replace(/\s+/g, " ").trim();
  }
  return String(v).replace(/\s+/g, " ").trim();
}

function looksLikeDescription(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 400) return false;
  if (NOISE_LINE_RE.test(t)) return false;
  if (/^[\d.,\s/%+-]+$/.test(t)) return false;
  if (/^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(t)) return false;
  // Cần ít nhất một chữ cái
  if (!/[a-zA-ZÀ-ỹ]/.test(t)) return false;
  return true;
}

/** Token hóa mô tả để so khớp (bỏ dấu khoảng, lower). */
export function tokenizeH21GoodsText(raw: string): string[] {
  const key = scscH21DescriptionKey(raw);
  if (!key) return [];
  return key
    .split(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Điểm tương đồng mô tả list ↔ catalog (0..1).
 * Exact / contain / Jaccard token.
 */
export function scoreH21GoodsSimilarity(query: string, candidate: string): number {
  const qk = scscH21DescriptionKey(query);
  const ck = scscH21DescriptionKey(candidate);
  if (!qk || !ck) return 0;
  if (qk === ck) return 1;
  if (ck.includes(qk) || qk.includes(ck)) {
    const ratio = Math.min(qk.length, ck.length) / Math.max(qk.length, ck.length);
    return 0.82 + 0.15 * ratio;
  }
  const qt = tokenizeH21GoodsText(qk);
  const ct = tokenizeH21GoodsText(ck);
  if (!qt.length || !ct.length) return 0;
  const cset = new Set(ct);
  let inter = 0;
  for (const t of qt) if (cset.has(t)) inter += 1;
  const union = new Set([...qt, ...ct]).size;
  const jaccard = union > 0 ? inter / union : 0;
  const coverage = inter / qt.length;
  // Ưu tiên query tokens xuất hiện trong catalog
  return Math.max(jaccard * 0.55 + coverage * 0.45, jaccard);
}

export function extractGoodsQueriesFromText(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    // CSV/TSV: lấy cột mô tả dài nhất nếu nhiều cột
    if (/[,\t;|]/.test(line) && !looksLikeDescription(line)) {
      const parts = line.split(/[,\t;|]/).map((p) => p.replace(/^["']|["']$/g, "").trim());
      const best = parts
        .filter(looksLikeDescription)
        .sort((a, b) => b.length - a.length)[0];
      if (best) line = best;
    }
    // Bỏ prefix STT kiểu "1. " / "12)"
    line = line.replace(/^\d{1,4}[).:\-\s]+/, "").trim();
    if (!looksLikeDescription(line)) continue;
    const key = scscH21DescriptionKey(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line.slice(0, 400));
  }
  return out;
}

function extractQueriesFromSheetRows(rows: string[][]): string[] {
  if (!rows.length) return [];
  const header = rows[0] ?? [];
  let descCol = -1;
  for (let c = 0; c < header.length; c++) {
    const h = header[c]?.trim() ?? "";
    if (!h) continue;
    const compact = h.replace(/\s+/g, " ");
    if (DESC_HEADER_RE.test(compact)) {
      descCol = c;
      break;
    }
  }

  const dataRows = descCol >= 0 ? rows.slice(1) : rows;
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (text: string) => {
    if (!looksLikeDescription(text)) return;
    const key = scscH21DescriptionKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(text.slice(0, 400));
  };

  if (descCol >= 0) {
    for (const row of dataRows) {
      push(row[descCol] ?? "");
    }
    return out;
  }

  // Không có header rõ: chọn cột có nhiều text mô tả nhất
  const colCount = Math.max(0, ...rows.map((r) => r.length));
  let bestCol = 0;
  let bestScore = -1;
  for (let c = 0; c < colCount; c++) {
    const headerCell = header[c]?.trim() ?? "";
    if (headerCell && SKIP_HEADER_RE.test(headerCell)) continue;
    let score = 0;
    for (let r = 0; r < rows.length; r++) {
      const t = rows[r]?.[c] ?? "";
      if (looksLikeDescription(t)) score += Math.min(40, t.length);
    }
    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }
  for (const row of rows) {
    push(row[bestCol] ?? "");
  }
  return out;
}

async function extractQueriesFromExcel(buf: ArrayBuffer): Promise<string[]> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell.value);
    });
    if (cells.some((c) => c.trim())) rows.push(cells);
  });
  return extractQueriesFromSheetRows(rows);
}

/** Parse file list hàng khách gửi → danh sách mô tả. */
export async function parseH21GoodsListFile(
  buf: ArrayBuffer,
  fileName: string
): Promise<string[]> {
  const name = (fileName || "").toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return extractQueriesFromExcel(buf);
  }
  const text = new TextDecoder("utf-8").decode(buf);
  return extractGoodsQueriesFromText(text);
}

/**
 * Khớp từng dòng list với catalog (best match, dedupe catalog id).
 */
export function matchH21GoodsListToCatalog(
  queries: readonly string[],
  catalog: readonly ScscH21CatalogItem[],
  opts?: {
    minScore?: number;
    cargoFamily?: H21CargoFamilyId;
    maxMatches?: number;
  }
): { matches: H21GoodsListMatch[]; unmatched: string[] } {
  const minScore = opts?.minScore ?? 0.42;
  const maxMatches = opts?.maxMatches ?? 50;
  const family = opts?.cargoFamily ?? "general";
  const pool =
    family === "general"
      ? [...catalog]
      : (filterCatalogByH21Family([...catalog], family, 1) as ScscH21CatalogItem[]);

  const usable = pool.filter((c) => c.active !== false && (c.unitFactor ?? 0) > 0);
  const matches: H21GoodsListMatch[] = [];
  const unmatched: string[] = [];
  const usedIds = new Set<string>();

  for (const query of queries) {
    let best: H21GoodsListMatch | null = null;
    for (const item of usable) {
      if (usedIds.has(item.id)) continue;
      const score = scoreH21GoodsSimilarity(query, item.description);
      if (score < minScore) continue;
      if (!best || score > best.score) {
        best = { query, catalogItem: item, score };
      }
    }
    if (best) {
      usedIds.add(best.catalogItem.id);
      matches.push(best);
      if (matches.length >= maxMatches) break;
    } else {
      unmatched.push(query);
    }
  }

  return { matches, unmatched };
}

/** Pipeline: queries + catalog + KG → dòng invoice. */
export function buildH21InvoiceLinesFromGoodsList(opts: {
  queries: readonly string[];
  catalog: readonly ScscH21CatalogItem[];
  grossKg: number;
  cargoFamily?: H21CargoFamilyId;
  minScore?: number;
  maxMatches?: number;
  rng?: () => number;
  coverage?: { minCoverage?: number; maxCoverage?: number };
}): H21GoodsListImportResult {
  const { matches, unmatched } = matchH21GoodsListToCatalog(opts.queries, opts.catalog, {
    minScore: opts.minScore,
    cargoFamily: opts.cargoFamily,
    maxMatches: opts.maxMatches,
  });
  if (!matches.length) {
    const err = new Error(
      "Không khớp được mặt hàng nào trong catalog H21 — kiểm tra list hoặc nhóm hàng"
    );
    (err as Error & { code?: string }).code = "SCSC_H21_LIST_NO_MATCH";
    throw err;
  }
  const lines = allocateH21InvoiceLinesFromItems({
    items: matches.map((m) => m.catalogItem),
    grossKg: opts.grossKg,
    rng: opts.rng,
    coverage: opts.coverage ?? { minCoverage: 0.78, maxCoverage: 0.92 },
  }) as ScscH21InvoiceLine[];
  return {
    queries: [...opts.queries],
    matches,
    unmatched,
    lines,
  };
}

export async function importH21GoodsListToInvoiceLines(opts: {
  buf: ArrayBuffer;
  fileName: string;
  catalog: readonly ScscH21CatalogItem[];
  grossKg: number;
  cargoFamily?: H21CargoFamilyId;
}): Promise<H21GoodsListImportResult> {
  const queries = await parseH21GoodsListFile(opts.buf, opts.fileName);
  if (!queries.length) {
    const err = new Error("Không đọc được tên hàng từ file — cần cột mô tả / mỗi dòng một mặt hàng");
    (err as Error & { code?: string }).code = "SCSC_H21_LIST_EMPTY";
    throw err;
  }
  return buildH21InvoiceLinesFromGoodsList({
    queries,
    catalog: opts.catalog,
    grossKg: opts.grossKg,
    cargoFamily: opts.cargoFamily,
  });
}
