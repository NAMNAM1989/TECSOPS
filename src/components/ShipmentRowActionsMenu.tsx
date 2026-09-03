import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { canPrintDimScscReport, printDimReport } from "../utils/printDimReport";
import {
  canExportTcsDimTemplate,
  downloadTcsAttachedDimsExcel,
  printTcsAttachedDimsList,
} from "../utils/exportTcsAttachedDimsExcel";
import { awbDigitsKey } from "../utils/awbFormat";
import { isTcsWarehouse } from "../constants/warehouses";
import { isScscH21Warehouse } from "../types/scscH21Catalog";
import { isTcsH21Warehouse } from "../types/tcsH21Catalog";
import { OPS } from "../styles/opsModalStyles";

const CsdPrintModal = lazy(() =>
  import("./CsdPrintModal").then((module) => ({ default: module.CsdPrintModal })),
);

const CSD_AIRLINE: Record<"FD" | "TG" | "MH", string> = {
  FD: "Thai AirAsia",
  TG: "Thai Airways",
  MH: "Malaysia Airlines",
};

type Props = {
  row: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  onPrint: (s: Shipment) => void;
  onDelete: (id: string) => void;
  /** Lập invoice H21 từ catalog SCSC — chỉ truyền khi kho SCSC. */
  onInvoice?: (s: Shipment) => void;
  compact?: boolean;
  /** Card mobile denser — nút menu ~32px. */
  dense?: boolean;
};

const iconCls = "h-3.5 w-3.5";

function lightweightCsdCarrier(row: Pick<Shipment, "flight" | "awb">): "FD" | "TG" | "MH" | null {
  if (awbDigitsKey(row.awb).length !== 11) return null;
  const flight = String(row.flight || "").trim().toUpperCase().replace(/\s+/g, "");
  if (flight.startsWith("FD")) return "FD";
  if (flight.startsWith("TG")) return "TG";
  if (flight.startsWith("MH")) return "MH";
  return null;
}

function ActionIconBtn({
  label,
  shortLabel,
  onClick,
  active,
  children,
}: {
  label: string;
  shortLabel?: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${OPS.actionIcon} ${shortLabel ? "w-auto gap-0.5 px-1.5" : ""} ${
        active ? OPS.actionIconOpen : ""
      }`}
    >
      {children}
      {shortLabel ? (
        <span className="text-[10px] font-semibold leading-none">{shortLabel}</span>
      ) : null}
    </button>
  );
}

function IconPrintLabel() {
  return (
    <svg className={iconCls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 9V4h12v5M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"
      />
    </svg>
  );
}

function IconDimReport() {
  return (
    <svg className={iconCls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10M8 7v10" />
    </svg>
  );
}

function IconPdfDim() {
  return (
    <svg className={iconCls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M9 13h6M9 17h4"
      />
    </svg>
  );
}

function IconKebabVertical() {
  return (
    <svg className={iconCls} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="5.5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="18.5" r="1.5" />
    </svg>
  );
}

function IconInvoice() {
  return (
    <svg className={iconCls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5h6M7 3h10a1 1 0 011 1v16l-3-1.5L12 20l-3-1.5L6 20V4a1 1 0 011-1zM9 10h6M9 14h4"
      />
    </svg>
  );
}

function IconCsd() {
  return (
    <svg className={iconCls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6M9 16h6M7 4h7l3 3v13a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
      />
    </svg>
  );
}

function menuPositionFromTrigger(btn: HTMLElement): CSSProperties {
  const tr = btn.getBoundingClientRect();
  const gap = 4;
  const approxH = 140;
  let top = tr.bottom + gap;
  if (top + approxH > window.innerHeight - 8) {
    top = Math.max(8, tr.top - approxH - gap);
  }
  return {
    position: "fixed",
    top,
    right: Math.max(8, window.innerWidth - tr.right),
    zIndex: 450,
    minWidth: "9.5rem",
  };
}

export function ShipmentRowActionsMenu({
  row,
  customerDirectory,
  onPrint,
  onDelete,
  onInvoice,
  compact = false,
  dense = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const showDim = canPrintDimScscReport(row);
  const showTcsDim = isTcsWarehouse(row.warehouse) && canExportTcsDimTemplate(row);
  const showTcsDimPdf = isTcsWarehouse(row.warehouse) && (row.dimLines?.length ?? 0) > 0;
  const showInvoice =
    Boolean(onInvoice) &&
    (isScscH21Warehouse(row.warehouse) || isTcsH21Warehouse(row.warehouse));
  const invoiceLabel = isTcsH21Warehouse(row.warehouse)
    ? "Invoice H21 TCS"
    : "Invoice H21 SCSC";
  const csdCarrier = lightweightCsdCarrier(row);
  const showCsd = csdCarrier != null;
  const showCsdInline = showCsd && !compact;
  const csdAirline = csdCarrier ? CSD_AIRLINE[csdCarrier] : "";
  const [csdOpen, setCsdOpen] = useState(false);
  const menuExtras =
    (showDim ? 1 : 0) +
    (showTcsDim ? 2 : 0) +
    (showTcsDimPdf ? 1 : 0) +
    (showCsd ? 1 : 0) +
    (showInvoice ? 1 : 0) +
    1;

  const confirmDelete = () => {
    if (confirm(`Xóa lô AWB ${row.awb || "(chưa có AWB)"}?`)) onDelete(row.id);
  };

  const openMenu = () => {
    const btn = triggerRef.current;
    if (btn) setMenuStyle(menuPositionFromTrigger(btn));
    setMenuOpen(true);
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setMenuStyle(null);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const update = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      setMenuStyle(menuPositionFromTrigger(btn));
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      closeMenu();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", close, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", close, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const menuItem = (
    label: string,
    onClick: () => void,
    tone?: "danger",
    testId?: string,
    title?: string
  ) => (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        closeMenu();
        onClick();
      }}
      className={`${OPS.dropdownItem} ${tone === "danger" ? OPS.dropdownItemDanger : ""}`}
    >
      {label}
    </button>
  );

  const dropdown =
    menuOpen && menuStyle ? (
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        data-testid={`row-actions-dropdown-${row.id}`}
        style={menuStyle}
        className={OPS.dropdown}
      >
        {compact ? menuItem("In nhãn", () => onPrint(row)) : null}
        {showInvoice
          ? menuItem(
              `Invoice H21${
                row.invoiceDeclarations?.length
                  ? ` (${row.invoiceDeclarations.length} tờ)`
                  : row.invoiceItems?.length
                    ? ` (${row.invoiceItems.length})`
                    : ""
              }`,
              () => onInvoice?.(row),
              undefined,
              `row-invoice-h21-${row.id}`
            )
          : null}
        {showDim
          ? menuItem("Excel LIST DIM", () => {
              void import("../utils/exportScscDimListExcel").then((m) =>
                m.downloadScscDimListExcel(row)
              );
            })
          : null}
        {showTcsDim ? menuItem("In LIST DIM TCS", () => printTcsAttachedDimsList(row)) : null}
        {showTcsDim
          ? menuItem("Excel ATTACHED DIM", () => void downloadTcsAttachedDimsExcel(row))
          : null}
        {showTcsDimPdf
          ? menuItem("Tải PDF DIM TCS", () => {
              void import("../utils/tcsDimRecordForm").then((module) =>
                module.downloadTcsDimRecordPdf(row),
              );
            })
          : null}
        {showCsd && csdCarrier
          ? menuItem(
              `In CSD ${csdCarrier}`,
              () => {
                closeMenu();
                setCsdOpen(true);
              },
              undefined,
              `row-csd-${row.id}`,
              `Form CSD ${csdAirline} — nhập Transit rồi in`
            )
          : null}
        {menuExtras > 1 ? <div className={`my-0.5 border-t ${OPS.border}`} aria-hidden /> : null}
        {menuItem("Xóa lô", confirmDelete, "danger", `row-delete-${row.id}`)}
      </div>
    ) : null;

  return (
    <div
      ref={wrapRef}
      className={compact ? "inline-flex shrink-0 items-center" : OPS.actionToolbar}
    >
      {!compact ? (
        <>
          <ActionIconBtn label="In nhãn vận chuyển" shortLabel="In" onClick={() => onPrint(row)}>
            <IconPrintLabel />
          </ActionIconBtn>
          {showInvoice ? (
            <ActionIconBtn
              label={invoiceLabel}
              shortLabel="H21"
              active={Boolean(row.invoiceDeclarations?.length || row.invoiceItems?.length)}
              onClick={() => onInvoice?.(row)}
            >
              <IconInvoice />
            </ActionIconBtn>
          ) : null}
          {showDim ? (
            <ActionIconBtn label="In LIST DIM SCSC" onClick={() => printDimReport(row)}>
              <IconDimReport />
            </ActionIconBtn>
          ) : null}
          {showTcsDimPdf ? (
            <ActionIconBtn
              label="Tải PDF DIM TCS (QF/ED/49)"
              onClick={() => {
                void import("../utils/tcsDimRecordForm").then((module) =>
                  module.downloadTcsDimRecordPdf(row),
                );
              }}
            >
              <IconPdfDim />
            </ActionIconBtn>
          ) : null}
        </>
      ) : null}
      {showCsdInline && csdCarrier ? (
        <button
          type="button"
          title={`In CSD ${csdCarrier} (${csdAirline}) — nhập Transit rồi in`}
          aria-label={`In CSD ${csdCarrier}`}
          data-testid={`row-csd-btn-${row.id}`}
          onClick={(e) => {
            e.stopPropagation();
            setCsdOpen(true);
          }}
          className="inline-flex h-7 items-center rounded-md border border-rose-500/35 bg-rose-50 px-1.5 text-[10px] font-bold text-rose-900 hover:bg-rose-100"
        >
          <IconCsd />
          <span className="ml-0.5">CSD {csdCarrier}</span>
        </button>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        title="Menu thao tác lô hàng"
        aria-label="Menu"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-controls={menuOpen ? menuId : undefined}
        data-testid={`row-actions-menu-${row.id}`}
        onClick={(e) => {
          e.stopPropagation();
          if (menuOpen) closeMenu();
          else openMenu();
        }}
        className={`${
          dense
            ? "inline-flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-ui-border/80 bg-ui-surface text-ui-text transition-colors hover:bg-ui-surface-muted focus:outline-none focus:ring-2 focus:ring-ui-focus"
            : compact
              ? "inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-ui-border bg-ui-surface text-ui-text shadow-sm transition-colors hover:bg-ui-surface-muted focus:outline-none focus:ring-2 focus:ring-ui-focus"
              : OPS.actionIcon
        } ${menuOpen ? OPS.actionIconOpen : ""}`}
      >
        <IconKebabVertical />
      </button>
      {typeof document !== "undefined" && dropdown ? createPortal(dropdown, document.body) : null}
      {csdOpen ? (
        <Suspense fallback={null}>
          <CsdPrintModal
            open
            shipment={row}
            customerDirectory={customerDirectory}
            onClose={() => setCsdOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
