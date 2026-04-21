import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Shipment } from "../types/shipment";
import { formatAwb } from "../utils/awbFormat";
import {
  LABEL_FONT_SCALE_DEFAULT,
  LABEL_FONT_SCALE_MAX,
  LABEL_FONT_SCALE_MIN,
  clampLabelFontScale,
  labelFs,
  loadLabelFontScale,
  saveLabelFontScale,
} from "../utils/labelFontScale";
import {
  type LabelPrintMode,
  loadLabelPrintFlipCcw,
  loadLabelPrintMode,
  saveLabelPrintFlipCcw,
  saveLabelPrintMode,
} from "../utils/labelPrintMode";
import { LABEL_PT } from "../constants/labelTypography";
import { airlineLines, shipmentToTsplBody } from "../utils/shipmentToLabelPayload";
import { printBrowserLabel } from "../utils/printBrowserLabel";
import { credFetch } from "../apiFetch";

const DEFAULT_ORIGIN = "SGN";

type LabelContentProps = { s: Shipment; fontScale: number };

export function LabelContent({ s, fontScale }: LabelContentProps) {
  const fs = (pt: number) => labelFs(fontScale, pt);
  const awbLine = formatAwb(s.awb);
  const pcsDisplay = s.pcs != null ? String(s.pcs) : "—";
  const [line1, line2] = airlineLines(s.flight);

  return (
    <div className="print-label-sheet lbl-sheet">
      <div className="lbl-band lbl-band--airline">
        <p style={{ fontSize: fs(LABEL_PT.airlineLine) }}>{line1}</p>
        <p style={{ fontSize: fs(LABEL_PT.airlineLine) }}>{line2}</p>
      </div>
      <div className="lbl-band lbl-band--awb">
        <p style={{ fontSize: fs(LABEL_PT.awb) }}>{awbLine}</p>
      </div>
      <div className="lbl-band lbl-band--split">
        <div className="lbl-col lbl-col--left">
          <span className="lbl-col-cap" style={{ fontSize: fs(LABEL_PT.caption) }}>
            Origin
          </span>
          <span className="lbl-col-airport" style={{ fontSize: fs(LABEL_PT.airport) }}>
            {DEFAULT_ORIGIN}
          </span>
          <span className="lbl-col-footer" style={{ fontSize: fs(LABEL_PT.caption) }}>
            Total no. of pieces
          </span>
        </div>
        <div className="lbl-col lbl-col--right">
          <span className="lbl-col-cap" style={{ fontSize: fs(LABEL_PT.caption) }}>
            Destination
          </span>
          <span className="lbl-col-airport truncate" style={{ fontSize: fs(LABEL_PT.airport) }}>
            {s.dest}
          </span>
          <span className="lbl-col-footer" style={{ fontSize: fs(LABEL_PT.pieces) }}>
            {pcsDisplay}
          </span>
        </div>
      </div>
    </div>
  );
}

function LabelPreviewFit({ shipment, fontScale }: { shipment: Shipment; fontScale: number }) {
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
  }, [updateScale, shipment.id, fontScale]);

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
            height: "80mm",
            transform: `scale(${preview.scale})`,
            transformOrigin: "top left",
          }}
        >
          <LabelContent s={shipment} fontScale={fontScale} />
        </div>
      </div>
    </div>
  );
}

interface PrintShippingLabelProps {
  shipment: Shipment;
  onClose: () => void;
}

const PRINT_OVERRIDE_STYLE_ID = "tecsops-print-label-override";

export function PrintShippingLabel({ shipment, onClose }: PrintShippingLabelProps) {
  const [fontScale, setFontScale] = useState(LABEL_FONT_SCALE_DEFAULT);
  const [printMode, setPrintMode] = useState<LabelPrintMode>("thermal");
  const [printFlipCcw, setPrintFlipCcw] = useState(false);
  const [printerHost, setPrinterHost] = useState("");
  const [printerPort, setPrinterPort] = useState("9100");
  const [tsplBusy, setTsplBusy] = useState(false);
  const [tsplMsg, setTsplMsg] = useState<string | null>(null);

  useEffect(() => {
    setFontScale(loadLabelFontScale());
    setPrintMode(loadLabelPrintMode());
    setPrintFlipCcw(loadLabelPrintFlipCcw());
  }, []);

  useEffect(() => {
    if (printMode !== "direct") {
      document.getElementById(PRINT_OVERRIDE_STYLE_ID)?.remove();
      return;
    }
    let el = document.getElementById(PRINT_OVERRIDE_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = PRINT_OVERRIDE_STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = `
@media print {
  @page { size: 100mm 80mm !important; margin: 0 !important; }
  html {
    height: 80mm !important;
    width: 100mm !important;
    max-height: 80mm !important;
    overflow: hidden !important;
  }
  body {
    min-height: 0 !important;
    height: 80mm !important;
    max-height: 80mm !important;
    width: 100mm !important;
    max-width: 100mm !important;
    overflow: hidden !important;
  }
  .print-only.print-label-host {
    width: 100mm !important;
    height: 80mm !important;
    max-width: 100mm !important;
    max-height: 80mm !important;
    page-break-after: avoid !important;
    break-after: avoid-page !important;
  }
  .print-label-spin,
  .print-label-spin.print-label-spin--ccw {
    position: static !important;
    transform: none !important;
    left: auto !important;
    top: auto !important;
    width: 100mm !important;
    height: 80mm !important;
    max-width: 100mm !important;
    max-height: 80mm !important;
    overflow: hidden !important;
  }
}`;
    return () => {
      document.getElementById(PRINT_OVERRIDE_STYLE_ID)?.remove();
    };
  }, [printMode]);

  const onFontScaleInput = (raw: number) => {
    const c = clampLabelFontScale(raw);
    setFontScale(c);
    saveLabelFontScale(c);
  };

  const onPrintModeChange = (m: LabelPrintMode) => {
    setPrintMode(m);
    saveLabelPrintMode(m);
  };

  const onPrintFlipChange = (on: boolean) => {
    setPrintFlipCcw(on);
    saveLabelPrintFlipCcw(on);
  };

  const downloadTspl = async () => {
    setTsplMsg(null);
    setTsplBusy(true);
    try {
      const body = shipmentToTsplBody(shipment);
      const r = await fetch("/api/tspl/build", {
        ...credFetch,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? r.statusText);
      const text = await r.text();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `label-${body.awb.replace(/\s/g, "")}.tspl`;
      a.click();
      URL.revokeObjectURL(a.href);
      setTsplMsg("Đã tải file .tspl — gửi RAW qua cổng 9100 hoặc nhập vào tool máy in.");
    } catch (e) {
      setTsplMsg(e instanceof Error ? e.message : "Lỗi tải TSPL");
    } finally {
      setTsplBusy(false);
    }
  };

  const sendTsplToNetwork = async () => {
    setTsplMsg(null);
    const host = printerHost.trim();
    if (!host) {
      setTsplMsg("Nhập IP máy in.");
      return;
    }
    const port = parseInt(printerPort, 10) || 9100;
    setTsplBusy(true);
    try {
      const body = { ...shipmentToTsplBody(shipment), host, port };
      const r = await fetch("/api/tspl/print", {
        ...credFetch,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setTsplMsg("Đã gửi TSPL tới máy in.");
    } catch (e) {
      setTsplMsg(e instanceof Error ? e.message : "Lỗi gửi in");
    } finally {
      setTsplBusy(false);
    }
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

          <div className="mb-4 rounded-2xl border border-black/[0.08] bg-apple-blue/5 px-3 py-3">
            <p className="text-xs font-semibold text-apple-label">Khuyến nghị: TSPL (RAW)</p>
            <p className="mt-1 text-[11px] leading-snug text-apple-secondary">
              Tránh Chrome scale/lệch trang. Tải file lệnh hoặc gửi TCP :9100 (cần{" "}
              <span className="font-mono text-apple-label">TSPL_ALLOWED_HOSTS</span> trên server).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={tsplBusy}
                onClick={() => void downloadTspl()}
                className="rounded-full bg-apple-blue px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-apple-blue-hover disabled:opacity-50"
              >
                Tải .tspl
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="text-[10px] font-semibold text-apple-secondary">IP máy in</label>
                <input
                  value={printerHost}
                  onChange={(e) => setPrinterHost(e.target.value)}
                  placeholder="192.168.x.x"
                  className="mt-0.5 w-full rounded-xl border border-black/[0.1] bg-white px-2 py-1.5 font-mono text-xs text-apple-label"
                />
              </div>
              <div className="w-20">
                <label className="text-[10px] font-semibold text-apple-secondary">Cổng</label>
                <input
                  value={printerPort}
                  onChange={(e) => setPrinterPort(e.target.value)}
                  className="mt-0.5 w-full rounded-xl border border-black/[0.1] bg-white px-2 py-1.5 font-mono text-xs text-apple-label"
                />
              </div>
              <button
                type="button"
                disabled={tsplBusy}
                onClick={() => void sendTsplToNetwork()}
                className="rounded-full border border-black/[0.12] bg-white px-3 py-2 text-xs font-semibold text-apple-blue hover:bg-black/[0.03] disabled:opacity-50"
              >
                Gửi TSPL
              </button>
            </div>
            {tsplMsg && <p className="mt-2 text-[11px] text-apple-secondary">{tsplMsg}</p>}
          </div>

          <div className="mb-4 rounded-2xl border border-black/[0.08] bg-apple-bg px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="label-font-scale" className="text-xs font-semibold text-apple-label">
                Cỡ chữ ({Math.round(fontScale * 100)}%)
              </label>
              <button
                type="button"
                onClick={() => onFontScaleInput(LABEL_FONT_SCALE_DEFAULT)}
                className="text-[11px] font-semibold text-apple-blue hover:underline"
              >
                Mặc định 100%
              </button>
            </div>
            <input
              id="label-font-scale"
              type="range"
              min={LABEL_FONT_SCALE_MIN}
              max={LABEL_FONT_SCALE_MAX}
              step={0.05}
              value={fontScale}
              onChange={(e) => onFontScaleInput(parseFloat(e.target.value))}
              className="mt-2 h-2 w-full cursor-pointer accent-apple-blue"
            />
            <p className="mt-1.5 text-[11px] leading-snug text-apple-secondary">
              Gốc: {LABEL_PT.airlineLine}/{LABEL_PT.awb}/{LABEL_PT.caption}/{LABEL_PT.airport}/{LABEL_PT.pieces} pt — vùng
              tuyệt đối mm.
            </p>
          </div>

          <div className="mb-4 rounded-2xl border border-black/[0.08] bg-amber-50/60 px-3 py-3">
            <p className="text-xs font-semibold text-apple-label">Chrome window.print (dự phòng)</p>
            <div className="mt-2 space-y-2 text-[11px] text-apple-label">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="label-print-mode"
                  checked={printMode === "thermal"}
                  onChange={() => onPrintModeChange("thermal")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Nhiệt</span> — @page <span className="font-mono">80×100 mm</span>, tem xoay
                  90°.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="label-print-mode"
                  checked={printMode === "direct"}
                  onChange={() => onPrintModeChange("direct")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Thẳng 100×80</span> — PDF / laser.
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-2 ${printMode !== "thermal" ? "opacity-40" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={printFlipCcw}
                  disabled={printMode !== "thermal"}
                  onChange={(e) => onPrintFlipChange(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Đảo xoay ±90°.</span>
              </label>
            </div>
            <p className="mt-2 text-[10px] text-apple-secondary">
              In trình duyệt: 100%, tắt Fit to page, tắt header/footer nếu có.
            </p>
          </div>

          <LabelPreviewFit shipment={shipment} fontScale={fontScale} />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void printBrowserLabel()}
              className="min-w-[8rem] flex-1 rounded-full bg-apple-blue px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-apple-blue-hover"
            >
              In Chrome…
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/[0.12] bg-white px-5 py-3 text-sm font-semibold text-apple-label hover:bg-black/[0.03]"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      <div className="print-only print-label-host fixed left-0 top-0 hidden bg-white print:block" aria-hidden>
        <div
          className={
            printMode === "thermal" && printFlipCcw ? "print-label-spin print-label-spin--ccw" : "print-label-spin"
          }
        >
          <LabelContent s={shipment} fontScale={fontScale} />
        </div>
      </div>
    </>
  );
}
