import type { CustomerSavedConsignee } from "../types/customerDirectory";
import { formatSavedConsigneeOptionLabel } from "../utils/customerConsigneeShipmentPatch";

type Props = {
  value: string;
  options: readonly CustomerSavedConsignee[];
  disabled?: boolean;
  onChange: (consigneeId: string) => void;
};

/** Chọn CNEE lưu sẵn của khách — dùng trên lưới KHO SCSC. */
export function InlineConsigneeSelect({ value, options, disabled, onChange }: Props) {
  if (!options.length) {
    return <span className="text-[10px] text-apple-tertiary">—</span>;
  }

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      title="Chọn CNEE lưu trong danh bạ khách"
      className="max-w-full min-w-0 cursor-pointer rounded border border-black/[0.08] bg-white px-0.5 py-px text-[10px] font-medium leading-tight text-apple-label focus:outline-none focus:ring-1 focus:ring-apple-blue/40 disabled:cursor-default disabled:opacity-60"
    >
      <option value="">— CNEE —</option>
      {options.map((sc) => (
        <option key={sc.id} value={sc.id}>
          {formatSavedConsigneeOptionLabel(sc)}
        </option>
      ))}
    </select>
  );
}
