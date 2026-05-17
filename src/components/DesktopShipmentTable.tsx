import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { lookupCustomerCodeByName } from "../utils/customerDirectoryCore";
import { StatusSelect } from "./StatusBadge";
import { SummaryBar } from "./SummaryBar";
import { InlineNumberEdit } from "./InlineNumberEdit";
import { InlineTextEdit } from "./InlineTextEdit";
import { formatYmdToFlightDateDdMon, parseBookingDateLoose } from "../utils/bookingDateParse";
import { focusShipmentGridCell } from "../utils/focusShipmentGrid";
import { InlineAwbEdit } from "./InlineAwbEdit";
import { InlineCutoffBlock } from "./InlineCutoffBlock";
import { MobileDimKgModal } from "./MobileDimKgModal";
import { CustomerShipmentDetailModal } from "./CustomerShipmentDetailModal";
import { statusRowBg, statusRowBorder } from "./statusStyles";
import { ShipmentRowActionsMenu } from "./ShipmentRowActionsMenu";
import {
  warehouseLabel,
  warehouseSectionsForLayout,
  type WarehouseLayoutFilter,
} from "../constants/warehouses";
import { partitionShipmentsByWarehouse } from "../utils/partitionShipmentsByWarehouse";
import { formatShipmentDimWeightKg } from "../utils/volumetricDim";
import { useEcargoKhoScscRegister } from "../hooks/useEcargoKhoScscRegister";
import { canSendEcargoRegister } from "../utils/ecargoPayload";
import type { EcargoKhoScscPersistedMap } from "../utils/ecargoRegisterLocalStorage";
import { buildKhoScscEcargoPasteBlock, formatSessionYmdForEcargoPaste } from "../utils/ecargoPasteBlock";
import { findCustomerEntry, resolveSavedConsigneeForBooking } from "../utils/mapBookingToScaleTicketFormData";
import { buildShipmentPatchForSavedConsignee } from "../utils/customerConsigneeShipmentPatch";
import { InlineConsigneeSelect } from "./InlineConsigneeSelect";

interface Props {
  rows: Shipment[];
  /** Toàn bộ lô (kiểm tra trùng AWB khi sửa inline). */
  allRows: Shipment[];
  /** Danh bạ khách — dùng để đồng bộ mã khi sửa tên ô lưới. */
  customerDirectory?: readonly CustomerDirectoryEntry[];
  globalAgents?: import("../types/globalAgents").GlobalAgentCatalog;
  scscWeighPrintSettings?: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings;
  saveScscWeighPrintSettings?: (
    settings: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings
  ) => void | Promise<void>;
  /**
   * Khớp bộ lọc kho trên trang: khi chọn một kho cụ thể, chỉ hiển thị section kho đó (gọn màn hình).
   * `"ALL"` = hiện đủ 4 kho như trước.
   */
  warehouseLayoutFilter?: WarehouseLayoutFilter;
  /** Thêm dòng trống vào đúng kho (nút cạnh tiêu đề TCS / SCSC). */
  onAddBlankRow: (warehouse: Warehouse) => void;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onEdit: (s: Shipment) => void;
  /** Ngày phiên đang xem (YYYY-MM-DD) — parse ngày bay eCargo theo năm trên OPS. */
  viewSessionYmd: string;
}

const ECARGO_VEHICLE_MIN = 7;

/** Nội dung modal eCargo: số xe, gửi, khối 5 dòng, copy. */
function EcargoKhoScscModalBody({
  row,
  vehicleForEcargo,
  pasteDate,
  ecargoCanSubmit,
  onVehicleChange,
  onRegister,
  onClose,
}: {
  row: Shipment;
  vehicleForEcargo: string;
  pasteDate: string;
  ecargoCanSubmit: boolean;
  onVehicleChange: (raw: string) => void;
  onRegister: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasVehicle = vehicleForEcargo.trim().length >= ECARGO_VEHICLE_MIN;
  const pasteText = useMemo(
    () => buildKhoScscEcargoPasteBlock(row, vehicleForEcargo, pasteDate),
    [pasteDate, row, vehicleForEcargo]
  );

  const copyPasteBlock = useCallback(async () => {
    if (!hasVehicle) return;
    try {
      await navigator.clipboard.writeText(pasteText);
      onClose();
    } catch {
      window.alert("Không sao chép được — chọn trong ô và Ctrl+C.");
    }
  }, [hasVehicle, onClose, pasteText]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  return (
    <div className="space-y-5 px-5 pb-5 pt-4 sm:px-8 sm:pb-8">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="mb-2 block text-sm font-semibold text-apple-secondary">Số xe</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            placeholder="VD: 50H17480"
            value={vehicleForEcargo}
            onChange={(e) => onVehicleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ecargoCanSubmit) {
                e.preventDefault();
                onRegister();
              }
            }}
            className="h-14 w-full rounded-[1.1rem] border border-black/[0.12] bg-[#f7f7fb] px-5 font-mono text-lg font-bold uppercase tracking-wide text-apple-label shadow-inner placeholder:text-apple-tertiary focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          />
        </label>
        <button
          type="button"
          disabled={!ecargoCanSubmit}
          aria-label="Đăng ký eCargo"
          onClick={() => onRegister()}
          className="h-12 shrink-0 rounded-2xl bg-sky-600 px-7 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_6px_14px_rgba(2,132,199,0.28)] transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-black/30 disabled:shadow-none"
        >
          Gửi ECARGO
        </button>
      </div>
      <div>
        <span className="mb-2 block text-sm font-semibold text-apple-secondary">Nội dung sao chép</span>
        <textarea
          readOnly
          value={pasteText}
          rows={5}
          spellCheck={false}
          className="w-full resize-none rounded-[1.1rem] border border-black/[0.1] bg-zinc-50 px-5 py-4 font-mono text-lg font-bold leading-[1.7] text-apple-label shadow-inner focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          onFocus={(e) => e.target.select()}
        />
      </div>
      <button
        type="button"
        disabled={!hasVehicle}
        aria-label="Sao chép khối dán"
        onClick={() => void copyPasteBlock()}
        className="w-full rounded-2xl border-2 border-sky-400/80 bg-gradient-to-b from-sky-50 to-sky-100/90 py-4 text-xl font-extrabold uppercase tracking-wide text-sky-950 shadow-sm transition hover:border-sky-500 hover:from-sky-100 hover:to-sky-50 disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-zinc-100 disabled:from-zinc-100 disabled:to-zinc-100 disabled:text-apple-tertiary"
      >
        SAO CHÉP
      </button>
    </div>
  );
}

function EcargoKhoScscCenterModal({
  rowId,
  row,
  vehicleForEcargo,
  viewSessionYmd,
  ecargoCanSubmit,
  onVehicleChange,
  onRegister,
  onClose,
}: {
  rowId: string;
  row: Shipment;
  vehicleForEcargo: string;
  viewSessionYmd: string;
  ecargoCanSubmit: boolean;
  onVehicleChange: (raw: string) => void;
  onRegister: () => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[420] flex items-center justify-center bg-black/45 p-4 backdrop-blur-md animate-ecargo-backdrop-in motion-reduce:animate-none sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`ecargo-modal-title-${rowId}`}
        data-ecargo-panel={rowId}
        id={`ecargo-panel-${rowId}`}
        className="relative w-full max-w-2xl origin-center animate-ecargo-card-in motion-reduce:animate-none motion-reduce:opacity-100"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-[1.35rem] border border-black/[0.08] bg-white shadow-apple-md ring-1 ring-black/[0.06]">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] bg-white px-5 py-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-700 shadow-sm">
                <svg className="h-6 w-8" viewBox="0 0 32 22" fill="currentColor" aria-hidden>
                  <path opacity="0.35" d="M2 14h6v5H2v-5zm22 0h6v5h-6v-5z" />
                  <path d="M1 15.5V8.5L4 5h8l2.5 3H27l3 4.5v6H1zm3-6.5v4h6V9H4zm9 0v4h14l-2-2.5H13V9z" />
                  <circle cx="8" cy="19" r="2.2" />
                  <circle cx="24" cy="19" r="2.2" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 id={`ecargo-modal-title-${rowId}`} className="text-2xl font-extrabold tracking-tight text-apple-label">
                  eCargo
                </h2>
                <p className="truncate font-mono text-sm font-bold text-apple-secondary">
                  Lô #{row.stt} · {row.awb}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Đóng"
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-apple-secondary transition hover:bg-black/[0.06] hover:text-apple-label"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <EcargoKhoScscModalBody
            row={row}
            vehicleForEcargo={vehicleForEcargo}
            pasteDate={formatSessionYmdForEcargoPaste(viewSessionYmd)}
            ecargoCanSubmit={ecargoCanSubmit}
            onVehicleChange={onVehicleChange}
            onRegister={onRegister}
            onClose={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

const COL_HEADERS = [
  { key: "stt", label: "#", w: "w-8" },
  { key: "awb", label: "AWB / HAWB", w: "min-w-[9rem]" },
  { key: "flight", label: "CHUYẾN", w: "min-w-[5.5rem]" },
  { key: "cutoff", label: "CUTOFF", w: "min-w-[5.5rem]" },
  { key: "dest", label: "DST", w: "w-12" },
  { key: "pcs", label: "KIỆN", w: "w-12 text-right" },
  { key: "kg", label: "KG", w: "w-12 text-right" },
  { key: "dim", label: "DIM", w: "w-14 text-right" },
  { key: "customer", label: "KHÁCH", w: "min-w-[4.75rem] max-w-[6.5rem]" },
  { key: "cnee", label: "CNEE", w: "min-w-[5.25rem] max-w-[8.5rem]" },
  { key: "note", label: "NOTE", w: "min-w-[3.75rem] max-w-[7rem]" },
  { key: "status", label: "TT", w: "min-w-[6.5rem]" },
  { key: "actions", label: "", w: "min-w-[5.5rem]" },
] as const;

export function DesktopShipmentTable({
  rows,
  allRows,
  customerDirectory = [],
  globalAgents,
  scscWeighPrintSettings,
  saveScscWeighPrintSettings,
  warehouseLayoutFilter = "ALL",
  onAddBlankRow,
  onUpdate,
  onDelete,
  onPrint,
  onEdit,
  viewSessionYmd,
}: Props) {
  const ecargoRegister = useEcargoKhoScscRegister();
  const [dimModalRow, setDimModalRow] = useState<Shipment | null>(null);
  const [customerDetailRow, setCustomerDetailRow] = useState<Shipment | null>(null);
  const rowsByWarehouse = useMemo(() => partitionShipmentsByWarehouse(rows), [rows]);
  const warehouseSections = useMemo(
    () => warehouseSectionsForLayout(warehouseLayoutFilter),
    [warehouseLayoutFilter]
  );

  return (
    <>
    <div className="hidden md:block space-y-3">
      {warehouseSections.map((wh) => {
        const group = rowsByWarehouse[wh];

        return (
          <section key={wh}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-[15px] font-semibold tracking-tight text-apple-label">{warehouseLabel[wh]}</h2>
                <span className="rounded-full bg-apple-label px-2 py-0.5 text-[10px] font-semibold text-white">
                  {group.length} lô
                </span>
                <button
                  type="button"
                  onClick={() => void onAddBlankRow(wh)}
                  className="inline-flex items-center gap-1 rounded-full bg-apple-blue px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-apple-blue-hover active:scale-[0.98]"
                >
                  <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Nhập booking
                </button>
              </div>
              <SummaryBar rows={rows} warehouse={wh} />
            </div>

            <div className="max-h-[min(72vh,680px)] overflow-auto rounded-xl border border-black/[0.08] bg-white shadow-apple">
              <table className="w-full border-collapse text-left text-[11px] leading-tight">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-black/[0.08] bg-apple-bg shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                    {COL_HEADERS.map((c) => {
                      const w =
                        c.key === "actions"
                          ? wh === "KHO-SCSC"
                            ? "min-w-[7.75rem] w-[7.75rem]"
                            : "min-w-[5.75rem] w-[5.75rem]"
                          : c.w;
                      return (
                      <th
                        key={c.key}
                        className={`whitespace-nowrap border-r border-black/[0.06] px-1 py-1 text-[8px] font-semibold uppercase tracking-wide text-apple-secondary last:border-r-0 ${w}`}
                      >
                        {c.label}
                      </th>
                    );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {group.length === 0 ? (
                    <tr>
                      <td
                        colSpan={COL_HEADERS.length}
                        className="px-3 py-5 text-center text-xs text-apple-tertiary"
                      >
                        Chưa có lô
                      </td>
                    </tr>
                  ) : (
                    <WarehouseGroupRows
                      group={group}
                      sectionWarehouse={wh}
                      viewSessionYmd={viewSessionYmd}
                      ecargoMap={ecargoRegister.map}
                      onEcargoVehicleChange={ecargoRegister.setVehicle}
                      onEcargoRegister={ecargoRegister.register}
                      allRows={allRows}
                      customerDirectory={customerDirectory}
                      globalAgents={globalAgents}
                      scscWeighPrintSettings={scscWeighPrintSettings}
                      saveScscWeighPrintSettings={saveScscWeighPrintSettings}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      onPrint={onPrint}
                      onEdit={onEdit}
                      onOpenDimModal={setDimModalRow}
                      onOpenCustomerDetail={setCustomerDetailRow}
                    />
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
    {dimModalRow ? (
      <MobileDimKgModal
        key={dimModalRow.id}
        row={dimModalRow}
        onClose={() => setDimModalRow(null)}
        onSave={(payload) => {
          onUpdate(dimModalRow.id, payload);
          setDimModalRow(null);
        }}
      />
    ) : null}
    <CustomerShipmentDetailModal
      open={customerDetailRow != null}
      shipment={
        customerDetailRow ? rows.find((r) => r.id === customerDetailRow.id) ?? customerDetailRow : null
      }
      directory={customerDirectory}
      viewSessionYmd={viewSessionYmd}
      onClose={() => setCustomerDetailRow(null)}
    />
    </>
  );
}

function WarehouseGroupRows({
  group,
  sectionWarehouse,
  viewSessionYmd,
  ecargoMap,
  onEcargoVehicleChange,
  onEcargoRegister,
  allRows,
  customerDirectory,
  globalAgents,
  scscWeighPrintSettings,
  saveScscWeighPrintSettings,
  onUpdate,
  onDelete,
  onPrint,
  onEdit,
  onOpenDimModal,
  onOpenCustomerDetail,
}: {
  group: Shipment[];
  sectionWarehouse: Warehouse;
  viewSessionYmd: string;
  ecargoMap: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange: (id: string, raw: string) => void;
  onEcargoRegister: (row: Shipment, viewSessionYmd: string, vehicleRaw: string) => void;
  allRows: Shipment[];
  customerDirectory: readonly CustomerDirectoryEntry[];
  globalAgents?: import("../types/globalAgents").GlobalAgentCatalog;
  scscWeighPrintSettings?: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings;
  saveScscWeighPrintSettings?: (
    settings: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings
  ) => void | Promise<void>;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onEdit: (s: Shipment) => void;
  onOpenDimModal: (s: Shipment) => void;
  onOpenCustomerDetail: (s: Shipment) => void;
}) {
  const groupRowIds = group.map((r) => r.id);
  const [openEcargoRowId, setOpenEcargoRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!openEcargoRowId) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const panel = document.querySelector(`[data-ecargo-panel="${openEcargoRowId}"]`);
      const trig = document.querySelector(`[data-ecargo-trigger="${openEcargoRowId}"]`);
      if (panel?.contains(t) || trig?.contains(t)) return;
      setOpenEcargoRowId(null);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [openEcargoRowId]);

  return (
    <>
      {group.map((row) => (
        <ShipmentRow
          key={row.id}
          row={row}
          sectionWarehouse={sectionWarehouse}
          viewSessionYmd={viewSessionYmd}
          ecargoMap={ecargoMap}
          onEcargoVehicleChange={onEcargoVehicleChange}
          onEcargoRegister={onEcargoRegister}
          groupRowIds={groupRowIds}
          allRows={allRows}
          customerDirectory={customerDirectory}
          globalAgents={globalAgents}
          scscWeighPrintSettings={scscWeighPrintSettings}
          saveScscWeighPrintSettings={saveScscWeighPrintSettings}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onPrint={onPrint}
          onEdit={onEdit}
          onOpenDimModal={onOpenDimModal}
          onOpenCustomerDetail={onOpenCustomerDetail}
          ecargoTableOpen={openEcargoRowId === row.id}
          onToggleEcargoTable={() => setOpenEcargoRowId((p) => (p === row.id ? null : row.id))}
          onCloseEcargoTable={() => setOpenEcargoRowId((p) => (p === row.id ? null : p))}
        />
      ))}
    </>
  );
}

function ShipmentRow({
  row,
  sectionWarehouse,
  viewSessionYmd,
  ecargoMap,
  onEcargoVehicleChange,
  onEcargoRegister,
  groupRowIds,
  allRows,
  customerDirectory,
  globalAgents,
  scscWeighPrintSettings,
  saveScscWeighPrintSettings,
  onUpdate,
  onDelete,
  onPrint,
  onEdit,
  onOpenDimModal,
  onOpenCustomerDetail,
  ecargoTableOpen,
  onToggleEcargoTable,
  onCloseEcargoTable,
}: {
  row: Shipment;
  sectionWarehouse: Warehouse;
  viewSessionYmd: string;
  ecargoMap: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange: (id: string, raw: string) => void;
  onEcargoRegister: (row: Shipment, viewSessionYmd: string, vehicleRaw: string) => void;
  groupRowIds: string[];
  allRows: Shipment[];
  customerDirectory: readonly CustomerDirectoryEntry[];
  globalAgents?: import("../types/globalAgents").GlobalAgentCatalog;
  scscWeighPrintSettings?: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings;
  saveScscWeighPrintSettings?: (
    settings: import("../types/scscWeighPrintSettings").ScscWeighPrintSettings
  ) => void | Promise<void>;
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  onDelete: (id: string) => void;
  onPrint: (s: Shipment) => void;
  onEdit: (s: Shipment) => void;
  onOpenDimModal: (s: Shipment) => void;
  onOpenCustomerDetail: (s: Shipment) => void;
  ecargoTableOpen: boolean;
  onToggleEcargoTable: () => void;
  onCloseEcargoTable: () => void;
}) {
  const bg = statusRowBg[row.status];
  const border = statusRowBorder[row.status];
  const sessionYear = parseInt(row.sessionDate.slice(0, 4), 10) || new Date().getFullYear();
  const rowIdx = groupRowIds.indexOf(row.id);
  const hasNextRow = rowIdx >= 0 && rowIdx < groupRowIds.length - 1;
  const showEcargoKhoScsc = sectionWarehouse === "KHO-SCSC" && row.warehouse === "KHO-SCSC";
  const vehicleForEcargo = ecargoMap[row.id]?.vehicleInput ?? "";
  const ecargoCanSubmit = canSendEcargoRegister(row, vehicleForEcargo, viewSessionYmd);
  const customerEntry = findCustomerEntry(row, customerDirectory);
  const savedConsigneeOptions = customerEntry?.savedConsignees ?? [];
  const resolvedCnee = resolveSavedConsigneeForBooking(row, customerEntry);
  const cneePreview = (row.consigneeNamePrint?.trim() || resolvedCnee?.consigneeName?.trim() || "").slice(
    0,
    36
  );

  useEffect(() => {
    if (!ecargoTableOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseEcargoTable();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [ecargoTableOpen, onCloseEcargoTable]);

  const navDownSameField = (field: string) => () => {
    if (!hasNextRow) return;
    const nextId = groupRowIds[rowIdx + 1];
    focusShipmentGridCell(nextId, field);
  };

  const onFlightDateCommit = (t: string) => {
    const ymd = parseBookingDateLoose(t, sessionYear);
    if (!ymd) {
      window.alert("Ngày bay không hợp lệ (ví dụ 15APR hoặc 15/04/2026).");
      return;
    }
    onUpdate(row.id, { flightDate: formatYmdToFlightDateDdMon(ymd) });
  };

  const onFlightDateEnterDown = () => {
    if (hasNextRow) focusShipmentGridCell(groupRowIds[rowIdx + 1], "flight");
    else focusShipmentGridCell(row.id, "dest");
  };

  return (
    <>
    <tr
      id={`shipment-row-${row.id}`}
      className={`border-b border-black/[0.06] transition-colors hover:brightness-[0.99] ${bg} ${border}`}
    >
      {/* # */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 text-center text-[10px] font-semibold tabular-nums text-apple-secondary">
        {row.stt}
      </td>
      {/* AWB + HAWB — nhập inline (thêm dòng từ « Nhập booking »). */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 align-top">
        <div className="flex min-w-[8.5rem] flex-col gap-0">
          <InlineAwbEdit
            rowId={row.id}
            value={row.awb}
            allRows={allRows}
            onCommit={(awb) => onUpdate(row.id, { awb })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "hawb")}
          />
          <InlineTextEdit
            value={row.hawb ?? ""}
            placeholder="HAWB"
            className="font-mono text-[9px] font-semibold text-apple-secondary"
            maxLength={32}
            gridNav={{ rowId: row.id, field: "hawb" }}
            onCommit={(v) => onUpdate(row.id, { hawb: v.slice(0, 32) })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "flight")}
          />
        </div>
      </td>
      {/* Flight — 2 dòng: chuyến + ngày, Enter xuống ô kế */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 align-top">
        <div className="flex min-w-[5.5rem] flex-col gap-0">
          <InlineTextEdit
            value={row.flight}
            placeholder="Chuyến"
            className="text-[12px] font-semibold text-apple-label"
            uppercase
            maxLength={12}
            gridNav={{ rowId: row.id, field: "flight" }}
            onCommit={(v) => onUpdate(row.id, { flight: v })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "flightDate")}
          />
          <InlineTextEdit
            value={row.flightDate}
            placeholder="15APR"
            className="text-[9px] font-medium text-apple-secondary"
            uppercase
            maxLength={16}
            gridNav={{ rowId: row.id, field: "flightDate" }}
            onCommit={onFlightDateCommit}
            onEnterNavigateDown={onFlightDateEnterDown}
          />
        </div>
      </td>
      {/* Cutoff (giờ + ngày) + ghi chú cutoff — nhập inline */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 align-top">
        <div className="flex min-w-[5.5rem] flex-col gap-0">
          <InlineCutoffBlock
            rowId={row.id}
            cutoffIso={row.cutoff}
            sessionYear={sessionYear}
            onCommit={(iso) => onUpdate(row.id, { cutoff: iso })}
            onEnterAfterCommit={() => focusShipmentGridCell(row.id, "cutoffNote")}
          />
          <InlineTextEdit
            value={row.cutoffNote ?? ""}
            placeholder="PER"
            className="text-[9px] font-semibold text-apple-label"
            uppercase
            maxLength={32}
            gridNav={{ rowId: row.id, field: "cutoffNote" }}
            onCommit={(v) => onUpdate(row.id, { cutoffNote: v })}
            onEnterNavigateDown={() => focusShipmentGridCell(row.id, "dest")}
          />
        </div>
      </td>
      {/* DEST */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 text-center">
        <InlineTextEdit
          value={row.dest}
          placeholder="DEST"
            className="text-center text-[12px] font-semibold text-apple-label"
          uppercase
          maxLength={3}
          gridNav={{ rowId: row.id, field: "dest" }}
          onCommit={(v) => onUpdate(row.id, { dest: v.slice(0, 3) })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("dest") : undefined}
        />
      </td>
      {/* PCS — inline edit */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 text-right">
        <InlineNumberEdit
          value={row.pcs}
          placeholder="Nhập"
          className="font-mono text-[12px] font-bold tabular-nums"
          gridNav={{ rowId: row.id, field: "pcs" }}
          onCommit={(v) => onUpdate(row.id, { pcs: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("pcs") : undefined}
        />
      </td>
      {/* KG — inline edit */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 text-right">
        <InlineNumberEdit
          value={row.kg}
          placeholder="Nhập"
          className="font-mono text-[12px] font-bold tabular-nums"
          gridNav={{ rowId: row.id, field: "kg" }}
          onCommit={(v) => onUpdate(row.id, { kg: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("kg") : undefined}
        />
      </td>
      {/* DIM kg — khi đã có D×R×C: chỉ hiển thị + modal (tránh sửa nhanh làm mất dimLines → mất in DIM) */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 text-right align-top">
        <div className="flex flex-col items-end gap-0">
          {(row.dimLines?.length ?? 0) > 0 ? (
            <span className="font-mono text-[10px] font-semibold tabular-nums text-apple-label">
              {formatShipmentDimWeightKg(row.flight, row.dimWeightKg)}
            </span>
          ) : (
            <InlineNumberEdit
              value={row.dimWeightKg}
              placeholder="—"
              className="font-mono text-[11px] font-semibold tabular-nums"
              gridNav={{ rowId: row.id, field: "dimKg" }}
              onCommit={(v) =>
                onUpdate(row.id, { dimWeightKg: v, dimLines: null, dimDivisor: null })
              }
              onEnterNavigateDown={hasNextRow ? navDownSameField("dimKg") : undefined}
            />
          )}
          <button
            type="button"
            aria-label="Nhập DIM D×R×C"
            title="D×R×C"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDimModal(row);
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-apple-blue/35 bg-apple-blue/8 text-apple-blue hover:bg-apple-blue/15"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </td>
      {/* Customer */}
      <td className="border-r border-black/[0.06] px-1 py-0.5">
        <div className="flex min-w-0 items-stretch gap-0.5">
          <div className="min-w-0 flex-1">
            <InlineTextEdit
              value={row.customer}
              placeholder="Khách"
              className="text-[12px] font-semibold text-apple-label"
              maxLength={120}
              gridNav={{ rowId: row.id, field: "customer" }}
              onCommit={(v) => {
                const trimmed = v.trim();
                const code = lookupCustomerCodeByName(customerDirectory, trimmed);
                const customerId =
                  customerDirectory.find(
                    (e) =>
                      e.code.trim().toLowerCase() === code.trim().toLowerCase() ||
                      e.name.trim().toLowerCase() === trimmed.toLowerCase()
                  )?.id ?? "";
                const entry =
                  customerDirectory.find(
                    (e) =>
                      e.id === customerId ||
                      e.code.trim().toLowerCase() === code.trim().toLowerCase() ||
                      e.name.trim().toLowerCase() === trimmed.toLowerCase()
                  ) ?? undefined;
                const soleShipper =
                  entry?.savedShippers?.length === 1 ? entry.savedShippers[0] : undefined;
                const soleConsignee =
                  entry?.savedConsignees?.length === 1 ? entry.savedConsignees[0] : undefined;
                onUpdate(row.id, {
                  customer: trimmed,
                  customerCode: code,
                  customerId,
                  customerShipperId: soleShipper?.id ?? "",
                  shipperNamePrint: soleShipper?.shipperName?.trim() ?? "",
                  shipperAddressPrint: soleShipper?.shipperAddress ?? "",
                  shipperPhonePrint: soleShipper?.shipperPhone?.trim() ?? "",
                  shipperEmailPrint: soleShipper?.shipperEmail?.trim() ?? "",
                  taxCodePrint: soleShipper?.taxCode?.trim() ?? "",
                  ...buildShipmentPatchForSavedConsignee(soleConsignee),
                });
              }}
              onEnterNavigateDown={hasNextRow ? navDownSameField("customer") : undefined}
            />
          </div>
          <button
            type="button"
            title="Thông tin CNEE — sao chép"
            aria-label="Thông tin CNEE"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCustomerDetail(row);
            }}
            className="shrink-0 self-center rounded border border-black/[0.08] bg-white p-0.5 text-apple-blue hover:bg-apple-blue/10"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        </div>
      </td>
      {/* CNEE — chỉ desktop */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 align-top">
        <div className="flex min-w-0 flex-col gap-px">
          <InlineConsigneeSelect
            value={row.customerConsigneeId?.trim() ?? ""}
            options={savedConsigneeOptions}
            onChange={(consigneeId) => {
              const sc = savedConsigneeOptions.find((x) => x.id === consigneeId);
              onUpdate(row.id, buildShipmentPatchForSavedConsignee(sc));
            }}
          />
          {cneePreview ? (
            <span
              className="line-clamp-1 text-[9px] leading-tight text-apple-tertiary"
              title={cneePreview}
            >
              {cneePreview}
            </span>
          ) : null}
        </div>
      </td>
      {/* Note */}
      <td className="border-r border-black/[0.06] px-1 py-0.5 align-top">
        <InlineTextEdit
          value={row.note ?? ""}
          placeholder="Ghi chú"
          className="line-clamp-1 text-left text-[10px] leading-snug text-apple-secondary"
          maxLength={2000}
          gridNav={{ rowId: row.id, field: "note" }}
          onCommit={(v) => onUpdate(row.id, { note: v })}
          onEnterNavigateDown={hasNextRow ? navDownSameField("note") : undefined}
        />
      </td>
      {/* Status */}
      <td className="border-r border-black/[0.06] px-1 py-1">
        <StatusSelect
          value={row.status}
          compact
          onChange={(s: ShipmentStatus) => onUpdate(row.id, { status: s })}
        />
      </td>
      {/* Actions — icon từng chức năng + xe eCargo (KHO SCSC) */}
      <td className="px-0.5 py-0.5 align-top">
        <div className="flex flex-wrap items-center justify-end gap-1">
          <ShipmentRowActionsMenu
            row={row}
            customerDirectory={customerDirectory}
            globalAgents={globalAgents}
            scscWeighPrintSettings={scscWeighPrintSettings}
            saveScscWeighPrintSettings={saveScscWeighPrintSettings}
            onEdit={onEdit}
            onPrint={onPrint}
            onDelete={onDelete}
          />
          {showEcargoKhoScsc ? (
            <button
              type="button"
              data-ecargo-trigger={row.id}
              aria-label="eCargo"
              aria-expanded={ecargoTableOpen}
              aria-controls={`ecargo-panel-${row.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleEcargoTable();
              }}
              className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border shadow-sm transition-all active:scale-[0.97] ${
                ecargoTableOpen
                  ? "border-sky-600 bg-sky-100 text-sky-900 ring-1 ring-sky-300/50"
                  : "border-sky-500/80 bg-gradient-to-b from-white via-sky-50 to-sky-100 text-sky-800 hover:border-sky-600"
              }`}
            >
              {vehicleForEcargo.trim().length >= ECARGO_VEHICLE_MIN ? (
                <span
                  className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-emerald-500 ring-1 ring-white"
                  aria-hidden
                />
              ) : null}
              <svg className="h-3.5 w-5" viewBox="0 0 32 22" fill="currentColor" aria-hidden>
                <path opacity="0.35" d="M2 14h6v5H2v-5zm22 0h6v5h-6v-5z" />
                <path d="M1 15.5V8.5L4 5h8l2.5 3H27l3 4.5v6H1zm3-6.5v4h6V9H4zm9 0v4h14l-2-2.5H13V9z" />
                <circle cx="8" cy="19" r="2.2" />
                <circle cx="24" cy="19" r="2.2" />
              </svg>
            </button>
          ) : null}
        </div>
      </td>
    </tr>
    {showEcargoKhoScsc && ecargoTableOpen ? (
      <EcargoKhoScscCenterModal
        rowId={row.id}
        row={row}
        vehicleForEcargo={vehicleForEcargo}
        viewSessionYmd={viewSessionYmd}
        ecargoCanSubmit={ecargoCanSubmit}
        onVehicleChange={(raw) => onEcargoVehicleChange(row.id, raw)}
        onRegister={() => onEcargoRegister(row, viewSessionYmd, vehicleForEcargo)}
        onClose={onCloseEcargoTable}
      />
    ) : null}
    </>
  );
}
