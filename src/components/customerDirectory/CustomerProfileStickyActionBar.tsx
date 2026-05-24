import { CD } from "./customerDirectoryStyles";

type Props = {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  deleteLabel?: string;
  onDelete?: () => void;
};

/** Thanh hành động cố định dưới cùng — Luôn thấy Lưu / Hủy khi cuộn. */
export function CustomerProfileStickyActionBar({
  saving,
  onSave,
  onCancel,
  deleteLabel,
  onDelete,
}: Props) {
  return (
    <div className={`sticky bottom-0 z-20 shrink-0 px-3 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md sm:px-4 ${CD.footer}`}>
      <div className="flex items-center gap-2">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          >
            {deleteLabel ?? "Xóa khách"}
          </button>
        ) : (
          <span className="hidden flex-1 sm:block" />
        )}
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
          <span className={`hidden text-[10px] lg:inline ${CD.muted}`}>Ctrl+S lưu</span>
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${CD.tabIdle}`}
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="min-w-[9rem] rounded-full bg-apple-blue px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-apple-blue-hover disabled:cursor-wait disabled:opacity-70"
          >
            {saving ? "Đang lưu…" : "Lưu & đóng"}
          </button>
        </div>
      </div>
    </div>
  );
}
