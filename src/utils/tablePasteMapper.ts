import { TABLE_COLUMN_ORDER, type TableGridField, PASTE_CREATES_ROWS } from "../config/tableUx";
import type { Shipment } from "../types/shipment";
import type { ShipmentMutation } from "./shipmentMutations";
import { formatAwb } from "./awbFormat";

export interface PasteChange {
  before: unknown;
  after: unknown;
}

export interface PastePreviewRow {
  rowId: string;
  stt?: number;
  awb: string;
  changes: Record<string, PasteChange>;
}

export interface PastePlan {
  forwardMutations: ShipmentMutation[];
  reverseMutations: ShipmentMutation[];
  affectedRowsCount: number;
  droppedRowsCount: number;
  previewRows: PastePreviewRow[];
}

function parseCellValue(field: TableGridField, raw: string): unknown {
  const trimmed = raw.trim();
  switch (field) {
    case "awb":
      return trimmed ? formatAwb(trimmed) : "";
    case "hawb":
      return trimmed.slice(0, 32);
    case "flight":
      return trimmed.toUpperCase().slice(0, 12);
    case "flightDate":
      return trimmed.toUpperCase().slice(0, 16);
    case "dest":
      return trimmed.toUpperCase().slice(0, 3);
    case "pcs": {
      if (trimmed === "" || trimmed === "—") return null;
      const num = parseInt(trimmed.replace(/[^\d-]/g, ""), 10);
      return Number.isNaN(num) ? null : num;
    }
    case "kg": {
      if (trimmed === "" || trimmed === "—") return null;
      const num = parseFloat(trimmed.replace(/,/g, ".").replace(/[^\d.-]/g, ""));
      return Number.isNaN(num) ? null : num;
    }
    case "dimKg": {
      if (trimmed === "" || trimmed === "—") return null;
      const num = parseFloat(trimmed.replace(/,/g, ".").replace(/[^\d.-]/g, ""));
      return Number.isNaN(num) ? null : num;
    }
    case "customer":
      return trimmed.slice(0, 120);
    case "note":
      return trimmed.slice(0, 2000);
  }
}

export function buildPastePlan(
  tsvGrid: string[][],
  startCell: { rowId: string; field: TableGridField },
  rows: readonly Shipment[],
  fields: readonly TableGridField[] = TABLE_COLUMN_ORDER
): PastePlan {
  const forwardMutations: ShipmentMutation[] = [];
  const reverseMutations: ShipmentMutation[] = [];
  const previewRows: PastePreviewRow[] = [];

  const startRowIdx = rows.findIndex((r) => r.id === startCell.rowId);
  const startFieldIdx = fields.indexOf(startCell.field);

  if (startRowIdx === -1 || startFieldIdx === -1 || tsvGrid.length === 0) {
    return {
      forwardMutations: [],
      reverseMutations: [],
      affectedRowsCount: 0,
      droppedRowsCount: 0,
      previewRows: [],
    };
  }

  let droppedRowsCount = 0;

  for (let r = 0; r < tsvGrid.length; r++) {
    const targetRowIdx = startRowIdx + r;
    if (targetRowIdx >= rows.length) {
      if (!PASTE_CREATES_ROWS) {
        droppedRowsCount++;
        continue;
      }
    }

    const targetRow = rows[targetRowIdx];
    const patch: Partial<Shipment> = {};
    const reversePatch: Partial<Shipment> = {};
    const rowChanges: Record<string, PasteChange> = {};

    const tsvCols = tsvGrid[r];
    for (let c = 0; c < tsvCols.length; c++) {
      const targetFieldIdx = startFieldIdx + c;
      if (targetFieldIdx >= fields.length) continue;

      const field = fields[targetFieldIdx];
      const parsedVal = parseCellValue(field, tsvCols[c]);
      const currentVal = (targetRow as unknown as Record<string, unknown>)[field];

      if (parsedVal !== currentVal) {
        (patch as Record<string, unknown>)[field] = parsedVal;
        (reversePatch as Record<string, unknown>)[field] = currentVal;
        rowChanges[field] = { before: currentVal, after: parsedVal };
      }
    }

    if (Object.keys(patch).length > 0) {
      forwardMutations.push({
        action: "UPDATE",
        id: targetRow.id,
        patch,
      });
      reverseMutations.push({
        action: "UPDATE",
        id: targetRow.id,
        patch: reversePatch,
      });
      previewRows.push({
        rowId: targetRow.id,
        stt: targetRow.stt,
        awb: targetRow.awb,
        changes: rowChanges,
      });
    }
  }

  return {
    forwardMutations,
    reverseMutations,
    affectedRowsCount: previewRows.length,
    droppedRowsCount,
    previewRows,
  };
}
