import { CD } from "./customerDirectoryStyles";

type Props = {
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  deleteLabel?: string;
  onDelete?: () => void;
};

/** Thanh hành động — một Lưu, Hủy khi dirty. */
export function CustomerProfileStickyActionBar({
  saving,
  dirty,
  onSave,
  onDiscard,
  deleteLabel,
  onDelete,
}: Props) {
  return (
    <div
      className={`sticky bottom-0 z-20 shrink-0 px-3 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md sm:px-4 ${CD.footer}`}
    >
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
          {dirty ? (
            <span className={`hidden text-[10px] sm:inline ${CD.muted}`}>Chưa lưu · Ctrl+S</span>
          ) : (
            <span className={`hidden text-[10px] sm:inline ${CD.muted}`}>Đã lưu</span>
          )}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={onDiscard}
            className={`rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-40 ${CD.tabIdle}`}
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={onSave}
            className="min-w-[7rem] rounded-full bg-apple-blue px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
