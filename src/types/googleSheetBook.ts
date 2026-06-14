export type SheetBookSyncStatus = "new" | "update" | "duplicate";

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
  customer: string;
  customerCode: string;
  customerKnown: boolean;
  syncStatus: SheetBookSyncStatus;
  duplicate: boolean;
  needsUpdate: boolean;
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
  rows: SheetBookSyncRow[];
};

export type SheetBookApplyResult = {
  appliedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: { awb: string; error: string }[];
};
