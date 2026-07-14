/**
 * In nhãn nhiệt qua iframe tài liệu tối giản (chỉ CSS nhãn + markup).
 * Tránh Tailwind / #root / min-h-screen của app làm Chrome gộp nhiều @page thành một cuộn dọc.
 *
 * XP-470B (mặc định): trang = khổ tem 100×80 / 100×50, không xoay.
 * Máy cuộn hẹp 80mm: trang 80×100 + xoay 90°.
 */
import labelSheetCss from "../styles/print-label.css?raw";
import type { LabelSheetFormat } from "./labelSheetFormat";
import { loadLabelPrintFlipCcw, loadLabelPrintMode, type LabelPrintMode } from "./labelPrintMode";

/** Trang in theo chế độ máy. */
export function thermalPageMm(
  format: LabelSheetFormat,
  mode: LabelPrintMode = "xp470b"
): { w: string; h: string; labelH: number; wMm: number; hMm: number } {
  const labelH = format === "100x50" ? 50 : 80;
  if (mode === "xp470b") {
    /* XP-470B 4″: SIZE width×length = 100×H — in thẳng */
    return { w: "100mm", h: `${labelH}mm`, labelH, wMm: 100, hMm: labelH };
  }
  /* Máy print-head ~80mm: tem xoay 90° */
  return { w: `${labelH}mm`, h: "100mm", labelH, wMm: labelH, hMm: 100 };
}

/** Bỏ mọi @page trong CSS gốc — chỉ dùng @page động theo khổ đã chọn (PDF/Save as PDF). */
export function stripAtPageRules(css: string): string {
  return css.replace(/@page\b[^{]*\{[^{}]*\}/g, "/* @page stripped — set by print overrides */");
}

function buildThermalPrintOverrides(
  format: LabelSheetFormat,
  mode: LabelPrintMode,
  flipCcw: boolean
): string {
  const { w: THERMAL_PAGE_WIDTH, h: THERMAL_PAGE_HEIGHT, labelH, wMm, hMm } = thermalPageMm(
    format,
    mode
  );
  const LABEL_HEIGHT_MM = `${labelH}mm`;
  const upright = mode === "xp470b";

  const rotate = upright
    ? "transform: none !important;"
    : flipCcw
      ? "transform: translate(-50%, -50%) rotate(-90deg) !important;"
      : "transform: translate(-50%, -50%) rotate(90deg) !important;";

  const spinLayout = upright
    ? `
.print-label-spin {
  position: relative !important;
  flex: 0 0 auto !important;
  left: auto !important;
  top: auto !important;
  width: 100mm !important;
  height: ${LABEL_HEIGHT_MM} !important;
  margin: 0 auto !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  transform: none !important;
}
`
    : `
.print-label-spin {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  width: 100mm !important;
  height: ${LABEL_HEIGHT_MM} !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  transform-origin: center center !important;
  ${rotate}
}
`;

  return `
  /* Khổ trang PDF/in = đúng tem đã chọn (${wMm}×${hMm} mm) */
@page {
  size: ${THERMAL_PAGE_WIDTH} ${THERMAL_PAGE_HEIGHT};
  margin: 0;
}

html {
  margin: 0 !important;
  padding: 0 !important;
  width: ${THERMAL_PAGE_WIDTH} !important;
  min-width: ${THERMAL_PAGE_WIDTH} !important;
  max-width: ${THERMAL_PAGE_WIDTH} !important;
  height: auto !important;
  min-height: 0 !important;
  background: #fff !important;
}

body {
  margin: 0 !important;
  padding: 0 !important;
  width: ${THERMAL_PAGE_WIDTH} !important;
  min-width: ${THERMAL_PAGE_WIDTH} !important;
  max-width: ${THERMAL_PAGE_WIDTH} !important;
  height: auto !important;
  min-height: ${THERMAL_PAGE_HEIGHT} !important;
  overflow: visible !important;
  background: #fff !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: flex-start !important;
}

.print-label-host {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: flex-start !important;
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
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
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

${spinLayout}

.label.print-label-sheet.lbl-sheet {
  width: 100mm !important;
  height: ${LABEL_HEIGHT_MM} !important;
  margin: 0 auto !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}

@media print {
  @page {
    size: ${THERMAL_PAGE_WIDTH} ${THERMAL_PAGE_HEIGHT};
    margin: 0;
  }
}
`;
}

export type PrintThermalLabelsOptions = {
  format?: LabelSheetFormat;
  /** Host cụ thể (tránh lấy nhầm .print-label-host khác trên trang). */
  host?: HTMLElement | null;
  /** Mặc định XP-470B (đọc localStorage). */
  mode?: LabelPrintMode;
  /**
   * Số tem cần in. Host chỉ cần 1 trang mẫu — iframe sẽ nhân bản.
   * Tránh React mount hàng trăm LabelContent (treo UI).
   */
  copies?: number;
  /**
   * Cửa sổ about:blank đã mở đồng bộ trong click handler
   * (tránh popup bị chặn sau await — cần để @page PDF đúng khổ).
   */
  printWindow?: Window | null;
};

export type ThermalLabelPrintResult =
  | { ok: true; printerCopiesHint?: number }
  | { ok: false; error: string };

const MAX_PRINT_COPIES = 500;
/** Chrome dễ treo khi preview quá nhiều trang @page nhỏ — trên ngưỡng này chỉ in 1 trang + nhắc đặt Copies. */
const BROWSER_SAFE_PAGE_COPIES = 30;

/** Lấy 1 trang tem từ host rồi nhân bản `copies` lần (HTML thuần, không React). */
export function buildRepeatedLabelPagesHtml(host: HTMLElement, copies: number): string {
  const n = Math.max(1, Math.min(MAX_PRINT_COPIES, Math.floor(copies) || 1));
  const page =
    host.querySelector<HTMLElement>(".print-label-page") ??
    (host.innerHTML.includes("lbl-sheet") ? host : null);
  if (!page) return "";

  const pageHtml =
    page.classList?.contains("print-label-page")
      ? page.outerHTML
      : `<div class="print-label-page"><div class="print-label-spin">${page.innerHTML}</div></div>`;

  if (n === 1) return pageHtml;
  return pageHtml.repeat(n);
}

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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);
}

export async function printThermalLabelsFromIframe(
  opts?: PrintThermalLabelsOptions
): Promise<ThermalLabelPrintResult> {
  const format = opts?.format ?? "100x80";
  const mode = opts?.mode ?? loadLabelPrintMode();
  const flipCcw = loadLabelPrintFlipCcw();
  const copiesRaw = opts?.copies;
  const { w: pageW, h: pageH, wMm, hMm } = thermalPageMm(format, mode);

  /**
   * Ưu tiên cửa sổ mở sẵn từ click; không thì thử mở ngay (có thể bị chặn sau await).
   * about:blank + document.write: Chrome Save as PDF lấy đúng @page size.
   */
  let popup: Window | null = opts?.printWindow && !opts.printWindow.closed ? opts.printWindow : null;
  if (!popup) {
    try {
      popup = window.open(
        "about:blank",
        "tecsops-label-print",
        `width=${Math.max(320, Math.round(wMm * 3.8))},height=${Math.max(280, Math.round(hMm * 3.8 + 48))}`
      );
    } catch {
      popup = null;
    }
  }

  const host = resolveThermalLabelPrintHost(opts?.host ?? null);
  if (!host) {
    try {
      popup?.close();
    } catch {
      /* ignore */
    }
    return { ok: false, error: "Không tìm thấy vùng nhãn để in. Mở lại hộp thoại in nhãn." };
  }
  if (opts?.host && !(await waitForLabelMarkup(host))) {
    try {
      popup?.close();
    } catch {
      /* ignore */
    }
    return { ok: false, error: "Nhãn chưa render xong — thử bấm In lại." };
  }
  if (!host.innerHTML.trim()) {
    try {
      popup?.close();
    } catch {
      /* ignore */
    }
    return { ok: false, error: "Nội dung nhãn trống." };
  }

  const pageCount = host.querySelectorAll(".print-label-page").length;
  const copiesWanted =
    copiesRaw != null
      ? Math.max(1, Math.min(MAX_PRINT_COPIES, Math.floor(copiesRaw) || 1))
      : Math.max(1, pageCount || 1);

  /** Tránh treo: lô lớn → 1 trang + Copies trên hộp thoại in. */
  const usePrinterCopies = copiesWanted > BROWSER_SAFE_PAGE_COPIES;
  const copies = usePrinterCopies ? 1 : copiesWanted;

  const inner =
    pageCount > 1 && copiesRaw == null && !usePrinterCopies
      ? host.innerHTML
      : buildRepeatedLabelPagesHtml(host, copies);

  if (!inner.trim()) {
    try {
      popup?.close();
    } catch {
      /* ignore */
    }
    return { ok: false, error: "Không tạo được nội dung tem để in." };
  }

  const bodyClass =
    mode === "xp470b"
      ? "tecsops-label-print-open tecsops-label-print-xp470b"
      : "tecsops-label-print-open tecsops-label-print-narrow80";

  const sheetCss = stripAtPageRules(labelSheetCss);
  const pageTitle = `Tem ${wMm}x${hMm}mm`;
  const docHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${wMm}, initial-scale=1" />
  <title>${pageTitle}</title>
  <style>${sheetCss}</style>
  <style>
    ${buildThermalPrintOverrides(format, mode, flipCcw)}
  </style>
</head>
<body class="${bodyClass}" data-label-page-mm="${wMm}x${hMm}">
  <div class="print-label-host">${inner}</div>
</body>
</html>`;

  type PrintTarget = { win: Window; cleanup: () => void };

  const usePopup = (): PrintTarget | null => {
    if (!popup || popup.closed) return null;
    try {
      const doc = popup.document;
      doc.open();
      doc.write(docHtml);
      doc.close();
      return {
        win: popup,
        cleanup: () => {
          try {
            if (!popup.closed) popup.close();
          } catch {
            /* ignore */
          }
        },
      };
    } catch {
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      return null;
    }
  };

  const useIframe = (): PrintTarget | { error: string } => {
    try {
      popup?.close();
    } catch {
      /* ignore */
    }
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
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      return { error: "Không tạo được khung in." };
    }
    doc.open();
    doc.write(docHtml);
    doc.close();
    return {
      win,
      cleanup: () => {
        try {
          iframe.remove();
        } catch {
          /* ignore */
        }
      },
    };
  };

  const target = usePopup() ?? useIframe();
  if ("error" in target) return { ok: false, error: target.error };

  const { win, cleanup: removeTarget } = target;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    removeTarget();
  };

  win.addEventListener("afterprint", cleanup);

  try {
    const doc = win.document;
    if (doc?.fonts?.ready) await withTimeout(doc.fonts.ready, 1500);
  } catch {
    /* ignore */
  }

  await new Promise<void>((r) => {
    const doc = win.document;
    if (!doc || doc.readyState === "complete") {
      r();
      return;
    }
    const onLoad = () => r();
    win.addEventListener("load", onLoad, { once: true });
    setTimeout(() => {
      win.removeEventListener("load", onLoad);
      r();
    }, 2000);
  });

  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  try {
    win.focus();
    win.print();
    setTimeout(cleanup, 120_000);
    return usePrinterCopies
      ? { ok: true, printerCopiesHint: copiesWanted }
      : { ok: true };
  } catch {
    cleanup();
    return { ok: false, error: "Trình duyệt chặn hộp thoại in." };
  }
}
