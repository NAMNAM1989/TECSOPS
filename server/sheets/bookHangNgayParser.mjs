import { formatAwb, awbDigitsKey } from "./awbFormat.mjs";

const WAREHOUSES = new Set(["TECS-TCS", "TECS-SCSC", "TCS", "SCSC"]);

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
 * @property {number|null} dimWeightKg
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
  if (h.includes("cutoff") || (h.includes("note") && !h.includes("ghi chu"))) return "cutoff";
  if (h === "dest" || h.startsWith("dest")) return "dest";
  if (h.includes("kho hang")) return "warehouse";
  if (h.includes("kien") && h.includes("kg")) return "pcsKg";
  if (h.includes("khach hang")) return "customer";
  if (h.includes("cnne") || h.includes("cnee") || h.includes("consignee")) return "consignee";
  if (h.includes("ghi chu") || h === "note" || h === "notes") return "note";
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

/**
 * Layout BOOK HẰNG NGÀY hiện tại (A–L):
 * B=AWB, C=chuyến, D=cutoff, E=dest, F=kho, G=kiện/kg, H=khách, I=shipper, J=CNEE, L=ghi chú.
 */
const STANDARD_BOOK_COLS = {
  awb: 1,
  flightDate: 2,
  cutoff: 3,
  dest: 4,
  warehouse: 5,
  pcsKg: 6,
  customer: 7,
  consignee: 9,
  note: 11,
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
    const datePart = slashParts[slashParts.length - 1].replace(/\s+/g, "");
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

/**
 * Số cân trên Sheet có thể là `1234`, `1,234` (nghìn), `65,5` hoặc `1.234,5` (EU).
 * Dấu phân tách thập phân là dấu cuối cùng khi nhóm sau nó không đủ 3 chữ số.
 */
function parseSheetNumber(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const lastSep = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if (lastSep < 0) {
    const plain = Number(t);
    return Number.isFinite(plain) ? plain : null;
  }
  const tail = t.slice(lastSep + 1);
  const isThousandsGroup = /^\d{3}$/.test(tail) && !/^\d{1,2}$/.test(tail);
  const normalized = isThousandsGroup
    ? t.replace(/[.,]/g, "")
    : `${t.slice(0, lastSep).replace(/[.,]/g, "")}.${tail}`;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** `xx/yy` hoặc `xx/yy/zz` → pcs / kg / dim (nếu có). */
function parsePcsKg(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return { pcs: null, kg: null, dimWeightKg: null };
  const m = t.match(/^(\d+)\s*[/\\]\s*([\d.,]+)(?:\s*[/\\]\s*([\d.,]+))?/);
  if (!m) return { pcs: null, kg: null, dimWeightKg: null };
  const pcs = Number(m[1]);
  return {
    pcs: Number.isFinite(pcs) ? pcs : null,
    kg: parseSheetNumber(m[2]),
    dimWeightKg: m[3] != null && m[3] !== "" ? parseSheetNumber(m[3]) : null,
  };
}

export function mapSheetWarehouse(raw, blockDefault = "TECS-TCS") {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");

  // Exact-match 4 kho (TCS/SCSC ≠ TECS-*).
  if (WAREHOUSES.has(u)) return u;
  // Legacy alias → hub TECS.
  if (u === "KHO-SCSC") return "TECS-SCSC";
  if (u === "KHO-TCS") return "TECS-TCS";
  // Biến thể Sheet cũ (LX-*, …) → hub; không đụng exact TCS/SCSC (đã return ở trên).
  if (u.includes("SCSC") || u.includes("SCCS")) return "TECS-SCSC";
  if (u.includes("TCS")) return "TECS-TCS";
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

/** Chỉ lấy MAWB — bỏ dòng/phần HAWB trong cùng ô. */
function mawbRawFromCell(raw) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const withoutHawbBlock = text.replace(/\n?\s*hawb\s*[:：]?.*/gi, "").trim();
  const firstLine = withoutHawbBlock.split(/\n/)[0]?.trim() ?? "";
  return firstLine;
}

/** Số chữ số tối thiểu để coi ô là "có ý định ghi AWB" (không phải STT / ô rác). */
const AWB_CELL_MIN_DIGITS = 8;

/**
 * AWB chỉ hợp lệ khi đủ 11 chữ số (3 prefix + 8 số).
 *
 * Ô 8–10 số là AWB ghi thiếu: vẫn nhận dòng để Ops thấy và sửa, nhưng KHÔNG lưu mã què —
 * assertAwbUnique bỏ qua mã < 11 số nên AWB thiếu sẽ lọt qua kiểm tra trùng,
 * đồng thời chặn lô lên RECEIVED/VOLUME_DONE và bị eSID/TCS từ chối.
 *
 * @returns {{ awb: string, hasAwbCell: boolean }}
 */
function awbFromCells(cells, awbIdx) {
  const raw = mawbRawFromCell(cells[awbIdx]);
  const digits = awbDigitsKey(raw);
  if (digits.length < AWB_CELL_MIN_DIGITS) return { awb: "", hasAwbCell: false };
  if (digits.length < 11) return { awb: "", hasAwbCell: true };
  return { awb: formatAwb(digits), hasAwbCell: true };
}

/** Cột H — chỉ lấy dòng đầu nếu ô có xuống dòng. */
function customerFromCell(raw) {
  return String(raw ?? "")
    .split(/\r?\n/)[0]
    .trim();
}

/**
 * Ghi chú cột L. gviz không trả màu chữ — lấy toàn bộ text không rỗng.
 * (Yêu cầu «chữ đỏ» cần Sheets API có format; tạm thời lấy nội dung cột L.)
 */
function noteFromCell(raw) {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, 500);
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
      // Chỉ đổi blockDefault / tiêu đề khối — KHÔNG xóa colMap.
      // Sheet thật thường không lặp header sau dòng tiêu đề giữa TCS↔SCSC;
      // xóa colMap sẽ làm mất toàn bộ dòng SCSC phía sau.
      blockDefault = titleKind;
      blockTitle =
        cells.find((c) => normHeader(c).includes("cap nhat danh sach"))?.trim() ||
        cells[0]?.trim() ||
        blockDefault;
      continue;
    }

    const header = parseHeaderMap(cells);
    if (header) {
      colMap = mergeStandardBookCols(header);
      continue;
    }

    if (isSkippableRow(cells)) continue;

    // Tab BOOK mới có thể không còn hàng header (data từ dòng 1).
    // Khi thấy ô AWB hợp lệ → dùng layout cột chuẩn A–L.
    if (!colMap) {
      const probe = awbFromCells(cells, STANDARD_BOOK_COLS.awb);
      if (!probe.hasAwbCell) continue;
      colMap = { ...STANDARD_BOOK_COLS };
    }

    // Chỉ cần dòng nằm sau header AWB đã nhận diện (hoặc layout chuẩn).
    // Không khóa theo số dòng Excel: layout BOOK có thể dịch lên/xuống giữa các tab.
    const { awb, hasAwbCell } = awbFromCells(cells, colMap.awb);
    if (!hasAwbCell) continue;

    const { flight, flightDate } = parseFlightDate(cells[colMap.flightDate ?? -1] ?? "");
    const { cutoff, cutoffNote } = parseCutoff(cells[colMap.cutoff ?? -1] ?? "");
    const dest = String(cells[colMap.dest ?? -1] ?? "").trim().toUpperCase();
    const warehouse = mapSheetWarehouse(cells[colMap.warehouse ?? -1] ?? "", blockDefault);
    const { pcs, kg, dimWeightKg } = parsePcsKg(cells[colMap.pcsKg ?? -1] ?? "");
    const customer = customerFromCell(cells[colMap.customer ?? -1] ?? "");
    const consigneeNamePrint = String(cells[colMap.consignee ?? -1] ?? "")
      .trim()
      .slice(0, 2000);
    const note = noteFromCell(cells[colMap.note ?? 11] ?? "");

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
      dimWeightKg,
      customer,
      consigneeNamePrint,
      note,
      sheetRowIndex: rowIndex,
      blockTitle: blockTitle || blockDefault,
    });
  }

  void sessionDate;
  return out;
}

export { awbDigitsKey, parsePcsKg, mawbRawFromCell };
