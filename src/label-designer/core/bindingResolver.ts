import type { LabelDataContext, LabelObject, LabelTemplateV1, TableCell } from "./types";

const BIND_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const NEG_BIND_RE = /\{\{\s*!([a-zA-Z0-9_.]+)\s*\}\}/g;

export function resolveBindString(raw: string, ctx: LabelDataContext): string {
  return raw.replace(BIND_RE, (_, key: string) => {
    const v = ctx[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

function truthyCtx(val: unknown): boolean {
  if (val === false || val === 0) return false;
  if (typeof val === "string") return val.trim().length > 0 && val !== "false" && val !== "0";
  return Boolean(val);
}

export function shouldHideObject(obj: LabelObject, ctx: LabelDataContext): boolean {
  if (obj.visible === false) return true;
  if (obj.hideWhen) {
    const expr = obj.hideWhen
      .replace(NEG_BIND_RE, (_, key: string) => (truthyCtx(ctx[key]) ? "0" : "1"))
      .replace(BIND_RE, (_, key: string) => (truthyCtx(ctx[key]) ? "1" : "0"));
    if (expr === "1" || expr === "true") return true;
  }
  return false;
}

function resolveTableCell(cell: TableCell, ctx: LabelDataContext): TableCell {
  const text = cell.bind ? resolveBindString(cell.bind, ctx) : resolveBindString(cell.text, ctx);
  return { ...cell, text };
}

export function bindLabelObject(obj: LabelObject, ctx: LabelDataContext): LabelObject {
  switch (obj.type) {
    case "text": {
      const text = obj.bind ? resolveBindString(obj.bind, ctx) : resolveBindString(obj.text, ctx);
      return { ...obj, text };
    }
    case "barcode": {
      const value = obj.bind ? resolveBindString(obj.bind, ctx) : resolveBindString(obj.value, ctx);
      return { ...obj, value };
    }
    case "qr": {
      const value = obj.bind ? resolveBindString(obj.bind, ctx) : resolveBindString(obj.value, ctx);
      return { ...obj, value };
    }
    case "table": {
      const cells: Record<string, TableCell> = {};
      for (const [k, cell] of Object.entries(obj.cells)) {
        cells[k] = resolveTableCell(cell, ctx);
      }
      return { ...obj, cells };
    }
    default:
      return obj;
  }
}

/** Clone template và thay {{field}} bằng dữ liệu lô / phiếu cân. */
export function bindLabelTemplate(template: LabelTemplateV1, ctx: LabelDataContext): LabelTemplateV1 {
  const objects = template.objects
    .filter((o) => !shouldHideObject(o, ctx))
    .map((o) => bindLabelObject(o, ctx));
  return { ...template, objects };
}
