import type { LabelSheetFormat } from "../utils/labelSheetFormat";
import type { LabelTemplateV1 } from "../label-designer/core/types";

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
  /** Khổ tem cố định cho máy này (100×50 hoặc 100×80). */
  labelSheetFormat: LabelSheetFormat;
  /** Ghi đè tọa độ/cỡ từng ô tem (kéo trên căn chỉnh). */
  thermalFieldOverrides?: ThermalFieldOverridesMap;
  /** Template Label Designer (ưu tiên hơn overrides cũ). */
  labelTemplate?: LabelTemplateV1;
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

/** Tuỳ chỉnh tọa độ/cỡ một ô in SCSC (lưu trên profile A4). */
export type ScscFieldOverride = {
  x?: number;
  y?: number;
  width?: number;
  heightMm?: number;
  fontMm?: number;
  fontPt?: number;
  lineHeightMm?: number;
  align?: "left" | "center" | "right";
  wrapText?: boolean;
  multiline?: boolean;
  bold?: boolean;
};

export type ScscFieldOverridesMap = Record<string, ScscFieldOverride>;

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
  /** Khoảng cách dòng Shipper/Agent/CNEE (mm). Mặc định 6. */
  partyLineGapMm?: number;
  /** Cỡ chữ dòng địa chỉ (mm) — căn theo partyLineGapMm. */
  partyAddressFontMm?: number;
  /** Cỡ chữ tên party (mm). */
  partyNameFontMm?: number;
  /** Cỡ chữ SĐT/Email/MST/Notify (mm). */
  partyContactFontMm?: number;
  /** Ghi đè tọa độ/cỡ từng ô SCSC (kéo trên preview). */
  scscFieldOverrides?: ScscFieldOverridesMap;
  /** Template Label Designer cho phiếu SCSC A4. */
  labelTemplate?: LabelTemplateV1;
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
