export type SyncStatus = "live" | "degraded" | "offline" | "loading";

export type SyncStatusPillProps = {
  status: SyncStatus;
  socketConnected: boolean;
  compact?: boolean;
  interactive?: boolean;
  pendingOfflineCount?: number;
  lastSyncedAt?: Date | string | number | null;
  onRefresh?: () => void;
  className?: string;
  "data-testid"?: string;
};

function formatSyncTime(ts?: Date | string | number | null): string | null {
  if (!ts) return null;
  try {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return null;
  }
}

/**
 * Chỉ báo trạng thái kết nối & đồng bộ theo spec v2 (§10.9).
 * Không đặt role="status" ở đây (chuyển sang AppShell sr-only duy nhất).
 * Khi interactive=false hoặc không có onRefresh: render <span> (tránh lỗi nested-interactive).
 */
export function SyncStatusPill({
  status,
  socketConnected,
  compact = false,
  interactive = true,
  pendingOfflineCount = 0,
  lastSyncedAt,
  onRefresh,
  className = "",
  "data-testid": testId,
}: SyncStatusPillProps) {
  const isQueueWarning = pendingOfflineCount >= 400;

  if (status === "loading") {
    return (
      <span
        data-testid={testId}
        className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 font-semibold text-ui-text-muted select-none ${
          compact ? "px-1.5 py-0.5 text-2xs" : "px-2 py-0.5 text-2xs"
        } ${className}`}
        title="Đang tải dữ liệu…"
      >
        <span
          className="h-1.5 w-1.5 animate-pulse motion-reduce:animate-none rounded-full bg-slate-400"
          aria-hidden="true"
        />
        Đang tải…
      </span>
    );
  }

  const live = status === "live" && socketConnected;
  const degraded = status !== "offline" && (!socketConnected || status === "degraded");
  const syncTimeStr = formatSyncTime(lastSyncedAt);

  if (live) {
    const titleText = syncTimeStr ? `Live · Đã sync lúc ${syncTimeStr}` : "Live · Đang kết nối trực tiếp";
    return (
      <span
        data-testid={testId}
        className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50 text-emerald-900 shadow-ui-sm font-bold select-none ${
          compact ? "px-1.5 py-0.5 text-2xs" : "px-2.5 py-0.5 text-2xs"
        } ${className}`}
        title={titleText}
      >
        <span
          className="h-1.5 w-1.5 animate-pulse motion-reduce:animate-none rounded-full bg-green-600"
          aria-hidden="true"
        />
        <span>Live</span>
        {pendingOfflineCount > 0 ? (
          <span className="font-mono text-2xs font-bold text-amber-800">
            · {pendingOfflineCount} chờ gửi
          </span>
        ) : !compact && syncTimeStr ? (
          <span className="font-mono text-2xs font-normal text-ui-text-muted">
            · {syncTimeStr}
          </span>
        ) : null}
      </span>
    );
  }

  if (degraded) {
    const titleText = "Mất realtime — bấm Làm mới để cập nhật";
    const canClick = interactive && Boolean(onRefresh);

    if (canClick) {
      return (
        <button
          type="button"
          onClick={onRefresh}
          data-testid={testId}
          aria-label="Đồng bộ hạn chế, bấm để làm mới"
          className={`inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50 font-semibold text-amber-950 shadow-ui-sm select-none hover:bg-amber-100 transition-colors ${
            compact ? "px-2 py-1 text-2xs" : "px-3 py-1.5 text-2xs"
          } ${className}`}
          title={titleText}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-orange-600" aria-hidden="true" />
          <span>Hạn chế</span>
          {!compact ? (
            <span className="font-mono text-2xs text-ui-text-muted">· Làm mới</span>
          ) : null}
        </button>
      );
    }

    return (
      <span
        data-testid={testId}
        className={`inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50 font-semibold text-amber-950 shadow-ui-sm select-none ${
          compact ? "px-1.5 py-0.5 text-2xs" : "px-2.5 py-0.5 text-2xs"
        } ${className}`}
        title={titleText}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-orange-600" aria-hidden="true" />
        <span>Hạn chế</span>
      </span>
    );
  }

  // Offline
  const titleText = isQueueWarning
    ? `Sắp đầy hàng đợi offline (${pendingOfflineCount}/500)`
    : pendingOfflineCount > 0
      ? `Offline · ${pendingOfflineCount} thay đổi chờ gửi`
      : "Không kết nối máy chủ";

  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold select-none ${
        isQueueWarning
          ? "border-amber-400 bg-amber-100 text-amber-950 font-bold shadow-ui-sm"
          : "border-red-200 bg-red-50 text-red-900 shadow-ui-sm"
      } ${compact ? "px-1.5 py-0.5 text-2xs" : "px-2.5 py-0.5 text-2xs"} ${className}`}
      title={titleText}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isQueueWarning ? "bg-amber-600" : "bg-red-600"}`}
        aria-hidden="true"
      />
      <span>Offline</span>
      {pendingOfflineCount > 0 ? (
        <span
          className={`font-mono text-2xs tabular-nums ${
            isQueueWarning ? "font-bold text-amber-900" : "text-red-700"
          }`}
        >
          · {pendingOfflineCount}
        </span>
      ) : null}
    </span>
  );
}
