import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type {
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
} from "../types/customerDirectory";
import type { GlobalAgentCatalog, GlobalAgentEntry } from "../types/globalAgents";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import { ScscWeighSenderSettings } from "../components/ScscWeighSenderSettings";
import { clampScscWeighPrintSettings, defaultScscWeighPrintSettings, resolveScscWeighWarehouseKey } from "../printing/scscWeigh/scscWeighPrintSettingsCore";
import { setScscWeighPrintSettingsCache } from "../printing/scscWeigh/scscWeighPrintSettingsRuntime";
import type { Shipment } from "../types/shipment";
import {
  ScscWeighPickerPreview,
  type ScscWeighPickerPreviewHandle,
} from "../printing/scscWeigh/ScscWeighPickerPreview";
import { profileOptionLabel } from "./customerDirectoryDefaults";
import { mapBookingToScaleTicketFormData, findCustomerEntry } from "./mapBookingToScaleTicketFormData";
import {
  clipScscGoodsDescriptionPrint,
  clipScscOtherRequirementsPrint,
  resolveScscGoodsDescriptionPrint,
  resolveScscOtherRequirementsPrint,
  SCSC_GOODS_DESCRIPTION_PRINT_MAX,
  SCSC_OTHER_REQUIREMENTS_PRINT_MAX,
  scscGoodsPrintOverflowWarning,
} from "./scscPrintContent";
import {
  resolveAgentIdForPrintPicker,
  resolveConsigneeForPrintPicker,
  resolveGoodsForPrintPicker,
  resolveShipperForPrintPicker,
} from "./scscPrintProfileLink";
import {
  mapOptionsForScscPrintPicker,
  shipmentForScscPrintPicker,
  type ScscPrintProfileChoice,
} from "./scscPrintPickerState";
import type { ScscPrintPickSection } from "./scscPrintProfilePick";
import { OPS } from "../styles/opsModalStyles";
import { warehouseLabel } from "../constants/warehouses";

export type { ScscPrintProfileChoice };

function agentTitle(a: GlobalAgentEntry): string {
  return profileOptionLabel(a.label, a.agentName, a.id);
}

function shipperTitle(s: CustomerSavedShipper): string {
  return profileOptionLabel(s.label, s.shipperName, s.id);
}

function cneeTitle(c: CustomerSavedConsignee): string {
  return profileOptionLabel(c.label, c.consigneeName, c.id);
}

function goodsTitle(g: CustomerSavedGoods): string {
  return profileOptionLabel(g.label, g.goodsDescription, g.id);
}

function PrintContentSection(props: {
  goodsText: string;
  otherText: string;
  saveToShipment: boolean;
  goodsOverflowWarning: string | null;
  onGoodsChange: (v: string) => void;
  onOtherChange: (v: string) => void;
  onSaveToShipmentChange: (v: boolean) => void;
  onApplyTemplate: () => void;
  hasGoodsTemplates: boolean;
}) {
  const {
    goodsText,
    otherText,
    saveToShipment,
    goodsOverflowWarning,
    onGoodsChange,
    onOtherChange,
    onSaveToShipmentChange,
    onApplyTemplate,
    hasGoodsTemplates,
  } = props;

  return (
    <section className={`rounded-xl border p-3 ${OPS.card}`}>
      <p className={`mb-2 px-0.5 text-[10px] font-semibold uppercase ${OPS.muted}`}>Nội dung in (sửa được)</p>
      <label className="mb-2 block">
        <span className={`mb-1 block text-[11px] font-semibold ${OPS.secondary}`}>Tên hàng in phiếu</span>
        <textarea
          value={goodsText}
          onChange={(e) => onGoodsChange(clipScscGoodsDescriptionPrint(e.target.value))}
          rows={3}
          className={`w-full resize-y rounded-lg border px-2.5 py-2 text-xs ${OPS.input}`}
          placeholder="GENERAL CARGO"
        />
        <span className={`mt-0.5 block text-[10px] tabular-nums ${OPS.muted}`}>
          {goodsText.length}/{SCSC_GOODS_DESCRIPTION_PRINT_MAX}
        </span>
        {goodsOverflowWarning ? (
          <p className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">{goodsOverflowWarning}</p>
        ) : null}
      </label>
      <label className="mb-2 block">
        <span className={`mb-1 block text-[11px] font-semibold ${OPS.secondary}`}>Yêu cầu khác</span>
        <textarea
          value={otherText}
          onChange={(e) => onOtherChange(clipScscOtherRequirementsPrint(e.target.value))}
          rows={2}
          className={`w-full resize-y rounded-lg border px-2.5 py-2 text-xs ${OPS.input}`}
          placeholder="Không xếp chồng, giữ khô…"
        />
        <span className={`mt-0.5 block text-[10px] tabular-nums ${OPS.muted}`}>
          {otherText.length}/{SCSC_OTHER_REQUIREMENTS_PRINT_MAX}
        </span>
      </label>
      {hasGoodsTemplates ? (
        <button
          type="button"
          onClick={onApplyTemplate}
          className={`mb-2 w-full rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${OPS.tabIdle}`}
        >
          Điền lại từ mẫu đã chọn
        </button>
      ) : null}
      <label className={`flex cursor-pointer items-center gap-2 text-[11px] ${OPS.secondary}`}>
        <input
          type="checkbox"
          checked={saveToShipment}
          onChange={(e) => onSaveToShipmentChange(e.target.checked)}
          className="rounded border-slate-300"
        />
        Lưu tên hàng & yêu cầu khác vào lô
      </label>
    </section>
  );
}

function PickDropdown(props: {
  title: string;
  useBooking: boolean;
  bookingLabel: string;
  items: { id: string; title: string }[];
  selectedId: string;
  onChange: (useBooking: boolean, selectedId: string) => void;
}) {
  const { title, useBooking, bookingLabel, items, selectedId, onChange } = props;
  const displayBookingLabel = bookingLabel.length > 30 ? bookingLabel.slice(0, 27) + "..." : bookingLabel;

  return (
    <div className="flex flex-col gap-1">
      <span className={`px-0.5 text-[10px] font-bold uppercase tracking-wide ${OPS.secondary}`}>{title}</span>
      <select
        value={useBooking ? "booking" : selectedId}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "booking") {
            onChange(true, "");
          } else {
            onChange(false, val);
          }
        }}
        className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${OPS.input}`}
      >
        <option value="booking">Theo lô: {displayBookingLabel || "(mặc định)"}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
    </div>
  );
}

function PrintProfilePickerOverlay(props: {
  headerSub: string;
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  globalAgents: GlobalAgentCatalog;
  sections: ScscPrintPickSection[];
  shippers: CustomerSavedShipper[];
  consignees: CustomerSavedConsignee[];
  agents: GlobalAgentEntry[];
  goods: CustomerSavedGoods[];
  bookingShipperLabel: string;
  bookingConsigneeLabel: string;
  bookingAgentLabel: string;
  bookingGoodsLabel: string;
  scscWeighPrintSettings?: ScscWeighPrintSettings;
  onSaveScscWeighPrintSettings?: (settings: ScscWeighPrintSettings) => void | Promise<void>;
  onConfirm: (choice: ScscPrintProfileChoice) => void;
  onCancel: () => void;
}) {
  const {
    headerSub,
    shipment,
    customerDirectory,
    globalAgents,
    sections,
    shippers,
    consignees,
    agents,
    goods,
    bookingShipperLabel,
    bookingConsigneeLabel,
    bookingAgentLabel,
    bookingGoodsLabel,
    scscWeighPrintSettings: scscWeighPrintSettingsProp,
    onSaveScscWeighPrintSettings,
    onConfirm,
    onCancel,
  } = props;

  const [senderSettings, setSenderSettings] = useState<ScscWeighPrintSettings>(
    clampScscWeighPrintSettings(scscWeighPrintSettingsProp ?? defaultScscWeighPrintSettings())
  );

  useEffect(() => {
    setSenderSettings(clampScscWeighPrintSettings(scscWeighPrintSettingsProp ?? defaultScscWeighPrintSettings()));
  }, [scscWeighPrintSettingsProp]);

  const updateSenderSettings = (next: ScscWeighPrintSettings) => {
    setSenderSettings(next);
    void onSaveScscWeighPrintSettings?.(clampScscWeighPrintSettings(next));
  };

  const previewRef = useRef<ScscWeighPickerPreviewHandle>(null);
  const [calUi, setCalUi] = useState({ dirty: false, saving: false, justSaved: false });
  const [printing, setPrinting] = useState(false);

  const flushSenderSettingsForPrint = () => {
    const clamped = clampScscWeighPrintSettings(senderSettings);
    setScscWeighPrintSettingsCache(clamped);
    void onSaveScscWeighPrintSettings?.(clamped);
  };

  const handleConfirmPrint = async (choice: ScscPrintProfileChoice) => {
    if (printing) return;
    setPrinting(true);
    try {
      flushSenderSettingsForPrint();
      const saved = await previewRef.current?.saveCalibration({ force: true });
      if (saved === false) {
        const proceed = window.confirm(
          "Không lưu được căn chỉnh lên server — bản in có thể lệch preview. Vẫn in?"
        );
        if (!proceed) return;
      }
      onConfirm(choice);
    } finally {
      setPrinting(false);
    }
  };

  const shipmentAgentId = (shipment.globalAgentId ?? shipment.customerAgentId ?? "").trim();
  const customer = findCustomerEntry(shipment, customerDirectory);

  const defaultShipper = resolveShipperForPrintPicker(shipment, customer, shippers);
  const defaultConsignee = resolveConsigneeForPrintPicker(shipment, customer, consignees);
  const defaultGoods = resolveGoodsForPrintPicker(shipment, customer, goods);
  const defaultAgentId = resolveAgentIdForPrintPicker(shipment, globalAgents, agents);

  const [shipperId, setShipperId] = useState(defaultShipper?.id ?? "");
  const [consigneeId, setConsigneeId] = useState(defaultConsignee?.id ?? "");
  const [agentId, setAgentId] = useState(defaultAgentId);
  const [goodsId, setGoodsId] = useState(defaultGoods?.id ?? "");
  const [useBookingShipper, setUseBookingShipper] = useState(
    !sections.includes("shipper") || !defaultShipper
  );
  const [useBookingConsignee, setUseBookingConsignee] = useState(
    !sections.includes("consignee") || !defaultConsignee
  );
  const [useBookingAgent, setUseBookingAgent] = useState(
    !sections.includes("agent") || (!defaultAgentId && !shipmentAgentId)
  );
  const [useBookingGoods, setUseBookingGoods] = useState(
    !sections.includes("goods") || !defaultGoods
  );

  const [goodsText, setGoodsText] = useState(() =>
    resolveScscGoodsDescriptionPrint(shipment, defaultGoods)
  );
  const [otherText, setOtherText] = useState(() =>
    resolveScscOtherRequirementsPrint(shipment, customer)
  );
  const [saveToShipment, setSaveToShipment] = useState(true);

  const applyGoodsTemplateToContent = () => {
    const g = useBookingGoods
      ? undefined
      : goods.find((x) => x.id === goodsId) ?? defaultGoods;
    setGoodsText(resolveScscGoodsDescriptionPrint(shipment, g));
    if (!useBookingGoods && g) {
      setOtherText(resolveScscOtherRequirementsPrint(shipment, customer));
    }
  };

  const pickerState: ScscPrintProfileChoice = {
    useBookingShipper,
    shipperId,
    useBookingConsignee,
    consigneeId,
    useBookingAgent,
    agentId,
    useBookingGoods,
    goodsId,
    goodsDescriptionPrint: goodsText,
    otherRequirementsPrint: otherText,
    saveToShipment,
  };

  const goodsOverflowWarning = useMemo(() => scscGoodsPrintOverflowWarning(goodsText), [goodsText]);

  const previewFormData = useMemo(() => {
    const effective = shipmentForScscPrintPicker(shipment, pickerState);
    return mapBookingToScaleTicketFormData(effective, customerDirectory, {
      ...mapOptionsForScscPrintPicker(pickerState),
      globalAgents,
    });
  }, [shipment, customerDirectory, globalAgents, pickerState]);

  const printWarehouse = resolveScscWeighWarehouseKey(shipment.warehouse);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 p-2 backdrop-blur-md sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
    >
      <div className={`flex max-h-[98vh] w-full max-w-[min(1680px,98vw)] flex-col overflow-hidden rounded-[24px] border shadow-apple-md ${OPS.modal} ${OPS.border}`}>
        <div className={`border-b px-5 py-4 ${OPS.border}`}>
          <h2 className={`text-[17px] font-semibold ${OPS.title}`}>In phiếu cân SCSC</h2>
          <p className={`mt-1 text-xs ${OPS.secondary}`}>
            {headerSub} · Form in sẵn · {warehouseLabel[printWarehouse]}
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col lg:min-h-[min(82vh,820px)] lg:flex-row">
          <div className={`min-h-0 shrink-0 space-y-3 overflow-y-auto border-b p-3 lg:w-80 lg:max-w-[22rem] lg:border-b-0 lg:border-r ${OPS.aside} ${OPS.border}`}>
            <details className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden bg-black/[0.01] dark:bg-white/[0.01]">
              <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold text-dashboard-muted dark:text-dashboard-muted-dark hover:bg-black/[0.03] dark:hover:bg-white/[0.03] focus:outline-none">
                Người gửi (Phiếu cân)
              </summary>
              <div className="border-t border-black/5 dark:border-white/5 bg-white dark:bg-dashboard-surface-dark px-1 py-1">
                <ScscWeighSenderSettings
                  compact
                  activeWarehouse={printWarehouse}
                  settings={senderSettings}
                  onChange={updateSenderSettings}
                />
              </div>
            </details>

            <div className={`rounded-xl border p-3 flex flex-col gap-3 ${OPS.card}`}>
              <p className={`-mb-1 px-0.5 text-[10px] font-bold uppercase tracking-wider ${OPS.muted}`}>Hồ sơ in ấn</p>
              {sections.includes("shipper") && (
                <PickDropdown
                  title="Shipper"
                  useBooking={useBookingShipper}
                  bookingLabel={bookingShipperLabel.trim() || "Theo lô"}
                  items={shippers.map((s) => ({ id: s.id, title: shipperTitle(s) }))}
                  selectedId={shipperId}
                  onChange={(useB, id) => {
                    setUseBookingShipper(useB);
                    setShipperId(id);
                  }}
                />
              )}
              {sections.includes("consignee") && (
                <PickDropdown
                  title="CNEE"
                  useBooking={useBookingConsignee}
                  bookingLabel={bookingConsigneeLabel.trim() || "Theo lô"}
                  items={consignees.map((c) => ({ id: c.id, title: cneeTitle(c) }))}
                  selectedId={consigneeId}
                  onChange={(useB, id) => {
                    setUseBookingConsignee(useB);
                    setConsigneeId(id);
                  }}
                />
              )}
              {sections.includes("agent") && (
                <PickDropdown
                  title="Agent"
                  useBooking={useBookingAgent}
                  bookingLabel={bookingAgentLabel.trim() || "Theo lô / Mặc định"}
                  items={agents.map((a) => ({ id: a.id, title: agentTitle(a) }))}
                  selectedId={agentId}
                  onChange={(useB, id) => {
                    setUseBookingAgent(useB);
                    setAgentId(id);
                  }}
                />
              )}
              {sections.includes("goods") && (
                <PickDropdown
                  title="Tên hàng"
                  useBooking={useBookingGoods}
                  bookingLabel={bookingGoodsLabel.trim() || "Theo lô"}
                  items={goods.map((g) => ({ id: g.id, title: goodsTitle(g) }))}
                  selectedId={goodsId}
                  onChange={(useB, id) => {
                    setUseBookingGoods(useB);
                    setGoodsId(id);
                    const g = goods.find((x) => x.id === id);
                    setGoodsText(resolveScscGoodsDescriptionPrint(shipment, g));
                    if (!useB && g) {
                      setOtherText(resolveScscOtherRequirementsPrint(shipment, customer));
                    }
                  }}
                />
              )}
            </div>

            <PrintContentSection
              goodsText={goodsText}
              otherText={otherText}
              saveToShipment={saveToShipment}
              goodsOverflowWarning={goodsOverflowWarning}
              onGoodsChange={setGoodsText}
              onOtherChange={setOtherText}
              onSaveToShipmentChange={setSaveToShipment}
              onApplyTemplate={applyGoodsTemplateToContent}
              hasGoodsTemplates={goods.length > 0}
            />
          </div>
          <div className={`flex min-h-0 min-w-0 flex-1 flex-col rounded-xl p-2 lg:p-3 ${OPS.panelSoft}`}>
            <ScscWeighPickerPreview
              ref={previewRef}
              mode="studio"
              warehouse={printWarehouse}
              showSummary={false}
              formData={previewFormData}
              scscWeighPrintSettings={senderSettings}
              onCalibrationUiChange={setCalUi}
            />
          </div>
        </div>
        <div className={`flex flex-wrap gap-2 px-4 py-3 ${OPS.stickyBar}`}>
          <button
            type="button"
            disabled={printing || calUi.saving}
            onClick={() => void previewRef.current?.saveCalibration()}
            className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-60 ${
              calUi.justSaved
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 ring-2 ring-emerald-400/50 dark:text-emerald-300"
                : calUi.dirty
                  ? "animate-pulse border-apple-blue bg-apple-blue/15 text-apple-blue ring-2 ring-sky-400/60 dark:text-sky-300"
                  : OPS.tabIdle
            }`}
          >
            {calUi.saving
              ? "Đang lưu…"
              : calUi.justSaved
                ? "✓ Đã lưu"
                : calUi.dirty
                  ? "● Lưu căn chỉnh"
                  : "Lưu căn chỉnh"}
          </button>
          <button
            type="button"
            disabled={printing}
            onClick={() => void handleConfirmPrint(pickerState)}
            className="min-w-[8rem] flex-1 rounded-full bg-apple-blue py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {printing ? "Đang lưu & in…" : "In phiếu"}
          </button>
          <button
            type="button"
            disabled={printing}
            onClick={onCancel}
            className={`rounded-full border px-5 py-2.5 text-sm font-semibold disabled:opacity-60 ${OPS.tabIdle}`}
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}

export function openScscPrintProfilePickerModal(params: {
  headerSub: string;
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  globalAgents: GlobalAgentCatalog;
  sections: ScscPrintPickSection[];
  shippers: CustomerSavedShipper[];
  consignees: CustomerSavedConsignee[];
  agents: GlobalAgentEntry[];
  goods: CustomerSavedGoods[];
  bookingShipperLabel?: string;
  bookingConsigneeLabel?: string;
  bookingAgentLabel?: string;
  bookingGoodsLabel?: string;
  scscWeighPrintSettings?: ScscWeighPrintSettings;
  onSaveScscWeighPrintSettings?: (settings: ScscWeighPrintSettings) => void | Promise<void>;
}): Promise<ScscPrintProfileChoice | null> {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    const finish = (choice: ScscPrintProfileChoice | null) => {
      try {
        root.unmount();
      } catch {
        /* ignore */
      }
      el.remove();
      resolve(choice);
    };
    root.render(
      <PrintProfilePickerOverlay
        {...params}
        bookingShipperLabel={params.bookingShipperLabel ?? ""}
        bookingConsigneeLabel={params.bookingConsigneeLabel ?? ""}
        bookingAgentLabel={params.bookingAgentLabel ?? ""}
        bookingGoodsLabel={params.bookingGoodsLabel ?? ""}
        onConfirm={(ch) => finish(ch)}
        onCancel={() => finish(null)}
      />
    );
  });
}
