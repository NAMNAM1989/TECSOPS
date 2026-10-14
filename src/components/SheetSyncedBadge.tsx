import { formatSheetSyncTime } from "../utils/sheetRealtime";

type Props = {
  at: string | null | undefined;
  className?: string;
};

/** «Sheet: cập nhật lúc HH:mm:ss» — lần Sheet đẩy dữ liệu lên gần nhất (webhook / auto-sync). */
export function SheetSyncedBadge({ at, className = "" }: Props) {
  const time = formatSheetSyncTime(at);
  if (!time) return null;
  return (
    <span
      data-testid="sheet-synced-badge"
      className={`shrink-0 whitespace-nowrap text-2xs tabular-nums text-ui-text-muted ${className}`}
      title="Lần gần nhất Google Sheet BOOK tự cập nhật lên web"
    >
      Sheet: cập nhật lúc {time}
    </span>
  );
}
