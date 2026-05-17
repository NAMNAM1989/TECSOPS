import type { TableCell, TableObject } from "./types";

export function tableCellKey(r: number, c: number): string {
  return `${r}:${c}`;
}

export function isTableCellCovered(table: TableObject, r: number, c: number): boolean {
  const cell = table.cells[tableCellKey(r, c)];
  if (cell?.colSpan === 0 || cell?.rowSpan === 0) return true;

  for (let rr = 0; rr < table.rows; rr++) {
    for (let cc = 0; cc < table.cols; cc++) {
      if (rr === r && cc === c) continue;
      const master = table.cells[tableCellKey(rr, cc)];
      if (!master || master.colSpan === 0 || master.rowSpan === 0) continue;
      const rs = master.rowSpan ?? 1;
      const cs = master.colSpan ?? 1;
      if (r >= rr && r < rr + rs && c >= cc && c < cc + cs) return true;
    }
  }
  return false;
}

export function getTableMasterCell(table: TableObject, r: number, c: number): { r: number; c: number } {
  if (!isTableCellCovered(table, r, c)) return { r, c };
  for (let rr = 0; rr < table.rows; rr++) {
    for (let cc = 0; cc < table.cols; cc++) {
      const master = table.cells[tableCellKey(rr, cc)];
      if (!master || master.colSpan === 0) continue;
      const rs = master.rowSpan ?? 1;
      const cs = master.colSpan ?? 1;
      if (r >= rr && r < rr + rs && c >= cc && c < cc + cs) return { r: rr, c: cc };
    }
  }
  return { r, c };
}

/** Gộp vùng ô [r1,c1]..[r2,c2] thành một ô master. */
export function mergeTableCells(
  table: TableObject,
  r1: number,
  c1: number,
  r2: number,
  c2: number
): TableObject {
  const minR = Math.max(0, Math.min(r1, r2));
  const maxR = Math.min(table.rows - 1, Math.max(r1, r2));
  const minC = Math.max(0, Math.min(c1, c2));
  const maxC = Math.min(table.cols - 1, Math.max(c1, c2));
  const cells = { ...table.cells };
  const masterKey = tableCellKey(minR, minC);
  const master: TableCell = { ...(cells[masterKey] ?? { text: "" }) };
  master.rowSpan = maxR - minR + 1;
  master.colSpan = maxC - minC + 1;
  cells[masterKey] = master;

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (r === minR && c === minC) continue;
      cells[tableCellKey(r, c)] = { text: "", colSpan: 0, rowSpan: 0 };
    }
  }
  return { ...table, cells };
}

export function unmergeTableCell(table: TableObject, r: number, c: number): TableObject {
  const { r: mr, c: mc } = getTableMasterCell(table, r, c);
  const master = table.cells[tableCellKey(mr, mc)];
  if (!master || (master.rowSpan ?? 1) === 1 && (master.colSpan ?? 1) === 1) return table;

  const cells = { ...table.cells };
  const rs = master.rowSpan ?? 1;
  const cs = master.colSpan ?? 1;
  cells[tableCellKey(mr, mc)] = { ...master, rowSpan: 1, colSpan: 1 };
  for (let r2 = mr; r2 < mr + rs; r2++) {
    for (let c2 = mc; c2 < mc + cs; c2++) {
      if (r2 === mr && c2 === mc) continue;
      cells[tableCellKey(r2, c2)] = { text: "" };
    }
  }
  return { ...table, cells };
}

export function setTableColWidth(table: TableObject, col: number, widthMm: number): TableObject {
  const colWidths = [...table.colWidths];
  colWidths[col] = Math.max(4, widthMm);
  return { ...table, colWidths, width: colWidths.reduce((a, b) => a + b, 0) };
}

export function setTableRowHeight(table: TableObject, row: number, heightMm: number): TableObject {
  const rowHeights = [...table.rowHeights];
  rowHeights[row] = Math.max(3, heightMm);
  return { ...table, rowHeights, height: rowHeights.reduce((a, b) => a + b, 0) };
}

export function setTableBorder(table: TableObject, borderWidth: number, borderColor?: string): TableObject {
  return {
    ...table,
    borderWidth: Math.max(0.05, borderWidth),
    ...(borderColor !== undefined ? { borderColor } : {}),
  };
}

export function distributeTableColWidths(table: TableObject, totalWidthMm?: number): TableObject {
  const w = totalWidthMm ?? table.width;
  const each = w / table.cols;
  const colWidths = Array.from({ length: table.cols }, () => each);
  return { ...table, colWidths, width: w };
}

export function distributeTableRowHeights(table: TableObject, totalHeightMm?: number): TableObject {
  const h = totalHeightMm ?? table.height;
  const each = h / table.rows;
  const rowHeights = Array.from({ length: table.rows }, () => each);
  return { ...table, rowHeights, height: h };
}

export function patchTableCell(table: TableObject, r: number, c: number, patch: Partial<TableCell>): TableObject {
  const { r: mr, c: mc } = getTableMasterCell(table, r, c);
  const key = tableCellKey(mr, mc);
  return {
    ...table,
    cells: {
      ...table.cells,
      [key]: { ...(table.cells[key] ?? { text: "" }), ...patch },
    },
  };
}
