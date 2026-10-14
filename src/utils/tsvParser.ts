/**
 * Parser cho dữ liệu bảng tính TSV (Tab-Separated Values) từ Excel / Google Sheets
 * Hỗ trợ ô có dấu ngoặc kép, tab bên trong ô, xuống dòng trong ô (CRLF / LF).
 */

export function parseTsv(text: string): string[][] {
  const result: string[][] = [];
  if (!text || text.trim() === "") return result;

  let row: string[] = [];
  let currentCell = "";
  let insideQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Double quote bên trong ô đã quote -> 1 quote
        currentCell += '"';
        i += 2;
        continue;
      } else {
        // Đảo trạng thái quote
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }
    }

    if (!insideQuotes && char === "\t") {
      row.push(currentCell);
      currentCell = "";
      i++;
      continue;
    }

    if (!insideQuotes && (char === "\r" || char === "\n")) {
      if (char === "\r" && nextChar === "\n") {
        i += 2;
      } else {
        i++;
      }
      row.push(currentCell);
      result.push(row);
      row = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
    i++;
  }

  // Đẩy ô và dòng cuối cùng nếu còn
  if (currentCell !== "" || row.length > 0) {
    row.push(currentCell);
    result.push(row);
  }

  // Loại bỏ dòng rỗng cuối cùng nếu có
  if (result.length > 0) {
    const lastRow = result[result.length - 1];
    if (lastRow.length === 1 && lastRow[0].trim() === "") {
      result.pop();
    }
  }

  return result;
}

/**
 * Xuất dữ liệu mảng 2 chiều thành định dạng TSV chuẩn clipboard
 */
export function formatTsv(grid: string[][]): string {
  return grid
    .map((row) =>
      row
        .map((cell) => {
          if (cell.includes("\t") || cell.includes("\n") || cell.includes('"')) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join("\t")
    )
    .join("\r\n");
}
