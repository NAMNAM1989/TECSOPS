import { credFetch } from "../apiFetch";

/** Socket.IO server → client khi webhook Apps Script / auto-sync áp dữ liệu Sheet. */
export const SHEET_SYNC_SOCKET_EVENT = "sheetSync";
/** Cầu nối socket (useShipmentSync) → UI không cần giữ tham chiếu socket. */
export const SHEET_SYNC_WINDOW_EVENT = "tecsops:sheet-sync";

export type SheetSyncConflict = {
  awb: string;
  code: "awb_taken" | "sheet_duplicate" | string;
  reason: string;
  rowNumber: number | null;
};

export type SheetSyncLast = {
  at: string;
  source: "webhook" | "auto" | string;
  sessionDate: string;
  tabName: string;
  added: number;
  updated: number;
};

export type SheetSyncEvent = SheetSyncLast & {
  conflicts: SheetSyncConflict[];
  last: SheetSyncLast | null;
};

export type SheetRealtimeStatusResponse = {
  last: SheetSyncLast | null;
  webhookEnabled: boolean;
  autoSync: { enabled: boolean; minutes: number };
};

export async function fetchSheetRealtimeStatus(): Promise<SheetRealtimeStatusResponse | null> {
  const res = await fetch("/api/sheets/book/realtime-status", { ...credFetch });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as SheetRealtimeStatusResponse | null;
}

/** «HH:mm:ss» giờ máy người dùng. */
export function formatSheetSyncTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function describeSheetConflicts(conflicts: readonly SheetSyncConflict[]): string {
  const lines = conflicts.slice(0, 3).map((c) => {
    const where = c.rowNumber ? `dòng ${c.rowNumber}` : "";
    return [c.awb, where, c.reason].filter(Boolean).join(" · ");
  });
  const more = conflicts.length > 3 ? ` (+${conflicts.length - 3} dòng khác)` : "";
  return lines.join("\n") + more;
}
