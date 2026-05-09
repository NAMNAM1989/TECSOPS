import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../types/shipment";
import { loadLabelFontScale } from "../utils/labelFontScale";
import {
  LABEL_HAWB_REL_MAX,
  LABEL_HAWB_REL_MIN,
  LABEL_MAWB_REL_MAX,
  LABEL_MAWB_REL_MIN,
  clampLabelHawbRelScale,
  clampLabelMawbRelScale,
  loadLabelHawbRelScale,
  loadLabelMawbRelScale,
  saveLabelHawbRelScale,
  saveLabelMawbRelScale,
} from "../utils/labelAwbHawbScale";
import { loadLabelPrintFlipCcw } from "../utils/labelPrintMode";
import {
  loadLabelCompactShowHawb,
  loadLabelSheetFormat,
  saveLabelCompactShowHawb,
  saveLabelSheetFormat,
  type LabelSheetFormat,
} from "../utils/labelSheetFormat";
import { printThermalLabelsFromIframe } from "../utils/printThermalLabelIframe";
import { mapShipmentToAirCargoLabelData } from "../utils/mapShipmentToAirCargoLabelData";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";

export type LabelSheetVariant = "standard" | "compact";

type LabelContentProps = {
  s: Shipment;
  fontScale: number;
  /** Nhân thêm cỡ MAWB/AWB so với 7mm (1 = mặc định). */
  mawbRelScale?: number;
  /** Nhân thêm cỡ số HAWB so với 4mm (1 = mặc định). */
  hawbRelScale?: number;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  /** Khổ 100×50: bố cục và cỡ chữ nhỏ hơn. */
  sheetVariant?: LabelSheetVariant;
  /** Khổ compact: có in HAWB hay chỉ MAWB + kiện (mặc định nên tắt). */
  showHawbOnCompact?: boolean;
};

export function LabelContent({
  s,
  fontScale,
  mawbRelScale = 1,
  hawbRelScale = 1,
  airlineLabelOverrides,
  sheetVariant = "standard",
  showHawbOnCompact = false,
}: LabelContentProps) {
  const d = mapShipmentToAirCargoLabelData(s, airlineLabelOverrides);
  const mm = (base: number) => `${Math.round(base * fontScale * 100) / 100}mm`;
  const compact = sheetVariant === "compact";
  const showHawbBlock = d.hasHawb && (!compact || showHawbOnCompact);

  const airlineMm = compact ? 4 : 5;
  const mawbBaseMm = compact ? 5.5 : 7;
  const routeLabMm = compact ? 2 : 2.5;
  const routeValMm = compact ? 5.5 : 9;
  const piecesMm = compact ? 11 : 20;
  const hawbBaseMm = compact ? 3 : 4;
  const piecesLabMm = compact ? 2.3 : 2.8;
  const specialMm = compact ? 2.2 : 2.8;

  return (
    <div
      className={
        compact ? "label print-label-sheet lbl-sheet lbl-sheet--compact" : "label print-label-sheet lbl-sheet"
      }
    >
      {d.airline ? (
        <div className="lbl-airline" style={{ fontSize: mm(airlineMm) }}>
          {d.airline}
        </div>
      ) : null}

      <div className="lbl-mawb" style={{ fontSize: mm(mawbBaseMm * mawbRelScale) }}>
        {d.mawb || <span className="lbl-placeholder">Nhập MAWB...</span>}
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

      {showHawbBlock ? (
        <div className="lbl-hawb-row">
          <span className="lbl-hawb-label" style={{ fontSize: mm(routeLabMm) }}>
            HAWB No.:
          </span>
          <span className="lbl-hawb-val" style={{ fontSize: mm(hawbBaseMm * hawbRelScale) }}>
            {d.hawbNo || "-"}
          </span>
        </div>
      ) : null}

      <div className="lbl-bottom">
        {showHawbBlock ? (
          <>
            <div className="lbl-pieces-cell">
              <div className="pieces-label" style={{ fontSize: mm(piecesLabMm) }}>
                Pieces
                <br />
                HAWB
              </div>
              <div className="pieces-val" style={{ fontSize: mm(piecesMm) }}>
                {d.hawbPieces || "-"}
              </div>
            </div>
            <div className="lbl-pieces-cell">
              <div className="pieces-label" style={{ fontSize: mm(piecesLabMm) }}>
                Total Pieces
                <br />
                MAWB
              </div>
              <div className="pieces-val" style={{ fontSize: mm(piecesMm) }}>
                {d.pieces || "-"}
              </div>
            </div>
          </>
        ) : (
          <div className="lbl-pieces-cell">
            <div className="pieces-label" style={{ fontSize: mm(piecesLabMm) }}>
              Total no. of pieces
            </div>
            <div className="pieces-val" style={{ fontSize: mm(piecesMm) }}>
              {d.pieces || "-"}
            </div>
          </div>
        )}
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
  );
}

function LabelPreviewFit({
  shipment,
  fontScale,
  mawbRelScale,
  hawbRelScale,
  airlineLabelOverrides,
  sheetVariant,
  showHawbOnCompact,
}: {
  shipment: Shipment;
  fontScale: number;
  mawbRelScale: number;
  hawbRelScale: number;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  sheetVariant: LabelSheetVariant;
  showHawbOnCompact: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState({ scale: 1, clipW: 360, clipH: 288 });

  const updateScale = useCallback(() => {
    const box = containerRef.current;
    const label = labelRef.current;
    if (!box || !label) return;

    const lw = label.offsetWidth;
    const lh = label.offsetHeight;
    if (lw < 8 || lh < 8) return;

    const pad = 20;
    const cr = box.getBoundingClientRect();
    const sx = (cr.width - pad) / lw;
    const sy = (cr.height - pad) / lh;
    const s = Math.min(sx, sy, 1);
    const sc = Number.isFinite(s) ? Math.max(0.32, s) : 1;
    setPreview({ scale: sc, clipW: lw * sc, clipH: lh * sc });
  }, []);

  useLayoutEffect(() => {
    updateScale();
    const box = containerRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => updateScale());
    ro.observe(box);
    window.addEventListener("resize", updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [
    updateScale,
    shipment.id,
    fontScale,
    mawbRelScale,
    hawbRelScale,
    airlineLabelOverrides,
    sheetVariant,
    showHawbOnCompact,
  ]);

  const labelH = sheetVariant === "compact" ? "50mm" : "80mm";

  return (
    <div
      ref={containerRef}
      className="flex h-[min(280px,calc(100dvh-300px))] w-full min-h-[200px] items-center justify-center overflow-hidden rounded-2xl bg-apple-bg px-3 py-4"
    >
      <div
        className="overflow-hidden rounded-xl shadow-apple ring-1 ring-black/[0.08]"
        style={{ width: preview.clipW, height: preview.clipH }}
      >
        <div
          ref={labelRef}
          style={{
            width: "100mm",
            height: labelH,
            transform: `scale(${preview.scale})`,
            transformOrigin: "top left",
          }}
        >
          <LabelContent
            s={shipment}
            fontScale={fontScale}
            mawbRelScale={mawbRelScale}
            hawbRelScale={hawbRelScale}
            airlineLabelOverrides={airlineLabelOverrides}
            sheetVariant={sheetVariant}
            showHawbOnCompact={showHawbOnCompact}
          />
        </div>
      </div>
    </div>
  );
}

interface PrintShippingLabelProps {
  shipment: Shipment;
  /** Ghi đè tên hãng từ Cài đặt trên app (đồng bộ server). */
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  onClose: () => void;
}

export function PrintShippingLabel({ shipment, airlineLabelOverrides, onClose }: PrintShippingLabelProps) {
  const fontScale = useMemo(() => loadLabelFontScale(), []);
  const printFlipCcw = useMemo(() => loadLabelPrintFlipCcw(), []);
  const [mawbRelScale, setMawbRelScale] = useState(loadLabelMawbRelScale);
  const [hawbRelScale, setHawbRelScale] = useState(loadLabelHawbRelScale);
  const [sheetFormat, setSheetFormat] = useState<LabelSheetFormat>(() => loadLabelSheetFormat());
  const [compactShowHawb, setCompactShowHawb] = useState(() => loadLabelCompactShowHawb());

  const sheetVariant: LabelSheetVariant = sheetFormat === "100x50" ? "compact" : "standard";

  const handlePrint = async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await printThermalLabelsFromIframe({ format: sheetFormat });
  };

  return (
    <>
      <div
        className="no-print fixed inset-0 z-[100] flex items-end justify-center bg-black/25 p-4 backdrop-blur-xl sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <div className="no-print max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-apple-md sm:max-w-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[19px] font-semibold tracking-tight text-apple-label">In nhãn</h2>
              <p className="text-xs text-apple-secondary">
                Tem {shipment.awb} · {shipment.customer}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-apple-tertiary hover:bg-black/[0.05] hover:text-apple-label"
              aria-label="Đóng"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <LabelPreviewFit
            shipment={shipment}
            fontScale={fontScale}
            mawbRelScale={mawbRelScale}
            hawbRelScale={hawbRelScale}
            airlineLabelOverrides={airlineLabelOverrides}
            sheetVariant={sheetVariant}
            showHawbOnCompact={compactShowHawb}
          />

          <div className="mt-4 space-y-2 rounded-2xl border border-black/[0.08] bg-apple-bg/60 p-3">
            <p className="text-[11px] font-semibold text-apple-label">Khổ tem (lưu trên máy)</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSheetFormat("100x80");
                  saveLabelSheetFormat("100x80");
                }}
                className={
                  sheetFormat === "100x80"
                    ? "rounded-full bg-apple-blue px-3.5 py-2 text-xs font-semibold text-white"
                    : "rounded-full border border-black/[0.12] bg-white px-3.5 py-2 text-xs font-semibold text-apple-label hover:bg-black/[0.03]"
                }
              >
                100 × 80 mm
              </button>
              <button
                type="button"
                onClick={() => {
                  setSheetFormat("100x50");
                  saveLabelSheetFormat("100x50");
                }}
                className={
                  sheetFormat === "100x50"
                    ? "rounded-full bg-apple-blue px-3.5 py-2 text-xs font-semibold text-white"
                    : "rounded-full border border-black/[0.12] bg-white px-3.5 py-2 text-xs font-semibold text-apple-label hover:bg-black/[0.03]"
                }
              >
                100 × 50 mm
              </button>
            </div>
            {sheetFormat === "100x50" ? (
              <label className="flex cursor-pointer items-start gap-2.5 pt-0.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-black/20 accent-apple-blue"
                  checked={compactShowHawb}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setCompactShowHawb(on);
                    saveLabelCompactShowHawb(on);
                  }}
                />
                <span className="text-[11px] leading-snug text-apple-secondary">
                  In HAWB trên tem nhỏ (mặc định tắt — chỉ MAWB, điểm đến và tổng kiện).
                </span>
              </label>
            ) : null}
          </div>

          <div className="mt-4 space-y-3 rounded-2xl border border-black/[0.08] bg-apple-bg/60 p-3">
            <p className="text-[11px] font-semibold text-apple-label">Cỡ chữ trên tem (lưu trên máy)</p>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="label-mawb-scale" className="text-[11px] text-apple-secondary">
                  Số MAWB / AWB
                </label>
                <span className="font-mono text-[11px] font-semibold text-apple-label tabular-nums">
                  {Math.round(mawbRelScale * 100)}%
                </span>
              </div>
              <input
                id="label-mawb-scale"
                type="range"
                min={LABEL_MAWB_REL_MIN}
                max={LABEL_MAWB_REL_MAX}
                step={0.05}
                value={mawbRelScale}
                onChange={(e) => {
                  const v = clampLabelMawbRelScale(Number(e.target.value));
                  setMawbRelScale(v);
                  saveLabelMawbRelScale(v);
                }}
                className="mt-1.5 h-2 w-full cursor-pointer accent-apple-blue"
              />
            </div>
            {sheetVariant === "standard" || compactShowHawb ? (
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="label-hawb-scale" className="text-[11px] text-apple-secondary">
                    Số HAWB
                  </label>
                  <span className="font-mono text-[11px] font-semibold text-apple-label tabular-nums">
                    {Math.round(hawbRelScale * 100)}%
                  </span>
                </div>
                <input
                  id="label-hawb-scale"
                  type="range"
                  min={LABEL_HAWB_REL_MIN}
                  max={LABEL_HAWB_REL_MAX}
                  step={0.05}
                  value={hawbRelScale}
                  onChange={(e) => {
                    const v = clampLabelHawbRelScale(Number(e.target.value));
                    setHawbRelScale(v);
                    saveLabelHawbRelScale(v);
                  }}
                  className="mt-1.5 h-2 w-full cursor-pointer accent-apple-blue"
                />
              </div>
            ) : null}
            <p className="text-[10px] leading-snug text-apple-secondary">
              100% = mặc định. Áp dụng cả xem trước và khi in; tăng quá mức có thể chồng chữ trên tem{" "}
              {sheetFormat === "100x50" ? "100×50" : "100×80"} mm.
            </p>
          </div>

          <p className="mt-4 text-[11px] leading-snug text-apple-secondary">
            Web chỉ gửi một trang nhãn. Chọn số bản in trong hộp thoại in của Chrome (hoặc trên máy in) để tránh lỗi gộp trang.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handlePrint()}
              className="min-h-11 min-w-[8rem] flex-1 rounded-full bg-apple-blue px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-apple-blue-hover sm:flex-none"
            >
              In
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-full border border-black/[0.12] bg-white px-5 py-3 text-sm font-semibold text-apple-label hover:bg-black/[0.03]"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      {createPortal(
        <div
          className="print-label-host hidden bg-white print:block"
          aria-hidden
        >
          <div className="print-label-page">
            <div className={printFlipCcw ? "print-label-spin print-label-spin--ccw" : "print-label-spin"}>
              <LabelContent
                s={shipment}
                fontScale={fontScale}
                mawbRelScale={mawbRelScale}
                hawbRelScale={hawbRelScale}
                airlineLabelOverrides={airlineLabelOverrides}
                sheetVariant={sheetVariant}
                showHawbOnCompact={compactShowHawb}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
