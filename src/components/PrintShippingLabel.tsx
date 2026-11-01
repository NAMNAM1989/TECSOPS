import { useMemo, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import {
  loadLabelSheetFormat,
  saveLabelSheetFormat,
  type LabelSheetFormat,
} from "../utils/labelSheetFormat";
import {
  labelPrintIssues,
  mapShipmentToAirCargoLabelData,
} from "../utils/mapShipmentToAirCargoLabelData";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import { OPS } from "../styles/opsModalStyles";
import {
  printThermalLabelsFromIframe,
  thermalPageMm,
} from "../utils/printThermalLabelIframe";
import { labelSheetFormatLabel } from "../printing/thermalLabelFormat";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
/** Chỉ load khi mở modal in — không nhồi vào first paint. */
import "../styles/print-label.css";

export type LabelSheetVariant = "standard" | "compact";

type LabelContentProps = {
  s: Shipment;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  /** Catalog Supabase: không merge defaults cứng. */
  airlineReplaceDefaults?: boolean;
  sheetVariant?: LabelSheetVariant;
};

/** Cỡ chữ (pt) cho chữ đậm Arial in hoa vừa `widthMm` — ước theo số ký tự, không đo DOM. */
function fitLabelPt(text: string, maxPt: number, widthMm = 95): number {
  const perCharMm = 0.7 * 0.3528; // ~0.7em mỗi ký tự, 1pt = 0.3528mm
  const fitted = widthMm / (Math.max(text.length, 1) * perCharMm);
  return Math.round(Math.min(maxPt, fitted) * 10) / 10;
}

type LabelRow = { id: "car" | "awb" | "hawb" | "od" | "pcs"; hMm: number; pt: number };

/** Theo talon esid-desktop (src/print/talon.mjs, 31/10/2026): chiều cao hàng mm + cỡ chữ pt. */
const LABEL_ROWS: Record<"50" | "80" | "80h", LabelRow[]> = {
  "50": [
    { id: "car", hMm: 7, pt: 14 },
    { id: "awb", hMm: 13.3, pt: 36 },
    { id: "od", hMm: 10.1, pt: 24 },
    { id: "pcs", hMm: 18.6, pt: 36 },
  ],
  "80": [
    { id: "car", hMm: 12, pt: 18 },
    { id: "awb", hMm: 19.5, pt: 36 },
    { id: "od", hMm: 17.5, pt: 30 },
    { id: "pcs", hMm: 29, pt: 48 },
  ],
  "80h": [
    { id: "car", hMm: 10, pt: 18 },
    { id: "awb", hMm: 15.5, pt: 36 },
    { id: "hawb", hMm: 10.5, pt: 24 },
    { id: "od", hMm: 13.5, pt: 30 },
    { id: "pcs", hMm: 28.5, pt: 48 },
  ],
};

const ROW_CAPTION = { car: "CARRIER", awb: "AWB", hawb: "HAWB", pcs: "TOTAL NO. OF PIECES" } as const;

function LabelCell({ cap, value, pt }: { cap: string; value: string; pt: number }) {
  return (
    <div className="lbl-cell">
      <span className="lbl-cap">{cap}</span>
      {value ? (
        <span className="lbl-v" style={{ fontSize: `${pt}pt` }}>
          {value}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Tem talon (khớp esid-desktop docs/talon-mockup.html):
 * CARRIER · AWB · (HAWB, chỉ khổ 100×80) · ORIGIN | DEST · TOTAL NO. OF PIECES.
 * Ô trống để trống (không chữ gợi ý). Không barcode, không banner xử lý.
 */
export function LabelContent({
  s,
  airlineLabelOverrides,
  airlineReplaceDefaults = false,
  sheetVariant = "standard",
}: LabelContentProps) {
  const d = mapShipmentToAirCargoLabelData(s, airlineLabelOverrides, {
    replaceDefaults: airlineReplaceDefaults,
  });
  const compact = sheetVariant === "compact";
  const showHawb = d.hasHawb && !compact;
  const rows = LABEL_ROWS[compact ? "50" : showHawb ? "80h" : "80"];
  const text = { car: d.airline, awb: d.mawb, hawb: d.hawbNo, pcs: d.pieces };

  return (
    <div className={`label print-label-sheet lbl-sheet ${compact ? "lbl-sheet--compact" : ""}`.trim()}>
      <div className="lbl-grid" style={{ gridTemplateRows: rows.map((r) => `${r.hMm}mm`).join(" ") }}>
        {rows.map((r) =>
          r.id === "od" ? (
            <div key={r.id} className="lbl-row lbl-row--od">
              <LabelCell cap="ORIGIN" value={d.origin} pt={r.pt} />
              <LabelCell cap="DEST" value={d.dest} pt={r.pt} />
            </div>
          ) : (
            <div key={r.id} className={`lbl-row lbl-row--${r.id}`}>
              <LabelCell
                cap={ROW_CAPTION[r.id]}
                value={text[r.id]}
                pt={r.id === "car" || r.id === "hawb" ? fitLabelPt(text[r.id], r.pt) : r.pt}
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}

function LabelPreviewSimple({
  shipment,
  format,
  airlineLabelOverrides,
  airlineReplaceDefaults = false,
}: {
  shipment: Shipment;
  format: LabelSheetFormat;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  airlineReplaceDefaults?: boolean;
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
            airlineReplaceDefaults={airlineReplaceDefaults}
            sheetVariant={compact ? "compact" : "standard"}
          />
        </div>
      </div>
    </div>
  );
}

interface PrintShippingLabelProps {
  shipment: Shipment;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  airlineReplaceDefaults?: boolean;
  onClose: () => void;
}

export function PrintShippingLabel({
  shipment,
  airlineLabelOverrides,
  airlineReplaceDefaults = false,
  onClose,
}: PrintShippingLabelProps) {
  const [format, setFormat] = useState<LabelSheetFormat>(() => loadLabelSheetFormat());
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const printHostRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(true, dialogRef, () => {
    if (!printing) onClose();
  });
  const pageMm = useMemo(() => thermalPageMm(format, "xp470b"), [format]);
  const labelData = useMemo(
    () =>
      mapShipmentToAirCargoLabelData(shipment, airlineLabelOverrides, {
        replaceDefaults: airlineReplaceDefaults,
      }),
    [shipment, airlineLabelOverrides, airlineReplaceDefaults]
  );
  const { errors, warnings } = useMemo(
    () => labelPrintIssues(labelData, format),
    [labelData, format]
  );
  const blocked = errors.length > 0;

  const handlePrint = async () => {
    if (printing || blocked) return;
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
        copies: 1,
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
                PRINT LABEL
              </h2>
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
              airlineReplaceDefaults={airlineReplaceDefaults}
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
            </div>

            {errors.length ? (
              <div
                role="alert"
                className="rounded-xl border border-red-300/70 bg-red-50 px-3 py-2 text-xs text-red-900"
              >
                <strong>Không in được:</strong> {errors.join(" ")}
              </div>
            ) : null}

            {warnings.length ? (
              <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <strong>Kiểm tra:</strong> {warnings.join(" ")}
              </div>
            ) : null}

            {printMsg ? (
              <p className="text-center text-2xs font-medium text-amber-800">{printMsg}</p>
            ) : null}
          </div>

          <div
            className={`flex shrink-0 flex-col gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-end ${OPS.footer}`}
          >
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
                onClick={() => void handlePrint()}
                disabled={printing || blocked}
                className="rounded-full bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-apple-blue-hover disabled:opacity-60"
              >
                {printing ? "Đang chuẩn bị…" : "PRINT"}
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
              airlineReplaceDefaults={airlineReplaceDefaults}
              sheetVariant={format === "100x50" ? "compact" : "standard"}
            />
          </div>
        </div>
      </div>
    </>
  );
}
