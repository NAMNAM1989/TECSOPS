import { useMemo, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import {
  loadLabelSheetFormat,
  saveLabelSheetFormat,
  type LabelSheetFormat,
} from "../utils/labelSheetFormat";
import { mapShipmentToAirCargoLabelData } from "../utils/mapShipmentToAirCargoLabelData";
import { fitAwbFontMm, fitRouteCodeFontMm } from "../utils/fitAwbFontMm";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import { OPS } from "../styles/opsModalStyles";
import {
  printThermalLabelsFromIframe,
  thermalPageMm,
} from "../utils/printThermalLabelIframe";
import { labelSheetFormatLabel } from "../printing/thermalLabelFormat";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

export type LabelSheetVariant = "standard" | "compact";

type LabelContentProps = {
  s: Shipment;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  sheetVariant?: LabelSheetVariant;
};

/**
 * Mẫu tem 4 hàng (khớp docs/air-cargo-label-100x80-100x50.html):
 * Airline · AIR WAYBILL NO. · Origin/Dest · TOTAL PIECES
 * Không barcode, không banner xử lý, không HAWB trên tem.
 */
export function LabelContent({
  s,
  airlineLabelOverrides,
  sheetVariant = "standard",
}: LabelContentProps) {
  const d = mapShipmentToAirCargoLabelData(s, airlineLabelOverrides);
  const compact = sheetVariant === "compact";
  const hasAirline = Boolean(d.airline);

  /* Nhỏ hơn một chút để letter-spacing rộng vẫn không tràn tên dài */
  const airlineMm = compact ? 3.3 : 4.2;
  const mawbMm = fitAwbFontMm(d.mawb, { compact });
  const routeLabMm = compact ? 1.9 : 2.3;
  /* DEST ưu tiên to hơn ORIGIN một chút; cả hai vẫn fit nửa ô */
  const originMm = fitRouteCodeFontMm(d.origin, { compact, relScale: 0.92 });
  const destMm = fitRouteCodeFontMm(d.dest, { compact });
  const piecesLabMm = compact ? 1.9 : 2.3;
  /* Nhường chiều cao cho AWB/DEST — pieces vẫn đủ lớn */
  const piecesValMm = compact ? 10.5 : 18;

  const sheetClass = [
    "label",
    "print-label-sheet",
    "lbl-sheet",
    compact ? "lbl-sheet--compact" : "",
    hasAirline ? "" : "lbl-sheet--no-airline",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={sheetClass}>
      <div className="lbl-sheet-inner">
        {hasAirline ? (
          <div className="lbl-airline" style={{ fontSize: `${airlineMm}mm` }}>
            {d.airline}
          </div>
        ) : null}

        <div className="lbl-mawb">
          <div className="lbl-mawb-caption">AIR WAYBILL NO.</div>
          <div className="lbl-mawb-val" style={{ fontSize: `${mawbMm}mm` }}>
            {d.mawb || <span className="lbl-placeholder">Nhập MAWB...</span>}
          </div>
        </div>

        <div className="lbl-route">
          <div className="lbl-route-cell">
            <div className="route-label" style={{ fontSize: `${routeLabMm}mm` }}>
              ORIGIN:
            </div>
            <div className="route-val" style={{ fontSize: `${originMm}mm` }}>
              {d.origin}
            </div>
          </div>
          <div className="lbl-route-cell">
            <div className="route-label" style={{ fontSize: `${routeLabMm}mm` }}>
              DESTINATION:
            </div>
            <div className="route-val route-val--dest" style={{ fontSize: `${destMm}mm` }}>
              {d.dest || <span className="lbl-placeholder">-</span>}
            </div>
          </div>
        </div>

        <div className="lbl-bottom">
          <div className="lbl-pieces-cell">
            <div className="pieces-label" style={{ fontSize: `${piecesLabMm}mm` }}>
              TOTAL PIECES
            </div>
            <div className="pieces-val" style={{ fontSize: `${piecesValMm}mm` }}>
              {d.pieces || null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LabelPreviewSimple({
  shipment,
  format,
  airlineLabelOverrides,
}: {
  shipment: Shipment;
  format: LabelSheetFormat;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
}) {
  const compact = format === "100x50";
  const labelHMm = compact ? 50 : 80;
  const scale = compact ? 1.05 : 0.92;

  return (
    <div
      className={`flex min-h-[240px] w-full items-center justify-center overflow-auto rounded-2xl p-4 ${OPS.printPreviewFrame}`}
    >
      <div
        className="shrink-0 overflow-hidden rounded-lg bg-white shadow-apple ring-1 ring-black/[0.1]"
        style={{
          width: `${100 * scale}mm`,
          height: `${labelHMm * scale}mm`,
        }}
      >
        <div
          style={{
            width: "100mm",
            height: `${labelHMm}mm`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <LabelContent
            s={shipment}
            airlineLabelOverrides={airlineLabelOverrides}
            sheetVariant={compact ? "compact" : "standard"}
          />
        </div>
      </div>
    </div>
  );
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

interface PrintShippingLabelProps {
  shipment: Shipment;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  onClose: () => void;
}

export function PrintShippingLabel({
  shipment,
  airlineLabelOverrides,
  onClose,
}: PrintShippingLabelProps) {
  const [format, setFormat] = useState<LabelSheetFormat>(() => loadLabelSheetFormat());
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const printHostRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [copiesInput, setCopiesInput] = useState("");
  useModalFocusTrap(true, dialogRef, () => {
    if (!printing) onClose();
  });
  const pageMm = useMemo(() => thermalPageMm(format, "xp470b"), [format]);
  const labelData = useMemo(
    () => mapShipmentToAirCargoLabelData(shipment, airlineLabelOverrides),
    [shipment, airlineLabelOverrides]
  );
  const copies = Number(copiesInput);
  const hasValidCopies = Number.isInteger(copies) && copies >= 1 && copies <= 999;
  const warnings = useMemo(() => {
    const next: string[] = [];
    if (labelData.mawbDigits.length !== 11) next.push("MAWB chưa đủ 11 số");
    if (!labelData.dest) next.push("chưa có Destination");
    if (!shipment.pcs || shipment.pcs < 1) next.push("chưa có số kiện");
    if (!labelData.airline) next.push("chưa nhận diện được hãng");
    return next;
  }, [labelData, shipment.pcs]);

  const handlePrint = async (requestedCopies?: number) => {
    if (printing) return;
    if (requestedCopies == null && !hasValidCopies) {
      setPrintMsg("Hãy nhập số tem cần in từ 1 đến 999.");
      return;
    }
    const requested = requestedCopies ?? copies;
    const copiesToPrint = clampInt(requested, 1, 999);
    setPrintMsg(null);
    setPrinting(true);
    const { wMm, hMm } = pageMm;
    let printWindow: Window | null = null;
    try {
      printWindow = window.open(
        "about:blank",
        "tecsops-label-print",
        `width=${Math.max(320, Math.round(wMm * 3.8))},height=${Math.max(280, Math.round(hMm * 3.8 + 48))}`
      );
    } catch {
      printWindow = null;
    }
    try {
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      );
      const res = await printThermalLabelsFromIframe({
        format,
        host: printHostRef.current,
        mode: "xp470b",
        copies: copiesToPrint,
        printWindow,
      });
      if (!res.ok) {
        setPrintMsg(res.error);
      } else if (res.printerCopiesHint) {
        setPrintMsg(
          `Lô ${res.printerCopiesHint} tem: trong hộp thoại in hãy đặt Số bản = ${res.printerCopiesHint}.`
        );
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <div
        className="no-print fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4"
        role="presentation"
        onClick={() => {
          if (!printing) onClose();
        }}
      >
        <div
          ref={dialogRef}
          className={`flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-ui-border shadow-md ${OPS.modal}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="print-shipping-label-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`flex shrink-0 items-center justify-between border-b px-5 py-4 ${OPS.border}`}>
            <div className="min-w-0">
              <h2
                id="print-shipping-label-title"
                className={`truncate text-lg font-semibold ${OPS.title}`}
              >
                In nhãn vận chuyển
              </h2>
              <p className={`text-xs ${OPS.secondary}`}>
                {shipment.awb || "Chưa có AWB"} · {labelSheetFormatLabel(format)} · XP-470B
                {hasValidCopies ? ` · ${copies} tem` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`shrink-0 rounded-full p-2 ${OPS.secondary}`}
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <LabelPreviewSimple
              shipment={shipment}
              format={format}
              airlineLabelOverrides={airlineLabelOverrides}
            />

            <div>
              <p className={`mb-2 text-center text-xs font-semibold ${OPS.secondary}`}>Khổ tem</p>
              <div className="flex gap-2">
                {(["100x80", "100x50"] as const).map((fmt) => {
                  const selected = format === fmt;
                  return (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => {
                        setFormat(fmt);
                        saveLabelSheetFormat(fmt);
                        setPrintMsg(null);
                      }}
                      className={`flex-1 rounded-2xl border-2 px-3 py-3 text-center transition-all active:scale-[0.98] ${
                        selected ? OPS.formatBtnOn : OPS.formatBtnOff
                      }`}
                    >
                      <span className="block text-[14px] font-bold leading-tight">
                        {labelSheetFormatLabel(fmt)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className={`mt-2 text-center text-[11px] ${OPS.secondary}`}>
                Trang in{" "}
                <span className="font-semibold tabular-nums">
                  {pageMm.wMm}×{pageMm.hMm} mm
                </span>{" "}
                · đúng tem, không xoay
              </p>
            </div>

            <div className={`rounded-2xl border px-4 py-3 ${OPS.border}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${OPS.secondary}`}>
                    Số tem
                  </p>
                  <p className={`text-[11px] ${OPS.muted}`}>Nhập tay — không tự lấy theo kiện</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    inputMode="numeric"
                    value={copiesInput}
                    onChange={(e) =>
                      setCopiesInput(e.target.value.replace(/\D/g, "").slice(0, 3))
                    }
                    placeholder="Nhập"
                    className={`${OPS.printStepperInput} !w-20 !py-1.5 !text-sm`}
                    aria-label="Số lượng tem"
                  />
                  <span className={`text-xs font-semibold ${OPS.secondary}`}>tem</span>
                </div>
              </div>
            </div>

            {warnings.length ? (
              <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <strong>Kiểm tra:</strong> {warnings.join(" · ")}.
              </div>
            ) : null}

            {printMsg ? (
              <p className="text-center text-[11px] font-medium text-amber-800">{printMsg}</p>
            ) : null}
          </div>

          <div
            className={`flex shrink-0 flex-col gap-2 border-t px-5 py-3 sm:flex-row sm:items-center ${OPS.footer}`}
          >
            <p className={`min-w-0 flex-1 text-[11px] ${OPS.muted}`}>
              Scale 100% · Margins None trong hộp thoại in.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold ${OPS.secondary}`}
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => void handlePrint(1)}
                disabled={printing}
                className={`rounded-full border px-4 py-2.5 text-sm font-semibold ${OPS.border} ${OPS.title}`}
              >
                In thử 1
              </button>
              <button
                type="button"
                onClick={() => void handlePrint()}
                disabled={printing || !hasValidCopies}
                className="rounded-full bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-apple-blue-hover disabled:opacity-60"
              >
                {printing
                  ? "Đang chuẩn bị…"
                  : hasValidCopies
                    ? `In ${copies} tem`
                    : "Nhập số tem để in"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Host in nằm trong cùng cây React — tránh createPortal(document.body) gây insertBefore khi unmount. */}
      <div ref={printHostRef} className="print-label-host" aria-hidden>
        <div className="print-label-page">
          <div className="print-label-spin">
            <LabelContent
              s={shipment}
              airlineLabelOverrides={airlineLabelOverrides}
              sheetVariant={format === "100x50" ? "compact" : "standard"}
            />
          </div>
        </div>
      </div>
    </>
  );
}
