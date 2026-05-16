import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { canPrintDimScscReport, printDimReport } from "../utils/printDimReport";
import { downloadScscDimListExcel } from "../utils/exportScscDimListExcel";
import { canPrintWeighReceiptScsc, printWeighReceiptScscWithConsigneeChoice } from "../utils/printWeighReceiptScsc";
import {
  canExportTcsDimTemplate,
  downloadTcsAttachedDimsExcel,
  printTcsAttachedDimsList,
} from "../utils/exportTcsAttachedDimsExcel";
import { isTcsWarehouse } from "../constants/warehouses";

type Props = {
  row: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  onEdit: (s: Shipment) => void;
  onPrint: (s: Shipment) => void;
  onDelete: (id: string) => void;
};

export function ShipmentRowActionsMenu({ row, customerDirectory, onEdit, onPrint, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** fixed — tránh bị cắt bởi overflow-x-auto của bảng */
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    const update = () => {
      const btn = triggerRef.current;
      const menu = menuRef.current;
      if (!btn) return;
      const tr = btn.getBoundingClientRect();
      const gap = 6;
      const menuH = menu?.offsetHeight ?? 220;
      let top = tr.bottom + gap;
      if (top + menuH > window.innerHeight - 10) {
        top = Math.max(10, tr.top - menuH - gap);
      }
      setMenuStyle({
        position: "fixed",
        top,
        right: Math.max(10, window.innerWidth - tr.right),
        zIndex: 450,
        minWidth: "9rem",
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const item = (label: string, onClick: () => void, tone?: "danger") => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpen(false);
        onClick();
      }}
      className={`block w-full px-3 py-2 text-left text-xs font-semibold hover:bg-black/[0.04] ${
        tone === "danger" ? "text-red-700" : "text-apple-label"
      }`}
    >
      {label}
    </button>
  );

  const menuPanel = open ? (
    <div
      ref={menuRef}
      style={menuStyle ?? { position: "fixed", visibility: "hidden", right: 0, top: 0, zIndex: 450 }}
      className="overflow-hidden rounded-xl border border-black/[0.12] bg-white py-1 shadow-apple-md"
      role="menu"
    >
      {item("In nhãn", () => onPrint(row))}
      {canPrintWeighReceiptScsc(row)
        ? item("In tờ cân", () => void printWeighReceiptScscWithConsigneeChoice(row, { customerDirectory }))
        : null}
      {canPrintDimScscReport(row) ? item("In DIM", () => printDimReport(row)) : null}
      {canPrintDimScscReport(row) ? item("Excel DIM", () => downloadScscDimListExcel(row)) : null}
      {isTcsWarehouse(row.warehouse) && canExportTcsDimTemplate(row)
        ? item("DIM TCS", () => printTcsAttachedDimsList(row))
        : null}
      {isTcsWarehouse(row.warehouse) && canExportTcsDimTemplate(row)
        ? item("Excel TCS", () => downloadTcsAttachedDimsExcel(row))
        : null}
      {item("Sửa", () => onEdit(row))}
      {item("Xóa", () => {
        if (confirm(`Xóa AWB ${row.awb}?`)) onDelete(row.id);
      }, "danger")}
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Thao tác"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded border border-black/[0.1] bg-white px-1.5 py-1 text-[10px] font-bold text-apple-secondary shadow-sm hover:bg-black/[0.04]"
      >
        ⋮
      </button>
      {typeof document !== "undefined" && menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  );
}
