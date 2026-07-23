import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../types/shipment";
import {
  loadLabelSheetFormat,
  saveLabelSheetFormat,
  type LabelSheetFormat,
} from "../utils/labelSheetFormat";
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
  showAirline?: boolean;
  showHandling?: boolean;
  handlingText?: string;
};

export function LabelContent({
  s,
  fontScale,
  mawbRelScale = 1,
  hawbRelScale: _hawbRelScale = 1,
  airlineLabelOverrides,
  sheetVariant = "standard",
  showHawbOnCompact = false,
  showAirline = true,
  showHandling = true,
  handlingText = "",
}: LabelContentProps) {
  const d = mapShipmentToAirCargoLabelData(s, airlineLabelOverrides);
  const mm = (base: number) => `${Math.round(base * fontScale * 100) / 100}mm`;
  const compact = sheetVariant === "compact";
  const hasAirline = showAirline && Boolean(d.airline);
  const hasHawb = d.hasHawb && (!compact || showHawbOnCompact);
  const autoHandling =
    d.special === "cold"
      ? "PLS KEEP AT 2-8C - PERISHABLE"
      : d.special === "danger"
        ? "DANGEROUS GOODS"
        : "";
  const handling = handlingText.trim() || autoHandling;

  /* Thiết kế TECSOPS XP-470B: AWB hero → pieces → airport → airline */
  const airlineMm = compact ? 2.6 : 3.4;
  const mawbMm = fitAwbFontMm(d.mawb, { compact, relScale: mawbRelScale });
  const routeLabMm = compact ? 1.35 : 1.7;
  const routeValMm = compact ? 5.5 : 7.8;
  const piecesLabMm = compact ? 1.5 : 2;
  const piecesValMm = compact ? 11.5 : 16.5;
  const specialMm = compact ? 1.5 : 1.9;
  const hawbMm = (compact ? 3.2 : 4.2) * _hawbRelScale;

  const sheetClass = [
    "label",
    "print-label-sheet",
    "lbl-sheet",
    compact ? "lbl-sheet--compact" : "",
    hasAirline ? "" : "lbl-sheet--no-airline",
    hasHawb ? "lbl-sheet--house" : "",
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
        {hasHawb ? (
          <div className="lbl-hawb">
            <span className="lbl-hawb-label">HAWB</span>
            <strong className="lbl-hawb-val" style={{ fontSize: mm(hawbMm) }}>
              {d.hawbNo}
            </strong>
          </div>
        ) : null}
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
        {showHandling && handling ? (
          <div className={`lbl-special ${d.special}`} style={{ fontSize: mm(specialMm) }}>
            {handling}
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
  fontScale,
  showAirline,
  showHandling,
  handlingText,
}: {
  shipment: Shipment;
  format: LabelSheetFormat;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  fontScale: number;
  showAirline: boolean;
  showHandling: boolean;
  handlingText: string;
}) {
  const compact = format === "100x50";
  const labelHMm = compact ? 50 : 80;
  const scale = compact ? 1.08 : 1;

  return (
    <div className={`flex min-h-[280px] w-full items-center justify-center overflow-auto rounded-2xl p-5 ${OPS.printPreviewFrame}`}>
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
            fontScale={fontScale}
            airlineLabelOverrides={airlineLabelOverrides}
            sheetVariant={compact ? "compact" : "standard"}
            showHawbOnCompact
            showAirline={showAirline}
            showHandling={showHandling}
            handlingText={handlingText}
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

function SettingToggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
      } ${OPS.border}`}
    >
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${OPS.title}`}>{label}</span>
        {hint ? <span className={`block text-[11px] ${OPS.muted}`}>{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-apple-blue"
      />
    </label>
  );
}

interface PrintShippingLabelProps {
  shipment: Shipment;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  onClose: () => void;
}

export function PrintShippingLabel({ shipment, airlineLabelOverrides, onClose }: PrintShippingLabelProps) {
  const [format, setFormat] = useState<LabelSheetFormat>(() => loadLabelSheetFormat());
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const printHostRef = useRef<HTMLDivElement>(null);
  const [copiesInput, setCopiesInput] = useState("");
  const [fontScale, setFontScale] = useState(1);
  const [showAirline, setShowAirline] = useState(true);
  const [showHandling, setShowHandling] = useState(true);
  const [handlingText, setHandlingText] = useState("");
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
    if (showAirline && !labelData.airline) next.push("chưa nhận diện được hãng");
    return next;
  }, [labelData, shipment.pcs, showAirline]);

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
        mode: "xp470b",
        copies: copiesToPrint,
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
        className="no-print fixed inset-0 z-[100] flex items-end justify-center bg-black/30 p-2 backdrop-blur-xl sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
      >
        <div
          className={`flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border shadow-apple-md sm:max-h-[calc(100dvh-2rem)] ${OPS.modal}`}
        >
          <div className={`flex shrink-0 items-center justify-between border-b px-5 py-4 sm:px-6 ${OPS.border}`}>
            <div className="min-w-0">
              <h2 className={`truncate text-lg font-semibold ${OPS.title}`}>Xưởng in nhãn vận chuyển</h2>
              <p className={`text-xs ${OPS.secondary}`}>
                {shipment.awb || "Chưa có AWB"} · {labelSheetFormatLabel(format)} ·{" "}
                {hasValidCopies ? `${copies} tem` : "chưa nhập số tem"}
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

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)] lg:p-6">
              <section className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className={`text-sm font-bold ${OPS.title}`}>Xem trước đúng tỷ lệ</h3>
                    <p className={`text-[11px] ${OPS.muted}`}>
                      Nội dung bên dưới chính là nội dung gửi sang cửa sổ in.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                      warnings.length
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                        : "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200"
                    }`}
                  >
                    {warnings.length ? `${warnings.length} cảnh báo` : "Sẵn sàng in"}
                  </span>
                </div>

                <LabelPreviewSimple
                  shipment={shipment}
                  format={format}
                  airlineLabelOverrides={airlineLabelOverrides}
                  fontScale={fontScale}
                  showAirline={showAirline}
                  showHandling={showHandling}
                  handlingText={handlingText}
                />

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className={OPS.printSummaryCard}>
                    <span className={`block text-[10px] uppercase ${OPS.muted}`}>Trang in</span>
                    <strong className={`text-sm ${OPS.title}`}>{pageMm.wMm}×{pageMm.hMm} mm</strong>
                  </div>
                  <div className={OPS.printSummaryCard}>
                    <span className={`block text-[10px] uppercase ${OPS.muted}`}>Số lượng</span>
                    <strong className={`text-sm ${OPS.title}`}>
                      {hasValidCopies ? `${copies} tem` : "Chưa nhập"}
                    </strong>
                  </div>
                  <div className={OPS.printSummaryCard}>
                    <span className={`block text-[10px] uppercase ${OPS.muted}`}>Thiết bị</span>
                    <strong className={`text-sm ${OPS.title}`}>XP-470B</strong>
                  </div>
                </div>

                {warnings.length ? (
                  <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <strong>Kiểm tra trước khi in:</strong> {warnings.join(" · ")}.
                  </div>
                ) : null}
              </section>

              <aside className="space-y-4">
                <section className={`${OPS.card} p-3`}>
                  <h3 className={`mb-2 text-xs font-bold uppercase tracking-wide ${OPS.secondary}`}>
                    Khổ tem
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
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
                          className={`rounded-xl border-2 px-3 py-2.5 text-center transition active:scale-[0.98] ${
                            selected ? OPS.formatBtnOn : OPS.formatBtnOff
                          }`}
                        >
                          <span className="block text-sm font-bold">{labelSheetFormatLabel(fmt)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className={`mt-2 text-[10px] ${OPS.muted}`}>
                    Chỉ sử dụng hai khổ tem chuẩn trên máy XP-470B.
                  </p>
                </section>

                <section className={`${OPS.card} p-3`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className={`text-xs font-bold uppercase tracking-wide ${OPS.secondary}`}>Số tem</h3>
                      <p className={`text-[10px] ${OPS.muted}`}>
                        Nhập tay để xác nhận đúng số lượng trước khi in.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={999}
                        inputMode="numeric"
                        value={copiesInput}
                        onChange={(e) => setCopiesInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
                        placeholder="Nhập"
                        className={`${OPS.printStepperInput} !w-20 !py-1.5 !text-sm`}
                        aria-label="Số lượng tem"
                      />
                      <span className={`text-xs font-semibold ${OPS.secondary}`}>tem</span>
                    </div>
                  </div>
                  {!hasValidCopies && copiesInput ? (
                    <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      Số tem phải từ 1 đến 999.
                    </p>
                  ) : null}
                </section>

                <section className={`${OPS.card} p-3`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <h3 className={`text-xs font-bold uppercase tracking-wide ${OPS.secondary}`}>Nội dung tem</h3>
                      <p className={`text-[10px] ${OPS.muted}`}>Thay đổi chỉ áp dụng cho lần in này.</p>
                    </div>
                    <span className={`text-xs font-semibold tabular-nums ${OPS.secondary}`}>
                      {Math.round(fontScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={85}
                    max={115}
                    step={5}
                    value={Math.round(fontScale * 100)}
                    onChange={(e) => setFontScale(Number(e.target.value) / 100)}
                    className="mb-3 w-full accent-apple-blue"
                    aria-label="Tỷ lệ chữ"
                  />
                  <div className="grid gap-2">
                    <SettingToggle
                      checked={showAirline}
                      onChange={setShowAirline}
                      label="Hiện tên hãng"
                      hint={labelData.airline || "Chưa nhận diện được hãng"}
                    />
                    {labelData.hasHawb ? (
                      <div className="rounded-xl border border-emerald-300/70 bg-emerald-50 px-3 py-2.5 dark:border-emerald-400/30 dark:bg-emerald-500/10">
                        <span className={`block text-sm font-semibold ${OPS.title}`}>Tem House · HAWB</span>
                        <span className="block truncate font-mono text-[11px] font-bold text-emerald-800 dark:text-emerald-200">
                          {labelData.hawbNo}
                        </span>
                        <span className={`block text-[10px] ${OPS.muted}`}>
                          HAWB được tự động làm nổi bật trên tem.
                        </span>
                      </div>
                    ) : null}
                    <SettingToggle
                      checked={showHandling}
                      onChange={setShowHandling}
                      label="Hiện cảnh báo xử lý"
                      hint="Tự nhận PER/COLD/DG hoặc dùng nội dung bên dưới"
                    />
                  </div>
                  <div className="mt-3">
                    <label className={`text-[11px] font-semibold ${OPS.secondary}`}>
                      Dòng cảnh báo tùy chỉnh
                      <input
                        value={handlingText}
                        onChange={(e) => setHandlingText(e.target.value.slice(0, 48).toUpperCase())}
                        disabled={!showHandling}
                        placeholder="Để trống = tự nhận từ ghi chú"
                        className={`mt-1 w-full ${OPS.inputLg}`}
                        maxLength={48}
                      />
                    </label>
                  </div>
                </section>
              </aside>
            </div>
          </div>

          <div className={`flex shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:px-6 ${OPS.footer}`}>
            <div className="min-w-0 flex-1">
              {printMsg ? (
                <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">{printMsg}</p>
              ) : (
                <p className={`text-[11px] ${OPS.muted}`}>
                  Trình duyệt sẽ mở hộp thoại in; đặt Scale 100% và Margins = None.
                </p>
              )}
            </div>
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
                In thử 1 tem
              </button>
              <button
                type="button"
                onClick={() => void handlePrint()}
                disabled={printing || !hasValidCopies}
                className="rounded-full bg-apple-blue px-6 py-2.5 text-sm font-semibold text-white hover:bg-apple-blue-hover disabled:opacity-60"
              >
                {printing ? "Đang chuẩn bị…" : hasValidCopies ? `In ${copies} tem` : "Nhập số tem để in"}
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
                    fontScale={fontScale}
                    airlineLabelOverrides={airlineLabelOverrides}
                    sheetVariant={format === "100x50" ? "compact" : "standard"}
                    showHawbOnCompact
                    showAirline={showAirline}
                    showHandling={showHandling}
                    handlingText={handlingText}
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
