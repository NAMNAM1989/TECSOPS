import { useCallback, useRef, useState } from "react";
import { TABLE_COLUMN_ORDER, type TableGridField } from "../config/tableUx";
export type { TableGridField };

export type GridNavDirection = "up" | "down" | "left" | "right" | "next" | "prev";

export interface ActiveGridCell {
  rowId: string;
  field: TableGridField;
}

export interface UseGridNavigationOptions {
  rowIds: readonly string[];
  fields?: readonly TableGridField[];
  onActiveCellChange?: (cell: ActiveGridCell | null) => void;
}

/**
 * Focus ô bảng desktop có data-grid-row / data-grid-field.
 */
export function focusShipmentGridCell(rowId: string, field: string) {
  requestAnimationFrame(() => {
    const r = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(rowId) : rowId;
    const f = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(field) : field;
    const el = document.querySelector(
      `[data-grid-row="${r}"][data-grid-field="${f}"]`
    ) as HTMLElement | null;
    if (el) {
      el.focus();
    }
  });
}

/**
 * Tính toán ô đích theo hướng điều hướng bàn phím Excel
 */
export function getNextGridCell(
  current: ActiveGridCell,
  dir: GridNavDirection,
  rowIds: readonly string[],
  fields: readonly TableGridField[] = TABLE_COLUMN_ORDER
): ActiveGridCell | null {
  if (rowIds.length === 0 || fields.length === 0) return null;
  const rowIdx = rowIds.indexOf(current.rowId);
  const fieldIdx = fields.indexOf(current.field);
  if (rowIdx === -1 || fieldIdx === -1) return null;

  switch (dir) {
    case "up": {
      const nextRowIdx = Math.max(0, rowIdx - 1);
      return { rowId: rowIds[nextRowIdx], field: current.field };
    }
    case "down": {
      const nextRowIdx = Math.min(rowIds.length - 1, rowIdx + 1);
      return { rowId: rowIds[nextRowIdx], field: current.field };
    }
    case "left": {
      const nextFieldIdx = Math.max(0, fieldIdx - 1);
      return { rowId: current.rowId, field: fields[nextFieldIdx] };
    }
    case "right": {
      const nextFieldIdx = Math.min(fields.length - 1, fieldIdx + 1);
      return { rowId: current.rowId, field: fields[nextFieldIdx] };
    }
    case "next": {
      // Tab: sang phải, hết dòng nhảy dòng kế tiếp cột đầu (awb)
      if (fieldIdx < fields.length - 1) {
        return { rowId: current.rowId, field: fields[fieldIdx + 1] };
      }
      if (rowIdx < rowIds.length - 1) {
        return { rowId: rowIds[rowIdx + 1], field: fields[0] };
      }
      return current;
    }
    case "prev": {
      // Shift+Tab: sang trái, đầu dòng nhảy dòng trước cột cuối (note)
      if (fieldIdx > 0) {
        return { rowId: current.rowId, field: fields[fieldIdx - 1] };
      }
      if (rowIdx > 0) {
        return { rowId: rowIds[rowIdx - 1], field: fields[fields.length - 1] };
      }
      return current;
    }
  }
}

/**
 * Hook điều hướng lưới kiểu Excel cho DesktopShipmentTable.
 */
export function useGridNavigation({
  rowIds,
  fields = TABLE_COLUMN_ORDER,
  onActiveCellChange,
}: UseGridNavigationOptions) {
  const [activeCell, setActiveCellState] = useState<ActiveGridCell | null>(null);
  const rowIdsRef = useRef(rowIds);
  rowIdsRef.current = rowIds;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const setActiveCell = useCallback(
    (cell: ActiveGridCell | null) => {
      setActiveCellState(cell);
      onActiveCellChange?.(cell);
    },
    [onActiveCellChange]
  );

  const focusCell = useCallback(
    (rowId: string, field: TableGridField) => {
      setActiveCell({ rowId, field });
      focusShipmentGridCell(rowId, field);
    },
    [setActiveCell]
  );

  const navigate = useCallback(
    (from: ActiveGridCell, dir: GridNavDirection): ActiveGridCell | null => {
      const target = getNextGridCell(from, dir, rowIdsRef.current, fieldsRef.current);
      if (target) {
        setActiveCell(target);
        focusShipmentGridCell(target.rowId, target.field);
      }
      return target;
    },
    [setActiveCell]
  );

  const onNavigate = useCallback(
    (rowId: string, field: TableGridField, dir: GridNavDirection) => {
      return navigate({ rowId, field }, dir);
    },
    [navigate]
  );

  return {
    activeCell,
    setActiveCell,
    focusCell,
    navigate,
    onNavigate,
  };
}
