import { newObjectId } from "../core/objectManager";
import type {
  BarcodeObject,
  ImageObject,
  LabelObject,
  LineObject,
  QrObject,
  RectObject,
  TableObject,
  TextObject,
} from "../core/types";

export function createTextObject(x = 10, y = 10): TextObject {
  return {
    type: "text",
    id: newObjectId("text"),
    x,
    y,
    width: 40,
    height: 8,
    text: "Văn bản",
    fontSize: 4,
    fontFamily: "Arial",
    fontWeight: "normal",
    color: "#000000",
    align: "left",
    zIndex: 1,
  };
}

export function createLineObject(x = 10, y = 10): LineObject {
  return {
    type: "line",
    id: newObjectId("line"),
    x,
    y,
    x2: x + 50,
    y2: y,
    stroke: "#000000",
    strokeWidth: 0.35,
    zIndex: 0,
  };
}

export function createRectObject(x = 10, y = 10): RectObject {
  return {
    type: "rect",
    id: newObjectId("rect"),
    x,
    y,
    width: 30,
    height: 15,
    fill: "transparent",
    stroke: "#000000",
    strokeWidth: 0.35,
    zIndex: 0,
  };
}

export function createBarcodeObject(x = 10, y = 10): BarcodeObject {
  return {
    type: "barcode",
    id: newObjectId("barcode"),
    x,
    y,
    width: 80,
    height: 10,
    format: "CODE128",
    value: "{{awbDigits}}",
    bind: "{{awbDigits}}",
    displayValue: true,
    zIndex: 2,
  };
}

export function createQrObject(x = 10, y = 10): QrObject {
  return {
    type: "qr",
    id: newObjectId("qr"),
    x,
    y,
    width: 20,
    height: 20,
    value: "{{awb}}",
    bind: "{{awb}}",
    errorLevel: "M",
    zIndex: 2,
  };
}

export function createImageObject(x = 10, y = 10, src = ""): ImageObject {
  return {
    type: "image",
    id: newObjectId("image"),
    x,
    y,
    width: 30,
    height: 20,
    src,
    zIndex: 0,
  };
}

export function createTableObject(x = 10, y = 10): TableObject {
  const rows = 3;
  const cols = 3;
  const colW = 25;
  const rowH = 8;
  const cells: TableObject["cells"] = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells[`${r}:${c}`] = { text: r === 0 ? `C${c + 1}` : "" };
    }
  }
  return {
    type: "table",
    id: newObjectId("table"),
    x,
    y,
    width: colW * cols,
    height: rowH * rows,
    rows,
    cols,
    colWidths: Array.from({ length: cols }, () => colW),
    rowHeights: Array.from({ length: rows }, () => rowH),
    cells,
    fontSize: 3,
    fontFamily: "Arial",
    borderWidth: 0.25,
    borderColor: "#000",
    zIndex: 1,
  };
}

export type FactoryKey = "text" | "line" | "rect" | "image" | "barcode" | "qr" | "table";

const FACTORIES: Record<FactoryKey, (x: number, y: number) => LabelObject> = {
  text: createTextObject,
  line: createLineObject,
  rect: createRectObject,
  image: (x, y) => createImageObject(x, y),
  barcode: createBarcodeObject,
  qr: createQrObject,
  table: createTableObject,
};

export function createDesignerObject(kind: FactoryKey, x = 12, y = 12): LabelObject {
  return FACTORIES[kind](x, y);
}
