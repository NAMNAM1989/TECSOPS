import { useCallback, useEffect, useState, type ReactNode } from "react";
import { credFetch } from "../apiFetch";

type Phase = "check" | "login" | "in";

export function SitePasswordGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("check");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogout, setShowLogout] = useState(false);

  const probe = useCallback(async () => {
    setError(null);
    try {
      const gateRes = await fetch("/api/auth/gate", { cache: "no-store" });
      const gateJson = (await gateRes.json().catch(() => ({}))) as { required?: boolean };
      const passwordRequired = gateJson.required === true;

      if (!passwordRequired) {
        setPhase("in");
        return;
      }

      const res = await fetch("/api/state", { ...credFetch, cache: "no-store" });
      if (res.ok) {
        setPhase("in");
        return;
      }
      if (res.status === 401) {
        setPhase("login");
        return;
      }
    } catch {
      /* mạng lỗi — vẫn cho vào app (offline / chỉ Vite) */
    }
    setPhase("in");
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        ...credFetch,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(typeof j.error === "string" ? j.error : "Đăng nhập thất bại");
        return;
      }
      setPassword("");
      setShowLogout(true);
      setPhase("in");
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    setBusy(true);
    try {
      await fetch("/api/logout", { ...credFetch, method: "POST" });
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      setShowLogout(false);
      setPhase("login");
    }
  };

  if (phase === "check") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-apple-bg px-4">
        <p className="text-sm font-medium text-apple-secondary">Đang kiểm tra truy cập…</p>
      </div>
    );
  }

  if (phase === "login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-apple-bg px-4 py-10">
        <div className="w-full max-w-sm rounded-[28px] border border-black/[0.08] bg-white p-8 shadow-apple-md">
          <h1 className="text-center text-[19px] font-semibold tracking-tight text-apple-label">TECSOPS</h1>
          <p className="mt-2 text-center text-sm text-apple-secondary">Nhập mật khẩu để vào trang.</p>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="site-pw" className="mb-1 block text-xs font-semibold text-apple-secondary">
                Mật khẩu
              </label>
              <input
                id="site-pw"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-medium text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                placeholder="••••••••"
              />
            </div>
            {error ? <p className="text-center text-sm font-medium text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || !password.trim()}
              className="w-full rounded-full bg-apple-blue py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Đang xử lý…" : "Vào trang"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {showLogout ? (
        <div className="fixed right-4 top-4 z-[100]">
          <button
            type="button"
            onClick={() => void onLogout()}
            disabled={busy}
            className="rounded-full border border-black/[0.1] bg-white/95 px-3 py-1.5 text-xs font-semibold text-apple-secondary shadow-sm backdrop-blur-sm hover:bg-black/[0.04] disabled:opacity-50"
          >
            Đăng xuất
          </button>
        </div>
      ) : null}
      {children}
    </>
  );
}
