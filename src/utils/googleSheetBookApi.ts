import { credFetch } from "../apiFetch";
import type { SheetBookApplyResult, SheetBookSyncResult } from "../types/googleSheetBook";

export type SheetBookConfig = {
  spreadsheetId: string;
  shareUrl: string;
  sheetTabExample: string;
  hints: string[];
};

export async function fetchBookSheetConfig(): Promise<SheetBookConfig> {
  const res = await fetch("/api/sheets/book/config", { ...credFetch });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Không đọc được cấu hình Sheet.");
  }
  return data as SheetBookConfig;
}

export async function syncBookGoogleSheet(
  sessionDate: string,
  opts: {
    spreadsheetId: string;
    /** Chỉ gửi khi đã biết gid khớp ngày phiên — đừng gửi gid từ URL/localStorage cũ. */
    sheetGid?: string;
    refresh?: boolean;
  }
): Promise<SheetBookSyncResult> {
  const q = new URLSearchParams({ sessionDate, spreadsheetId: opts.spreadsheetId });
  // Không gửi gid lệch ngày: server chọn tab theo sessionDate (ngày phiên Ops).
  const gid = String(opts.sheetGid ?? "").trim();
  if (gid) q.set("gid", gid);
  if (opts.refresh) q.set("refresh", "1");
  const res = await fetch(`/api/sheets/book/sync?${q}`, { ...credFetch });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Không đồng bộ được Google Sheet.");
  }
  return data as SheetBookSyncResult;
}

/** URL Sheet sạch theo spreadsheet (+ gid tab đã khớp ngày phiên nếu có). */
export function buildSheetBookEditUrl(spreadsheetId: string, sheetGid?: string): string {
  const id = String(spreadsheetId ?? "").trim();
  if (!id) return "";
  const gid = String(sheetGid ?? "").trim();
  if (gid) {
    return `https://docs.google.com/spreadsheets/d/${id}/edit?gid=${gid}#gid=${gid}`;
  }
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

export async function syncBookLocalCsv(
  sessionDate: string,
  opts: { csvText: string; fileName?: string }
): Promise<SheetBookSyncResult> {
  const res = await fetch("/api/sheets/book/sync-local", {
    ...credFetch,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionDate,
      csvText: opts.csvText,
      fileName: opts.fileName || "upload.csv",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "Không đọc được file CSV/TSV."
    );
  }
  return data as SheetBookSyncResult;
}

export async function applyBookGoogleSheetRows(
  sessionDate: string,
  indices: number[],
  sheetTab: string,
  spreadsheetId: string,
  sheetGid?: string,
  removeIds: string[] = []
): Promise<SheetBookApplyResult> {
  const res = await fetch("/api/sheets/book/apply", {
    ...credFetch,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionDate,
      indices,
      removeIds,
      reorder: true,
      sheetTab,
      spreadsheetId,
      ...(sheetGid ? { gid: sheetGid } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Không nhập được dữ liệu từ Sheet.");
  }
  return data as SheetBookApplyResult;
}
