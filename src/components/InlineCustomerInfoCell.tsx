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
  "box-border h-7 min-w-0 w-full max-w-full cursor-pointer truncate rounded-lg border border-ui-border bg-ui-surface px-2 py-0 text-[11px] font-semibold leading-none text-ui-text focus:outline-none focus:ring-1 focus:ring-ui-focus disabled:cursor-default disabled:opacity-45";

const LINE =
  "block h-3.5 w-full truncate text-left text-[10px] font-semibold leading-[0.875rem] text-ui-text";

const FIELD_LABEL =
  "w-[3.25rem] shrink-0 pt-1.5 text-[10px] font-semibold leading-none text-ui-text-muted";

/** Chỉ cắt rất dài (option/select); ô tóm tắt dùng CSS truncate theo cột. */
function clipLabel(s: string, max = 48): string {
  const t = s.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function shortShipperLabel(sc: CustomerSavedShipper): string {
  return sc.shipperName.trim() || sc.label.trim() || sc.id;
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
  emptyLabel,
  disabled,
  title,
  children,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  emptyLabel: string;
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
      <option value="">{emptyLabel}</option>
      {children}
    </select>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className={FIELD_LABEL}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
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
 * Ô INFO KH: mặc định 3 dòng tóm tắt; click → panel chỉnh Shipper / CNEE (+ tên in) / Hàng.
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

  const cneePrint = (shipment.consigneeNamePrint ?? "").trim();
  const cneeProfileName = selectedConsignee
    ? formatSavedConsigneeShortLabel(selectedConsignee).trim()
    : "";
  const printDiffers =
    Boolean(cneePrint) &&
    Boolean(cneeProfileName) &&
    cneePrint.toUpperCase() !== cneeProfileName.toUpperCase();

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 272;
    const estH = 220;
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
    <div className="flex min-w-0 flex-col gap-2">
      <FieldRow label="Shipper">
        <MiniSelect
          ariaLabel="Chọn Shipper lưu sẵn"
          value={shipperId}
          emptyLabel={shippers.length ? "— Chọn —" : "— Chưa có —"}
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
      </FieldRow>

      <div className="flex min-w-0 flex-col gap-1">
        <FieldRow label="CNEE">
          <MiniSelect
            ariaLabel="Chọn CNEE lưu sẵn"
            value={consigneeId}
            emptyLabel={consignees.length ? "— Chọn —" : "— Chưa có —"}
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
        </FieldRow>

        <div className="ml-[3.25rem] flex min-w-0 items-center gap-1.5 pl-2">
          <span
            className={`shrink-0 text-[9px] font-medium ${
              printDiffers ? "text-amber-700" : "text-ui-text-muted"
            }`}
            title="Tên CNEE trên phiếu in (có thể khác hồ sơ đã chọn)"
          >
            Tên in
          </span>
          <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-dashed border-ui-border/80 bg-ui-surface-muted/40 px-1.5 [&_input]:h-6 [&_input]:text-[10px]">
            <InlineTextEdit
              value={shipment.consigneeNamePrint ?? ""}
              placeholder="Theo hồ sơ CNEE"
              title={
                cneePrint
                  ? `Tên in: ${cneePrint}`
                  : "Sửa tên CNEE trên phiếu in"
              }
              className="h-6 text-[10px] font-medium text-ui-text"
              maxLength={CNEE_PRINT_MAX_LEN}
              gridNav={{ rowId: shipment.id, field: "cneePrint" }}
              validate={validateInlineCneePrint}
              onCommit={(v) =>
                onUpdate({ consigneeNamePrint: normalizeInlineCneePrint(v) })
              }
            />
          </div>
        </div>
      </div>

      <FieldRow label="Hàng">
        <MiniSelect
          ariaLabel="Chọn tên hàng lưu sẵn trong hồ sơ khách"
          value={goodsId}
          emptyLabel={goods.length ? "— Chọn —" : "— Chưa có —"}
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
      </FieldRow>
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
              aria-label="Chỉnh Shipper, CNEE và Hàng"
              className="fixed z-[640] w-[17rem] rounded-xl border border-ui-border bg-ui-surface p-2.5 shadow-lg shadow-slate-900/15"
              style={{ top: pos.top, left: pos.left }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-ui-border/70 pb-1.5">
                <p className="text-[11px] font-semibold text-ui-text">Hồ sơ KH</p>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ui-text-muted transition hover:bg-ui-surface-muted hover:text-ui-text"
                  onClick={() => setOpen(false)}
                  aria-label="Đóng"
                >
                  ✕
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
