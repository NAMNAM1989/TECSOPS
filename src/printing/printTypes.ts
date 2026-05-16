/** Loại tài liệu in trong Print Center. */
export type PrintDocumentType = "thermal-label" | "scsc-weigh" | "dim-report";

/** Cách gửi lệnh in tới máy. */
export type PrintDeliveryMode = "tspl-tcp" | "browser-print" | "download-tspl";

export type ThermalTsplConnection = "tcp" | "usb-shared";

/** Profile máy in nhãn nhiệt (TSPL). */
export type ThermalLabelPrinterProfile = {
  id: string;
  name: string;
  type: "thermal-tspl";
  connection: ThermalTsplConnection;
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
  notes?: string;
};

/** Profile máy in tờ cân A4 (browser). */
export type A4WeighReceiptPrinterProfile = {
  id: string;
  name: string;
  type: "a4-browser";
  paper: "A4";
  offsetXmm: number;
  offsetYmm: number;
  scaleX: number;
  scaleY: number;
  templateVersion: string;
  notes?: string;
};

export type PrinterProfile = ThermalLabelPrinterProfile | A4WeighReceiptPrinterProfile;

export type PrinterProfileStoreV1 = {
  version: 1;
  activeThermalProfileId: string;
  activeA4WeighProfileId: string;
  profiles: PrinterProfile[];
  updatedAt: string;
};

export type CalibrationMeasurement = {
  /** Sai lệch đo được: dương = in bị lệch sang phải (thermal) / xuống (A4 offset Y). */
  errorXmm: number;
  errorYmm: number;
  /** Kích thước in thực tế trên giấy (mm), nếu người dùng đo được. */
  measuredWidthMm?: number;
  measuredHeightMm?: number;
  expectedWidthMm?: number;
  expectedHeightMm?: number;
};
