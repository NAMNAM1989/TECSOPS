import type { CustomerDirectoryEntry, CustomerSavedConsignee } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import {
  buildShipmentCneeTooltipLines,
  formatShipmentCneeReadonlySummary,
} from "../utils/shipmentCneeCopyBlock";
import { InlineConsigneeSelect } from "./InlineConsigneeSelect";
import { HoverMagnifyText } from "./HoverMagnifyText";

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  value: string;
  options: readonly CustomerSavedConsignee[];
  onChange: (consigneeId: string) => void;
  /** Năm tham chiếu khi parse ngày bay dạng DDMMM. */
  sessionYmdFallback?: string;
};

/** Ô CNEE: tên ngắn trên lưới; chi tiết (địa chỉ, SĐT…) trong panel hover fixed bám dưới ô. */
export function InlineCneeCell({
  shipment,
  customerDirectory,
  value,
  options,
  onChange,
  sessionYmdFallback,
}: Props) {
  const shortName = formatShipmentCneeReadonlySummary(shipment, customerDirectory);
  const tooltipLines = buildShipmentCneeTooltipLines(shipment, customerDirectory, {
    sessionYmdFallback,
  });
  const detailText = tooltipLines.join("\n").trim();
  const hasDetail = detailText.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {options.length > 0 ? (
        <InlineConsigneeSelect value={value} options={options} onChange={onChange} />
      ) : null}
      {shortName || hasDetail ? (
        hasDetail ? (
          <HoverMagnifyText
            displayText={shortName || "Chi tiết CNEE"}
            text={detailText}
            className="min-w-0 truncate text-[11px] font-medium leading-snug text-apple-label"
            panelLabel="CNEE"
            magnifyTitle="Rê chuột để xem địa chỉ, SĐT, email — bôi đen để sao chép"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="block min-w-0 truncate text-[11px] font-medium leading-snug text-apple-label"
            title={shortName}
          >
            {shortName}
          </span>
        )
      ) : options.length === 0 ? (
        <span className="text-[10px] text-apple-tertiary">—</span>
      ) : null}
    </div>
  );
}
