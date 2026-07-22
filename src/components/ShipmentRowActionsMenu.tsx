import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { canPrintDimScscReport, printDimReport } from "../utils/printDimReport";
import { downloadScscDimListExcel } from "../utils/exportScscDimListExcel";
import {
  canExportTcsDimTemplate,
  downloadTcsAttachedDimsExcel,
  printTcsAttachedDimsList,
} from "../utils/exportTcsAttachedDimsExcel";
import { canExportEsidDeclare, downloadEsidDeclareExcel } from "../utils/exportEsidDeclareExcel";
import { awbDigitsKey } from "../utils/awbFormat";
import { isTcsWarehouse } from "../constants/warehouses";
import { OPS } from "../styles/opsModalStyles";
import { useTcsPortalActionsContext } from "./TcsPortalActionsContext";

type Props = {
  row: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  onPrint: (s: Shipment) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, patch: Partial<Shipment>) => void;
  /** @deprecated dùng Tải PDF ESID trong menu */
  onOpenTcsPortal?: (s: Shipment) => void;
  compact?: boolean;
};

const iconCls = "h-3.5 w-3.5";

function ActionIconBtn({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
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
      className={`${OPS.actionIcon} ${active ? OPS.actionIconOpen : ""}`}
    >
      {children}
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

function IconKebabVertical() {
  return (
    <svg className={iconCls} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="5.5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="18.5" r="1.5" />
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
  onOpenTcsPortal: _onOpenTcsPortal,
  compact = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const tcs = useTcsPortalActionsContext();

  const showDim = canPrintDimScscReport(row);
  const showTcsDim = isTcsWarehouse(row.warehouse) && canExportTcsDimTemplate(row);
  const showTcsEsid = isTcsWarehouse(row.warehouse) && Boolean(tcs);
  const showEsidExcel = canExportEsidDeclare(row);
  const showFillEsid = showTcsEsid && awbDigitsKey(row.awb).length === 11;
  const menuExtras =
    (showDim ? 1 : 0) +
    (showTcsDim ? 2 : 0) +
    (showTcsEsid ? 1 : 0) +
    (showFillEsid ? 1 : 0) +
    (showEsidExcel ? 1 : 0) +
    1;

  const confirmDelete = () => {
    if (confirm(`Xóa lô AWB ${row.awb || "(chưa có AWB)"}?`)) onDelete(row.id);
  };

  const openMenu = () => {
    const btn = triggerRef.current;
    if (btn) setMenuStyle(menuPositionFromTrigger(btn));
    setMenuOpen(true);
    // Không pre-warm tìm AWB khi mở ⋮ (tránh gõ vào ô tìm danh sách trước «Điền»).
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
        {showDim ? menuItem("Excel DIM", () => downloadScscDimListExcel(row)) : null}
        {showTcsDim ? menuItem("In DIM TCS", () => printTcsAttachedDimsList(row)) : null}
        {showTcsDim ? menuItem("Excel TCS", () => void downloadTcsAttachedDimsExcel(row)) : null}
        {showFillEsid
          ? menuItem(
              "Điền",
              () => {
                if (tcs?.busy) return;
                void tcs?.fillEsidDeclareFor(row);
              },
              undefined,
              `row-fill-esid-${row.id}`,
              "Điền ESID trên tab Chrome TCS đã login (extension). Agent ESID = nút Agent thanh TCS."
            )
          : null}
        {showTcsEsid
          ? menuItem(
              "Tải PDF ESID",
              () => {
                if (tcs?.busy) return;
                void tcs?.downloadEsidFor(row);
              },
              undefined,
              `row-pdf-esid-${row.id}`
            )
          : null}
        {showEsidExcel
          ? menuItem(
              "Excel khai báo ESID",
              () => {
                void downloadEsidDeclareExcel(row, customerDirectory);
              },
              undefined,
              `row-excel-esid-declare-${row.id}`
            )
          : null}
        {menuExtras > 1 ? <div className={`my-0.5 border-t ${OPS.border}`} aria-hidden /> : null}
        {menuItem("Xóa lô", confirmDelete, "danger", `row-delete-${row.id}`)}
      </div>
    ) : null;

  return (
    <div ref={wrapRef} className={OPS.actionToolbar}>
      {!compact ? (
        <>
          <ActionIconBtn label="In nhãn vận chuyển" onClick={() => onPrint(row)}>
            <IconPrintLabel />
          </ActionIconBtn>
          {showDim ? (
            <ActionIconBtn label="In DIM SCSC" onClick={() => printDimReport(row)}>
              <IconDimReport />
            </ActionIconBtn>
          ) : null}
        </>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        title={`Thêm (${menuExtras})`}
        aria-label="Menu thao tác lô hàng"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-controls={menuOpen ? menuId : undefined}
        data-testid={`row-actions-menu-${row.id}`}
        onClick={(e) => {
          e.stopPropagation();
          if (menuOpen) closeMenu();
          else openMenu();
        }}
        className={`${OPS.actionIcon} ${menuOpen ? OPS.actionIconOpen : ""}`}
      >
        <IconKebabVertical />
      </button>
      {typeof document !== "undefined" && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
