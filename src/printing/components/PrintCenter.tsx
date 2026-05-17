import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Shipment } from "../../types/shipment";
import type { CustomerDirectoryEntry } from "../../types/customerDirectory";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";
import type { GlobalAgentCatalog } from "../../types/globalAgents";
import { defaultGlobalAgentCatalog } from "../../utils/globalAgentsCore";
import { LabelDesigner } from "../../label-designer/designer/LabelDesigner";
import { buildBoundThermalPreview } from "../../label-designer/adapters/printPipelinePreview";
import { profileDocumentKind, resolveTemplateForKind } from "../../label-designer/adapters/printPipeline";
import {
  commitThermalDesignerSave,
  resolveThermalLabelTemplateForDesigner,
} from "../../label-designer/core/templatePreserve";
import { buildShipmentLabelContext } from "../../label-designer/data/shipmentDataContext";
import { loadLabelSheetFormat, type LabelSheetFormat } from "../../utils/labelSheetFormat";
import {
  formatMismatchMessage,
  labelFormatMismatch,
  labelSheetFormatLabel,
  resolveThermalProfileLabelFormat,
  syncLabelSheetFormatFromProfile,
} from "../thermalLabelFormat";
import { printDimReport } from "../../utils/printDimReport";
import { ensureScscConsigneeForPrint } from "../../utils/ensureScscConsigneeForPrint";
import { usePrinterProfiles } from "../../hooks/usePrinterProfiles";
import type { PrintDocumentType } from "../printTypes";
import { getActiveA4WeighProfile, getActiveThermalProfile } from "../printerProfiles";
import {
  loadThermalDeliveryMode,
  resolveEffectiveThermalDeliveryMode,
  saveThermalDeliveryMode,
  type ThermalDeliveryMode,
} from "../printDeliveryMode";
import { PrinterProfileSelector } from "./PrinterProfileSelector";
import { PrinterProfileEditor } from "./PrinterProfileEditor";
import { CalibrationWizard } from "./CalibrationWizard";
import { printShipmentThermalBrowser } from "../thermalLabel/thermalLabelBrowserPrint";
import {
  downloadTsplFile,
  printThermalCalibrationTspl,
  printThermalLabelTspl,
} from "../thermalLabel/thermalLabelTspl";
import { printScscWeighReceiptHtml } from "../scscWeigh/scscWeighPrint";
import { canPrintWeighReceiptScsc } from "../../utils/printWeighReceiptScsc";
import type { ShipmentMutation } from "../../utils/shipmentMutations";
import type { AppState } from "../../utils/shipmentMutations";

type Props = {
  open: boolean;
  onClose: () => void;
  rows: Shipment[];
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  customerDirectory: readonly CustomerDirectoryEntry[];
  globalAgents?: GlobalAgentCatalog;
  mutate?: (mutation: ShipmentMutation) => Promise<AppState | null>;
};

export function PrintCenter({
  open,
  onClose,
  rows,
  airlineLabelOverrides,
  customerDirectory,
  globalAgents = defaultGlobalAgentCatalog(),
  mutate,
}: Props) {
  const { store, upsert, setActiveThermal, setActiveA4, syncStatus, syncError, pushCatalogNow } =
    usePrinterProfiles({ pushCatalog: mutate });
  const [docType, setDocType] = useState<PrintDocumentType>("thermal-label");
  const [deliveryMode, setDeliveryMode] = useState<ThermalDeliveryMode>(() => loadThermalDeliveryMode());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [calibOpen, setCalibOpen] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);

  const thermalProfile = useMemo(() => getActiveThermalProfile(store), [store]);
  const a4Profile = useMemo(() => getActiveA4WeighProfile(store), [store]);
  const activeProfile = docType === "scsc-weigh" ? a4Profile : thermalProfile;
  const thermalFormat = useMemo(
    () => resolveThermalProfileLabelFormat(thermalProfile),
    [thermalProfile]
  );
  const [sheetFormat, setSheetFormat] = useState<LabelSheetFormat>(() => loadLabelSheetFormat());

  useEffect(() => {
    if (docType !== "thermal-label") return;
    setSheetFormat(syncLabelSheetFormatFromProfile(thermalProfile));
  }, [docType, thermalProfile.id, thermalProfile.labelSheetFormat, thermalProfile]);

  const formatMismatch =
    docType === "thermal-label" && labelFormatMismatch(thermalProfile, sheetFormat);

  const pickThermalProfile = (id: string) => {
    setActiveThermal(id);
    const picked = store.profiles.find((p) => p.id === id);
    if (picked?.type === "thermal-tspl") {
      setSheetFormat(syncLabelSheetFormatFromProfile(picked));
    }
  };

  const eligibleRows = useMemo(() => {
    if (docType === "scsc-weigh") return rows.filter((r) => canPrintWeighReceiptScsc(r));
    return rows;
  }, [rows, docType]);

  const previewShipment = useMemo(() => {
    const id = [...selectedIds][0];
    return eligibleRows.find((r) => r.id === id) ?? eligibleRows[0] ?? null;
  }, [selectedIds, eligibleRows]);

  if (!open || typeof document === "undefined") return null;

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectedRows = eligibleRows.filter((r) => selectedIds.has(r.id));
  const targets = selectedRows.length > 0 ? selectedRows : previewShipment ? [previewShipment] : [];

  const runTestCalibration = async () => {
    if (docType === "thermal-label") {
      if (deliveryMode === "tspl-tcp") {
        const res = await printThermalCalibrationTspl(thermalProfile);
        setStatusMsg(res.ok ? "Đã gửi tem test TSPL." : res.error);
      } else {
        setStatusMsg("Browser: kiểm tra khổ 100×80, scale 100%, margin None.");
      }
      return;
    }
    const s = previewShipment ?? rows[0];
    if (!s) return;
    printScscWeighReceiptHtml(s, { profile: a4Profile, calibrationTest: true, customerDirectory });
    setStatusMsg("Đã gửi in test tờ cân A4.");
  };

  const runPrint = async () => {
    setStatusMsg(null);
    if (targets.length === 0) {
      setStatusMsg("Không có lô để in.");
      return;
    }

    if (docType === "dim-report") {
      for (const s of targets) printDimReport(s);
      setStatusMsg(`Đã gửi in DIM cho ${targets.length} lô.`);
      return;
    }

    if (docType === "scsc-weigh") {
      let n = 0;
      for (const s of targets) {
        const ctx = await ensureScscConsigneeForPrint(s, customerDirectory, globalAgents);
        if (!ctx) continue;
        printScscWeighReceiptHtml(ctx.shipment, {
          profile: a4Profile,
          customerDirectory,
          mapOptions: {
            skipAutoSingleConsignee: ctx.skipAutoSingleConsignee,
            skipAutoDefaultAgent: ctx.skipAutoDefaultAgent,
            skipAutoSingleShipper: ctx.skipAutoSingleShipper,
            skipAutoSingleGoods: ctx.skipAutoSingleGoods,
          },
        });
        n += 1;
      }
      setStatusMsg(`Đã gửi ${n} tờ cân (${a4Profile.name}).`);
      return;
    }

    if (formatMismatch) {
      setStatusMsg(formatMismatchMessage(thermalProfile, sheetFormat));
      return;
    }
    const printFormat = resolveThermalProfileLabelFormat(thermalProfile);

    const effectiveMode = resolveEffectiveThermalDeliveryMode(deliveryMode, thermalProfile.host);
    if (effectiveMode === "tspl-tcp") {
      let ok = 0;
      let err = "";
      for (const s of targets) {
        const res = await printThermalLabelTspl(s, thermalProfile, airlineLabelOverrides);
        if (res.ok) ok += 1;
        else err = res.error;
      }
      setStatusMsg(ok ? `TSPL: ${ok}/${targets.length} → ${thermalProfile.host || "?"}` : err || "Lỗi TSPL");
      return;
    }

    let ok = 0;
    let err = "";
    for (const s of targets) {
      try {
        await printShipmentThermalBrowser(s, { airlineLabelOverrides, format: printFormat });
        ok += 1;
      } catch (e) {
        err = e instanceof Error ? e.message : "Lỗi in trình duyệt";
      }
    }
    setStatusMsg(
      ok === targets.length
        ? `Đã gửi in trình duyệt: ${ok} tem.`
        : err || `In được ${ok}/${targets.length} tem.`
    );
  };

  return createPortal(
    <div className="no-print fixed inset-0 z-[95] flex flex-col bg-apple-bg">
      <header className="flex shrink-0 items-center justify-between border-b border-black/[0.08] bg-white px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-apple-label">Trung tâm in</h2>
          <p className="text-xs text-apple-secondary">Profile máy in · preview · in hàng loạt</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border px-4 py-2 text-sm font-semibold">
          Đóng
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_340px]">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-2xl border bg-white p-4">
          <DocTypeTabs docType={docType} onChange={setDocType} />
          <PrinterProfileSelector
            docType={docType === "dim-report" ? "thermal-label" : docType}
            store={store}
            onChangeActive={(id) => (docType === "scsc-weigh" ? setActiveA4(id) : pickThermalProfile(id))}
            onEditProfiles={() => setProfileEditorOpen(true)}
          />
          {docType === "thermal-label" ? (
            <>
              <p className="rounded-xl border border-apple-blue/20 bg-apple-blue/5 px-3 py-2 text-[11px] text-apple-label">
                Khổ tem theo profile: <strong>{labelSheetFormatLabel(thermalFormat)}</strong>
                {thermalProfile.host?.trim() ? ` · IP ${thermalProfile.host}` : " · chưa có IP (dùng TSPL)"}
              </p>
              {formatMismatch ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-800">
                  {formatMismatchMessage(thermalProfile, sheetFormat)}
                </p>
              ) : null}
              <ThermalModeBar mode={deliveryMode} profileHost={thermalProfile.host} onChange={setDeliveryMode} />
            </>
          ) : null}
          <ShipmentPickList rows={eligibleRows} selectedIds={selectedIds} onToggle={toggleId} />
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border bg-white p-4">
          <p className="text-xs font-semibold text-apple-label">Preview</p>
          {docType === "thermal-label" && previewShipment ? (
            <div className="flex justify-center rounded-xl bg-apple-bg p-3">
              <div style={{ width: "100mm", height: sheetFormat === "100x50" ? "50mm" : "80mm" }}>
                {buildBoundThermalPreview(previewShipment, thermalProfile, airlineLabelOverrides)}
              </div>
            </div>
          ) : (
            <p className="text-xs text-apple-secondary">
              {docType === "scsc-weigh"
                ? `${a4Profile.name} · offset ${a4Profile.offsetXmm}/${a4Profile.offsetYmm}mm · scale ${a4Profile.scaleX}/${a4Profile.scaleY} · địa chỉ ${a4Profile.partyAddressFontMm ?? 3}mm / dòng ${a4Profile.partyLineGapMm ?? 6}mm`
                : "Chọn lô để xem trước."}
            </p>
          )}
          {statusMsg ? <p className="rounded-lg bg-black/[0.04] px-3 py-2 text-xs">{statusMsg}</p> : null}
          {syncStatus === "ok" ? (
            <p className="text-[10px] text-emerald-800">Profile đã đồng bộ lên server.</p>
          ) : null}
          {syncError ? <p className="text-[10px] text-red-700">{syncError}</p> : null}
          <div className="mt-auto flex flex-wrap gap-2">
            {mutate ? (
              <button
                type="button"
                onClick={() => void pushCatalogNow()}
                className="rounded-full border px-3 py-2 text-xs font-semibold"
              >
                Đồng bộ profile
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setDesignerOpen(true)}
              className="rounded-full border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-950"
            >
              Thiết kế tem
            </button>
            <button type="button" onClick={() => setCalibOpen(true)} className="rounded-full border px-3 py-2 text-xs font-semibold">
              Calibration
            </button>
            <button type="button" onClick={() => void runTestCalibration()} className="rounded-full border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
              In thử căn chỉnh
            </button>
            {docType === "thermal-label" && deliveryMode === "tspl-tcp" && previewShipment ? (
              <button
                type="button"
                onClick={() => void downloadTsplFile(previewShipment, thermalProfile, airlineLabelOverrides)}
                className="rounded-full border px-3 py-2 text-xs font-semibold"
              >
                Tải TSPL
              </button>
            ) : null}
            {docType === "thermal-label" && thermalProfile.labelTemplate?.objects.length ? (
              <button
                type="button"
                onClick={() => {
                  if (!confirm("Đặt lại mẫu gốc? Preview dùng lại layout CSS chuẩn.")) return;
                  upsert({ ...thermalProfile, labelTemplate: undefined, thermalFieldOverrides: undefined });
                }}
                className="select-none rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800 transition-all active:scale-[0.97]"
              >
                ↺ Mẫu gốc
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void runPrint()}
              className="select-none rounded-full bg-apple-blue px-4 py-2 text-xs font-semibold text-white transition-all active:scale-[0.97]"
            >
              In ({targets.length})
            </button>
          </div>
        </div>
      </div>

      <PrinterProfileEditor open={profileEditorOpen} profiles={store.profiles} onSave={(p) => { upsert(p); setProfileEditorOpen(false); }} onClose={() => setProfileEditorOpen(false)} />
      <CalibrationWizard open={calibOpen} profile={activeProfile} onSave={(p) => { upsert(p); setCalibOpen(false); setStatusMsg("Đã lưu profile."); }} onTestPrint={() => void runTestCalibration()} onClose={() => setCalibOpen(false)} />
      {designerOpen && previewShipment && docType === "thermal-label" ? (
        <LabelDesigner
          open={designerOpen}
          initialTemplate={resolveThermalLabelTemplateForDesigner(
            thermalProfile,
            resolveThermalProfileLabelFormat(thermalProfile)
          )}
          documentKind={profileDocumentKind(thermalProfile)}
          sampleContext={buildShipmentLabelContext(previewShipment, airlineLabelOverrides)}
          onSave={(template) => {
            const kind = profileDocumentKind(thermalProfile);
            const format = resolveThermalProfileLabelFormat(thermalProfile);
            const committed = commitThermalDesignerSave(template, kind, format);
            upsert({
              ...thermalProfile,
              thermalFieldOverrides: committed.thermalFieldOverrides,
              labelTemplate: committed.labelTemplate,
            });
            setDesignerOpen(false);
            setStatusMsg("Đã lưu căn chỉnh tem — kiểm tra preview.");
          }}
          onClose={() => setDesignerOpen(false)}
        />
      ) : null}
      {designerOpen && docType === "scsc-weigh" ? (
        <LabelDesigner
          open={designerOpen}
          initialTemplate={resolveTemplateForKind(a4Profile, "scsc-weigh-a4")}
          documentKind="scsc-weigh-a4"
          onSave={(template) => {
            upsert({ ...a4Profile, labelTemplate: template });
            setDesignerOpen(false);
            setStatusMsg("Đã lưu template SCSC A4.");
          }}
          onClose={() => setDesignerOpen(false)}
        />
      ) : null}
    </div>,
    document.body
  );
}

function DocTypeTabs({ docType, onChange }: { docType: PrintDocumentType; onChange: (t: PrintDocumentType) => void }) {
  const tabs: { k: PrintDocumentType; label: string }[] = [
    { k: "thermal-label", label: "Nhãn nhiệt" },
    { k: "scsc-weigh", label: "Tờ cân SCSC" },
    { k: "dim-report", label: "DIM" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(({ k, label }) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={docType === k ? "rounded-full bg-apple-blue px-3 py-1.5 text-xs font-semibold text-white" : "rounded-full border px-3 py-1.5 text-xs font-semibold"}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ThermalModeBar({
  mode,
  profileHost,
  onChange,
}: {
  mode: ThermalDeliveryMode;
  profileHost?: string;
  onChange: (m: ThermalDeliveryMode) => void;
}) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-3 text-[11px] text-amber-950">
      <p className="font-semibold">Chế độ in</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => { onChange("tspl-tcp"); saveThermalDeliveryMode("tspl-tcp"); }} className={mode === "tspl-tcp" ? "rounded-full bg-apple-blue px-3 py-1 text-xs font-semibold text-white" : "rounded-full border bg-white px-3 py-1 text-xs"}>
          TSPL trực tiếp
        </button>
        <button type="button" onClick={() => { onChange("browser-print"); saveThermalDeliveryMode("browser-print"); }} className={mode === "browser-print" ? "rounded-full bg-apple-blue px-3 py-1 text-xs font-semibold text-white" : "rounded-full border bg-white px-3 py-1 text-xs"}>
          Trình duyệt (fallback)
        </button>
      </div>
      <p className="mt-2">{mode === "browser-print" ? "Scale 100%, margin None, tắt Fit to page." : `TCP → ${profileHost || "(chưa cấu hình IP)"}`}</p>
    </div>
  );
}

function ShipmentPickList({
  rows,
  selectedIds,
  onToggle,
}: {
  rows: Shipment[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-apple-secondary">Không có lô phù hợp.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => onToggle(r.id)} />
              <span className="font-mono font-semibold">{r.awb}</span>
              <span className="truncate text-apple-secondary">{r.customer}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
