import { credFetch } from "../apiFetch";
import type { SheetBookApplyResult, SheetBookSyncResult } from "../types/googleSheetBook";

export async function syncBookGoogleSheet(
  sessionDate: string,
  opts?: { refresh?: boolean }
): Promise<SheetBookSyncResult> {
  const q = new URLSearchParams({ sessionDate });
  if (opts?.refresh) q.set("refresh", "1");
  const res = await fetch(`/api/sheets/book/sync?${q}`, { ...credFetch });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Không đồng bộ được Google Sheet.");
  }
  return data as SheetBookSyncResult;
}

export async function applyBookGoogleSheetRows(
  sessionDate: string,
  indices: number[],
  sheetTab: string,
  spreadsheetId: string
): Promise<SheetBookApplyResult> {
  const res = await fetch("/api/sheets/book/apply", {
    ...credFetch,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionDate, indices, sheetTab, spreadsheetId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Không nhập được dữ liệu từ Sheet.");
  }
  return data as SheetBookApplyResult;
}
