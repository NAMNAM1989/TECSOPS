import type { ScscH21StampId } from "../types/scscH21Catalog";
import type { TcsH21StampId } from "../types/tcsH21Catalog";
import type { Shipment } from "../types/shipment";

type H21StampOption = ScscH21StampId | TcsH21StampId;

type Props = {
  shipment: Shipment;
  stamps: readonly H21StampOption[];
  onUpdate: (patch: Partial<Shipment>) => void | Promise<boolean | void>;
};

const selectCls =
  "box-border h-7 min-w-0 w-full max-w-full cursor-pointer truncate rounded-lg border border-ui-border bg-ui-surface px-1.5 py-0 text-[10px] font-semibold leading-none text-ui-text focus:outline-none focus:ring-1 focus:ring-ui-focus disabled:cursor-default disabled:opacity-45";

function shortLabel(s: H21StampOption): string {
  const name = s.shipperName.trim();
  if (name.length <= 28) return name;
  return `${name.slice(0, 26)}…`;
}

/** Dropdown shipper tờ khai H21 — cột 「Tờ khai」 trên bảng SCSC/TCS. */
export function H21DeclarationShipperCell({ shipment, stamps, onUpdate }: Props) {
  const active = stamps.filter((s) => s.active !== false);
  const value = shipment.h21DeclarationShipperId?.trim() ?? "";
  const selected = active.find((s) => s.id === value);

  return (
    <select
      className={selectCls}
      aria-label="Chọn shipper tờ khai H21"
      value={value}
      disabled={active.length === 0}
      title={
        selected
          ? `${selected.shipperName}${selected.stampId ? ` · ${selected.stampId}` : ""}`
          : "Shipper trên invoice H21 — quản lý tại trang H21"
      }
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const id = e.target.value;
        void onUpdate({ h21DeclarationShipperId: id });
      }}
    >
      <option value="">{active.length ? "— Chọn —" : "— Chưa có —"}</option>
      {active.map((s) => (
        <option key={s.id} value={s.id} title={s.shipperName}>
          {shortLabel(s)}
        </option>
      ))}
    </select>
  );
}
