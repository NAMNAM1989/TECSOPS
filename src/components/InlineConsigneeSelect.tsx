import type { CustomerSavedConsignee } from "../types/customerDirectory";
import {
  formatSavedConsigneeDetailTitle,
  formatSavedConsigneeShortLabel,
} from "../utils/customerConsigneeShipmentPatch";

type Props = {
  value: string;
  options: readonly CustomerSavedConsignee[];
  disabled?: boolean;
  className?: string;
  onChange: (consigneeId: string) => void;
};

/** Chọn CNEE — ô đóng chỉ hiện mã viết tắt; hover select = tên pháp lý. */
export function InlineConsigneeSelect({
  value,
  options,
  disabled,
  className = "",
  onChange,
}: Props) {
  if (!options.length) {
    return <span className="text-[10px] ops-grid-placeholder">—</span>;
  }

  const selected = options.find((o) => o.id === value);
  const selectTitle = selected
    ? formatSavedConsigneeDetailTitle(selected)
    : "Chọn CNEE (mã viết tắt — bấm ⊞ bên cạnh để xem địa chỉ & AWB)";

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      title={selectTitle}
      aria-label="Chọn CNEE lưu trong danh bạ khách"
      className={`min-w-0 max-w-full flex-1 cursor-pointer truncate rounded border border-black/[0.08] bg-white px-1 py-0.5 text-[10px] font-bold leading-tight tracking-tight text-apple-label focus:outline-none focus:ring-1 focus:ring-apple-blue/40 disabled:cursor-default disabled:opacity-60 dark:border-white/15 dark:bg-ops-bg dark:text-zinc-100 dark:focus:ring-sky-400/40 ${className}`}
    >
      <option value="">CNEE</option>
      {options.map((sc) => (
        <option key={sc.id} value={sc.id} title={formatSavedConsigneeDetailTitle(sc)}>
          {formatSavedConsigneeShortLabel(sc)}
        </option>
      ))}
    </select>
  );
}
