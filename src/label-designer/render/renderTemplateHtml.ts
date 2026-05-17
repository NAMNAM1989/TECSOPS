import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bindLabelTemplate } from "../core/bindingResolver";
import type { LabelDataContext, LabelTemplateV1 } from "../core/types";
import { LabelMmHtmlView } from "./htmlMmRenderer";

/** Render template đã bind ra chuỗi HTML (in SCSC / server-side string). */
export function renderLabelTemplateToHtml(
  template: LabelTemplateV1,
  ctx: LabelDataContext,
  opts?: { wrapperStyle?: string; sheetClassName?: string }
): string {
  const bound = bindLabelTemplate(template, ctx);
  const inner = renderToStaticMarkup(
    createElement(LabelMmHtmlView, {
      template: bound,
      sheetClassName: opts?.sheetClassName ?? "",
    })
  );
  if (!opts?.wrapperStyle) return inner;
  return `<div class="label-template-layer" style="${opts.wrapperStyle}">${inner}</div>`;
}
