import { useEffect, useState } from "react";
import type { SyncStatus } from "../hooks/useShipmentSync";
import { formatRelativeSync, formatSyncClockIct, parseSyncedAtMs } from "../utils/dbSyncedAt";

type Props = {
  status: SyncStatus;
  socketConnected: boolean;
  /** SoT `lots.synced_at` (epoch ms). Null/thiếu → ẩn timestamp, không hiện epoch. */
  lotSyncedAt: number | null;
  pendingOfflineCount?: number;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
};

function lotsSyncedPhrase(at: number | null, now: number): string {
  const ms = parseSyncedAtMs(at);
  if (ms == null) return "";
  const clock = formatSyncClockIct(ms);
  if (!clock) return "";
  const relative = formatRelativeSync(ms, now);
  return relative ? `đã sync lúc ${clock} (${relative})` : `đã sync lúc ${clock}`;
}

/**
 * Thanh Đồng bộ Ops — chỉ lots. Không trộn ops_customers.synced_at.
 * Live: 1 hàng gọn. Hạn chế/Offline: 2 hàng + CTA rõ.
 */
export function OpsMobileSyncBar({
  status,
  socketConnected,
  lotSyncedAt,
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

  const syncedPhrase = lotsSyncedPhrase(lotSyncedAt, now);
  const pendingBit = pendingOfflineCount > 0 ? `${pendingOfflineCount} chờ gửi` : "";
  const timeBit = syncedPhrase;

  let toneClass =
    "border-emerald-200/90 bg-emerald-50 text-emerald-950 ring-emerald-200/70";
  let dotClass = "bg-emerald-500 animate-pulse";
  let title = "Live";
  let detail = [timeBit, pendingBit].filter(Boolean).join(" · ");
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
    detail = ["Chỉ máy này", timeBit, pendingBit].filter(Boolean).join(" · ");
    ctaLabel = "Thử lại";
  } else if (degraded) {
    toneClass = "border-amber-200/90 bg-amber-50 text-amber-950 ring-amber-200/80";
    dotClass = "bg-amber-500";
    title = "Hạn chế";
    detail = ["Đồng bộ hạn chế", timeBit, pendingBit].filter(Boolean).join(" · ");
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
          {detail ? <span className="font-semibold opacity-80"> · {detail}</span> : null}
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
