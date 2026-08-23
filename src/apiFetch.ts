/** Tuỳ chọn fetch cùng origin (giữ credentials nếu trình duyệt gửi cookie sẵn có). */
export const credFetch: RequestInit = { credentials: "include" };

/** Session digest cho Chrome Ext khi cookie SameSite không đi kèm background fetch. */
export async function fetchAuthBridgeSession(): Promise<string> {
  const res = await fetch("/api/auth/bridge", {
    ...credFetch,
    cache: "no-store",
  });
  if (!res.ok) return "";
  const body = (await res.json().catch(() => ({}))) as { session?: string };
  return String(body.session || "").trim();
}
