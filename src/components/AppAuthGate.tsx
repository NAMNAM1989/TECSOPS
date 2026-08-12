import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, Wordmark } from "../ui";

type AuthStatus = {
  required: boolean;
  authenticated: boolean;
};

export function AppAuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/status", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Không kiểm tra được phiên truy cập.");
        return (await response.json()) as AuthStatus;
      })
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Không kết nối được máy chủ.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        authenticated?: boolean;
      };
      if (!response.ok || !body.authenticated) {
        throw new Error(body.error || "Không thể xác thực.");
      }
      setToken("");
      setStatus({ required: true, authenticated: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể xác thực.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status?.authenticated || status?.required === false) return children;

  return (
    <main className="flex min-h-screen items-center justify-center bg-ui-background p-4">
      <form
        className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <Wordmark size="lg" />
          </div>
          <h1 className="text-xl font-bold text-ui-navy">Truy cập hệ thống Ops</h1>
          <p className="text-sm text-slate-600">
            Nhập mã truy cập được cấu hình trên Railway. Mã chỉ dùng để tạo phiên HttpOnly và
            không lưu trong trình duyệt.
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-700">Mã truy cập</span>
          <input
            autoComplete="current-password"
            autoFocus
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            disabled={submitting}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            value={token}
          />
        </label>
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <Button className="w-full" disabled={submitting || !token.trim()} type="submit">
          {submitting ? "Đang xác thực…" : "Vào TECSOPS"}
        </Button>
      </form>
    </main>
  );
}
