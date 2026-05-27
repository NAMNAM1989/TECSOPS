import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../types/shipment";
import { loadLabelSheetFormat, type LabelSheetFormat } from "../utils/labelSheetFormat";
import { loadLabelPrintFlipCcw } from "../utils/labelPrintMode";
import { mapShipmentToAirCargoLabelData } from "../utils/mapShipmentToAirCargoLabelData";
import { buildBoundThermalPreview } from "../label-designer/adapters/printPipelinePreview";
import type { AirlineLabelOverrides } from "../utils/airlineLabelOverridesCore";
import { OPS } from "../styles/opsModalStyles";
import { usePrinterProfiles } from "../hooks/usePrinterProfiles";
import { getActiveThermalProfile } from "../printing/printerProfiles";
import { loadThermalDeliveryMode, resolveEffectiveThermalDeliveryMode } from "../printing/printDeliveryMode";
import {
  findThermalProfileByFormat,
  labelSheetFormatLabel,
  resolveThermalProfileLabelFormat,
  syncLabelSheetFormatFromProfile,
} from "../printing/thermalLabelFormat";
import { loadPrinterProfileStore } from "../printing/printerProfileStorage";
import { printThermalLabelLocalBridge, printThermalLabelTspl } from "../printing/thermalLabel/thermalLabelTspl";
import { fetchLocalPrintBridgeStatus } from "../printing/thermalLabel/thermalLocalBridge";
import { printThermalLabelsFromIframe } from "../utils/printThermalLabelIframe";
import type { PrinterProfileStoreV1 } from "../printing/printTypes";

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
  const noteMm = 1.9;
  const hawbNoteValMm = 2.8;
  const hawbLabMm = compact ? 2.2 : 2.8;
  const hawbValMm = compact ? 3.5 : 7;
  const piecesLabMm = compact ? 2.3 : 2.6;
  const piecesValMm = compact ? 15 : 22;
  const compactHawbPiecesMm = 12;
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

      {compact ? (
        <div className="lbl-bottom">
          {showHawbBlock && d.hawbPieces ? (
            <div className="lbl-compact-pieces-hawb-center" style={{ fontSize: mm(compactHawbPiecesMm) }}>
              {d.hawbPieces}
            </div>
          ) : null}
          {d.pieces ? (
            <div className="lbl-compact-pieces-center" style={{ fontSize: mm(piecesValMm) }}>
              {d.pieces}
            </div>
          ) : null}
          <div className="lbl-bottom-notes">
            {showHawbBlock ? (
              <div className="lbl-note-line" style={{ fontSize: mm(noteMm) }}>
                HAWB No.:
                {d.hawbNo ? (
                  <>
                    {" "}
                    <span className="lbl-note-hawb-val" style={{ fontSize: mm(hawbNoteValMm * hawbRelScale) }}>
                      {d.hawbNo}
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
            {showHawbBlock ? (
              <>
                <div className="lbl-note-line" style={{ fontSize: mm(noteMm) }}>
                  Pieces HAWB
                </div>
                <div className="lbl-note-line" style={{ fontSize: mm(noteMm) }}>
                  Total pieces MAWB
                </div>
              </>
            ) : (
              <div className="lbl-note-line" style={{ fontSize: mm(noteMm) }}>
                Total no. of pieces
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {showHawbBlock ? (
            <div className="lbl-hawb-row">
              <span className="lbl-hawb-label" style={{ fontSize: mm(hawbLabMm) }}>
                HAWB No.:
              </span>
              {d.hawbNo ? (
                <span className="lbl-hawb-val" style={{ fontSize: mm(hawbValMm * hawbRelScale) }}>
                  {d.hawbNo}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="lbl-bottom">
            {showHawbBlock ? (
              <>
                <div className="lbl-pieces-cell">
                  <div className="pieces-label" style={{ fontSize: mm(piecesLabMm) }}>
                    Pieces · HAWB
                  </div>
                  <div className="pieces-val" style={{ fontSize: mm(piecesValMm) }}>
                    {d.hawbPieces}
                  </div>
                </div>
                <div className="lbl-pieces-cell">
                  <div className="pieces-label" style={{ fontSize: mm(piecesLabMm) }}>
                    Total · MAWB
                  </div>
                  <div className="pieces-val" style={{ fontSize: mm(piecesValMm) }}>
                    {d.pieces}
                  </div>
                </div>
              </>
            ) : (
              <div className="lbl-pieces-cell">
                <div className="pieces-label" style={{ fontSize: mm(piecesLabMm) }}>
                  Total no. of pieces
                </div>
                <div className="pieces-val" style={{ fontSize: mm(piecesValMm) }}>
                  {d.pieces}
                </div>
              </div>
            )}
          </div>
        </>
      )}

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
  profile,
  airlineLabelOverrides,
}: {
  shipment: Shipment;
  profile: import("../printing/printTypes").ThermalLabelPrinterProfile;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
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
  }, [updateScale, shipment.id, airlineLabelOverrides, profile.id, profile.thermalFieldOverrides, profile.labelTemplate]);

  const format = resolveThermalProfileLabelFormat(profile);
  const labelH = format === "100x50" ? "50mm" : "80mm";

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
          {buildBoundThermalPreview(shipment, profile, airlineLabelOverrides)}
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
  const printFlipCcw = useMemo(() => loadLabelPrintFlipCcw(), []);
  const { store, setActiveThermal, upsert } = usePrinterProfiles();
  const thermalProfile = useMemo(() => getActiveThermalProfile(store), [store]);
  const activeFormat = useMemo(() => resolveThermalProfileLabelFormat(thermalProfile), [thermalProfile]);
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [bridgePrinters, setBridgePrinters] = useState<string[]>([]);
  const printHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const st = await fetchLocalPrintBridgeStatus(true);
      if (cancelled) return;
      setBridgeOnline(st.online);
      setBridgePrinters(st.printers);
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const saveWindowsPrinterName = useCallback(
    (format: LabelSheetFormat, name: string) => {
      const p = findThermalProfileByFormat(store, format);
      if (!p) return;
      upsert({ ...p, windowsPrinterName: name.trim() });
    },
    [store, upsert]
  );

  useEffect(() => {
    const fmt = loadLabelSheetFormat();
    const profile = findThermalProfileByFormat(store, fmt);
    if (profile && profile.id !== thermalProfile.id) {
      setActiveThermal(profile.id);
      syncLabelSheetFormatFromProfile(profile);
    }
  }, [store, setActiveThermal, thermalProfile.id]);

  const pickFormat = (format: LabelSheetFormat) => {
    const profile = findThermalProfileByFormat(store, format);
    if (!profile) {
      setPrintMsg(`Chưa có profile máy in ${labelSheetFormatLabel(format)} — cấu hình IP máy in trên máy chủ.`);
      return;
    }
    setActiveThermal(profile.id);
    syncLabelSheetFormatFromProfile(profile);
    setPrintMsg(null);
  };

  const handlePrint = async () => {
    setPrintMsg(null);
    const profile = getActiveThermalProfile(loadPrinterProfileStore());
    const printFormat = resolveThermalProfileLabelFormat(profile);
    const deliveryMode = loadThermalDeliveryMode();
    const effectiveMode = resolveEffectiveThermalDeliveryMode(deliveryMode, profile, bridgeOnline);

    if (effectiveMode === "local-bridge") {
      const res = await printThermalLabelLocalBridge(shipment, profile, airlineLabelOverrides);
      setPrintMsg(
        res.ok
          ? `Đã in ${labelSheetFormatLabel(printFormat)} → ${profile.windowsPrinterName}`
          : res.error
      );
      return;
    }

    if (effectiveMode === "tspl-tcp") {
      const res = await printThermalLabelTspl(shipment, profile, airlineLabelOverrides);
      setPrintMsg(res.ok ? `Đã gửi ${labelSheetFormatLabel(printFormat)} → ${profile.host}` : res.error);
      return;
    }

    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const res = await printThermalLabelsFromIframe({ format: printFormat, host: printHostRef.current });
    if (!res.ok) setPrintMsg(res.error);
    else if (!bridgeOnline && !profile.windowsPrinterName?.trim()) {
      setPrintMsg(
        "Đã mở hộp thoại in. Để in 1 click: chạy npm run print-bridge và gán tên máy Windows bên dưới."
      );
    }
  };

  return (
    <>
      <div
        className="no-print fixed inset-0 z-[100] flex items-end justify-center bg-black/25 p-4 backdrop-blur-xl sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <div className={`no-print max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[28px] border p-5 shadow-apple-md sm:max-w-xl ${OPS.modal} ${OPS.border}`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className={`text-[19px] font-semibold tracking-tight ${OPS.title}`}>In nhãn</h2>
              <p className={`text-xs ${OPS.secondary}`}>
                Tem {shipment.awb} · {shipment.customer}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-full p-2 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] ${OPS.muted}`}
              aria-label="Đóng"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <LabelPreviewFit
            shipment={shipment}
            profile={thermalProfile}
            airlineLabelOverrides={airlineLabelOverrides}
          />

          <div className={`mt-4 rounded-2xl border px-3 py-3 ${OPS.panelSoft}`}>
            <p
              className={`text-center text-[11px] font-semibold ${
                bridgeOnline ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-200"
              }`}
            >
              {bridgeOnline
                ? "Print Bridge đang chạy — in trực tiếp TSPL (không hộp thoại)"
                : "Print Bridge chưa chạy — trên PC quầy: npm run print-bridge"}
            </p>
          </div>

          <div className="mt-4">
            <p className={`mb-2 text-center text-xs font-semibold ${OPS.secondary}`}>Chọn khổ tem</p>
            <div className="flex gap-2">
              {(["100x80", "100x50"] as const).map((fmt) => {
                const profile = findThermalProfileByFormat(store, fmt);
                const selected = activeFormat === fmt;
                const winName = profile?.windowsPrinterName?.trim();
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => pickFormat(fmt)}
                    className={`flex-1 rounded-2xl border-2 px-3 py-3.5 text-center transition-all active:scale-[0.98] ${
                      selected ? OPS.formatBtnOn : OPS.formatBtnOff
                    }`}
                  >
                    <span className="block text-[15px] font-bold leading-tight">{labelSheetFormatLabel(fmt)}</span>
                    <span
                      className={`mt-1 block truncate text-[10px] font-medium ${
                        selected ? OPS.formatBtnSubOn : OPS.formatBtnSubOff
                      }`}
                    >
                      {winName && bridgeOnline
                        ? winName
                        : winName
                          ? `${winName} (cần bridge)`
                          : "Chưa gán máy Windows"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <ThermalWindowsPrinterNamesPanel
            store={store}
            bridgePrinters={bridgePrinters}
            onSave={saveWindowsPrinterName}
          />

          {printMsg ? (
            <p className={`mt-3 ${OPS.msgBox}`}>{printMsg}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handlePrint()}
              className="min-h-11 min-w-[8rem] flex-1 select-none rounded-full bg-apple-blue px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-apple-blue-hover active:scale-[0.97] sm:flex-none"
            >
              In
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`min-h-11 select-none rounded-full border px-5 py-3 text-sm font-semibold transition-all active:scale-[0.97] ${OPS.tabIdle}`}
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      {createPortal(
        <div
          ref={printHostRef}
          className="print-label-host hidden bg-white print:block"
          aria-hidden
        >
          <div className="print-label-page">
            <div className={printFlipCcw ? "print-label-spin print-label-spin--ccw" : "print-label-spin"}>
              {buildBoundThermalPreview(shipment, thermalProfile, airlineLabelOverrides)}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function ThermalWindowsPrinterNamesPanel({
  store,
  bridgePrinters,
  onSave,
}: {
  store: PrinterProfileStoreV1;
  bridgePrinters: string[];
  onSave: (format: LabelSheetFormat, name: string) => void;
}) {
  return (
    <div className={`mt-4 rounded-2xl border px-3 py-3 ${OPS.panelSoft}`}>
      <p className={`mb-2 text-[11px] font-semibold ${OPS.secondary}`}>
        Tên máy in Windows (XPrinter 470B USB) — copy đúng từ Cài đặt → Máy in
      </p>
      {(["100x80", "100x50"] as const).map((fmt) => {
        const profile = findThermalProfileByFormat(store, fmt);
        if (!profile) return null;
        return (
          <WindowsPrinterRow
            key={fmt}
            label={labelSheetFormatLabel(fmt)}
            value={profile.windowsPrinterName ?? ""}
            printers={bridgePrinters}
            onChange={(v) => onSave(fmt, v)}
          />
        );
      })}
    </div>
  );
}

function WindowsPrinterRow({
  label,
  value,
  printers,
  onChange,
}: {
  label: string;
  value: string;
  printers: string[];
  onChange: (v: string) => void;
}) {
  const listId = `win-printer-list-${label.replace(/\W/g, "")}`;
  return (
    <label className="mb-2 block last:mb-0">
      <span className={`mb-1 block text-[10px] font-semibold ${OPS.muted}`}>{label}</span>
      <input
        list={printers.length > 0 ? listId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="vd. XPrinter XP-470B"
        className={`w-full rounded-lg border px-2.5 py-2 text-sm ${OPS.input}`}
      />
      {printers.length > 0 ? (
        <datalist id={listId}>
          {printers.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      ) : null}
    </label>
  );
}
