/** Loại tài liệu tem — gộp thermal + SCSC. */
export type LabelDocumentKind =
  | "thermal-cargo-100x80"
  | "thermal-cargo-100x50"
  | "scsc-weigh-a4";

export type LabelTemplateV1 = {
  version: 1;
  id: string;
  name: string;
  documentKind: LabelDocumentKind;
  unit: "mm";
  page: {
    width: number;
    height: number;
    dpi: number;
    rotation?: 0 | 90 | 180 | 270;
    background?: string;
  };
  objects: LabelObject[];
  updatedAt?: string;
  /** true sau khi user lưu từ Label Designer — mới dùng preview mm thay CSS legacy. */
  designerActive?: boolean;
};

export type LabelObjectBase = {
  id: string;
  x: number;
  y: number;
  rotation?: number;
  zIndex?: number;
  visible?: boolean;
  opacity?: number;
  /** Ràng buộc dữ liệu, vd. {{awb}} */
  bind?: string;
  /** Ẩn khi biểu thức truthy, vd. {{hasHawb}} */
  hideWhen?: string;
};

export type TextObject = LabelObjectBase & {
  type: "text";
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  color?: string;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  lineHeight?: number;
};

export type LineObject = LabelObjectBase & {
  type: "line";
  x2: number;
  y2: number;
  strokeWidth?: number;
  stroke?: string;
};

export type RectObject = LabelObjectBase & {
  type: "rect";
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
};

export type ImageObject = LabelObjectBase & {
  type: "image";
  width: number;
  height: number;
  src: string;
};

export type BarcodeObject = LabelObjectBase & {
  type: "barcode";
  width: number;
  height: number;
  format: "CODE128" | "CODE39";
  value: string;
  displayValue?: boolean;
};

export type QrObject = LabelObjectBase & {
  type: "qr";
  width: number;
  height: number;
  value: string;
  errorLevel?: "L" | "M" | "Q" | "H";
};

export type TableCell = {
  text: string;
  bind?: string;
  colSpan?: number;
  rowSpan?: number;
  align?: "left" | "center" | "right";
  bold?: boolean;
};

export type TableObject = LabelObjectBase & {
  type: "table";
  width: number;
  height: number;
  rows: number;
  cols: number;
  colWidths: number[];
  rowHeights: number[];
  cells: Record<string, TableCell>;
  fontSize?: number;
  fontFamily?: string;
  borderWidth?: number;
  borderColor?: string;
};

export type LabelObject =
  | TextObject
  | LineObject
  | RectObject
  | ImageObject
  | BarcodeObject
  | QrObject
  | TableObject;

export type LabelDataContext = Record<string, string | number | boolean | undefined>;

export const LABEL_TEMPLATE_VERSION = 1 as const;
