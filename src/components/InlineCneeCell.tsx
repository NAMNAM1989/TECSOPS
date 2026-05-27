import type { CustomerDirectoryEntry, CustomerSavedConsignee } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import {
  buildShipmentCneeDisplayLines,
  formatShipmentCneeReadonlySummary,
} from "../utils/shipmentCneeCopyBlock";
import {
  formatSavedConsigneeDetailTitle,
} from "../utils/customerConsigneeShipmentPatch";
import { findCustomerEntry, resolveSavedConsigneeForBooking } from "../utils/mapBookingToScaleTicketFormData";
import { InlineConsigneeSelect } from "./InlineConsigneeSelect";
import { HoverMagnifyText } from "./HoverMagnifyText";

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  value: string;
  options: readonly CustomerSavedConsignee[];
  onChange: (consigneeId: string) => void;
  sessionYmdFallback?: string;
};

const stopRowClick = {
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

function CneeDetailPopTrigger({ detailText }: { detailText: string }) {
  return (
    <HoverMagnifyText
      iconOnly
      text={detailText}
      className="shrink-0"
      panelLabel="Chi tiết lô & CNEE"
      magnifyTitle="Pop-up: tên pháp lý, địa chỉ, AWB, SĐT (không đổi CNEE đã chọn)"
    />
  );
}

/**
 * Ô CNEE trên lưới:
 * - Có danh sách lưu sẵn: chỉ dropdown (mã ngắn) + nút pop-up chi tiết.
 * - Không trùng label + tên pháp lý trên cùng một hàng.
 */
export function InlineCneeCell({
  shipment,
  customerDirectory,
  value,
  options,
  onChange,
  sessionYmdFallback,
}: Props) {
  const panelLines = buildShipmentCneeDisplayLines(shipment, customerDirectory, {
    sessionYmdFallback,
  });
  const detailText = panelLines.join("\n").trim();
  const hasDetail = detailText.length > 0;

  if (options.length > 0) {
    return (
      <div className="flex min-w-0 items-center gap-0.5" {...stopRowClick}>
        <InlineConsigneeSelect
          className="min-w-0 flex-1"
          value={value}
          options={options}
          onChange={onChange}
        />
        {hasDetail ? (
          <CneeDetailPopTrigger detailText={detailText} />
        ) : null}
      </div>
    );
  }

  const primary = formatShipmentCneeReadonlySummary(shipment, customerDirectory);
  if (!primary && !hasDetail) {
    return <span className="text-[10px] ops-grid-placeholder">—</span>;
  }

  const customer = findCustomerEntry(shipment, customerDirectory);
  const saved = resolveSavedConsigneeForBooking(shipment, customer);
  const fullTitle = saved
    ? formatSavedConsigneeDetailTitle(saved)
    : shipment.consigneeNamePrint?.trim() || primary || detailText;

  return (
    <div className="flex min-w-0 items-center gap-0.5" {...stopRowClick}>
      {primary ? (
        <span
          className="min-w-0 flex-1 truncate text-[10px] font-bold leading-tight tracking-tight text-apple-label ops-grid-cell dark:text-zinc-100"
          title={fullTitle}
        >
          {primary}
        </span>
      ) : null}
      {hasDetail ? (
        <CneeDetailPopTrigger detailText={detailText} />
      ) : null}
    </div>
  );
}
