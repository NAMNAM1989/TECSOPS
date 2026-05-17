import { THERMAL_LABEL_LAYOUT_100x50, THERMAL_LABEL_LAYOUT_100x80 } from "../../printing/thermalLabel/labelLayoutMm";
import { buildScscWeighPrintFields } from "../../printing/scscWeigh/scscWeighLayout";
import { resolveScscWeighLayout } from "../../printing/scscWeigh/scscWeighLayout";
import type {
  BarcodeObject,
  LabelDocumentKind,
  LabelObject,
  LabelTemplateV1,
  TextObject,
} from "./types";
import { newObjectId } from "./objectManager";

function textFromSlot(
  key: string,
  x: number,
  y: number,
  opts: {
    text: string;
    bind?: string;
    fontSize: number;
    width: number;
    height: number;
    fontWeight?: "normal" | "bold";
    align?: "left" | "center" | "right";
    hideWhen?: string;
    zIndex?: number;
  }
): TextObject {
  return {
    type: "text",
    id: key,
    x,
    y,
    width: opts.width,
    height: opts.height,
    text: opts.text,
    bind: opts.bind,
    fontSize: opts.fontSize,
    fontFamily: "Arial",
    fontWeight: opts.fontWeight ?? "normal",
    align: opts.align ?? "left",
    color: "#000000",
    hideWhen: opts.hideWhen,
    zIndex: opts.zIndex ?? 0,
  };
}

export function buildThermalCargo100x80Template(): LabelTemplateV1 {
  const L = THERMAL_LABEL_LAYOUT_100x80;
  const objects: LabelObject[] = [
    textFromSlot("airlineLine1", L.airlineLine1.x, L.airlineLine1.y, {
      text: "",
      bind: "{{airlineLine1}}",
      fontSize: 4,
      width: 96,
      height: 5,
      fontWeight: "bold",
      align: "center",
    }),
    textFromSlot("airlineLine2", L.airlineLine2.x, L.airlineLine2.y, {
      text: "",
      bind: "{{airlineLine2}}",
      fontSize: 4,
      width: 96,
      height: 5,
      align: "center",
    }),
    textFromSlot("mawb", L.mawb.x, L.mawb.y, {
      text: "",
      bind: "{{mawb}}",
      fontSize: 8,
      width: 96,
      height: 10,
      fontWeight: "bold",
      align: "center",
    }),
    textFromSlot("originLabel", L.originLabel.x, L.originLabel.y, {
      text: "Origin",
      fontSize: 2.5,
      width: 40,
      height: 4,
    }),
    textFromSlot("origin", L.origin.x, L.origin.y, {
      text: "",
      bind: "{{origin}}",
      fontSize: 9,
      width: 40,
      height: 8,
      fontWeight: "bold",
      align: "center",
    }),
    textFromSlot("destLabel", L.destLabel.x, L.destLabel.y, {
      text: "Destination",
      fontSize: 2.5,
      width: 40,
      height: 4,
    }),
    textFromSlot("dest", L.dest.x, L.dest.y, {
      text: "",
      bind: "{{dest}}",
      fontSize: 9,
      width: 40,
      height: 8,
      fontWeight: "bold",
      align: "center",
    }),
    textFromSlot("hawbLine", L.hawbLine.x, L.hawbLine.y, {
      text: "",
      bind: "{{hawbLine}}",
      fontSize: 10,
      width: 96,
      height: 12,
      fontWeight: "bold",
      hideWhen: "{{!hasHawb}}",
    }),
    textFromSlot("piecesLabel", L.piecesLabel.x, L.piecesLabel.y, {
      text: "Total no. of pieces",
      fontSize: 2.6,
      width: 44,
      height: 4,
      hideWhen: "{{hasHawb}}",
    }),
    textFromSlot("pieces", L.pieces.x, L.pieces.y, {
      text: "",
      bind: "{{pieces}}",
      fontSize: 11,
      width: 22,
      height: 12,
      fontWeight: "bold",
      align: "center",
      hideWhen: "{{hasHawb}}",
    }),
    textFromSlot("piecesHawbLabel", L.piecesHawbLabel.x, L.piecesHawbLabel.y, {
      text: "Pieces · HAWB",
      fontSize: 2.6,
      width: 44,
      height: 4,
      hideWhen: "{{!hasHawb}}",
    }),
    textFromSlot("piecesHawb", L.piecesHawb.x, L.piecesHawb.y, {
      text: "",
      bind: "{{piecesHawb}}",
      fontSize: 11,
      width: 18,
      height: 10,
      fontWeight: "bold",
      align: "center",
      hideWhen: "{{!hasHawb}}",
    }),
    textFromSlot("piecesMawbLabel", L.piecesMawbLabel.x, L.piecesMawbLabel.y, {
      text: "Total · MAWB",
      fontSize: 2.6,
      width: 44,
      height: 4,
      hideWhen: "{{!hasHawb}}",
    }),
    textFromSlot("piecesMawb", L.piecesMawb.x, L.piecesMawb.y, {
      text: "",
      bind: "{{piecesMawb}}",
      fontSize: 11,
      width: 18,
      height: 10,
      fontWeight: "bold",
      align: "center",
      hideWhen: "{{!hasHawb}}",
    }),
    {
      type: "barcode",
      id: "barcode",
      x: L.barcode.x,
      y: L.barcode.y,
      width: 90,
      height: L.barcode.heightMm,
      format: "CODE128",
      value: "",
      bind: "{{awbDigits}}",
      hideWhen: "{{hasHawb}}",
      zIndex: 0,
    } satisfies BarcodeObject,
  ];

  return {
    version: 1,
    id: "builtin-thermal-100x80",
    name: "Tem cargo 100×80 (mặc định)",
    documentKind: "thermal-cargo-100x80",
    unit: "mm",
    page: { width: 100, height: 80, dpi: 203, rotation: 0 },
    objects,
  };
}

export function buildThermalCargo100x50Template(): LabelTemplateV1 {
  const L = THERMAL_LABEL_LAYOUT_100x50;
  const objects: LabelObject[] = [
    textFromSlot("hawbLine", L.hawbLine.x, L.hawbLine.y, {
      text: "",
      bind: "{{hawbLine}}",
      fontSize: 7,
      width: 96,
      height: 10,
      fontWeight: "bold",
      hideWhen: "{{!hasHawb}}",
    }),
    textFromSlot("piecesLabel", L.piecesLabel.x, L.piecesLabel.y, {
      text: "Total no. of pieces",
      fontSize: 2.3,
      width: 48,
      height: 4,
    }),
    textFromSlot("pieces", L.pieces.x, L.pieces.y, {
      text: "",
      bind: "{{pieces}}",
      fontSize: 15,
      width: 28,
      height: 11,
      fontWeight: "bold",
      align: "center",
    }),
    textFromSlot("piecesHawb", L.piecesHawb.x, L.piecesHawb.y, {
      text: "",
      bind: "{{piecesHawb}}",
      fontSize: 12,
      width: 20,
      height: 10,
      fontWeight: "bold",
      align: "center",
      hideWhen: "{{!hasHawb}}",
    }),
  ];

  return {
    version: 1,
    id: "builtin-thermal-100x50",
    name: "Tem cargo 100×50 (mặc định)",
    documentKind: "thermal-cargo-100x50",
    unit: "mm",
    page: { width: 100, height: 50, dpi: 203, rotation: 0 },
    objects,
  };
}

export function buildScscWeighA4Template(): LabelTemplateV1 {
  const layout = resolveScscWeighLayout(null);
  const fields = buildScscWeighPrintFields(layout);
  const objects: LabelObject[] = fields.map((f, i) => ({
    type: "text" as const,
    id: f.key,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.heightMm ?? f.lineHeightMm ?? 6,
    text: "",
    bind: `{{${f.key}}}`,
    fontSize: f.fontMm ?? (f.fontPt ? f.fontPt * 0.35 : 3.5),
    fontFamily: "Arial",
    fontWeight: f.bold ? "bold" : "normal",
    align: f.align ?? "left",
    color: "#000000",
    zIndex: i,
  }));

  return {
    version: 1,
    id: "builtin-scsc-a4",
    name: "Phiếu cân SCSC A4 (mặc định)",
    documentKind: "scsc-weigh-a4",
    unit: "mm",
    page: { width: 210, height: 297, dpi: 203, rotation: 0, background: "#ffffff" },
    objects,
  };
}

const BUILTIN: Record<LabelDocumentKind, () => LabelTemplateV1> = {
  "thermal-cargo-100x80": buildThermalCargo100x80Template,
  "thermal-cargo-100x50": buildThermalCargo100x50Template,
  "scsc-weigh-a4": buildScscWeighA4Template,
};

export function getBuiltinTemplate(kind: LabelDocumentKind): LabelTemplateV1 {
  return structuredClone(BUILTIN[kind]());
}

export function documentKindFromLabelFormat(format: "100x80" | "100x50"): LabelDocumentKind {
  return format === "100x50" ? "thermal-cargo-100x50" : "thermal-cargo-100x80";
}

/** Template trống mới cho designer. */
export function createEmptyTemplate(kind: LabelDocumentKind, name?: string): LabelTemplateV1 {
  const base = getBuiltinTemplate(kind);
  return {
    ...base,
    id: newObjectId("tpl"),
    name: name ?? `Tem mới ${kind}`,
    objects: [],
    updatedAt: new Date().toISOString(),
  };
}
