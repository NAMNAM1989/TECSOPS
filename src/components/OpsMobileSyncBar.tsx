import { useEffect, useState } from "react";
import type { SyncStatus } from "../hooks/useShipmentSync";

type Props = {
  status: SyncStatus;
  socketConnected: boolean;
  lastSyncAt: number | null;
  pendingOfflineCount?: number;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
};

function formatRelativeSync(at: number | null, now: number): string {
  if (at == null) return "chưa đồng bộ";
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 15) return "vừa xong";
  if (sec < 60) return `${sec}s trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  return `${hr} giờ trước`;
}

function formatClock(at: number | null): string {
  if (at == null) return "";
  try {
    return new Date(at).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

/**
 * Thanh Đồng bộ mobile — luôn thấy idle / syncing / last sync / lỗi / offline + CTA.
 * Live: 1 hàng gọn. Hạn chế/Offline: 2 hàng + CTA rõ.
 */
export function OpsMobileSyncBar({
  status,
  socketConnected,
  lastSyncAt,
  pendingOfflineCount = 0,
  onRefresh,
  refreshing = false,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const live = status === "live" && socketConnected;
  const loading = status === "loading" || refreshing;
  const offline = status === "offline";
  const degraded = !live && !offline && !loading;

  const relative = formatRelativeSync(lastSyncAt, now);
  const clock = formatClock(lastSyncAt);
  const pendingLabel =
    pendingOfflineCount > 0 ? ` · ${pendingOfflineCount} chờ gửi` : "";
  const syncedPhrase = clock
    ? `đã sync lúc ${clock} (${relative})`
    : relative;

  let toneClass =
    "border-emerald-200/90 bg-emerald-50 text-emerald-950 ring-emerald-200/70";
  let dotClass = "bg-emerald-500 animate-pulse";
  let title = "Live";
  let detail = syncedPhrase + pendingLabel;
  let ctaLabel: string | null = null;

  if (loading) {
    toneClass = "border-sky-200/90 bg-sky-50 text-sky-950 ring-sky-200/70";
    dotClass = "bg-sky-500 animate-pulse";
    title = "Đang đồng bộ";
    detail = "Đang tải / làm mới…";
    ctaLabel = null;
  } else if (offline) {
    toneClass = "border-slate-300 bg-slate-100 text-slate-800 ring-slate-300/80";
    dotClass = "bg-slate-500";
    title = "Offline";
    detail = `Chỉ máy này · ${syncedPhrase}${pendingLabel}`;
    ctaLabel = "Thử lại";
  } else if (degraded) {
    toneClass = "border-amber-200/90 bg-amber-50 text-amber-950 ring-amber-200/80";
    dotClass = "bg-amber-500";
    title = "Hạn chế";
    detail = `Đồng bộ hạn chế · ${syncedPhrase}${pendingLabel}`;
    ctaLabel = "Làm mới";
  }

  const compactLive = live && !loading;

  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 shadow-ui-sm ring-1 ${toneClass} ${
        compactLive ? "min-h-8 py-0.5" : "min-h-10 py-1"
      }`}
      data-testid="ops-mobile-sync-bar"
      role="status"
      aria-live="polite"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      {compactLive ? (
        <p className="min-w-0 flex-1 truncate text-[10px] font-bold leading-tight">
          <span className="font-extrabold">{title}</span>
          <span className="font-semibold opacity-80"> · {detail}</span>
        </p>
      ) : (
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[11px] font-extrabold tracking-tight">{title}</p>
          <p className="truncate text-[9px] font-semibold opacity-80">{detail}</p>
        </div>
      )}
      {ctaLabel && onRefresh ? (
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void onRefresh()}
          className="inline-flex min-h-10 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-ui-navy px-2.5 text-[10px] font-bold text-white disabled:opacity-50"
        >
          {ctaLabel}
        </button>
      ) : null}
    </div>
  );
}
