export type ChromeExtensionPackId = "tecs-tcs" | "tcs" | "scsc";

export type ChromeExtensionPackInfo = {
  ok: boolean;
  id: ChromeExtensionPackId | string;
  label: string;
  title?: string;
  warehouse?: string;
  version?: string;
  filename?: string;
  download_url?: string;
  error?: string;
  install?: string[];
};

export type ChromeExtensionsCatalog = {
  ok: boolean;
  count?: number;
  total?: number;
  tip?: string;
  extensions: ChromeExtensionPackInfo[];
  error?: string;
};

export async function fetchChromeExtensionsCatalog(): Promise<ChromeExtensionsCatalog> {
  const res = await fetch("/api/chrome-extensions", { cache: "no-store" });
  const data = (await res.json()) as ChromeExtensionsCatalog;
  if (!res.ok && !data.extensions?.length) {
    throw new Error(data.error || "Không lấy được danh sách Chrome Ext");
  }
  return {
    ok: Boolean(data.ok),
    count: data.count,
    total: data.total,
    tip: data.tip,
    extensions: Array.isArray(data.extensions) ? data.extensions : [],
    error: data.error,
  };
}

/** Trigger tải ZIP; trả về tên file hoặc ném lỗi. */
export function triggerChromeExtensionDownload(pack: ChromeExtensionPackInfo): string {
  if (!pack.ok || !pack.download_url) {
    throw new Error(pack.error || `Chưa đóng gói Ext ${pack.label || pack.id}`);
  }
  const filename =
    pack.filename ||
    (pack.version
      ? `${pack.id}-v${pack.version}.zip`
      : `${pack.id || "tecsops-chrome-extension"}.zip`);
  const a = document.createElement("a");
  a.href = pack.download_url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return filename;
}
