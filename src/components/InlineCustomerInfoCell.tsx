import type {
  CustomerDirectoryEntry,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
} from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { findCustomerEntry } from "../utils/customerBookingResolve";
import {
  buildShipmentPatchForSavedConsignee,
  formatSavedConsigneeDetailTitle,
  formatSavedConsigneeShortLabel,
} from "../utils/customerConsigneeShipmentPatch";
import {
  buildShipmentPatchForSavedGoods,
  buildShipmentPatchForSavedShipper,
  formatSavedGoodsDetailTitle,
  formatSavedGoodsShortLabel,
  isSavedGoodsSelectable,
} from "../utils/customerPrintProfileLink";
import { CneeDetailPopover } from "./CneeDetailPopover";
import { buildShipmentCneeDisplayLines } from "../utils/shipmentCneeCopyBlock";

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  sessionYmdFallback?: string;
  onUpdate: (patch: Partial<Shipment>) => void;
};

const stopRowClick = {
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

const selectCls =
  "min-w-0 w-full cursor-pointer truncate rounded border border-black/[0.08] bg-white px-1 py-0.5 text-[10px] font-bold leading-tight tracking-tight text-apple-label focus:outline-none focus:ring-1 focus:ring-apple-blue/40 disabled:cursor-default disabled:opacity-50";

function shortShipperLabel(sc: CustomerSavedShipper): string {
  const name = sc.shipperName.trim();
  if (name) return name.length > 28 ? `${name.slice(0, 26)}…` : name;
  return sc.label.trim() || sc.id;
}

function shipperTitle(sc: CustomerSavedShipper): string {
  const label = sc.label.trim();
  const name = sc.shipperName.trim();
  if (label && name && label.toUpperCase() !== name.toUpperCase()) {
    return `${label} — ${name}`;
  }
  return name || label || sc.id;
}

function MiniSelect({
  ariaLabel,
  value,
  placeholder,
  disabled,
  title,
  children,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={selectCls}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

/**
 * Ô «Thông tin KH» trên lưới Ops: 3 droplist Shipper / CNEE / Tên hàng
 * lấy từ hồ sơ khách đã lưu sẵn.
 */
export function InlineCustomerInfoCell({
  shipment,
  customerDirectory,
  sessionYmdFallback,
  onUpdate,
}: Props) {
  const entry = findCustomerEntry(shipment, customerDirectory);
  const shippers = entry?.savedShippers ?? [];
  const consignees = entry?.savedConsignees ?? [];
  /** Tab «Tên hàng» trong hồ sơ KH → `savedGoods[].goodsDescription`. */
  const goods = (entry?.savedGoods ?? []).filter(isSavedGoodsSelectable);

  const shipperId = shipment.customerShipperId?.trim() ?? "";
  const consigneeId = shipment.customerConsigneeId?.trim() ?? "";
  const goodsId = shipment.customerGoodsId?.trim() ?? "";

  const panelLines = buildShipmentCneeDisplayLines(shipment, customerDirectory, {
    sessionYmdFallback,
  });
  const detailText = panelLines.join("\n").trim();

  const selectedShipper = shippers.find((x) => x.id === shipperId);
  const selectedConsignee = consignees.find((x) => x.id === consigneeId);
  const selectedGoods = goods.find((x) => x.id === goodsId);

  const hasAnyProfile = shippers.length + consignees.length + goods.length > 0;
  if (!hasAnyProfile) {
    return (
      <span className="text-[10px] ops-grid-placeholder" title="Chưa có hồ sơ Shipper/CNEE/Tên hàng trong danh bạ">
        —
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5" {...stopRowClick}>
      <MiniSelect
        ariaLabel="Chọn Shipper lưu sẵn"
        value={shipperId}
        placeholder="Shipper"
        disabled={shippers.length === 0}
        title={selectedShipper ? shipperTitle(selectedShipper) : "Chọn Shipper từ hồ sơ khách"}
        onChange={(id) => {
          const sc = shippers.find((x) => x.id === id) as CustomerSavedShipper | undefined;
          onUpdate(buildShipmentPatchForSavedShipper(id ? sc : undefined));
        }}
      >
        {shippers.map((sc) => (
          <option key={sc.id} value={sc.id} title={shipperTitle(sc)}>
            {shortShipperLabel(sc)}
          </option>
        ))}
      </MiniSelect>

      <div className="flex min-w-0 items-center gap-0.5">
        <MiniSelect
          ariaLabel="Chọn CNEE lưu sẵn"
          value={consigneeId}
          placeholder="CNEE"
          disabled={consignees.length === 0}
          title={
            selectedConsignee
              ? formatSavedConsigneeDetailTitle(selectedConsignee)
              : "Chọn CNEE từ hồ sơ khách"
          }
          onChange={(id) => {
            const sc = consignees.find((x) => x.id === id) as
              | CustomerSavedConsignee
              | undefined;
            onUpdate(buildShipmentPatchForSavedConsignee(id ? sc : undefined));
          }}
        >
          {consignees.map((sc) => (
            <option
              key={sc.id}
              value={sc.id}
              title={formatSavedConsigneeDetailTitle(sc)}
            >
              {formatSavedConsigneeShortLabel(sc)}
            </option>
          ))}
        </MiniSelect>
        {detailText ? (
          <CneeDetailPopover text={detailText} className="shrink-0" />
        ) : null}
      </div>

      <MiniSelect
        ariaLabel="Chọn tên hàng lưu sẵn trong hồ sơ khách"
        value={goodsId}
        placeholder="Tên hàng"
        disabled={goods.length === 0}
        title={
          selectedGoods
            ? formatSavedGoodsDetailTitle(selectedGoods)
            : "Chọn tên hàng (Loại hàng) từ hồ sơ khách"
        }
        onChange={(id) => {
          const g = goods.find((x) => x.id === id) as CustomerSavedGoods | undefined;
          onUpdate(buildShipmentPatchForSavedGoods(id ? g : undefined));
        }}
      >
        {goods.map((g) => (
          <option key={g.id} value={g.id} title={formatSavedGoodsDetailTitle(g)}>
            {formatSavedGoodsShortLabel(g)}
          </option>
        ))}
      </MiniSelect>
    </div>
  );
}
