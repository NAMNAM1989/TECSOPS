import type { LabelSheetFormat } from "../utils/labelSheetFormat";
/** Loại tài liệu in (nhãn nhiệt / báo cáo DIM). */
export type PrintDocumentType = "thermal-label" | "dim-report";

/** Cách gửi lệnh in tới máy. */
export type PrintDeliveryMode = "tspl-tcp" | "browser-print" | "download-tspl";

export type ThermalTsplConnection = "tcp" | "usb-shared";

/** Profile máy in nhãn nhiệt (TSPL). */
export type ThermalLabelPrinterProfile = {
  id: string;
  name: string;
  type: "thermal-tspl";
  connection: ThermalTsplConnection;
  /** Tên hàng đợi Windows (USB) — dùng với `npm run print-bridge` trên PC quầy. */
  windowsPrinterName?: string;
  host?: string;
  port?: number;
  dpi: number;
  /** Kích thước tem vật lý (đọc chữ đứng): ngang × dọc. */
  labelWidthMm: number;
  labelHeightMm: number;
  /** Khổ trang khi feed/xoay (thường đảo so với tem). */
  pageWidthMm: number;
  pageHeightMm: number;
  gapMm: number;
  /** 0 | 90 | 180 | 270 — chiều in trên trục TSPL. */
  rotation: 0 | 90 | 180 | 270;
  offsetXmm: number;
  offsetYmm: number;
  speed: number;
  density: number;
  copiesDefault: number;
  /** Khổ tem cố định cho máy này (100×50 hoặc 100×80). */
  labelSheetFormat: LabelSheetFormat;
  notes?: string;
};

/** Tuỳ chỉnh một ô tem nhiệt (mm + nhân TSPL). */
export type ThermalFieldOverride = {
  x?: number;
  y?: number;
  fontMm?: number;
  mulX?: number;
  mulY?: number;
  tsplFont?: string;
};

export type ThermalFieldOverridesMap = Record<string, ThermalFieldOverride>;

export type PrinterProfile = ThermalLabelPrinterProfile;

export type PrinterProfileStoreV1 = {
  version: 1;
  activeThermalProfileId: string;
  profiles: PrinterProfile[];
  updatedAt: string;
};
