import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { canPrintDimScscReport, printDimReport } from "../utils/printDimReport";
import { downloadScscDimListExcel } from "../utils/exportScscDimListExcel";
import {
  canExportTcsDimTemplate,
  downloadTcsAttachedDimsExcel,
  printTcsAttachedDimsList,
} from "../utils/exportTcsAttachedDimsExcel";
import { isTcsWarehouse } from "../constants/warehouses";
import { OPS } from "../styles/opsModalStyles";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";

type Props = {
  row: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  onPrint: (s: Shipment) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, patch: Partial<Shipment>) => void;
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

export function ShipmentRowActionsMenu({
  row,
  customerDirectory: _customerDirectory,
  onPrint,
  onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  const showDim = canPrintDimScscReport(row);
  const showTcsDim = isTcsWarehouse(row.warehouse) && canExportTcsDimTemplate(row);
  const menuExtras = (showDim ? 1 : 0) + (showTcsDim ? 2 : 0) + 1;

  const confirmDelete = () => {
    if (confirm(`Xóa lô AWB ${row.awb || "(chưa có AWB)"}?`)) onDelete(row.id);
  };

  useEffect(() => {
    if (!menuOpen) {
      setMenuStyle(null);
      return;
    }
    const update = () => {
      const btn = triggerRef.current;
      const menu = menuRef.current;
      if (!btn) return;
      const tr = btn.getBoundingClientRect();
      const gap = 4;
      const menuH = menu?.offsetHeight ?? 160;
      let top = tr.bottom + gap;
      if (top + menuH > window.innerHeight - 8) {
        top = Math.max(8, tr.top - menuH - gap);
      }
      setMenuStyle({
        position: "fixed",
        top,
        right: Math.max(8, window.innerWidth - tr.right),
        zIndex: 450,
        minWidth: "9.5rem",
      });
    };
    update();
    const id = requestAnimationFrame(update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const menuItem = (label: string, onClick: () => void, tone?: "danger") => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setMenuOpen(false);
        onClick();
      }}
      className={`${OPS.dropdownItem} ${tone === "danger" ? OPS.dropdownItemDanger : ""}`}
    >
      {label}
    </button>
  );

  const dropdownMenu = menuOpen ? (
    <div
      ref={menuRef}
      style={menuStyle ?? { position: "fixed", visibility: "hidden", right: 0, top: 0, zIndex: 450 }}
      className={OPS.dropdown}
      role="menu"
    >
      {showDim ? menuItem("Excel DIM", () => downloadScscDimListExcel(row)) : null}
      {showTcsDim ? menuItem("In DIM TCS", () => printTcsAttachedDimsList(row)) : null}
      {showTcsDim ? menuItem("Excel TCS", () => void downloadTcsAttachedDimsExcel(row)) : null}
      {menuExtras > 1 ? <div className={`my-0.5 border-t ${OPS.border}`} aria-hidden /> : null}
      {menuItem("Xóa lô", confirmDelete, "danger")}
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className={OPS.actionToolbar}>
      <ActionIconBtn label="In nhãn vận chuyển" onClick={() => onPrint(row)}>
        <IconPrintLabel />
      </ActionIconBtn>
      {showDim ? (
        <ActionIconBtn label="In DIM SCSC" onClick={() => printDimReport(row)}>
          <IconDimReport />
        </ActionIconBtn>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        title={`Thêm (${menuExtras})`}
        aria-label="Menu thao tác lô hàng"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className={`${OPS.actionIcon} ${menuOpen ? OPS.actionIconOpen : ""}`}
      >
        <IconKebabVertical />
      </button>
      {typeof document !== "undefined" && dropdownMenu ? createPortal(dropdownMenu, document.body) : null}
    </div>
  );
}
