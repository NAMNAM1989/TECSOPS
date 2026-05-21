import { useCallback, useState } from "react";
import type { Warehouse } from "../types/shipment";

/**
 * Kho 0 lô: mặc định thu gọn. Kho có hàng: mặc định mở.
 * Người dùng có thể toggle thủ công (ghi đè mặc định).
 */
export function useWarehouseSectionCollapse(counts: Record<Warehouse, number>) {
  const [manual, setManual] = useState<Partial<Record<Warehouse, boolean>>>({});

  const isCollapsed = useCallback(
    (wh: Warehouse) => {
      if (manual[wh] !== undefined) return manual[wh]!;
      return counts[wh] === 0;
    },
    [manual, counts]
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
