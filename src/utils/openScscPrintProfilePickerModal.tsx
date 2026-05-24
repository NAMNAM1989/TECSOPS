import { useEffect, useMemo, useState } from "react";
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
import { clampScscWeighPrintSettings, defaultScscWeighPrintSettings } from "../printing/scscWeigh/scscWeighPrintSettingsCore";
import type { Shipment } from "../types/shipment";
import { ScscWeighPickerPreview } from "../printing/scscWeigh/ScscWeighPickerPreview";
import { profileOptionLabel } from "./customerDirectoryDefaults";
import { mapBookingToScaleTicketFormData } from "./mapBookingToScaleTicketFormData";
import {
  mapOptionsForScscPrintPicker,
  shipmentForScscPrintPicker,
  type ScscPrintProfileChoice,
} from "./scscPrintPickerState";
import type { ScscPrintPickSection } from "./scscPrintProfilePick";
import { OPS } from "../styles/opsModalStyles";

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

function PickSection(props: {
  title: string;
  name: string;
  useBooking: boolean;
  onUseBooking: () => void;
  bookingLabel: string;
  items: { id: string; title: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { title, name, useBooking, onUseBooking, bookingLabel, items, selectedId, onSelect } = props;
  return (
    <section>
      <p className={`mb-2 px-1 text-[10px] font-semibold uppercase ${OPS.muted}`}>{title}</p>
      <label className={OPS.pickPrimary}>
        <input type="radio" name={name} checked={useBooking} onChange={onUseBooking} />
        <span className={`text-xs ${OPS.title}`}>{bookingLabel}</span>
      </label>
      {items.map((item) => (
        <label
          key={item.id}
          className={OPS.pickItem}
        >
          <input
            type="radio"
            name={name}
            checked={!useBooking && selectedId === item.id}
            onChange={() => onSelect(item.id)}
          />
          <span className={`block text-sm font-semibold ${OPS.title}`}>{item.title}</span>
        </label>
      ))}
    </section>
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
    const clamped = clampScscWeighPrintSettings(next);
    setSenderSettings(clamped);
    void onSaveScscWeighPrintSettings?.(clamped);
  };

  const shipmentAgentId = (shipment.globalAgentId ?? shipment.customerAgentId ?? "").trim();

  const [shipperId, setShipperId] = useState(shippers[0]?.id ?? "");
  const [consigneeId, setConsigneeId] = useState(consignees[0]?.id ?? "");
  const [agentId, setAgentId] = useState(
    shipmentAgentId || globalAgents.defaultAgentId || agents.find((a) => !a.isNone)?.id || agents[0]?.id || ""
  );
  const [goodsId, setGoodsId] = useState(goods[0]?.id ?? "");
  const [useBookingShipper, setUseBookingShipper] = useState(
    !sections.includes("shipper") || Boolean(bookingShipperLabel.trim())
  );
  const [useBookingConsignee, setUseBookingConsignee] = useState(
    !sections.includes("consignee") || Boolean(bookingConsigneeLabel.trim())
  );
  const [useBookingAgent, setUseBookingAgent] = useState(() => {
    if (!sections.includes("agent")) return true;
    if (bookingAgentLabel.trim()) return true;
    if (shipmentAgentId) return false;
    return true;
  });
  const [useBookingGoods, setUseBookingGoods] = useState(
    !sections.includes("goods") || Boolean(bookingGoodsLabel.trim())
  );

  const pickerState: ScscPrintProfileChoice = {
    useBookingShipper,
    shipperId,
    useBookingConsignee,
    consigneeId,
    useBookingAgent,
    agentId,
    useBookingGoods,
    goodsId,
  };

  const previewFormData = useMemo(() => {
    const effective = shipmentForScscPrintPicker(shipment, pickerState);
    return mapBookingToScaleTicketFormData(effective, customerDirectory, {
      ...mapOptionsForScscPrintPicker(pickerState),
      globalAgents,
    });
  }, [shipment, customerDirectory, globalAgents, pickerState]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 p-2 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-[24px] border shadow-apple-md ${OPS.modal} ${OPS.border}`}>
        <div className={`border-b px-5 py-4 ${OPS.border}`}>
          <h2 className={`text-[17px] font-semibold ${OPS.title}`}>In phiếu cân — chọn hồ sơ in</h2>
          <p className={`mt-1 text-xs ${OPS.secondary}`}>{headerSub}</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col lg:min-h-[min(78vh,700px)] lg:flex-row">
          <div className={`min-h-0 shrink-0 space-y-4 overflow-y-auto border-b p-3 lg:w-80 lg:max-w-[22rem] lg:border-b-0 lg:border-r ${OPS.border}`}>
            <ScscWeighSenderSettings
              compact
              settings={senderSettings}
              onChange={updateSenderSettings}
            />
            {sections.includes("shipper") ? (
              <PickSection
                title="Shipper"
                name="shipper-pick"
                useBooking={useBookingShipper}
                onUseBooking={() => {
                  setUseBookingShipper(true);
                  setShipperId("");
                }}
                bookingLabel={
                  bookingShipperLabel.trim() ? `Theo lô: ${bookingShipperLabel}` : "Theo lô (đã nhập trên booking)"
                }
                items={shippers.map((s) => ({ id: s.id, title: shipperTitle(s) }))}
                selectedId={shipperId}
                onSelect={(id) => {
                  setUseBookingShipper(false);
                  setShipperId(id);
                }}
              />
            ) : null}
            {sections.includes("consignee") ? (
              <PickSection
                title="CNEE"
                name="cnee-pick"
                useBooking={useBookingConsignee}
                onUseBooking={() => {
                  setUseBookingConsignee(true);
                  setConsigneeId("");
                }}
                bookingLabel={
                  bookingConsigneeLabel.trim() ? `Theo lô: ${bookingConsigneeLabel}` : "Theo lô (đã nhập trên booking)"
                }
                items={consignees.map((c) => ({ id: c.id, title: cneeTitle(c) }))}
                selectedId={consigneeId}
                onSelect={(id) => {
                  setUseBookingConsignee(false);
                  setConsigneeId(id);
                }}
              />
            ) : null}
            {sections.includes("agent") ? (
              <PickSection
                title="Agent"
                name="agent-pick"
                useBooking={useBookingAgent}
                onUseBooking={() => {
                  setUseBookingAgent(true);
                  setAgentId("");
                }}
                bookingLabel={
                  bookingAgentLabel.trim()
                    ? `Theo lô: ${bookingAgentLabel}`
                    : "Theo lô / Agent mặc định trên booking"
                }
                items={agents.map((a) => ({ id: a.id, title: agentTitle(a) }))}
                selectedId={agentId}
                onSelect={(id) => {
                  setUseBookingAgent(false);
                  setAgentId(id);
                }}
              />
            ) : null}
            {sections.includes("goods") ? (
              <PickSection
                title="Tên hàng"
                name="goods-pick"
                useBooking={useBookingGoods}
                onUseBooking={() => {
                  setUseBookingGoods(true);
                  setGoodsId("");
                }}
                bookingLabel={
                  bookingGoodsLabel.trim() ? `Theo lô: ${bookingGoodsLabel}` : "Theo lô (đã nhập trên booking)"
                }
                items={goods.map((g) => ({ id: g.id, title: goodsTitle(g) }))}
                selectedId={goodsId}
                onSelect={(id) => {
                  setUseBookingGoods(false);
                  setGoodsId(id);
                }}
              />
            ) : null}
          </div>
          <div className="flex min-h-[min(58vh,520px)] min-w-0 flex-1 flex-col p-3 lg:min-h-0 lg:p-4">
            <ScscWeighPickerPreview formData={previewFormData} scscWeighPrintSettings={senderSettings} />
          </div>
        </div>
        <div className={`flex gap-2 border-t px-4 py-3 ${OPS.footer}`}>
          <button
            type="button"
            onClick={() => onConfirm(pickerState)}
            className="flex-1 rounded-full bg-apple-blue py-2.5 text-sm font-semibold text-white"
          >
            In phiếu
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-full border px-5 py-2.5 text-sm font-semibold ${OPS.tabIdle}`}
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
  if (params.sections.length === 0) {
    return Promise.resolve({
      useBookingShipper: true,
      shipperId: "",
      useBookingConsignee: true,
      consigneeId: "",
      useBookingAgent: true,
      agentId: "",
      useBookingGoods: true,
      goodsId: "",
    });
  }
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
