import { useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { formatAwb } from "../utils/awbFormat";
import { formatKgTotal } from "../utils/formatKgTotal";
import { copyTextToClipboard } from "../utils/copyTextToClipboard";
import { buildShipmentCustomerDetailSections } from "../utils/shipmentCneeCopyBlock";
import { findCustomerEntry } from "../utils/customerBookingResolve";
import { formatSavedConsigneeShortLabel } from "../utils/customerConsigneeShipmentPatch";
import { isScscH21Warehouse } from "../types/scscH21Catalog";
import { isTcsH21Warehouse } from "../types/tcsH21Catalog";
import { isTcsWarehouse } from "../constants/warehouses";
import { canExportTcsDimTemplate, downloadTcsAttachedDimsExcel } from "../utils/exportTcsAttachedDimsExcel";
import { useToast } from "../ui";
import { CustomerProfileEditors } from "./InlineCustomerInfoCell";
import { OpsRowNoteControl } from "./OpsRowNoteControl";

type Props = {
  shipment: Shipment | null;
  customerDirectory: readonly CustomerDirectoryEntry[];
  onUpdate: (id: string, patch: Partial<Shipment>) => void | Promise<boolean | void>;
  onPrint: (s: Shipment) => void;
  onDelete: (id: string) => void;
  onInvoice?: (s: Shipment) => void;
  onOpenDim: (s: Shipment) => void;
};

function printNameDiffers(shipment: Shipment, directory: readonly CustomerDirectoryEntry[]): boolean {
  const print = (shipment.consigneeNamePrint ?? "").trim();
  if (!print) return false;
  const entry = findCustomerEntry(shipment, directory);
  const saved = entry?.savedConsignees?.find((x) => x.id === shipment.customerConsigneeId?.trim());
  const profile = saved ? formatSavedConsigneeShortLabel(saved).trim() : "";
  return Boolean(profile) && print.toUpperCase() !== profile.toUpperCase();
}

export function LotProfilePanel({
  shipment,
  customerDirectory,
  onUpdate,
  onPrint,
  onDelete,
  onInvoice,
  onOpenDim,
}: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState<"awb" | "profile" | null>(null);
  const detail = useMemo(
    () => (shipment ? buildShipmentCustomerDetailSections(shipment, customerDirectory) : null),
    [shipment, customerDirectory],
  );
  const showInvoice =
    Boolean(shipment && onInvoice) &&
    Boolean(shipment && (isScscH21Warehouse(shipment.warehouse) || isTcsH21Warehouse(shipment.warehouse)));
  const showExcelDim =
    Boolean(shipment) &&
    isTcsWarehouse(shipment!.warehouse) &&
    canExportTcsDimTemplate(shipment!);
  const differs = shipment ? printNameDiffers(shipment, customerDirectory) : false;

  const copyAwb = async () => {
    if (!shipment) return;
    const text = (shipment.awb ?? "").trim();
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied("awb");
      toast.success("Đã sao chép AWB");
      window.setTimeout(() => setCopied(null), 1200);
    }
  };

  const copyProfile = async () => {
    if (!detail?.copyAllText) return;
    const ok = await copyTextToClipboard(detail.copyAllText);
    if (ok) {
      setCopied("profile");
      toast.success("Đã sao chép hồ sơ lô");
      window.setTimeout(() => setCopied(null), 1200);
    }
  };

  return (
    <aside
      className="my-4 mr-5 hidden w-[380px] shrink-0 overflow-hidden rounded-2xl border border-ui-border/90 bg-ui-surface shadow-ui-md lg:flex lg:flex-col"
      data-testid="lot-profile-panel"
      aria-label="Hồ sơ lô đang chọn"
    >
      {!shipment || !detail ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] font-semibold text-ui-text-muted">
          Chọn một lô trên bảng để xem hồ sơ và thao tác
        </div>
      ) : (
        <>
          <div className="border-b border-ui-border/80 px-4 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ui-text-muted">Hồ sơ lô</p>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="ops-awb text-[15px]">
                {shipment.awb?.trim() ? formatAwb(shipment.awb) : "Chưa có AWB"}
              </p>
              <button
                type="button"
                className="inline-flex h-7 items-center rounded-lg border border-ui-border bg-ui-surface px-2 font-mono text-[11px] font-bold"
                title="Sao chép AWB"
                onClick={() => void copyAwb()}
              >
                {copied === "awb" ? "Đã copy" : "Copy AWB"}
              </button>
            </div>
            <p className="text-[12px] font-semibold text-ui-text-muted">
              {[
                shipment.flight?.trim(),
                shipment.flightDate?.trim(),
                shipment.dest?.trim(),
                shipment.pcs != null || shipment.kg != null
                  ? `${shipment.pcs ?? "—"}K / ${shipment.kg != null ? formatKgTotal(shipment.kg) : "—"}kg`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="border-b border-ui-border/80 bg-ui-primary-soft/70 px-3 py-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-ui-primary text-[13px] font-bold text-white shadow-ui-sm hover:bg-ui-primary-hover"
                onClick={() => onPrint(shipment)}
              >
                In tem
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-ui-primary/40 bg-white text-[13px] font-bold text-ui-primary hover:bg-ui-primary-soft"
                onClick={() => onOpenDim(shipment)}
              >
                Đo DIM
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-lg border border-ui-border bg-white text-[11px] font-bold"
                onClick={() => void copyProfile()}
              >
                {copied === "profile" ? "Đã copy" : "Copy hồ sơ"}
              </button>
              <div className="flex h-8 items-center justify-center rounded-lg border border-ui-border bg-white">
                <OpsRowNoteControl
                  rowId={shipment.id}
                  value={shipment.note ?? ""}
                  onCommit={(v) => void onUpdate(shipment.id, { note: v })}
                />
              </div>
              {showInvoice ? (
                <button
                  type="button"
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-ui-border bg-white text-[11px] font-bold"
                  onClick={() => onInvoice?.(shipment)}
                >
                  H21
                </button>
              ) : (
                <span className="inline-flex h-8 items-center justify-center rounded-lg border border-dashed border-ui-border text-[11px] font-semibold text-ui-text-subtle">
                  H21
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-auto px-4 py-3">
            <section>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ui-text-muted">
                Khách (danh bạ)
              </label>
              <div className="rounded-xl border border-ui-border bg-ui-surface-muted/50 px-3 py-2 text-[13px] font-bold">
                {detail.customerName || shipment.customer?.trim() || "—"}
              </div>
            </section>
            <CustomerProfileEditors
              shipment={shipment}
              customerDirectory={customerDirectory}
              onUpdate={(patch) => onUpdate(shipment.id, patch)}
            />
            {differs ? (
              <div className="rounded-xl border border-dashed border-amber-400/70 bg-amber-50/70 px-3 py-2">
                <p className="text-[11px] font-bold uppercase text-amber-800">Tên in (khác hồ sơ)</p>
                <p className="text-[13px] font-semibold">{shipment.consigneeNamePrint}</p>
                <button
                  type="button"
                  className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-xl bg-ui-primary text-[12px] font-bold text-white hover:bg-ui-primary-hover"
                  onClick={() => onPrint(shipment)}
                >
                  In tem với tên này
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-ui-border/80 px-3 py-2">
            {showExcelDim ? (
              <button
                type="button"
                className="text-[12px] font-semibold text-ui-text-muted hover:text-ui-text"
                onClick={() => void downloadTcsAttachedDimsExcel(shipment)}
              >
                Excel DIM
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="text-[12px] font-bold text-red-700 hover:text-red-800"
              onClick={() => {
                if (confirm(`Xóa lô AWB ${shipment.awb || "(chưa có AWB)"}?`)) {
                  onDelete(shipment.id);
                }
              }}
            >
              Xóa lô
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
