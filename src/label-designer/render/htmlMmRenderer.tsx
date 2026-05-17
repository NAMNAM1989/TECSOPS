import type { CSSProperties } from "react";
import { isTableCellCovered } from "../core/tableEditor";
import type {
  BarcodeObject,
  LabelObject,
  LabelTemplateV1,
  LineObject,
  QrObject,
  RectObject,
  TableObject,
  TextObject,
} from "../core/types";

const MM_TO_PX = 96 / 25.4;

export function mmToPx(mm: number): number {
  return mm * MM_TO_PX;
}

function textStyle(obj: TextObject): CSSProperties {
  return {
    position: "absolute",
    left: `${obj.x}mm`,
    top: `${obj.y}mm`,
    width: `${obj.width}mm`,
    minHeight: `${obj.height}mm`,
    fontSize: `${obj.fontSize}mm`,
    fontFamily: obj.fontFamily,
    fontWeight: obj.fontWeight === "bold" ? 700 : 400,
    fontStyle: obj.fontStyle === "italic" ? "italic" : "normal",
    color: obj.color ?? "#000",
    textAlign: obj.align ?? "left",
    lineHeight: obj.lineHeight ? `${obj.lineHeight}mm` : 1.1,
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
    transformOrigin: "top left",
    zIndex: obj.zIndex ?? 0,
    opacity: obj.opacity ?? 1,
  };
}

function renderText(obj: TextObject) {
  return (
    <div key={obj.id} style={textStyle(obj)}>
      {obj.text}
    </div>
  );
}

function renderLine(obj: LineObject) {
  const len = Math.hypot(obj.x2 - obj.x, obj.y2 - obj.y);
  const angle = (Math.atan2(obj.y2 - obj.y, obj.x2 - obj.x) * 180) / Math.PI;
  return (
    <div
      key={obj.id}
      style={{
        position: "absolute",
        left: `${obj.x}mm`,
        top: `${obj.y}mm`,
        width: `${len}mm`,
        height: `${obj.strokeWidth ?? 0.35}mm`,
        background: obj.stroke ?? "#000",
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 50%",
        zIndex: obj.zIndex ?? 0,
      }}
    />
  );
}

function renderRect(obj: RectObject) {
  return (
    <div
      key={obj.id}
      style={{
        position: "absolute",
        left: `${obj.x}mm`,
        top: `${obj.y}mm`,
        width: `${obj.width}mm`,
        height: `${obj.height}mm`,
        background: obj.fill ?? "transparent",
        border: obj.stroke ? `${obj.strokeWidth ?? 0.35}mm solid ${obj.stroke}` : undefined,
        borderRadius: obj.cornerRadius ? `${obj.cornerRadius}mm` : undefined,
        zIndex: obj.zIndex ?? 0,
      }}
    />
  );
}

function renderBarcode(obj: BarcodeObject) {
  const h = obj.height;
  const bars = (obj.value || "0").replace(/\D/g, "").slice(0, 20) || "0";
  return (
    <div
      key={obj.id}
      style={{
        position: "absolute",
        left: `${obj.x}mm`,
        top: `${obj.y}mm`,
        width: `${obj.width}mm`,
        height: `${h}mm`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        zIndex: obj.zIndex ?? 0,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "75%",
          background: `repeating-linear-gradient(90deg, #000 0 1.2mm, #fff 1.2mm 2.2mm)`,
        }}
      />
      {obj.displayValue !== false ? (
        <span style={{ fontSize: "2.5mm", fontFamily: "monospace", marginTop: "0.5mm" }}>{bars}</span>
      ) : null}
    </div>
  );
}

function renderQr(obj: QrObject) {
  const size = Math.min(obj.width, obj.height);
  return (
    <div
      key={obj.id}
      style={{
        position: "absolute",
        left: `${obj.x}mm`,
        top: `${obj.y}mm`,
        width: `${size}mm`,
        height: `${size}mm`,
        border: "0.4mm solid #000",
        background:
          "linear-gradient(45deg, #000 25%, transparent 25%), linear-gradient(-45deg, #000 25%, transparent 25%)",
        backgroundSize: "4mm 4mm",
        zIndex: obj.zIndex ?? 0,
      }}
      title={obj.value}
    />
  );
}

function renderTable(obj: TableObject) {
  const cols = obj.cols;
  const rows = obj.rows;
  return (
    <table
      key={obj.id}
      style={{
        position: "absolute",
        left: `${obj.x}mm`,
        top: `${obj.y}mm`,
        width: `${obj.width}mm`,
        borderCollapse: "collapse",
        fontSize: `${obj.fontSize ?? 3}mm`,
        fontFamily: obj.fontFamily ?? "Arial",
        zIndex: obj.zIndex ?? 0,
      }}
    >
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r} style={{ height: `${obj.rowHeights[r] ?? obj.height / rows}mm` }}>
            {Array.from({ length: cols }, (_, c) => {
              if (isTableCellCovered(obj, r, c)) return null;
              const cell = obj.cells[`${r}:${c}`];
              return (
                <td
                  key={c}
                  colSpan={cell?.colSpan}
                  rowSpan={cell?.rowSpan}
                  style={{
                    width: `${obj.colWidths[c] ?? obj.width / cols}mm`,
                    border: `${obj.borderWidth ?? 0.25}mm solid ${obj.borderColor ?? "#000"}`,
                    padding: "0.5mm",
                    fontWeight: cell?.bold ? 700 : 400,
                    textAlign: cell?.align ?? "left",
                    verticalAlign: "middle",
                  }}
                >
                  {cell?.text ?? ""}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function renderObject(obj: LabelObject) {
  switch (obj.type) {
    case "text":
      return renderText(obj);
    case "line":
      return renderLine(obj);
    case "rect":
      return renderRect(obj);
    case "barcode":
      return renderBarcode(obj);
    case "qr":
      return renderQr(obj);
    case "table":
      return renderTable(obj);
    case "image":
      return (
        <img
          key={obj.id}
          src={obj.src}
          alt=""
          style={{
            position: "absolute",
            left: `${obj.x}mm`,
            top: `${obj.y}mm`,
            width: `${obj.width}mm`,
            height: `${obj.height}mm`,
            objectFit: "contain",
            zIndex: obj.zIndex ?? 0,
          }}
        />
      );
    default:
      return null;
  }
}

type LabelMmViewProps = {
  template: LabelTemplateV1;
  className?: string;
  sheetClassName?: string;
};

/** Render template đã bind ra DOM mm (preview + browser print). */
export function LabelMmHtmlView({ template, className = "", sheetClassName = "" }: LabelMmViewProps) {
  const { width, height } = template.page;
  const isCompact = template.documentKind === "thermal-cargo-100x50";
  const isScsc = template.documentKind === "scsc-weigh-a4";
  const sheetClass = isScsc
    ? "label print-label-sheet lbl-sheet lbl-sheet--scsc-designer"
    : isCompact
      ? "label print-label-sheet lbl-sheet lbl-sheet--compact lbl-sheet--calibrated"
      : "label print-label-sheet lbl-sheet lbl-sheet--calibrated";

  return (
    <div
      className={`${sheetClass} ${sheetClassName} ${className}`.trim()}
      style={{
        position: "relative",
        width: `${width}mm`,
        height: `${height}mm`,
        background: template.page.background ?? "#fff",
      }}
    >
      {template.objects.map(renderObject)}
    </div>
  );
}
