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
import { isEcargoScscWarehouse, isTcsWarehouse } from "../constants/warehouses";
import { ConfirmDialog } from "../ui";
import { OPS } from "../styles/opsModalStyles";
import { useEcargoRegisterActions } from "./EcargoRegisterActionsContext";
import { useTcsPortalActionsContext } from "./TcsPortalActionsContext";

const CsdPrintModal = lazy(() =>
  import("./CsdPrintModal").then((module) => ({ default: module.CsdPrintModal })),
);

const CSD_AIRLINE: Record<"FD" | "TH", string> = {
  FD: "Thai AirAsia",
  TH: "Thai Airways",
};

function lightweightCsdCarrier(row: Pick<Shipment, "flight" | "awb">): "FD" | "TH" | null {
  if (awbDigitsKey(row.awb).length !== 11) return null;
  const flight = String(row.flight || "").trim().toUpperCase().replace(/\s+/g, "");
  if (flight.startsWith("FD")) return "FD";
  if (flight.startsWith("TH")) return "TH";
  return null;
}

function portalChecklistWarnings(row: Shipment): string[] {
  return [
    !String(row.flight || "").trim() ? "Thiếu chuyến bay" : "",
    !String(row.dest || "").trim() ? "Thiếu điểm đến" : "",
    !(Number(row.pcs) > 0) ? "PCS chưa hợp lệ" : "",
    !(Number(row.kg) > 0) ? "KG chưa hợp lệ" : "",
    !String(row.customerCode || "").trim() ? "Chưa gắn Customer Code" : "",
  ].filter(Boolean);
}

type PendingRowConfirm =
  | { kind: "checklist"; action: "fill" | "ecargo"; warnings: string[] }
  | { kind: "delete" };

type Props = {
  row: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  onPrint: (s: Shipment) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, patch: Partial<Shipment>) => void;
  compact?: boolean;
  /** Viewport ≤767 — ẩn Điền; giữ PDF */
  isMobile?: boolean;
};

const iconCls = "h-3.5 w-3.5";

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

function IconEcargo() {
  return (
    <svg className={iconCls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7h12M8 12h12M8 17h8M4 7h.01M4 12h.01M4 17h.01"
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
  compact = false,
  isMobile = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const tcs = useTcsPortalActionsContext();
  const ecargo = useEcargoRegisterActions();

  const showDim = canPrintDimScscReport(row);
  const showTcsDim = isTcsWarehouse(row.warehouse) && canExportTcsDimTemplate(row);
  /** Form QF/ED/49 — family TCS (TCS / TECS-TCS), cùng chỗ LIST DIM. */
  const showTcsDimPdf = isTcsWarehouse(row.warehouse) && (row.dimLines?.length ?? 0) > 0;
  const showTcsEsid = isTcsWarehouse(row.warehouse) && Boolean(tcs);
  /** Điền ESID: chỉ PC — phone dùng Quét + PDF qua agent. */
  const showFillEsid =
    showTcsEsid && !isMobile && awbDigitsKey(row.awb).length === 11;
  const showEcargo = isEcargoScscWarehouse(row.warehouse) && Boolean(ecargo);
  const csdCarrier = lightweightCsdCarrier(row);
  const showCsd = csdCarrier != null;
  /** Mobile card: eC / CSD vào menu ⋮ — tránh che AWB và nút nhỏ khó bấm. */
  const showEcargoInline = showEcargo && !compact;
  const showCsdInline = showCsd && !compact;
  const csdAirline = csdCarrier ? CSD_AIRLINE[csdCarrier] : "";
  const [csdOpen, setCsdOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingRowConfirm | null>(null);
  const menuExtras =
    (showDim ? 1 : 0) +
    (showTcsDim ? 2 : 0) +
    (showTcsDimPdf ? 1 : 0) +
    (showTcsEsid ? 1 : 0) +
    (showFillEsid ? 1 : 0) +
    (showCsd ? 1 : 0) +
    (compact && showEcargo ? 1 : 0) +
    1;

  const confirmDelete = () => {
    setPendingConfirm({ kind: "delete" });
  };

  const runAfterChecklist = (action: "fill" | "ecargo") => {
    if (action === "fill") {
      if (tcs?.busy) return;
      void tcs?.fillEsidDeclareFor(row);
      return;
    }
    ecargo?.openForShipment(row.id);
  };

  const requestChecklistAction = (action: "fill" | "ecargo") => {
    const warnings = portalChecklistWarnings(row);
    if (!warnings.length) {
      runAfterChecklist(action);
      return;
    }
    setPendingConfirm({ kind: "checklist", action, warnings });
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
        {compact ? menuItem("In nhãn", () => onPrint(row)) : null}
        {compact && showEcargo
          ? menuItem(
              "Đăng ký eCargo",
              () => {
                requestChecklistAction("ecargo");
              },
              undefined,
              `row-ecargo-${row.id}`,
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
        {showFillEsid
          ? menuItem(
              "Điền",
              () => {
                requestChecklistAction("fill");
              },
              undefined,
              `row-fill-esid-${row.id}`,
              "Điền = tạo phiếu khai báo ESID trên TCS (đúng kho đang chọn). Không phụ thuộc Quét HT. Kiểm tra form rồi HOÀN TẤT."
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
      className={
        compact
          ? "inline-flex shrink-0 items-center"
          : OPS.actionToolbar
      }
    >
      {!compact ? (
        <>
          <ActionIconBtn label="In nhãn vận chuyển" shortLabel="In" onClick={() => onPrint(row)}>
            <IconPrintLabel />
          </ActionIconBtn>
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
      {showEcargoInline ? (
        <button
          type="button"
          title="Đăng ký eCargo lô này"
          aria-label="Đăng ký eCargo lô này"
          data-testid={`row-ecargo-${row.id}`}
          onClick={(e) => {
            e.stopPropagation();
            requestChecklistAction("ecargo");
          }}
          className="inline-flex h-7 items-center rounded-md border border-emerald-500/35 bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-900 hover:bg-emerald-100"
        >
          <IconEcargo />
          <span className="ml-0.5">eCargo</span>
        </button>
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
          compact
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
      <ConfirmDialog
        open={pendingConfirm?.kind === "checklist"}
        title="Checklist trước Fill/Register"
        message={
          pendingConfirm?.kind === "checklist"
            ? `Checklist trước Fill/Register:\n• ${pendingConfirm.warnings.join("\n• ")}\n\nTiếp tục mở form để kiểm tra thủ công?`
            : ""
        }
        confirmLabel="Tiếp tục"
        cancelLabel="Hủy"
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          const next = pendingConfirm;
          setPendingConfirm(null);
          if (next?.kind === "checklist") runAfterChecklist(next.action);
        }}
      />
      <ConfirmDialog
        open={pendingConfirm?.kind === "delete"}
        title="Xóa lô"
        message={`Xóa lô AWB ${row.awb || "(chưa có AWB)"}?`}
        confirmLabel="Xóa lô"
        cancelLabel="Hủy"
        danger
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          setPendingConfirm(null);
          onDelete(row.id);
        }}
      />
    </div>
  );
}
