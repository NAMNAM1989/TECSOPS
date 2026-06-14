/**
 * Tải tab Google Sheet công khai qua gviz (không cần API key khi file share link).
 */
export async function fetchGoogleSheetGrid(spreadsheetId, sheetName) {
  const id = String(spreadsheetId ?? "").trim();
  const sheet = String(sheetName ?? "").trim();
  if (!id || !sheet) throw new Error("Thiếu spreadsheetId hoặc tên tab Sheet.");

  const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq`);
  url.searchParams.set("tqx", "out:json");
  url.searchParams.set("sheet", sheet);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "TECSOPS/1.0" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`Không đọc được Google Sheet (HTTP ${res.status}). Kiểm tra link share và tên tab «${sheet}».`);
  }

  const text = await res.text();
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
    throw new Error(`Google Sheet: ${msg}`);
  }

  const rawRows = payload.table?.rows ?? [];
  let colCount = 10;
  for (const row of rawRows) {
    colCount = Math.max(colCount, row.c?.length ?? 0);
  }

  return rawRows.map((row, rowIndex) => {
    const cells = [];
    const len = Math.max(colCount, row.c?.length ?? 0, 10);
    for (let i = 0; i < len; i++) {
      cells.push(gvizCellValue(row.c?.[i]));
    }
    return { rowIndex, cells };
  });
}

function gvizCellValue(cell) {
  if (!cell || cell.v == null) return "";
  if (typeof cell.v === "number" && cell.f && String(cell.f).startsWith("=HYPERLINK")) {
    return String(cell.v);
  }
  return String(cell.v).replace(/\r\n/g, "\n").trim();
}

/** Tab «13JUNE2026» từ sessionDate «2026-06-13». */
export function sessionYmdToBookSheetTab(sessionYmd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(sessionYmd ?? "").trim());
  if (!m) throw new Error("sessionDate phải dạng YYYY-MM-DD.");
  const year = m[1];
  const month = Number(m[2]);
  const day = Number(m[3]);
  const names = [
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
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("sessionDate không hợp lệ.");
  }
  return `${day}${names[month - 1]}${year}`;
}

export function getBookSpreadsheetId() {
  return (
    process.env.GOOGLE_SHEETS_BOOK_SPREADSHEET_ID?.trim() ||
    "14wnnHgFvQRGvcOPjz7c1PsOO5fun5z6Z"
  );
}
