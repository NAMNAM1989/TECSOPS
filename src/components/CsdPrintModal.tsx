import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { OPS } from "../styles/opsModalStyles";
import { Button } from "../ui";
import { trackAiEvent } from "../utils/aiOpsClient";
import { opsTeamLabel } from "../constants/warehouses";
import {
  buildCsdFields,
  csdCarrierForShipment,
  csdRaForWarehouse,
  getCsdCarrierProfile,
  normalizeCsdTransfer,
  printCsdForShipment,
  suggestCsdTransfer,
} from "../utils/csdForms";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

type Props = {
  open: boolean;
  shipment: Shipment | null;
  customerDirectory?: readonly CustomerDirectoryEntry[];
  onClose: () => void;
};

export function CsdPrintModal({
  open,
  shipment,
  customerDirectory = [],
  onClose,
}: Props) {
  const titleId = useId();
  const carrier = shipment ? csdCarrierForShipment(shipment) : null;
  const profile = carrier ? getCsdCarrierProfile(carrier) : null;
  const ra = shipment ? csdRaForWarehouse(shipment.warehouse) : null;

  const [transfer, setTransfer] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(open, dialogRef, () => {
    if (!busy) onClose();
  });

  useEffect(() => {
    if (!open || !shipment || !carrier || !profile) return;
    setError(null);
    setBusy(false);
    setTransfer(suggestCsdTransfer(shipment.dest, carrier));
    setOrigin(profile.defaultOrigin || "SGN");
    trackAiEvent("csd.modal.open", {
      carrier,
      opsTeam: ra?.opsTeam,
      dest: (shipment.dest || "").slice(0, 3),
    });
  }, [open, shipment, carrier, profile, ra?.opsTeam]);

  if (!open || !shipment || !carrier || !profile) return null;

  const preview = buildCsdFields(shipment, carrier, {
    transfer,
    origin: profile.showOrigin ? origin : undefined,
    customerDirectory,
  });

  const onPrint = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const normTransfer = normalizeCsdTransfer(transfer);
    try {
      await printCsdForShipment(shipment, {
        transfer: normTransfer,
        origin: profile.showOrigin ? origin : undefined,
        allowEmptyGoods: true,
        customerDirectory,
      });
      trackAiEvent("csd.print.ok", {
        carrier,
        opsTeam: ra?.opsTeam,
        raCode: ra?.raCode,
        hasTransfer: Boolean(normTransfer),
        transfer: normTransfer.slice(0, 16),
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "In CSD thất bại";
      setError(msg);
      trackAiEvent("csd.print.fail", {
        carrier,
        error: msg.slice(0, 80),
      });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={dialogRef}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={`w-full max-w-md overflow-hidden rounded-2xl border shadow-apple-md ${OPS.modal} ${OPS.border}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={`border-b px-4 py-3 ${OPS.border}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className={`text-[16px] font-semibold ${OPS.title}`}>
                In CSD {profile.label}
              </h2>
              <p className={`mt-0.5 text-[11px] ${OPS.secondary}`}>
                {profile.airlineName} · chuyến {shipment.flight || "—"}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className={`rounded-full p-1.5 hover:bg-black/[0.05] ${OPS.muted}`}
              aria-label="Đóng"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-3 px-4 py-3">
          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-[12px]">
            <dt className={OPS.muted}>AWB</dt>
            <dd className={`font-semibold tabular-nums ${OPS.title}`}>{preview.awb || "—"}</dd>
            <dt className={OPS.muted}>Kho</dt>
            <dd className={`font-semibold ${OPS.title}`}>
              {ra ? `${opsTeamLabel[ra.opsTeam]} · ${shipment.warehouse}` : shipment.warehouse}
            </dd>
            <dt className={OPS.muted}>Mã RA</dt>
            <dd className={`font-mono text-[11px] font-bold tracking-tight ${OPS.title}`}>
              {preview.raCode || "—"}
            </dd>
            <dt className={OPS.muted}>DEST</dt>
            <dd className={`font-semibold ${OPS.title}`}>{preview.dest || "—"}</dd>
            <dt className={OPS.muted}>Hàng</dt>
            <dd className={`truncate ${OPS.secondary}`} title={preview.goods}>
              {preview.goods || "(trống)"}
            </dd>
          </dl>

          {profile.showOrigin ? (
            <label className="block">
              <span className={`mb-1 block text-[11px] font-semibold ${OPS.secondary}`}>
                Origin
              </span>
              <input
                className={`${OPS.inputLg} w-full font-mono uppercase tracking-wider`}
                value={origin}
                maxLength={3}
                spellCheck={false}
                disabled={busy}
                onChange={(e) =>
                  setOrigin(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, "")
                      .slice(0, 3)
                  )
                }
              />
            </label>
          ) : (
            <p className={`text-[11px] ${OPS.muted}`}>
              Origin trên mẫu TH đã in sẵn <span className="font-semibold">SGN</span>.
            </p>
          )}

          {profile.showTransfer ? (
            <div>
              <label className="block">
                <span className={`mb-1 block text-[11px] font-semibold ${OPS.secondary}`}>
                  Transfer / Transit{" "}
                  <span className={`font-normal ${OPS.muted}`}>(nếu biết — có thể để trống)</span>
                </span>
                <input
                  className={`${OPS.inputLg} w-full font-mono uppercase tracking-wider`}
                  value={transfer}
                  placeholder="BKK hoặc BKK/CNX"
                  maxLength={24}
                  spellCheck={false}
                  autoFocus
                  disabled={busy}
                  onChange={(e) => setTransfer(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onPrint();
                    }
                  }}
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.transferPresets.map((code) => {
                  const active = normalizeCsdTransfer(transfer) === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      disabled={busy}
                      onClick={() => setTransfer(code)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ring-1 transition ${
                        active
                          ? "bg-apple-blue text-white ring-apple-blue"
                          : "bg-white text-apple-label ring-black/10 hover:bg-apple-blue/5"
                      }`}
                    >
                      {code}
                    </button>
                  );
                })}
                {transfer ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setTransfer("")}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-apple-tertiary ring-1 ring-black/10 hover:bg-black/[0.03]"
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!preview.goods ? (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-950">
              Lô chưa có tên hàng in ấn — PDF sẽ để trống mục Contents.
            </p>
          ) : null}
          {!preview.dest ? (
            <p className="rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] font-medium text-rose-800">
              Thiếu DEST trên lô — nhập mã sân bay đích trước khi in.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] font-medium text-rose-800">
              {error}
            </p>
          ) : null}
        </div>

        <div
          className={`flex items-center justify-end gap-2 border-t px-4 py-3 ${OPS.footer}`}
        >
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
          <Button type="button" disabled={busy || !preview.dest} onClick={() => void onPrint()}>
            {busy ? "Đang tạo PDF…" : "Tải & In CSD"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
