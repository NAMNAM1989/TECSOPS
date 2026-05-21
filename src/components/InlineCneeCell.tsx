import type { CustomerDirectoryEntry, CustomerSavedConsignee } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { buildShipmentCneeDisplayLines } from "../utils/shipmentCneeCopyBlock";
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

/** Ô CNEE trên lưới: chọn consignee + khối chữ bôi đen copy như Excel. */
export function InlineCneeCell({
  shipment,
  customerDirectory,
  value,
  options,
  onChange,
  sessionYmdFallback,
}: Props) {
  const lines = buildShipmentCneeDisplayLines(shipment, customerDirectory, { sessionYmdFallback });
  const bodyText = lines.join("\n");

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {options.length > 0 ? (
        <InlineConsigneeSelect value={value} options={options} onChange={onChange} />
      ) : null}
      {bodyText ? (
        <HoverMagnifyText
          text={bodyText}
          className="max-h-[5.5rem] min-h-[1rem] cursor-zoom-in select-text overflow-y-auto whitespace-pre-wrap break-words rounded-sm bg-black/[0.02] px-0.5 py-px text-[7px] leading-[1.15] text-apple-label"
          panelLabel="CNEE"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
      ) : options.length === 0 ? (
        <span className="text-[10px] text-apple-tertiary">—</span>
      ) : null}
    </div>
  );
}
