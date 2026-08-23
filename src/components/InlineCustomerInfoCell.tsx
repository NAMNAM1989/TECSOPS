import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import {
  CNEE_PRINT_MAX_LEN,
  normalizeInlineCneePrint,
  validateInlineCneePrint,
} from "../utils/inlineShipmentFieldValidation";
import { InlineTextEdit } from "./InlineTextEdit";

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  /** Giữ prop để caller cũ không vỡ — chi tiết CNEE đã chuyển sang cột KHÁCH. */
  sessionYmdFallback?: string;
  onUpdate: (patch: Partial<Shipment>) => void | Promise<boolean | void>;
};

const stopRowClick = {
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

const selectCls =
  "box-border h-7 min-w-0 w-full max-w-full cursor-pointer truncate rounded-md border border-ui-border bg-ui-surface px-1.5 py-0 text-[11px] font-semibold leading-none text-ui-text focus:outline-none focus:ring-1 focus:ring-ui-focus disabled:cursor-default disabled:opacity-45";

const LINE =
  "block h-3.5 w-full truncate text-left text-[10px] font-semibold leading-[0.875rem] text-ui-text";

/** Chỉ cắt rất dài (option/select); ô tóm tắt dùng CSS truncate theo cột. */
function clipLabel(s: string, max = 48): string {
  const t = s.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function shortShipperLabel(sc: CustomerSavedShipper): string {
  return (
    sc.shipperName.trim() ||
    sc.label.trim() ||
    sc.id
  );
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
      style={{ width: "100%", maxWidth: "100%" }}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

function SummaryLine({
  label,
  value,
  empty,
}: {
  label: string;
  value: string;
  empty?: boolean;
}) {
  const shown = value || "—";
  return (
    <span
      className={`${LINE} ${empty ? "ops-grid-placeholder" : ""}`}
      title={value ? `${label}: ${value}` : undefined}
    >
      <span className="mr-1 font-bold text-ui-text-muted">{label}</span>
      {shown}
    </span>
  );
}

/**
 * Ô INFO KH: mặc định 3 dòng tóm tắt; click → panel chỉnh Shipper/CNEE/CNEE in ấn/Hàng.
 */
export function InlineCustomerInfoCell({
  shipment,
  customerDirectory,
  onUpdate,
}: Props) {
  const panelId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const entry = findCustomerEntry(shipment, customerDirectory);
  const shippers = entry?.savedShippers ?? [];
  const consignees = entry?.savedConsignees ?? [];
  const goods = (entry?.savedGoods ?? []).filter(isSavedGoodsSelectable);

  const shipperId = shipment.customerShipperId?.trim() ?? "";
  const consigneeId = shipment.customerConsigneeId?.trim() ?? "";
  const goodsId = shipment.customerGoodsId?.trim() ?? "";

  const selectedShipper = shippers.find((x) => x.id === shipperId);
  const selectedConsignee = consignees.find((x) => x.id === consigneeId);
  const selectedGoods = goods.find((x) => x.id === goodsId);

  const shipperText = selectedShipper
    ? shortShipperLabel(selectedShipper)
    : "";
  const cneeText = selectedConsignee
    ? formatSavedConsigneeShortLabel(selectedConsignee).trim()
    : (shipment.consigneeNamePrint ?? "").trim();
  const goodsText = selectedGoods
    ? formatSavedGoodsShortLabel(selectedGoods).trim()
    : "";

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 248;
    const estH = 280;
    let left = r.left;
    if (left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }
    if (left < 12) left = 12;
    let top = r.bottom + 6;
    if (top + estH > window.innerHeight - 12) {
      top = Math.max(12, r.top - estH - 6);
    }
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  const editors = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="block">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">
          Shipper
        </span>
        <MiniSelect
          ariaLabel="Chọn Shipper lưu sẵn"
          value={shipperId}
          placeholder="Shipper"
          disabled={shippers.length === 0}
          title={
            selectedShipper
              ? shipperTitle(selectedShipper)
              : "Chọn Shipper từ hồ sơ khách"
          }
          onChange={(id) => {
            const sc = shippers.find((x) => x.id === id) as
              | CustomerSavedShipper
              | undefined;
            void onUpdate(buildShipmentPatchForSavedShipper(id ? sc : undefined));
          }}
        >
          {shippers.map((sc) => (
            <option key={sc.id} value={sc.id} title={shipperTitle(sc)}>
              {shortShipperLabel(sc)}
            </option>
          ))}
        </MiniSelect>
      </label>

      <label className="block">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">
          CNEE
        </span>
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
            void onUpdate(
              buildShipmentPatchForSavedConsignee(id ? sc : undefined)
            );
          }}
        >
          {consignees.map((sc) => (
            <option
              key={sc.id}
              value={sc.id}
              title={formatSavedConsigneeDetailTitle(sc)}
            >
              {clipLabel(formatSavedConsigneeShortLabel(sc), 28)}
            </option>
          ))}
        </MiniSelect>
      </label>

      <div className="min-w-0">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">
          CNEE in ấn
        </span>
        <div className="min-w-0 overflow-hidden rounded-md border border-ui-border bg-white px-1 [&_input]:h-7 [&_input]:text-[11px]">
          <InlineTextEdit
            value={shipment.consigneeNamePrint ?? ""}
            placeholder="Tên CNEE in ấn"
            title={
              shipment.consigneeNamePrint?.trim()
                ? `CNEE in ấn: ${shipment.consigneeNamePrint}`
                : "Sửa tên CNEE in ấn"
            }
            className="h-7 text-[11px] font-semibold text-ui-text"
            maxLength={CNEE_PRINT_MAX_LEN}
            gridNav={{ rowId: shipment.id, field: "cneePrint" }}
            validate={validateInlineCneePrint}
            onCommit={(v) =>
              onUpdate({ consigneeNamePrint: normalizeInlineCneePrint(v) })
            }
          />
        </div>
      </div>

      <label className="block">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">
          Hàng
        </span>
        <MiniSelect
          ariaLabel="Chọn tên hàng lưu sẵn trong hồ sơ khách"
          value={goodsId}
          placeholder="Hàng"
          disabled={goods.length === 0}
          title={
            selectedGoods
              ? formatSavedGoodsDetailTitle(selectedGoods)
              : "Chọn tên hàng từ hồ sơ khách"
          }
          onChange={(id) => {
            const g = goods.find((x) => x.id === id) as
              | CustomerSavedGoods
              | undefined;
            void onUpdate(buildShipmentPatchForSavedGoods(id ? g : undefined));
          }}
        >
          {goods.map((g) => (
            <option key={g.id} value={g.id} title={formatSavedGoodsDetailTitle(g)}>
              {clipLabel(formatSavedGoodsShortLabel(g), 28)}
            </option>
          ))}
        </MiniSelect>
      </label>
    </div>
  );

  return (
    <div className="relative min-w-0 w-full max-w-full" {...stopRowClick}>
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Click để chọn / sửa Shipper · CNEE · Hàng"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full max-w-full flex-col gap-0 rounded-md px-0.5 py-0 text-left transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
          open ? "bg-ui-primary/10 ring-1 ring-ui-primary/30" : ""
        }`}
      >
        <SummaryLine label="Ship" value={shipperText} empty={!shipperText} />
        <SummaryLine label="CNEE" value={cneeText} empty={!cneeText} />
        <SummaryLine label="Hàng" value={goodsText} empty={!goodsText} />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label="Thông tin khách — chỉnh Shipper CNEE Hàng"
              className="fixed z-[640] w-[15.5rem] rounded-xl border border-ui-border bg-ui-surface p-2.5 shadow-lg shadow-slate-900/15"
              style={{ top: pos.top, left: pos.left }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ui-text-muted">
                  Thông tin KH
                </p>
                <button
                  type="button"
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
                  onClick={() => setOpen(false)}
                >
                  Đóng
                </button>
              </div>
              {editors}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
