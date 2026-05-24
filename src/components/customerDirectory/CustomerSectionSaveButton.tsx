import type { ReactNode } from "react";
import { CD } from "./customerDirectoryStyles";

type SaveBtnProps = {
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  compact?: boolean;
};

/** Nút lưu từng khu — không đóng modal. */
export function CustomerSectionSaveButton({ saving, saved, onSave, compact }: SaveBtnProps) {
  return (
    <button
      type="button"
      disabled={saving}
      onClick={onSave}
      className={
        compact
          ? `shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold disabled:opacity-60 ${
              saved
                ? "bg-emerald-600 text-white"
                : "bg-apple-blue text-white hover:bg-apple-blue-hover dark:bg-sky-600 dark:hover:bg-sky-500"
            }`
          : `rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-70 ${
              saved
                ? "bg-emerald-600 text-white"
                : "bg-apple-blue text-white hover:bg-apple-blue-hover dark:bg-sky-600 dark:hover:bg-sky-500"
            }`
      }
    >
      {saving ? "Đang lưu…" : saved ? "Đã lưu ✓" : "Lưu"}
    </button>
  );
}

export function CustomerSectionPanel({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-2.5 ${CD.card}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className={`text-xs font-bold uppercase tracking-wide ${CD.title}`}>{title}</h4>
        {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
