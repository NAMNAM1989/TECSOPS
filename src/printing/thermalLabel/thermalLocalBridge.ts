const BRIDGE_BASE = "http://127.0.0.1:9470";
const HEALTH_CACHE_MS = 4000;

let lastHealth: { at: number; online: boolean; printers: string[] } = {
  at: 0,
  online: false,
  printers: [],
};

export type LocalPrintBridgeStatus = {
  online: boolean;
  printers: string[];
};

export async function fetchLocalPrintBridgeStatus(force = false): Promise<LocalPrintBridgeStatus> {
  const now = Date.now();
  if (!force && now - lastHealth.at < HEALTH_CACHE_MS) {
    return { online: lastHealth.online, printers: lastHealth.printers };
  }
  try {
    const res = await fetch(`${BRIDGE_BASE}/health`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { printers?: string[] };
    const printers = Array.isArray(j.printers) ? j.printers.map((p) => String(p).trim()).filter(Boolean) : [];
    lastHealth = { at: now, online: true, printers };
    return { online: true, printers };
  } catch {
    lastHealth = { at: now, online: false, printers: [] };
    return { online: false, printers: [] };
  }
}

export async function printTsplViaLocalBridge(
  printerName: string,
  tspl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = printerName.trim();
  if (!name) return { ok: false, error: "Chưa cấu hình tên máy in Windows." };
  try {
    const res = await fetch(`${BRIDGE_BASE}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printerName: name, tspl }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: j.error ?? `Bridge HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/fetch|Failed|ECONNREFUSED|NetworkError/i.test(msg)) {
      return {
        ok: false,
        error:
          "Không kết nối được Print Bridge. Trên PC quầy chạy: npm run print-bridge",
      };
    }
    return { ok: false, error: msg };
  }
}
