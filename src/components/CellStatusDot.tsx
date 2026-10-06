export type CellStatus = "idle" | "pending" | "error";

export function CellStatusDot({ status }: { status?: CellStatus }) {
  if (!status || status === "idle") return null;
  if (status === "pending") {
    return (
      <span
        data-testid="cell-status-pending"
        className="pointer-events-none absolute right-0.5 top-0.5 z-[2] h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse"
        title="Đang gửi..."
      />
    );
  }
  if (status === "error") {
    return (
      <span
        data-testid="cell-status-error"
        className="pointer-events-none absolute right-0.5 top-0.5 z-[2] h-1.5 w-1.5 rounded-full bg-red-500"
        title="Lỗi lưu"
      />
    );
  }
  return null;
}
