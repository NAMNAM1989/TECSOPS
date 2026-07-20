import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../types/shipment";
import {
  loadLabelSheetFormat,
  saveLabelSheetFormat,
  type LabelSheetFormat,
} from "../utils/labelSheetFormat";
import {
  loadLabelPrintMode,
  saveLabelPrintMode,
  type LabelPrintMode,
} from "../utils/labelPrintMode";
import { mapShipmentToAirCargoLabelData } from "../utils/mapShipmentToAirCargoLabelData";
import { fitAwbFontMm } from "../utils/fitAwbFontMm";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import { OPS } from "../styles/opsModalStyles";
import { printThermalLabelsFromIframe, thermalPageMm } from "../utils/printThermalLabelIframe";
import { labelSheetFormatLabel } from "../printing/thermalLabelFormat";

export type LabelSheetVariant = "standard" | "compact";

type LabelContentProps = {
  s: Shipment;
  fontScale: number;
  mawbRelScale?: number;
  hawbRelScale?: number;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  sheetVariant?: LabelSheetVariant;
  showHawbOnCompact?: boolean;
};

export function LabelContent({
  s,
  fontScale,
  mawbRelScale = 1,
  hawbRelScale: _hawbRelScale = 1,
  airlineLabelOverrides,
  sheetVariant = "standard",
  showHawbOnCompact: _showHawbOnCompact = false,
}: LabelContentProps) {
  void _hawbRelScale;
  void _showHawbOnCompact;
  const d = mapShipmentToAirCargoLabelData(s, airlineLabelOverrides);
  const mm = (base: number) => `${Math.round(base * fontScale * 100) / 100}mm`;
  const compact = sheetVariant === "compact";
  const hasAirline = Boolean(d.airline);

  /* Thiết kế TECSOPS XP-470B: AWB hero → pieces → airport → airline */
  const airlineMm = compact ? 2.6 : 3.4;
  const mawbMm = fitAwbFontMm(d.mawb, { compact, relScale: mawbRelScale });
  const routeLabMm = compact ? 1.35 : 1.7;
  const routeValMm = compact ? 5.5 : 7.8;
  const piecesLabMm = compact ? 1.5 : 2;
  const piecesValMm = compact ? 11.5 : 16.5;
  const specialMm = compact ? 1.5 : 1.9;

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
      {hasAirline ? (
        <div className="lbl-airline" style={{ fontSize: mm(airlineMm) }}>
          {d.airline}
        </div>
      ) : null}

      <div className="lbl-mawb">
        <div className="lbl-mawb-val" style={{ fontSize: mm(mawbMm) }}>
          {d.mawb || <span className="lbl-placeholder">Nhập MAWB...</span>}
        </div>
      </div>

      <div className="lbl-route">
        <div className="lbl-route-cell">
          <div className="route-label" style={{ fontSize: mm(routeLabMm) }}>
            Origin
          </div>
          <div className="route-val" style={{ fontSize: mm(routeValMm) }}>
            {d.origin}
          </div>
        </div>
        <div className="lbl-route-cell">
          <div className="route-label" style={{ fontSize: mm(routeLabMm) }}>
            Destination
          </div>
          <div className="route-val" style={{ fontSize: mm(routeValMm) }}>
            {d.dest || <span className="lbl-placeholder">-</span>}
          </div>
        </div>
      </div>

      <div className="lbl-bottom">
        <div className="lbl-pieces-cell">
          <div className="pieces-label" style={{ fontSize: mm(piecesLabMm) }}>
            Total pieces
          </div>
          <div className="pieces-val" style={{ fontSize: mm(piecesValMm) }}>
            {d.pieces}
          </div>
        </div>
        {d.special === "cold" ? (
          <div className="lbl-special cold" style={{ fontSize: mm(specialMm) }}>
            PLS KEEP AT 2-8C - PERISHABLE
          </div>
        ) : d.special === "danger" ? (
          <div className="lbl-special danger" style={{ fontSize: mm(specialMm) }}>
            DANGEROUS GOODS
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Preview giữ đúng tỷ lệ 100×80 / 100×50 — không bóp width bằng maxWidth. */
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
  /* Modal ~max-w-md — scale giữ đúng tỷ lệ 100:80 / 100:50, tem căn giữa */
  const scale = compact ? 0.95 : 0.82;

  return (
    <div className="flex h-[min(300px,calc(100dvh-320px))] w-full min-h-[210px] items-center justify-center overflow-hidden rounded-2xl bg-apple-bg px-2 py-4">
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
            fontScale={1}
            airlineLabelOverrides={airlineLabelOverrides}
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
  onClose: () => void;
}

export function PrintShippingLabel({ shipment, airlineLabelOverrides, onClose }: PrintShippingLabelProps) {
  const [format, setFormat] = useState<LabelSheetFormat>(() => loadLabelSheetFormat());
  const [printMode, setPrintMode] = useState<LabelPrintMode>(() => loadLabelPrintMode());
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const printHostRef = useRef<HTMLDivElement>(null);
  const pcs = useMemo(() => Math.max(1, shipment.pcs ?? 1), [shipment.pcs]);
  const pageMm = useMemo(() => thermalPageMm(format, printMode), [format, printMode]);

  const handlePrint = async () => {
    if (printing) return;
    setPrintMsg(null);
    setPrinting(true);
    /* Mở cửa sổ in ngay trong click — giữ user gesture, PDF lấy đúng @page. */
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
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const res = await printThermalLabelsFromIframe({
        format,
        host: printHostRef.current,
        mode: printMode,
        copies: pcs,
        printWindow,
      });
      if (!res.ok) {
        setPrintMsg(res.error);
      } else if (res.printerCopiesHint) {
        setPrintMsg(
          `Lô ${res.printerCopiesHint} tem: trong hộp thoại in hãy đặt Số bản = ${res.printerCopiesHint} (tránh treo máy).`
        );
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <div
        className="no-print fixed inset-0 z-[100] flex items-end justify-center bg-black/25 p-4 backdrop-blur-xl sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <div className={`w-full max-w-md overflow-hidden rounded-[28px] border shadow-apple-md ${OPS.modal}`}>
          <div className={`flex items-center justify-between border-b px-5 py-4 ${OPS.border}`}>
            <div>
              <h2 className={`text-lg font-semibold ${OPS.title}`}>In nhãn vận chuyển</h2>
              <p className={`text-xs ${OPS.secondary}`}>
                {shipment.awb || "Chưa có AWB"} · {pcs} tem · in trình duyệt
              </p>
            </div>
            <button type="button" onClick={onClose} className={`rounded-full p-2 ${OPS.secondary}`} aria-label="Đóng">
              ✕
            </button>
          </div>

          <div className="px-5 py-4">
            <LabelPreviewSimple
              shipment={shipment}
              format={format}
              airlineLabelOverrides={airlineLabelOverrides}
            />

            <div className="mt-4">
              <p className={`mb-2 text-center text-xs font-semibold ${OPS.secondary}`}>Chọn khổ tem</p>
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

            <div className="mt-3">
              <p className={`mb-2 text-center text-xs font-semibold ${OPS.secondary}`}>Máy in</p>
              <div className="flex gap-2">
                {(
                  [
                    {
                      id: "xp470b" as const,
                      label: "XP-470B",
                      hint: "4″ · 100×80 thẳng",
                    },
                    {
                      id: "narrow80" as const,
                      label: "Cuộn hẹp 80mm",
                      hint: "xoay 90°",
                    },
                  ] as const
                ).map((opt) => {
                  const selected = printMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setPrintMode(opt.id);
                        saveLabelPrintMode(opt.id);
                        setPrintMsg(null);
                      }}
                      className={`flex-1 rounded-2xl border-2 px-2 py-2.5 text-center transition-all active:scale-[0.98] ${
                        selected ? OPS.formatBtnOn : OPS.formatBtnOff
                      }`}
                    >
                      <span className="block text-[13px] font-bold leading-tight">{opt.label}</span>
                      <span className={`mt-0.5 block text-[10px] ${selected ? "opacity-90" : OPS.secondary}`}>
                        {opt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className={`mt-2 text-center text-[11px] ${OPS.secondary}`}>
                PDF / khổ trang in:{" "}
                <span className="font-semibold tabular-nums">
                  {pageMm.wMm}×{pageMm.hMm} mm
                </span>
                {printMode === "xp470b" ? " (đúng tem, không xoay)" : " (trang xoay cho cuộn hẹp)"}
              </p>
            </div>

            {printMsg ? (
              <p className="mt-3 text-center text-[11px] font-medium text-amber-800 dark:text-amber-200">
                {printMsg}
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`flex-1 rounded-full py-3 text-sm font-semibold ${OPS.secondary}`}
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => void handlePrint()}
                disabled={printing}
                className="flex-[1.4] rounded-full bg-apple-blue py-3 text-sm font-semibold text-white hover:bg-apple-blue-hover disabled:opacity-60"
              >
                {printing ? "Đang chuẩn bị in…" : "In tem"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {typeof document !== "undefined"
        ? createPortal(
            <div ref={printHostRef} className="print-label-host" aria-hidden>
              {/* Chỉ 1 tem mẫu — iframe nhân bản theo số kiện khi in (tránh treo UI). */}
              <div className="print-label-page">
                <div className="print-label-spin">
                  <LabelContent
                    s={shipment}
                    fontScale={1}
                    airlineLabelOverrides={airlineLabelOverrides}
                    sheetVariant={format === "100x50" ? "compact" : "standard"}
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
