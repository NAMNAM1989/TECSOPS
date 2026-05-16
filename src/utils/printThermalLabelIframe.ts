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
  /** Host cụ thể (tránh lấy nhầm .print-label-host khác trên trang). */
  host?: HTMLElement | null;
};

export type ThermalLabelPrintResult = { ok: true } | { ok: false; error: string };

/** Chọn host có nội dung nhãn (ưu tiên host truyền vào, rồi phần tử cuối có lbl-sheet). */
export function resolveThermalLabelPrintHost(explicit?: HTMLElement | null): HTMLElement | null {
  if (explicit?.innerHTML.includes("lbl-sheet")) return explicit;
  const hosts = [...document.querySelectorAll<HTMLElement>(".print-label-host")];
  for (let i = hosts.length - 1; i >= 0; i--) {
    if (hosts[i].innerHTML.includes("lbl-sheet")) return hosts[i];
  }
  if (explicit?.innerHTML.trim()) return explicit;
  return hosts.find((h) => h.innerHTML.trim().length > 0) ?? null;
}

async function waitForLabelMarkup(host: HTMLElement, timeoutMs = 1200): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (host.innerHTML.includes("lbl-sheet")) return true;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
  return host.innerHTML.includes("lbl-sheet");
}

export async function printThermalLabelsFromIframe(
  opts?: PrintThermalLabelsOptions
): Promise<ThermalLabelPrintResult> {
  const format = opts?.format ?? "100x80";
  const { w: pageW, h: pageH } = thermalPageMm(format);

  const host = resolveThermalLabelPrintHost(opts?.host ?? null);
  if (!host) {
    return { ok: false, error: "Không tìm thấy vùng nhãn để in. Mở lại hộp thoại in nhãn." };
  }
  if (opts?.host && !(await waitForLabelMarkup(host))) {
    return { ok: false, error: "Nhãn chưa render xong — thử bấm In lại." };
  }
  if (!host.innerHTML.trim()) {
    return { ok: false, error: "Nội dung nhãn trống." };
  }
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
    return { ok: false, error: "Không tạo được khung in." };
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
    return { ok: false, error: "Không mở được cửa sổ in." };
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
    setTimeout(cleanup, 120_000);
    return { ok: true };
  } catch {
    cleanup();
    return { ok: false, error: "Trình duyệt chặn hộp thoại in." };
  }
}
