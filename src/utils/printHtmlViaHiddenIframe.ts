/** In HTML qua iframe ẩn — dùng chung DIM SCSC / LIST DIM TCS. */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PrintHtmlViaHiddenIframeOpts = {
  /** Delay trước khi gọi print (ms). */
  delayMs?: number;
  /** Cảnh báo khi không tạo được khung in. */
  failAlert?: string;
};

/**
 * Ghi HTML vào iframe ẩn, gọi print(), cleanup sau afterprint / timeout.
 * Trả về false nếu không tạo được document/window.
 */
export function printHtmlViaHiddenIframe(
  html: string,
  opts: PrintHtmlViaHiddenIframeOpts = {}
): boolean {
  const delayMs = opts.delayMs ?? 100;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "none",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    if (opts.failAlert) window.alert(opts.failAlert);
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return false;
  }

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  win.addEventListener("afterprint", cleanup);

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      window.alert("Không gọi được lệnh in.");
      cleanup();
    }
  };

  setTimeout(() => {
    if (iframe.contentDocument?.readyState === "complete") {
      runPrint();
    } else {
      win.addEventListener("load", runPrint, { once: true });
    }
  }, delayMs);

  setTimeout(cleanup, 120_000);
  return true;
}
