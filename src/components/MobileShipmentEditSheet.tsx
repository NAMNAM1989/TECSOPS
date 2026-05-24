import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Shipment, ShipmentStatus } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import { DESTINATIONS } from "../data/customers";
import { findCustomerEntry } from "../utils/mapBookingToScaleTicketFormData";
import { buildShipmentPatchForCustomerSelection, normalizeCustomerNameInput } from "../utils/customerShipmentPatch";
import { findGlobalAgentById } from "../utils/globalAgentsCore";
import {
  buildShipmentPatchForSavedConsignee,
  formatSavedConsigneeOptionLabel,
} from "../utils/customerConsigneeShipmentPatch";
import { normalizePrintAddressMultiline } from "../utils/printAddressMultiline";
import { parseBookingDateLoose, formatYmdToFlightDateDdMon } from "../utils/bookingDateParse";
import { StatusSelect } from "./StatusBadge";
import { MobileDimKgModal, type MobileDimSavePayload } from "./MobileDimKgModal";
import { formatShipmentDimWeightKg } from "../utils/volumetricDim";
import { isScscWarehouse } from "../constants/warehouses";
import {
  ECARGO_VEHICLE_MIN,
  EcargoKhoScscCenterModal,
  EcargoKhoScscTriggerButton,
} from "./EcargoKhoScscModal";
import type { EcargoAutoRegisterOpts } from "./DesktopShipmentTable";
import type { UpsertCustomerVehicleParams } from "../utils/customerVehicleCore";
import { resolveEcargoVehiclePrefill, vehicleDisplayLabel } from "../utils/customerVehicleCore";
import type { EcargoKhoScscPersistedMap } from "../utils/ecargoRegisterLocalStorage";
import type { EcargoSaveStatus } from "../hooks/useEcargoKhoScscRegister";
import type { EcargoJobRecord } from "../types/ecargoJob";
import { ecargoKhoScscLineStatusLabel } from "../utils/ecargoUiLabels";
import { CustomerPickerField } from "./CustomerPickerField";

type TabId = "lot" | "cnee" | "dim";

type Props = {
  open: boolean;
  shipment: Shipment | null;
  sessionDateYmd: string;
  customerDirectory: readonly CustomerDirectoryEntry[];
  globalAgents?: GlobalAgentCatalog;
  ecargoMap?: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange?: (id: string, raw: string) => void;
  onEcargoDriverChange?: (id: string, driverName: string, driverId: string) => void;
  onApplyEcargoPrefill?: (row: Shipment) => void;
  getEcargoSaveStatus?: (id: string) => EcargoSaveStatus;
  getEcargoJob?: (id: string) => EcargoJobRecord | undefined;
  refreshEcargoJob?: (id: string) => void | Promise<void>;
  onEcargoAutoRegister?: (row: Shipment, opts?: EcargoAutoRegisterOpts) => void | Promise<void>;
  onSaveCustomerVehicleForEcargo?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  isEcargoAutoRegistering?: (id: string) => boolean;
  onClose: () => void;
  onSave: (patch: Partial<Shipment>) => void;
};

function clip(v: string, max: number): string {
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

const TABS: { id: TabId; label: string }[] = [
  { id: "lot", label: "Lô hàng" },
  { id: "cnee", label: "CNEE" },
  { id: "dim", label: "DIM & TT" },
];

export function MobileShipmentEditSheet({
  open,
  shipment,
  sessionDateYmd,
  customerDirectory,
  globalAgents,
  ecargoMap = {},
  onEcargoVehicleChange,
  onEcargoDriverChange,
  onApplyEcargoPrefill,
  getEcargoSaveStatus,
  getEcargoJob,
  refreshEcargoJob,
  onEcargoAutoRegister,
  onSaveCustomerVehicleForEcargo,
  isEcargoAutoRegistering,
  onClose,
  onSave,
}: Props) {
  const [tab, setTab] = useState<TabId>("lot");
  const [dimOpen, setDimOpen] = useState(false);
  const [ecargoOpen, setEcargoOpen] = useState(false);

  const sessionYear = useMemo(() => {
    const y = parseInt((sessionDateYmd || shipment?.sessionDate || "").slice(0, 4), 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
  }, [sessionDateYmd, shipment?.sessionDate]);

  const applyCustomerFromDirectory = (name: string, entry?: CustomerDirectoryEntry) => {
    const patch = buildShipmentPatchForCustomerSelection(customerDirectory, name, entry, globalAgents);
    setCustomer(normalizeCustomerNameInput(patch.customer ?? name));
    setCustomerId((patch.customerId ?? "").trim());
    if (patch.customerConsigneeId) {
      setCustomerConsigneeId(patch.customerConsigneeId);
      setConsigneeNamePrint(patch.consigneeNamePrint ?? "");
      setConsigneeAddressPrint(patch.consigneeAddressPrint ?? "");
      setConsigneePhonePrint(patch.consigneePhonePrint ?? "");
      setConsigneeEmailPrint(patch.consigneeEmailPrint ?? "");
    }
  };

  const [flight, setFlight] = useState("");
  const [flightDateText, setFlightDateText] = useState("");
  const [dest, setDest] = useState("");
  const [customer, setCustomer] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [note, setNote] = useState("");
  const [customerConsigneeId, setCustomerConsigneeId] = useState("");
  const [consigneeNamePrint, setConsigneeNamePrint] = useState("");
  const [consigneeAddressPrint, setConsigneeAddressPrint] = useState("");
  const [consigneePhonePrint, setConsigneePhonePrint] = useState("");
  const [consigneeEmailPrint, setConsigneeEmailPrint] = useState("");
  const [globalAgentId, setGlobalAgentId] = useState("");
  const [customerGoodsId, setCustomerGoodsId] = useState("");
  const [goodsDescriptionPrint, setGoodsDescriptionPrint] = useState("");
  const [pcs, setPcs] = useState<number | null>(null);
  const [kg, setKg] = useState<number | null>(null);
  const [status, setStatus] = useState<ShipmentStatus>("PENDING");
  const [dimWeightKg, setDimWeightKg] = useState<number | null>(null);
  const [dimLines, setDimLines] = useState<Shipment["dimLines"]>(null);

  useEffect(() => {
    if (!open || !shipment) return;
    setTab("lot");
    setDimOpen(false);
    setEcargoOpen(false);
    setFlight((shipment.flight ?? "").trim());
    setFlightDateText((shipment.flightDate ?? "").trim());
    setDest((shipment.dest ?? "").trim());
    setCustomer((shipment.customer ?? "").trim());
    setCustomerId((shipment.customerId ?? "").trim());
    setNote((shipment.note ?? "").trim());
    setCustomerConsigneeId((shipment.customerConsigneeId ?? "").trim());
    setConsigneeNamePrint((shipment.consigneeNamePrint ?? "").trim());
    setConsigneeAddressPrint((shipment.consigneeAddressPrint ?? "").trim());
    setConsigneePhonePrint((shipment.consigneePhonePrint ?? "").trim());
    setConsigneeEmailPrint((shipment.consigneeEmailPrint ?? "").trim());
    setGlobalAgentId((shipment.globalAgentId ?? shipment.customerAgentId ?? "").trim());
    setCustomerGoodsId((shipment.customerGoodsId ?? "").trim());
    setGoodsDescriptionPrint((shipment.goodsDescriptionPrint ?? "").trim());
    setPcs(shipment.pcs);
    setKg(shipment.kg);
    setStatus(shipment.status);
    setDimWeightKg(shipment.dimWeightKg);
    setDimLines(shipment.dimLines);
  }, [open, shipment?.id]);

  if (!open || !shipment) return null;

  const entry = findCustomerEntry(shipment, customerDirectory);
  const savedConsignees = entry?.savedConsignees ?? [];
  const savedGoods = entry?.savedGoods ?? [];
  const agentOptions = globalAgents?.agents ?? [];
  const showEcargo = isScscWarehouse(shipment.warehouse);
  const ecargoLine = ecargoMap[shipment.id];
  const vehicleForEcargo = ecargoLine?.vehicleInput ?? "";
  const ecargoPrefill = resolveEcargoVehiclePrefill(shipment, customerDirectory, vehicleForEcargo, {
    driverName: ecargoLine?.driverName,
    driverId: ecargoLine?.driverId,
  });
  const effectiveEcargoVehicle = vehicleForEcargo.trim() || ecargoPrefill.vehicleInput;
  const ecargoReady = effectiveEcargoVehicle.trim().length >= ECARGO_VEHICLE_MIN;
  const ecargoJob = getEcargoJob?.(shipment.id);

  const handleSave = () => {
    const ymd = parseBookingDateLoose(flightDateText.trim(), sessionYear);
    const flightDate = ymd ? formatYmdToFlightDateDdMon(ymd) : flightDateText.trim();
    const customerPatch = buildShipmentPatchForCustomerSelection(customerDirectory, customer, undefined, globalAgents);
    const patch: Partial<Shipment> = {
      flight: flight.trim().toUpperCase(),
      flightDate,
      dest: dest.trim().toUpperCase(),
      ...customerPatch,
      note: note.trim(),
      pcs,
      kg,
      status,
      dimWeightKg,
      dimLines,
      globalAgentId: globalAgentId.trim(),
      customerGoodsId: customerGoodsId.trim(),
      goodsDescriptionPrint: clip(goodsDescriptionPrint, 60),
      consigneeNamePrint: clip(consigneeNamePrint, 45),
      consigneeAddressPrint: normalizePrintAddressMultiline(consigneeAddressPrint, 6).slice(0, 300),
      consigneePhonePrint: clip(consigneePhonePrint, 24),
      consigneeEmailPrint: clip(consigneeEmailPrint, 50),
      customerConsigneeId: customerConsigneeId.trim(),
    };
    const ag = globalAgents ? findGlobalAgentById(globalAgents, globalAgentId) : undefined;
    if (ag && !ag.isNone) {
      patch.agentNamePrint = clip(ag.agentName, 45);
      patch.agentAddressPrint = normalizePrintAddressMultiline(ag.agentAddress, 6).slice(0, 300);
      patch.agentPhonePrint = clip(ag.agentPhone, 24);
      patch.agentEmailPrint = clip(ag.agentEmail, 50);
      patch.agentTaxCodePrint = clip(ag.agentTaxCode, 24);
    }
    onSave(patch);
    onClose();
  };

  const onDimSave = (payload: MobileDimSavePayload) => {
    setDimWeightKg(payload.dimWeightKg);
    setDimLines(payload.dimLines);
    setDimOpen(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[470] flex flex-col justify-end bg-black/30 backdrop-blur-sm md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Sửa nhanh lô hàng"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex max-h-[88vh] flex-col rounded-t-3xl border border-black/[0.08] bg-white shadow-apple-md">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-apple-label">Sửa nhanh</h2>
              <p className="truncate font-mono text-[11px] text-apple-secondary">{shipment.awb || shipment.id}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-apple-tertiary hover:bg-black/[0.05]"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-1 border-b border-black/[0.06] px-3 py-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-full py-2 text-[12px] font-semibold transition ${
                  tab === t.id ? "bg-apple-blue text-white" : "text-apple-secondary hover:bg-black/[0.04]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {tab === "lot" ? (
              <div className="space-y-3">
                <Field label="Chuyến">
                  <input
                    value={flight}
                    onChange={(e) => setFlight(e.target.value.toUpperCase())}
                    className={inputCls}
                    placeholder="VN594"
                  />
                </Field>
                <Field label="Ngày bay">
                  <input
                    value={flightDateText}
                    onChange={(e) => setFlightDateText(e.target.value.toUpperCase())}
                    className={inputCls}
                    placeholder="11MAY"
                  />
                </Field>
                <Field label="DEST">
                  <input
                    list="mobile-edit-dest-list"
                    value={dest}
                    onChange={(e) => setDest(e.target.value.toUpperCase())}
                    className={inputCls}
                    placeholder="KUL"
                  />
                  <datalist id="mobile-edit-dest-list">
                    {DESTINATIONS.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Khách">
                  <CustomerPickerField
                    value={customer}
                    customerId={customerId}
                    directory={customerDirectory}
                    onChange={(name, entry) => applyCustomerFromDirectory(name, entry)}
                    placeholder="Tìm mã hoặc tên khách…"
                    inputClassName={inputCls}
                  />
                </Field>
                <Field label="Ghi chú">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
              </div>
            ) : null}

            {tab === "cnee" ? (
              <div className="space-y-3">
                {savedConsignees.length > 0 ? (
                  <Field label="CNEE lưu sẵn">
                    <select
                      value={customerConsigneeId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomerConsigneeId(v);
                        const sc = savedConsignees.find((x) => x.id === v);
                        const patch = buildShipmentPatchForSavedConsignee(sc);
                        setConsigneeNamePrint(patch.consigneeNamePrint ?? "");
                        setConsigneeAddressPrint(patch.consigneeAddressPrint ?? "");
                        setConsigneePhonePrint(patch.consigneePhonePrint ?? "");
                        setConsigneeEmailPrint(patch.consigneeEmailPrint ?? "");
                      }}
                      className={inputCls}
                    >
                      <option value="">— Chọn CNEE —</option>
                      {savedConsignees.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {formatSavedConsigneeOptionLabel(sc)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Field label="Tên CNEE in">
                  <input
                    value={consigneeNamePrint}
                    onChange={(e) => setConsigneeNamePrint(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Địa chỉ CNEE in">
                  <textarea
                    value={consigneeAddressPrint}
                    onChange={(e) => setConsigneeAddressPrint(e.target.value)}
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="ĐT">
                    <input
                      value={consigneePhonePrint}
                      onChange={(e) => setConsigneePhonePrint(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      value={consigneeEmailPrint}
                      onChange={(e) => setConsigneeEmailPrint(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
                {agentOptions.length > 0 ? (
                  <Field label="Agent in">
                    <select
                      value={globalAgentId}
                      onChange={(e) => setGlobalAgentId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— Agent —</option>
                      {agentOptions.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {(ag.label.trim() ? `${ag.label} — ` : "") + (ag.agentName.trim() || ag.id)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {savedGoods.length > 0 ? (
                  <Field label="Tên hàng lưu sẵn">
                    <select
                      value={customerGoodsId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomerGoodsId(v);
                        const g = savedGoods.find((x) => x.id === v);
                        if (g) setGoodsDescriptionPrint(g.goodsDescription.trim());
                      }}
                      className={inputCls}
                    >
                      <option value="">— Tên hàng —</option>
                      {savedGoods.map((g) => (
                        <option key={g.id} value={g.id}>
                          {(g.label.trim() ? `${g.label} — ` : "") + (g.goodsDescription.trim() || g.id)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Field label="Tên hàng in">
                  <input
                    value={goodsDescriptionPrint}
                    onChange={(e) => setGoodsDescriptionPrint(e.target.value.slice(0, 60))}
                    className={inputCls}
                  />
                </Field>
              </div>
            ) : null}

            {tab === "dim" ? (
              <div className="space-y-3">
                <Field label="Trạng thái">
                  <StatusSelect value={status} onChange={setStatus} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Kiện">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={pcs ?? ""}
                      onChange={(e) => setPcs(e.target.value === "" ? null : Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Kg">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={kg ?? ""}
                      onChange={(e) => setKg(e.target.value === "" ? null : Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <div className="rounded-xl border border-black/[0.08] bg-black/[0.02] p-3">
                  {dimWeightKg != null ? (
                    <p className="text-[12px] font-semibold text-apple-label">
                      DIM {formatShipmentDimWeightKg(shipment.flight, dimWeightKg)} kg
                      {(dimLines?.length ?? 0) > 0 ? (
                        <span className="font-normal text-apple-secondary"> · {dimLines!.length} nhóm</span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-[12px] text-apple-tertiary">Chưa có DIM</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setDimOpen(true)}
                    className="mt-2 w-full rounded-full bg-apple-blue py-2.5 text-sm font-semibold text-white"
                  >
                    Nhập DIM
                  </button>
                </div>
                {showEcargo && onEcargoVehicleChange && onEcargoAutoRegister && getEcargoSaveStatus ? (
                  <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-sky-900">eCargo kho SCSC</p>
                      <EcargoKhoScscTriggerButton
                        rowId={shipment.id}
                        open={ecargoOpen}
                        hasVehicle={ecargoReady}
                        job={ecargoJob}
                        onClick={() => {
                          const opening = !ecargoOpen;
                          setEcargoOpen((v) => !v);
                          if (opening) onApplyEcargoPrefill?.(shipment);
                        }}
                        title={
                          ecargoPrefill.defaultVehicle
                            ? `Xe mặc định: ${vehicleDisplayLabel(ecargoPrefill.defaultVehicle)}`
                            : undefined
                        }
                      />
                    </div>
                    {(ecargoLine || ecargoJob) ? (
                      <p className="mt-1 text-[10px] font-medium text-sky-800">
                        {ecargoKhoScscLineStatusLabel(ecargoLine, ecargoJob)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex gap-2 border-t border-black/[0.06] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-black/[0.1] py-3 text-sm font-semibold text-apple-label"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-full bg-apple-blue py-3 text-sm font-semibold text-white"
            >
              Lưu
            </button>
          </div>
        </div>
      </div>

      {dimOpen ? (
        <MobileDimKgModal
          row={{ ...shipment, dimWeightKg, dimLines }}
          onClose={() => setDimOpen(false)}
          onSave={onDimSave}
        />
      ) : null}

      {ecargoOpen && showEcargo && onEcargoVehicleChange && onEcargoAutoRegister && getEcargoSaveStatus ? (
        <EcargoKhoScscCenterModal
          rowId={shipment.id}
          row={shipment}
          customerDirectory={customerDirectory}
          vehicleForEcargo={vehicleForEcargo}
          driverNameForEcargo={ecargoLine?.driverName ?? ""}
          driverIdForEcargo={ecargoLine?.driverId ?? ""}
          viewSessionYmd={sessionDateYmd}
          saveStatus={getEcargoSaveStatus(shipment.id)}
          job={ecargoJob}
          autoRegistering={isEcargoAutoRegistering?.(shipment.id) ?? false}
          onClose={() => setEcargoOpen(false)}
          onVehicleChange={(raw) => onEcargoVehicleChange(shipment.id, raw)}
          onDriverChange={(name, id) => onEcargoDriverChange?.(shipment.id, name, id)}
          onAutoRegister={async (opts) => {
            await onEcargoAutoRegister(shipment, opts);
          }}
          onSaveVehicleAsDefault={onSaveCustomerVehicleForEcargo}
          onRefreshJob={() => void refreshEcargoJob?.(shipment.id)}
        />
      ) : null}
    </>
  );
}

const inputCls =
  "w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2.5 text-sm text-apple-label outline-none focus:border-apple-blue/50";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-apple-secondary">{label}</label>
      {children}
    </div>
  );
}
