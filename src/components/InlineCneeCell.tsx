import type { CustomerDirectoryEntry, CustomerSavedConsignee } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { formatShipmentCneeReadonlySummary } from "../utils/shipmentCneeCopyBlock";
import { formatSavedConsigneeDetailTitle } from "../utils/customerConsigneeShipmentPatch";
import { findCustomerEntry, resolveSavedConsigneeForBooking } from "../utils/customerBookingResolve";
import { InlineConsigneeSelect } from "./InlineConsigneeSelect";
import { CneeDetailPopover } from "./CneeDetailPopover";

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

/**
 * Ô CNEE trên lưới:
 * - Có danh sách lưu sẵn: chỉ dropdown (mã ngắn) + nút chi tiết phẳng.
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
  const detailBtn = (
    <CneeDetailPopover
      shipment={shipment}
      customerDirectory={customerDirectory}
      sessionYmdFallback={sessionYmdFallback}
      className="shrink-0"
    />
  );

  if (options.length > 0) {
    return (
      <div className="flex min-w-0 items-center gap-0.5" {...stopRowClick}>
        <InlineConsigneeSelect
          className="min-w-0 flex-1"
          value={value}
          options={options}
          onChange={onChange}
        />
        {detailBtn}
      </div>
    );
  }

  const primary = formatShipmentCneeReadonlySummary(shipment, customerDirectory);
  if (!primary) {
    return (
      <div className="flex min-w-0 items-center gap-0.5" {...stopRowClick}>
        <span className="text-[10px] ops-grid-placeholder">—</span>
        {detailBtn}
      </div>
    );
  }

  const customer = findCustomerEntry(shipment, customerDirectory);
  const saved = resolveSavedConsigneeForBooking(shipment, customer);
  const fullTitle = saved
    ? formatSavedConsigneeDetailTitle(saved)
    : shipment.consigneeNamePrint?.trim() || primary;

  return (
    <div className="flex min-w-0 items-center gap-0.5" {...stopRowClick}>
      <span
        className="min-w-0 flex-1 truncate text-[10px] font-bold leading-tight tracking-tight text-ui-text ops-grid-cell"
        title={fullTitle}
      >
        {primary}
      </span>
      {detailBtn}
    </div>
  );
}
