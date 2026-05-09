/**
 * In nhãn nhiệt qua iframe tài liệu tối giản (chỉ CSS nhãn + markup).
 * Tránh Tailwind / #root / min-h-screen của app làm Chrome gộp nhiều @page thành một cuộn dọc.
 */
import labelSheetCss from "../styles/print-label.css?raw";
import type { LabelSheetFormat } from "./labelSheetFormat";

/** Trang in sau khi tem (100×H) xoay 90°: rộng × cao. */
function thermalPageMm(format: LabelSheetFormat): { w: string; h: string; labelH: number } {
  if (format === "100x50") {
    return { w: "50mm", h: "100mm", labelH: 50 };
  }
  return { w: "80mm", h: "100mm", labelH: 80 };
}

function buildThermalPrintOverrides(format: LabelSheetFormat): string {
  const { w: THERMAL_PAGE_WIDTH, h: THERMAL_PAGE_HEIGHT, labelH } = thermalPageMm(format);
  const LABEL_HEIGHT_MM = `${labelH}mm`;

  return `
@page {
  size: ${THERMAL_PAGE_WIDTH} ${THERMAL_PAGE_HEIGHT};
  margin: 0;
}

html,
body {
  margin: 0 !important;
  padding: 0 !important;
  width: ${THERMAL_PAGE_WIDTH} !important;
  min-width: ${THERMAL_PAGE_WIDTH} !important;
  max-width: ${THERMAL_PAGE_WIDTH} !important;
  height: auto !important;
  min-height: 0 !important;
  overflow: visible !important;
  background: #fff !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.print-label-host {
  display: block !important;
  margin: 0 !important;
  padding: 0 !important;
  width: ${THERMAL_PAGE_WIDTH} !important;
  min-width: ${THERMAL_PAGE_WIDTH} !important;
  max-width: ${THERMAL_PAGE_WIDTH} !important;
  height: auto !important;
  overflow: visible !important;
  background: #fff !important;
  font-size: 0;
  line-height: 0;
}

.print-label-page {
  display: block !important;
  position: relative !important;
  margin: 0 !important;
  padding: 0 !important;
  width: ${THERMAL_PAGE_WIDTH} !important;
  min-width: ${THERMAL_PAGE_WIDTH} !important;
  max-width: ${THERMAL_PAGE_WIDTH} !important;
  height: ${THERMAL_PAGE_HEIGHT} !important;
  min-height: ${THERMAL_PAGE_HEIGHT} !important;
  max-height: ${THERMAL_PAGE_HEIGHT} !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
  break-after: page !important;
  page-break-after: always !important;
}

.print-label-page:last-child {
  break-after: auto !important;
  page-break-after: auto !important;
}

.print-label-spin {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  width: 100mm !important;
  height: ${LABEL_HEIGHT_MM} !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  transform-origin: center center !important;
  transform: translate(-50%, -50%) rotate(90deg) !important;
}

.print-label-spin.print-label-spin--ccw {
  transform: translate(-50%, -50%) rotate(-90deg) !important;
}

.label.print-label-sheet.lbl-sheet {
  width: 100mm !important;
  height: ${LABEL_HEIGHT_MM} !important;
  margin: 0 !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
`;
}

export type PrintThermalLabelsOptions = {
  format?: LabelSheetFormat;
};

export async function printThermalLabelsFromIframe(opts?: PrintThermalLabelsOptions): Promise<void> {
  const format = opts?.format ?? "100x80";
  const { w: pageW, h: pageH } = thermalPageMm(format);

  const host = document.querySelector(".print-label-host");
  if (!host || !host.innerHTML.trim()) return;
  const inner = host.innerHTML;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: pageW,
    height: pageH,
    border: "none",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }

  const docHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>In nhãn</title>
  <style>${labelSheetCss}</style>
  <style>
    ${buildThermalPrintOverrides(format)}
  </style>
</head>
<body class="tecsops-label-print-open">
  <div class="print-label-host">${inner}</div>
</body>
</html>`;

  doc.open();
  doc.write(docHtml);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return;
  }

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  win.addEventListener("afterprint", cleanup);

  try {
    if (doc.fonts?.ready) await doc.fonts.ready;
  } catch {
    /* ignore */
  }

  await new Promise<void>((r) => {
    if (doc.readyState === "complete") {
      r();
      return;
    }
    win.addEventListener("load", () => r(), { once: true });
  });

  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  try {
    win.focus();
    win.print();
  } catch {
    cleanup();
  }

  setTimeout(cleanup, 120_000);
}
