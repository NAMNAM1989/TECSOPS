/**
 * Tải tab Google Sheet công khai qua gviz (không cần API key khi file share link).
 */

import {
  getCachedSessionTab,
  getCachedTabList,
  setCachedSessionTab,
  setCachedTabList,
} from "./sheetFetchCache.mjs";

const MONTHS3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTHS_FULL = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

function gvizCellValue(cell) {
  if (!cell || cell.v == null) return "";
  if (typeof cell.v === "number" && cell.f && String(cell.f).startsWith("=HYPERLINK")) {
    return String(cell.v);
  }
  return String(cell.v).replace(/\r\n/g, "\n").trim();
}

function parseGvizPayload(text, sheetLabel) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Phản hồi Google Sheet không hợp lệ.");
  }

  let payload;
  try {
    payload = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Không parse được JSON từ Google Sheet.");
  }

  if (payload.status === "error") {
    const msg = payload.errors?.[0]?.detailed_message || payload.errors?.[0]?.message || "unknown";
    throw new Error(`Google Sheet «${sheetLabel}»: ${msg}`);
  }

  const rawRows = payload.table?.rows ?? [];
  let colCount = 12;
  for (const row of rawRows) {
    colCount = Math.max(colCount, row.c?.length ?? 0);
  }

  return rawRows.map((row, rowIndex) => {
    const cells = [];
    const len = Math.max(colCount, row.c?.length ?? 0, 12);
    for (let i = 0; i < len; i++) {
      cells.push(gvizCellValue(row.c?.[i]));
    }
    return { rowIndex, cells };
  });
}

/** Chỉ cột A–L + đủ hàng booking — nhỏ hơn payload gviz full sheet. */
export const BOOK_SHEET_GVIZ_RANGE = "A1:L280";

function normGridText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Nhận diện layout BOOK HẰNG NGÀY — tránh dùng nhầm tab mặc định của gviz. */
export function isLikelyBookHangNgayGrid(grid) {
  if (!Array.isArray(grid) || grid.length < 8) return false;
  for (const row of grid) {
    const cells = row.cells ?? [];
    const joined = normGridText(cells.join(" "));
    if (joined.includes("cap nhat danh sach hang len san bay")) return true;
    if (normGridText(cells[0] ?? "") === "vlc-tecs" || joined.includes("vlc-tecs")) return true;
    const awbHeader = normGridText(cells[1] ?? cells[0] ?? "");
    if (awbHeader.includes("awb") && awbHeader.includes("booking")) return true;
  }
  return false;
}

async function fetchGviz(spreadsheetId, params) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq`);
  url.searchParams.set("tqx", "out:json");
  const { range = BOOK_SHEET_GVIZ_RANGE, ...rest } = params;
  if (range) url.searchParams.set("range", range);
  for (const [k, v] of Object.entries(rest)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "TECSOPS/1.0", Accept: "application/json,text/plain,*/*" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Không đọc được Google Sheet (HTTP ${res.status}).`);
  }
  return res.text();
}

/** @returns {{ gid: string, title: string }[]} */
export async function listPublicBookSheetTabs(spreadsheetId) {
  const id = String(spreadsheetId ?? "").trim();
  if (!id) return [];

  const url = `https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`;
  const res = await fetch(url, {
    headers: { "User-Agent": "TECSOPS/1.0" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) return [];

  const html = await res.text();
  /** @type {Map<string, string>} */
  const byGid = new Map();

  const metaRe = /\[(?:0|1),0,\\"(\d+)\\",\[\{\\"1\\":\[\[0,0,\\"([^\\"]+)/g;
  let m;
  while ((m = metaRe.exec(html))) {
    byGid.set(m[1], m[2].trim());
  }

  const captions = [...html.matchAll(/docs-sheet-tab-caption">([^<]+)</g)].map((x) =>
    x[1].replace(/\s+/g, " ").trim()
  );
  for (const title of captions) {
    if (!title || ![...byGid.values()].includes(title)) {
      // caption-only — giữ để resolve tên tab dù thiếu gid
      if (![...byGid.values()].includes(title)) {
        byGid.set(`name:${title}`, title);
      }
    }
  }

  /** @type {{ gid: string, title: string }[]} */
  const out = [];
  const seenTitle = new Set();
  for (const [gid, title] of byGid) {
    if (!title || seenTitle.has(title)) continue;
    seenTitle.add(title);
    out.push({ gid: gid.startsWith("name:") ? "" : gid, title });
  }
  for (const title of captions) {
    if (!title || seenTitle.has(title)) continue;
    seenTitle.add(title);
    out.push({ gid: "", title });
  }
  return out;
}

async function loadTabList(spreadsheetId, listTabsFn) {
  const cached = getCachedTabList(spreadsheetId);
  if (cached) return cached;
  const tabs = await listTabsFn(spreadsheetId);
  setCachedTabList(spreadsheetId, tabs);
  return tabs;
}

function resolveTabFromList(tabs, candidates, sessionYmd) {
  const normCandidates = candidates.map((c) => ({ raw: c, norm: normalizeTabTitle(c) }));

  /** @type {{ title: string, gid: string } | null} */
  let resolved = null;
  for (const cand of normCandidates) {
    const hit = tabs.find((t) => normalizeTabTitle(t.title) === cand.norm);
    if (hit) {
      resolved = { title: hit.title, gid: hit.gid };
      break;
    }
  }

  if (!resolved) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(sessionYmd).trim());
    if (m) {
      const day = Number(m[3]);
      const mmm = MONTHS3[Number(m[2]) - 1];
      const hit = tabs.find((t) => {
        const compact = normalizeTabTitle(t.title).replace(/\s+/g, "");
        const dm = compact.match(
          /(?:^|\D)(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\d{2,4})?(?:\D|$)/
        );
        if (!dm) return false;
        return Number(dm[1]) === day && dm[2] === mmm;
      });
      if (hit) resolved = { title: hit.title, gid: hit.gid };
    }
  }

  return resolved;
}

async function fetchResolvedBookGrid(id, resolved, fetchByGid, fetchByName) {
  const grid = resolved.gid
    ? await fetchByGid(id, resolved.gid)
    : await fetchByName(id, resolved.title);
  return grid;
}

function cacheResolvedSessionTab(id, sessionYmd, resolved) {
  setCachedSessionTab(id, sessionYmd, { gid: resolved.gid, title: resolved.title });
}

function normalizeTabTitle(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Tab «NGÀY 13 JUL» từ sessionDate «2026-07-13».
 * @param {string} sessionYmd
 */
export function sessionYmdToBookSheetTab(sessionYmd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(sessionYmd ?? "").trim());
  if (!m) throw new Error("sessionDate phải dạng YYYY-MM-DD.");
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("sessionDate không hợp lệ.");
  }
  return `NGÀY ${day} ${MONTHS3[month - 1]}`;
}

/** Các biến thể tên tab để thử khi resolve. */
export function bookSheetTabCandidates(sessionYmd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(sessionYmd ?? "").trim());
  if (!m) return [];
  const year = m[1];
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return [];
  const mmm = MONTHS3[month - 1];
  const full = MONTHS_FULL[month - 1];
  const primary = `NGÀY ${day} ${mmm}`;
  return [
    primary,
    `NGAY ${day} ${mmm}`,
    `${day}${mmm}`,
    `${day} ${mmm}`,
    `${day}${full}${year}`,
    `${day}${full}`,
  ];
}

/**
 * @param {string} spreadsheetId
 * @param {string} sheetName
 */
export async function fetchGoogleSheetGrid(spreadsheetId, sheetName) {
  const id = String(spreadsheetId ?? "").trim();
  const sheet = String(sheetName ?? "").trim();
  if (!id || !sheet) throw new Error("Thiếu spreadsheetId hoặc tên tab Sheet.");

  const text = await fetchGviz(id, { sheet });
  return parseGvizPayload(text, sheet);
}

/**
 * @param {string} spreadsheetId
 * @param {string} gid
 */
export async function fetchGoogleSheetGridByGid(spreadsheetId, gid) {
  const id = String(spreadsheetId ?? "").trim();
  const g = String(gid ?? "").trim();
  if (!id || !g) throw new Error("Thiếu spreadsheetId hoặc gid Sheet.");

  const text = await fetchGviz(id, { gid: g });
  return parseGvizPayload(text, `gid=${g}`);
}

/**
 * Resolve tab theo ngày phiên (vd. 2026-07-13 → «NGÀY 13 JUL»), ưu tiên khớp danh sách tab công khai.
 * @returns {Promise<{ grid: { rowIndex: number, cells: string[] }[], sheetTab: string, gid: string }>}
 */
/**
 * Resolve tab theo ngày phiên (vd. 2026-07-13 → «NGÀY 13 JUL»), ưu tiên khớp danh sách tab công khai.
 * @param {string} spreadsheetId
 * @param {string} sessionYmd
 * @param {string} [preferredTab]
 * @param {{ listTabs?: (id: string) => Promise<{ gid: string, title: string }[]>, fetchByGid?: Function, fetchByName?: Function }} [deps]
 * @returns {Promise<{ grid: { rowIndex: number, cells: string[] }[], sheetTab: string, gid: string }>}
 */
export async function fetchBookHangNgayGridForSession(
  spreadsheetId,
  sessionYmd,
  preferredTab = "",
  deps = {}
) {
  const id = String(spreadsheetId ?? "").trim();
  if (!id) throw new Error("Thiếu spreadsheetId.");

  const listTabs = deps.listTabs ?? listPublicBookSheetTabs;
  const fetchByGid = deps.fetchByGid ?? fetchGoogleSheetGridByGid;
  const fetchByName = deps.fetchByName ?? fetchGoogleSheetGrid;
  const useProductionFastPath = listTabs === listPublicBookSheetTabs;

  const sessionCandidates = bookSheetTabCandidates(sessionYmd);
  if (!sessionCandidates.length) throw new Error("sessionDate phải dạng YYYY-MM-DD.");

  const preferred = String(preferredTab ?? "").trim();
  const preferredNorm = preferred ? normalizeTabTitle(preferred) : "";
  const sessionNorms = new Set(sessionCandidates.map((c) => normalizeTabTitle(c)));

  const preferredOk = Boolean(preferred && sessionNorms.has(preferredNorm));
  const candidates = preferredOk
    ? [preferred, ...sessionCandidates.filter((c) => normalizeTabTitle(c) !== preferredNorm)]
    : sessionCandidates;

  const primary = sessionCandidates[0];

  const sessionCached = getCachedSessionTab(id, sessionYmd);
  if (sessionCached && (sessionCached.gid || sessionCached.title)) {
    const resolved = { title: sessionCached.title || primary, gid: sessionCached.gid };
    const grid = await fetchResolvedBookGrid(id, resolved, fetchByGid, fetchByName);
    if (isLikelyBookHangNgayGrid(grid)) {
      return { grid, sheetTab: resolved.title, gid: resolved.gid };
    }
  }

  if (useProductionFastPath) {
    const tabsPromise = loadTabList(id, listTabs);
    let directGrid = null;
    try {
      directGrid = await fetchByName(id, primary);
    } catch {
      directGrid = null;
    }
    if (directGrid && isLikelyBookHangNgayGrid(directGrid)) {
      void tabsPromise
        .then((tabs) => {
          const hit = resolveTabFromList(tabs, candidates, sessionYmd);
          if (hit) cacheResolvedSessionTab(id, sessionYmd, hit);
          else cacheResolvedSessionTab(id, sessionYmd, { title: primary, gid: "" });
        })
        .catch(() => {
          cacheResolvedSessionTab(id, sessionYmd, { title: primary, gid: "" });
        });
      return { grid: directGrid, sheetTab: primary, gid: "" };
    }
  }

  let tabs = [];
  try {
    tabs = await loadTabList(id, listTabs);
  } catch {
    tabs = [];
  }

  const resolved = resolveTabFromList(tabs, candidates, sessionYmd);

  if (resolved?.gid || resolved?.title) {
    cacheResolvedSessionTab(id, sessionYmd, resolved);
    const grid = await fetchResolvedBookGrid(id, resolved, fetchByGid, fetchByName);
    return { grid, sheetTab: resolved.title, gid: resolved.gid };
  }

  const available = tabs.map((t) => t.title).filter(Boolean);
  if (tabs.length > 0) {
    const hint = available.length
      ? ` Có tab: ${available.slice(0, 12).join(", ")}${available.length > 12 ? "…" : ""}.`
      : "";
    throw new Error(
      `Không có tab Sheet cho ngày ${sessionYmd}. Kỳ vọng «${primary}».${hint}`
    );
  }

  throw new Error(
    `Không đọc được danh sách tab Sheet và không tìm thấy «${primary}» cho ngày ${sessionYmd}. Kiểm tra link share công khai.`
  );
}

export function getBookSpreadsheetId() {
  return (
    process.env.GOOGLE_SHEETS_BOOK_SPREADSHEET_ID?.trim() ||
    "15EHqZuuYznL2_VkCnpENHgc_mmBTSJGgrNG3iv5ZvA4"
  );
}
