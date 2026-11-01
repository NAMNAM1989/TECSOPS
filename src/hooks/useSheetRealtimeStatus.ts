import { useEffect, useRef, useState } from "react";
import {
  SHEET_SYNC_WINDOW_EVENT,
  fetchSheetRealtimeStatus,
  type SheetSyncConflict,
  type SheetSyncEvent,
} from "../utils/sheetRealtime";

/**
 * Lần Sheet → web gần nhất (webhook Apps Script / auto-sync) + callback khi có dòng bị skip
 * do AWB trùng / khác phiên. Trả `null` khi chưa có lần nào kể từ lúc server khởi động.
 */
export function useSheetRealtimeStatus(
  onConflicts?: (conflicts: SheetSyncConflict[], event: SheetSyncEvent) => void
): string | null {
  const [lastAt, setLastAt] = useState<string | null>(null);
  const onConflictsRef = useRef(onConflicts);
  onConflictsRef.current = onConflicts;

  useEffect(() => {
    let cancelled = false;
    void fetchSheetRealtimeStatus()
      .then((status) => {
        if (!cancelled && status?.last?.at) {
          setLastAt((prev) => (prev && prev > status.last!.at ? prev : status.last!.at));
        }
      })
      .catch(() => {});

    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<SheetSyncEvent>).detail;
      if (!detail || typeof detail !== "object") return;
      if (detail.last?.at) setLastAt(detail.last.at);
      if (Array.isArray(detail.conflicts) && detail.conflicts.length) {
        onConflictsRef.current?.(detail.conflicts, detail);
      }
    };
    window.addEventListener(SHEET_SYNC_WINDOW_EVENT, onEvent);
    return () => {
      cancelled = true;
      window.removeEventListener(SHEET_SYNC_WINDOW_EVENT, onEvent);
    };
  }, []);

  return lastAt;
}
