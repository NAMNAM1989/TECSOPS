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
  existingStt?: number | null;
  sheetStt?: number | null;
  duplicateId: string | null;
};

export type SheetBookOrphanKind = "replaced" | "web_only";

export type SheetBookOrphanRow = {
  id: string;
  awb: string;
  warehouse: string;
  customer: string;
  flight: string;
  flightDate: string;
  dest: string;
  pcs: number | null;
  kg: number | null;
  status: string;
  kind: SheetBookOrphanKind;
  replacedByAwb: string | null;
  autoRemove: boolean;
};

export type SheetBookSyncResult = {
  sessionDate: string;
  sessionFlightDate: string;
  sheetTab: string;
  expectedSheetTab?: string;
  sheetTabMismatch?: boolean;
  sheetGid?: string;
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
  orphanCount?: number;
  autoRemoveOrphanCount?: number;
  orphans?: SheetBookOrphanRow[];
  rows: SheetBookSyncRow[];
  /** sync-local file upload */
  source?: string;
  fileName?: string;
  headerPreview?: string[];
};

export type SheetBookApplyResult = {
  appliedCount: number;
  updatedCount: number;
  removedCount?: number;
  skippedCount: number;
  errorCount: number;
  errors: { awb: string; error: string }[];
  applied?: { awb: string; warehouse: string }[];
  updated?: { awb: string; warehouse: string; fromWarehouse?: string }[];
  removed?: { awb: string; warehouse: string; replacedByAwb?: string | null }[];
  reorderedCount?: number;
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
