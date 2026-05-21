/** Shared print template types — Postgres `print_*` tables + PDF pipeline. */

export type PrintTemplateKind = "scsc-weigh-a4" | "tcs-weigh-a4";

export type PrintTemplateRecord = {
  id: string;
  code: string;
  name: string;
  pageWidthMm: number;
  pageHeightMm: number;
  backgroundAssetUrl: string;
};

export type PrintProfileRecord = {
  id: string;
  templateId: string;
  name: string;
  offsetXMm: number;
  offsetYMm: number;
  scaleX: number;
  scaleY: number;
  isDefault: boolean;
  notes: string;
};

export type PrintTemplateFieldRecord = {
  id: string;
  profileId: string;
  fieldKey: string;
  posXMm: number;
  posYMm: number;
  widthMm: number | null;
  fontSizePt: number;
  lineHeightMm: number | null;
  heightMm: number | null;
  maxLines: number | null;
  align: "left" | "center" | "right";
  multiline: boolean;
  bold: boolean;
  sortOrder: number;
};

export type PrintFieldValues = Record<string, string>;

export type GenerateScscWeighPdfRequest = {
  profileId?: string;
  templateCode?: string;
  values: PrintFieldValues;
  /** true = vẽ PNG mẫu làm nền (debug / máy in thường); false = chỉ chữ (form in sẵn). */
  includeBackground?: boolean;
};
