type SyncStatus = "live" | "degraded" | "offline" | "loading";

/**
 * Trạng thái kết nối cho ops — chỉ Live / hạn chế / offline.
 * Không hiện chi tiết kỹ thuật (socket URL, token…).
 */
export function SyncStatusPill({
  status,
  socketConnected,
  compact = false,
}: {
  status: SyncStatus;
  socketConnected: boolean;
  compact?: boolean;
}) {
  if (status === "loading") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 font-semibold text-ui-text-muted ${
          compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
        Đang tải
      </span>
    );
  }

  const live = status === "live" && socketConnected;
  const degraded = status !== "offline" && (!socketConnected || status === "degraded");

  if (live) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-50 font-bold text-emerald-900 shadow-ui-sm ring-1 ring-emerald-200/90 ${
          compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
        }`}
        title="Đang nhận cập nhật tức thì từ các máy khác"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
        Live
      </span>
    );
  }

  if (degraded) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-amber-50 font-semibold text-amber-950 ring-1 ring-amber-200/80 ${
          compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
        }`}
        title="Đồng bộ hạn chế — vẫn lưu được; làm mới trang nếu thiếu cập nhật từ máy khác"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
        {compact ? "Hạn chế" : "Đồng bộ hạn chế"}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 font-semibold text-ui-text-muted ${
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      }`}
      title="Không kết nối máy chủ — dữ liệu chỉ trên máy này"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
      {compact ? "Offline" : "Chỉ máy này"}
    </span>
  );
}
