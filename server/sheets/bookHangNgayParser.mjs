import { formatAwb, awbDigitsKey } from "./awbFormat.mjs";

const WAREHOUSES = new Set(["TECS-TCS", "TECS-SCSC", "KHO-TCS", "KHO-SCSC"]);

/**
 * @typedef {Object} ParsedBookRow
 * @property {string} awb
 * @property {string} flight
 * @property {string} flightDate
 * @property {string} cutoff
 * @property {string} cutoffNote
 * @property {string} dest
 * @property {import('../../src/types/shipment.ts').Warehouse} warehouse
 * @property {number|null} pcs
 * @property {number|null} kg
 * @property {string} customer
 * @property {string} consigneeNamePrint
 * @property {string} note
 * @property {number} sheetRowIndex
 * @property {string} blockTitle
 */

function normHeader(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeAwbDataCell(label) {
  const h = normHeader(label);
  if (!h) return false;
  if (/\d{3}[-\s]?\d/.test(h)) return true;
  if (/\bhawb\b/.test(h)) return true;
  return false;
}

function looksLikeAwbHeader(label) {
  const h = normHeader(label);
  if (!h || looksLikeAwbDataCell(label)) return false;
  if (h.includes("awb") && h.includes("booking")) return true;
  if (h === "awb" || h.startsWith("awb/") || h.startsWith("awb ")) return true;
  return false;
}

function headerKind(label) {
  const h = normHeader(label);
  if (!h) return null;
  if (looksLikeAwbHeader(label)) return "awb";
  if (h.includes("chuyen bay") || h.includes("ngay bay")) return "flightDate";
  if (h.includes("cutoff") || h.includes("note")) return "cutoff";
  if (h === "dest" || h.startsWith("dest")) return "dest";
  if (h.includes("kho hang")) return "warehouse";
  if (h.includes("kien") && h.includes("kg")) return "pcsKg";
  if (h.includes("khach hang")) return "customer";
  if (h.includes("cnne") || h.includes("consignee")) return "consignee";
  if (h === "stt") return "stt";
  return null;
}

/** @returns {Record<string, number> | null} */
function parseHeaderMap(cells) {
  const map = {};
  for (let i = 0; i < cells.length; i++) {
    const kind = headerKind(cells[i]);
    if (kind && kind !== "stt" && map[kind] == null) map[kind] = i;
  }
  if (map.awb == null) return null;
  const requiredPeer = ["warehouse", "customer", "flightDate", "dest", "cutoff", "pcsKg", "consignee"];
  if (!requiredPeer.some((key) => map[key] != null)) return null;
  return map;
}

/** Layout 9 cột chuẩn BOOK HẰNG NGÀY (A–I): F=kho, H=khách. */
const STANDARD_BOOK_COLS = {
  awb: 1,
  flightDate: 2,
  cutoff: 3,
  dest: 4,
  warehouse: 5,
  pcsKg: 6,
  customer: 7,
  consignee: 8,
};

function mergeStandardBookCols(map) {
  if (!map) return null;
  return { ...STANDARD_BOOK_COLS, ...map };
}

function parseFlightDate(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return { flight: "", flightDate: "" };
  const slashParts = t.split("/").map((p) => p.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    const datePart = slashParts[slashParts.length - 1];
    const flightPart = slashParts.slice(0, -1).join("");
    const flight = flightPart.replace(/\s+/g, "").toUpperCase();
    const flightDate = /^\d{1,2}[A-Z]{3}$/i.test(datePart) ? datePart.toUpperCase() : "";
    return { flight, flightDate };
  }
  return { flight: t.toUpperCase(), flightDate: "" };
}

function parseCutoff(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return { cutoff: "", cutoffNote: "" };
  const m = t.match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(.+)$/);
  if (m) return { cutoff: m[1], cutoffNote: m[2].trim() };
  if (/^\d{1,2}:\d{2}$/.test(t)) return { cutoff: t, cutoffNote: "" };
  return { cutoff: "", cutoffNote: t };
}

function parsePcsKg(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return { pcs: null, kg: null };
  const m = t.match(/^(\d+)\s*[/\\]\s*([\d.,]+)/);
  if (!m) return { pcs: null, kg: null };
  const pcs = Number(m[1]);
  const kg = Number(m[2].replace(",", "."));
  return {
    pcs: Number.isFinite(pcs) ? pcs : null,
    kg: Number.isFinite(kg) ? kg : null,
  };
}

export function mapSheetWarehouse(raw, blockDefault = "TECS-TCS") {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");

  if (WAREHOUSES.has(u)) return u;
  if (u.includes("KHO") && u.includes("SCSC")) return "KHO-SCSC";
  if (u.includes("KHO") && u.includes("TCS")) return "KHO-TCS";
  if (u.includes("SCSC") || u.includes("SCCS")) return "TECS-SCSC";
  if (u.includes("TCS") || u === "LX-TCS") return "TECS-TCS";
  if (u === "SCSC") return "TECS-SCSC";
  return blockDefault;
}

function isTitleRow(cells) {
  const joined = normHeader(cells.join(" "));
  if (joined.includes("cap nhat danh sach hang len san bay")) return "TECS-SCSC";
  if (cells[0]?.toUpperCase() === "VLC-TECS" || joined.includes("vlc-tecs")) return "TECS-TCS";
  return null;
}

function isSkippableRow(cells) {
  const a = normHeader(cells[0] ?? cells[1] ?? "");
  if (a.includes("don phi mau dich")) return true;
  if (cells.every((c) => !String(c).trim())) return true;
  return false;
}

function awbFromCells(cells, awbIdx) {
  const raw = String(cells[awbIdx] ?? "").trim();
  const digits = awbDigitsKey(raw);
  if (digits.length < 8) return "";
  return formatAwb(digits);
}

/** Cột H — chỉ lấy dòng đầu nếu ô có xuống dòng. */
function customerFromCell(raw) {
  return String(raw ?? "")
    .split(/\r?\n/)[0]
    .trim();
}

/**
 * @param {{ rowIndex: number, cells: string[] }[]} gridRows
 * @param {string} sessionDate YYYY-MM-DD
 * @returns {ParsedBookRow[]}
 */
export function parseBookHangNgayGrid(gridRows, sessionDate) {
  /** @type {ParsedBookRow[]} */
  const out = [];
  let blockDefault = "TECS-TCS";
  let blockTitle = "";
  /** @type {Record<string, number> | null} */
  let colMap = null;

  for (const { rowIndex, cells } of gridRows) {
    const titleKind = isTitleRow(cells);
    if (titleKind) {
      blockDefault = titleKind;
      blockTitle =
        cells.find((c) => normHeader(c).includes("cap nhat danh sach"))?.trim() ||
        cells[0]?.trim() ||
        blockDefault;
      colMap = null;
      continue;
    }

    const header = parseHeaderMap(cells);
    if (header) {
      colMap = mergeStandardBookCols(header);
      continue;
    }

    if (!colMap || isSkippableRow(cells)) continue;

    const awb = awbFromCells(cells, colMap.awb);
    if (!awb) continue;

    const { flight, flightDate } = parseFlightDate(cells[colMap.flightDate ?? -1] ?? "");
    const { cutoff, cutoffNote } = parseCutoff(cells[colMap.cutoff ?? -1] ?? "");
    const dest = String(cells[colMap.dest ?? -1] ?? "").trim().toUpperCase();
    const warehouse = mapSheetWarehouse(cells[colMap.warehouse ?? -1] ?? "", blockDefault);
    const { pcs, kg } = parsePcsKg(cells[colMap.pcsKg ?? -1] ?? "");
    const customer = customerFromCell(cells[colMap.customer ?? -1] ?? "");
    const consigneeNamePrint = String(cells[colMap.consignee ?? -1] ?? "")
      .trim()
      .slice(0, 2000);
    const noteParts = [];
    if (cutoffNote) noteParts.push(cutoffNote);
    if (consigneeNamePrint && consigneeNamePrint.length < 120) {
      noteParts.push(`CNNE: ${consigneeNamePrint.slice(0, 80)}`);
    }

    out.push({
      awb,
      flight,
      flightDate,
      cutoff,
      cutoffNote,
      dest,
      warehouse,
      pcs,
      kg,
      customer,
      consigneeNamePrint,
      note: noteParts.join(" · ").slice(0, 500),
      sheetRowIndex: rowIndex,
      blockTitle: blockTitle || blockDefault,
    });
  }

  void sessionDate;
  return out;
}

export { awbDigitsKey };
