import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
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
  globalAgents?: GlobalAgentCatalog;
  scscWeighPrintSettings?: ScscWeighPrintSettings;
  saveScscWeighPrintSettings?: (settings: ScscWeighPrintSettings) => void | Promise<void>;
  onPrint: (s: Shipment) => void;
  onDelete: (id: string) => void;
};

function ActionIconBtn({
  label,
  onClick,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "sky" | "amber" | "danger";
  children: ReactNode;
}) {
  const toneCls =
    tone === "sky"
      ? "border-sky-200/80 text-sky-800 hover:bg-sky-50"
      : tone === "amber"
        ? "border-amber-200/80 text-amber-900 hover:bg-amber-50"
        : tone === "danger"
          ? "border-red-300/80 bg-red-50/80 text-red-600 hover:border-red-400 hover:bg-red-100 hover:text-red-800"
          : "border-black/[0.08] text-apple-secondary hover:bg-black/[0.04] hover:text-apple-label";

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-white shadow-sm transition active:scale-[0.96] ${toneCls}`}
    >
      {children}
    </button>
  );
}

const iconCls = "h-3.5 w-3.5";

function IconPrintLabel() {
  return (
    <svg className={iconCls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
      />
    </svg>
  );
}

function IconMore() {
  return (
    <svg className={iconCls} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

export function ShipmentRowActionsMenu({
  row,
  customerDirectory,
  globalAgents,
  scscWeighPrintSettings,
  saveScscWeighPrintSettings,
  onPrint,
  onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  const showWeigh = canPrintWeighReceiptScsc(row);
  const showDim = canPrintDimScscReport(row);
  const showTcsDim = isTcsWarehouse(row.warehouse) && canExportTcsDimTemplate(row);

  const confirmDelete = () => {
    if (confirm(`Xóa lô AWB ${row.awb || "(chưa có AWB)"}?`)) onDelete(row.id);
  };

  useLayoutEffect(() => {
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
      className={`block w-full px-2.5 py-1.5 text-left text-[11px] font-semibold hover:bg-black/[0.04] ${
        tone === "danger" ? "text-red-700" : "text-apple-label"
      }`}
    >
      {label}
    </button>
  );

  const dropdownMenu = menuOpen ? (
    <div
      ref={menuRef}
      style={menuStyle ?? { position: "fixed", visibility: "hidden", right: 0, top: 0, zIndex: 450 }}
      className="overflow-hidden rounded-lg border border-black/[0.1] bg-white py-0.5 shadow-apple-md"
      role="menu"
    >
      {showWeigh
        ? menuItem("In tờ cân SCSC", () =>
            void printWeighReceiptScscWithConsigneeChoice(row, {
              customerDirectory,
              globalAgents,
              scscWeighPrintSettings,
              saveScscWeighPrintSettings,
            })
          )
        : null}
      {showDim ? menuItem("In DIM SCSC", () => printDimReport(row)) : null}
      {showDim ? menuItem("Excel DIM", () => downloadScscDimListExcel(row)) : null}
      {showTcsDim ? menuItem("In DIM TCS", () => printTcsAttachedDimsList(row)) : null}
      {showTcsDim ? menuItem("Excel TCS", () => void downloadTcsAttachedDimsExcel(row)) : null}
      {(showWeigh || showDim || showTcsDim) ? (
        <div className="my-0.5 border-t border-black/[0.06]" aria-hidden />
      ) : null}
      {menuItem("Xóa lô", confirmDelete, "danger")}
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className="inline-flex items-center gap-0.5">
      <ActionIconBtn label="In nhãn" onClick={() => onPrint(row)}>
        <IconPrintLabel />
      </ActionIconBtn>
      <button
        ref={triggerRef}
        type="button"
        title="Thêm thao tác"
        aria-label="Menu thao tác lô hàng"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-black/[0.08] bg-white text-apple-secondary shadow-sm hover:bg-black/[0.04]"
      >
        <IconMore />
      </button>
      {typeof document !== "undefined" && dropdownMenu ? createPortal(dropdownMenu, document.body) : null}
    </div>
  );
}
