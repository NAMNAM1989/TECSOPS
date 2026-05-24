import { useCallback, useState } from "react";
import type { Warehouse } from "../types/shipment";

/**
 * Kho 0 lô: mặc định thu gọn. Kho có hàng: mặc định mở.
 * Người dùng có thể toggle thủ công (ghi đè mặc định).
 */
export function useWarehouseSectionCollapse(
  counts: Record<Warehouse, number>,
  pinnedOpen: readonly Warehouse[] = []
) {
  const [manual, setManual] = useState<Partial<Record<Warehouse, boolean>>>({});

  const isCollapsed = useCallback(
    (wh: Warehouse) => {
      if (pinnedOpen.includes(wh)) return false;
      if (manual[wh] !== undefined) return manual[wh]!;
      return counts[wh] === 0;
    },
    [manual, counts, pinnedOpen]
  );

  const toggle = useCallback(
    (wh: Warehouse) => {
      setManual((prev) => {
        const current = prev[wh] ?? counts[wh] === 0;
        return { ...prev, [wh]: !current };
      });
    },
    [counts]
  );

  return { isCollapsed, toggle };
}
