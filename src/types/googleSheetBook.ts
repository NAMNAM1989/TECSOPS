export type SheetBookSyncStatus =
  | "new"
  | "update"
  | "duplicate"
  | "sheet_duplicate"
  | "awb_taken";

export type SheetBookSyncRow = {
  index: number;
  sheetRowIndex: number;
  blockTitle: string;
  awb: string;
  flight: string;
  flightDate: string;
  dest: string;
  warehouse: string;
  pcs: number | null;
  kg: number | null;
  dimWeightKg?: number | null;
  customer: string;
  customerCode: string;
  customerKnown: boolean;
  note?: string;
  consigneePreview?: string;
  syncStatus: SheetBookSyncStatus;
  duplicate: boolean;
  needsUpdate: boolean;
  blocked: boolean;
  sheetDuplicateOfIndex: number | null;
  takenSessionDate: string | null;
  existingWarehouse: string | null;
  duplicateId: string | null;
};

export type SheetBookSyncResult = {
  sessionDate: string;
  sessionFlightDate: string;
  sheetTab: string;
  spreadsheetId: string;
  syncedAt: string;
  totalInTab: number;
  skippedByDate: number;
  total: number;
  importable: number;
  newCount: number;
  updateCount: number;
  sheetDuplicateCount?: number;
  awbTakenCount?: number;
  rows: SheetBookSyncRow[];
};

export type SheetBookApplyResult = {
  appliedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: { awb: string; error: string }[];
  /** State sau khi nhập — dùng cập nhật UI ngay (không chỉ dựa Socket). */
  state?: unknown;
};

/** Dòng có thể tick chọn trong modal nhập Sheet. */
export function isSheetRowSelectable(row: Pick<SheetBookSyncRow, "blocked" | "syncStatus">): boolean {
  if (row.blocked !== undefined) return !row.blocked;
  return (
    row.syncStatus !== "duplicate" &&
    row.syncStatus !== "sheet_duplicate" &&
    row.syncStatus !== "awb_taken"
  );
}
