import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Shipment, ShipmentStatus } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import { DESTINATIONS } from "../data/customers";
import { findCustomerEntry } from "../utils/mapBookingToScaleTicketFormData";
import { buildShipmentPatchForCustomerSelection, normalizeCustomerNameInput } from "../utils/customerShipmentPatch";
import {
  buildShipmentPatchForSavedConsignee,
  formatSavedConsigneeOptionLabel,
} from "../utils/customerConsigneeShipmentPatch";
import { parseBookingDateLoose, formatYmdToFlightDateDdMon } from "../utils/bookingDateParse";
import { StatusSelect } from "./StatusBadge";
import { MobileDimKgModal, type MobileDimSavePayload } from "./MobileDimKgModal";
import { formatShipmentDimWeightKg } from "../utils/volumetricDim";
import { isScscWarehouse } from "../constants/warehouses";
import {
  clipScscGoodsDescriptionPrint,
  clipScscOtherRequirementsPrint,
  SCSC_GOODS_DESCRIPTION_PRINT_MAX,
  SCSC_OTHER_REQUIREMENTS_PRINT_MAX,
} from "../utils/scscPrintContent";
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
import { EcargoRowNotice } from "./EcargoRowNotice";
import { isEcargoJobRunning, isEcargoJobTerminal } from "../types/ecargoJob";
import { CustomerPickerField } from "./CustomerPickerField";
import { buildShipmentCneeDisplayLines } from "../utils/shipmentCneeCopyBlock";
import { copyTextToClipboard } from "../utils/copyTextToClipboard";
import { MOBILE } from "../styles/mobileOpsStyles";
import { OPS } from "../styles/opsModalStyles";

type TabId = "lot" | "notify" | "dim";

export type MobileEditFocus = "awb" | "hawb" | null;

type Props = {
  open: boolean;
  shipment: Shipment | null;
  sessionDateYmd: string;
  customerDirectory: readonly CustomerDirectoryEntry[];
  globalAgents?: GlobalAgentCatalog;
  initialTab?: TabId;
  focusField?: MobileEditFocus;
  ecargoMap?: EcargoKhoScscPersistedMap;
  onEcargoVehicleChange?: (id: string, raw: string) => void;
  onEcargoDriverChange?: (id: string, driverName: string, driverId: string) => void;
  onEcargoWarehouseChange?: (id: string, arrivalDate: string, arrivalTimeSlot: string) => void;
  onEcargoVehicleTypeChange?: (id: string, vehicleType: string) => void;
  onApplyEcargoPrefill?: (row: Shipment) => void;
  getEcargoSaveStatus?: (id: string) => EcargoSaveStatus;
  getEcargoJob?: (id: string) => EcargoJobRecord | undefined;
  refreshEcargoJob?: (id: string) => void | Promise<void>;
  onEcargoAutoRegister?: (row: Shipment, opts?: EcargoAutoRegisterOpts) => void | Promise<void>;
  onEcargoFetchQr?: (row: Shipment) => void | Promise<void>;
  onSaveCustomerVehicleForEcargo?: (params: UpsertCustomerVehicleParams) => void | Promise<void>;
  isEcargoAutoRegistering?: (id: string) => boolean;
  isEcargoFetchingQr?: (id: string) => boolean;
  onClose: () => void;
  onSave: (patch: Partial<Shipment>) => void;
};

const TABS: { id: TabId; label: string }[] = [
  { id: "lot", label: "Booking" },
  { id: "notify", label: "Thông báo" },
  { id: "dim", label: "DIM & TT" },
];

export function MobileShipmentEditSheet({
  open,
  shipment,
  sessionDateYmd,
  customerDirectory,
  globalAgents,
  initialTab = "lot",
  focusField = null,
  ecargoMap = {},
  onEcargoVehicleChange,
  onEcargoDriverChange,
  onEcargoWarehouseChange,
  onEcargoVehicleTypeChange,
  onApplyEcargoPrefill,
  getEcargoSaveStatus,
  getEcargoJob,
  refreshEcargoJob,
  onEcargoAutoRegister,
  onEcargoFetchQr,
  onSaveCustomerVehicleForEcargo,
  isEcargoAutoRegistering,
  isEcargoFetchingQr,
  onClose,
  onSave,
}: Props) {
  const [tab, setTab] = useState<TabId>("lot");
  const [dimOpen, setDimOpen] = useState(false);
  const [ecargoOpen, setEcargoOpen] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const awbRef = useRef<HTMLInputElement>(null);
  const hawbRef = useRef<HTMLInputElement>(null);

  const sessionYear = useMemo(() => {
    const y = parseInt((sessionDateYmd || shipment?.sessionDate || "").slice(0, 4), 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
  }, [sessionDateYmd, shipment?.sessionDate]);

  const [awb, setAwb] = useState("");
  const [hawb, setHawb] = useState("");
  const [flight, setFlight] = useState("");
  const [flightDateText, setFlightDateText] = useState("");
  const [dest, setDest] = useState("");
  const [customer, setCustomer] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [note, setNote] = useState("");
  const [goodsDescriptionPrint, setGoodsDescriptionPrint] = useState("");
  const [otherRequirementsPrint, setOtherRequirementsPrint] = useState("");
  const [customerConsigneeId, setCustomerConsigneeId] = useState("");
  const [pcs, setPcs] = useState<number | null>(null);
  const [kg, setKg] = useState<number | null>(null);
  const [status, setStatus] = useState<ShipmentStatus>("PENDING");
  const [dimWeightKg, setDimWeightKg] = useState<number | null>(null);
  const [dimLines, setDimLines] = useState<Shipment["dimLines"]>(null);

  const applyCustomerFromDirectory = (name: string, entry?: CustomerDirectoryEntry) => {
    const patch = buildShipmentPatchForCustomerSelection(customerDirectory, name, entry, globalAgents);
    setCustomer(normalizeCustomerNameInput(patch.customer ?? name));
    setCustomerId((patch.customerId ?? "").trim());
    if (patch.customerConsigneeId) {
      setCustomerConsigneeId(patch.customerConsigneeId);
    }
    if (patch.goodsDescriptionPrint != null) {
      setGoodsDescriptionPrint(patch.goodsDescriptionPrint);
    }
    if (patch.otherRequirementsPrint != null) {
      setOtherRequirementsPrint(patch.otherRequirementsPrint);
    }
  };

  useEffect(() => {
    if (!open || !shipment) return;
    setTab(initialTab);
    setDimOpen(false);
    setEcargoOpen(false);
    setCopyOk(false);
    setAwb((shipment.awb ?? "").trim());
    setHawb((shipment.hawb ?? "").trim());
    setFlight((shipment.flight ?? "").trim());
    setFlightDateText((shipment.flightDate ?? "").trim());
    setDest((shipment.dest ?? "").trim());
    setCustomer((shipment.customer ?? "").trim());
    setCustomerId((shipment.customerId ?? "").trim());
    setNote((shipment.note ?? "").trim());
    setGoodsDescriptionPrint((shipment.goodsDescriptionPrint ?? "").trim());
    setOtherRequirementsPrint((shipment.otherRequirementsPrint ?? "").trim());
    setCustomerConsigneeId((shipment.customerConsigneeId ?? "").trim());
    setPcs(shipment.pcs);
    setKg(shipment.kg);
    setStatus(shipment.status);
    setDimWeightKg(shipment.dimWeightKg);
    setDimLines(shipment.dimLines);
  }, [open, shipment?.id, initialTab]);

  useEffect(() => {
    if (!open || !focusField) return;
    const t = window.setTimeout(() => {
      if (focusField === "awb") awbRef.current?.focus();
      if (focusField === "hawb") hawbRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(t);
  }, [open, focusField, shipment?.id]);

  const notifyPreview = useMemo(() => {
    if (!shipment) return "";
    const entry = findCustomerEntry(shipment, customerDirectory);
    const saved = entry?.savedConsignees ?? [];
    const sc = saved.find((x) => x.id === customerConsigneeId);
    const consigneePatch = buildShipmentPatchForSavedConsignee(sc);
    return buildShipmentCneeDisplayLines(
      { ...shipment, customer, customerConsigneeId, ...consigneePatch },
      customerDirectory,
      { sessionYmdFallback: sessionDateYmd }
    ).join("\n");
  }, [shipment, customer, customerConsigneeId, customerDirectory, sessionDateYmd]);

  if (!open || !shipment) return null;

  const entry = findCustomerEntry(shipment, customerDirectory);
  const savedConsignees = entry?.savedConsignees ?? [];
  const showEcargo = isScscWarehouse(shipment.warehouse);
  const showScscPrintFields = isScscWarehouse(shipment.warehouse);
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
    const consigneePatch = customerConsigneeId
      ? buildShipmentPatchForSavedConsignee(savedConsignees.find((x) => x.id === customerConsigneeId))
      : {};
    const patch: Partial<Shipment> = {
      awb: awb.trim(),
      hawb: hawb.trim().slice(0, 32),
      flight: flight.trim().toUpperCase(),
      flightDate,
      dest: dest.trim().toUpperCase(),
      ...customerPatch,
      ...consigneePatch,
      note: note.trim(),
      ...(showScscPrintFields
        ? {
            goodsDescriptionPrint: clipScscGoodsDescriptionPrint(goodsDescriptionPrint),
            otherRequirementsPrint: clipScscOtherRequirementsPrint(otherRequirementsPrint),
          }
        : {}),
      pcs,
      kg,
      status,
      dimWeightKg,
      dimLines,
      customerConsigneeId: customerConsigneeId.trim(),
    };
    onSave(patch);
    onClose();
  };

  const onDimSave = (payload: MobileDimSavePayload) => {
    setDimWeightKg(payload.dimWeightKg);
    setDimLines(payload.dimLines);
    setDimOpen(false);
  };

  const onCopyNotify = async () => {
    if (!notifyPreview.trim()) return;
    const ok = await copyTextToClipboard(notifyPreview);
    setCopyOk(ok);
    window.setTimeout(() => setCopyOk(false), 1600);
  };

  return (
    <>
      <div
        className={MOBILE.sheetBackdrop}
        role="dialog"
        aria-modal="true"
        aria-label="Sửa lô hàng"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className={`${MOBILE.sheet} ${OPS.border}`}>
          <div className={`flex items-center justify-between border-b px-4 py-3 ${OPS.border}`}>
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold text-apple-label dark:text-slate-100">
                {awb.trim() ? "Sửa lô" : "Booking mới"}
              </h2>
              <p className="truncate text-[11px] text-apple-secondary dark:text-slate-400">
                {shipment.warehouse} · {sessionDateYmd}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-apple-tertiary hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>

          <div className="mx-3 my-2 flex gap-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-full py-2 text-[12px] font-semibold transition-all duration-200 ${
                  tab === t.id ? MOBILE.tabActive : MOBILE.tabIdle
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {tab === "lot" ? (
              <div className="space-y-4">
                <Field label="AWB" hint="Bắt buộc để nhận diện lô">
                  <input
                    ref={awbRef}
                    value={awb}
                    onChange={(e) => setAwb(e.target.value.toUpperCase())}
                    className={MOBILE.inputHero}
                    placeholder="VN594-12345678"
                    autoComplete="off"
                    enterKeyHint="next"
                  />
                </Field>
                <Field label="HAWB (tuỳ chọn)">
                  <input
                    ref={hawbRef}
                    value={hawb}
                    onChange={(e) => setHawb(e.target.value.toUpperCase().slice(0, 32))}
                    className={MOBILE.input}
                    placeholder="House AWB"
                    autoComplete="off"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Chuyến">
                    <input
                      value={flight}
                      onChange={(e) => setFlight(e.target.value.toUpperCase())}
                      className={MOBILE.input}
                      placeholder="VN594"
                    />
                  </Field>
                  <Field label="Ngày bay">
                    <input
                      value={flightDateText}
                      onChange={(e) => setFlightDateText(e.target.value.toUpperCase())}
                      className={MOBILE.input}
                      placeholder="11MAY"
                    />
                  </Field>
                </div>
                <Field label="DEST">
                  <input
                    list="mobile-edit-dest-list"
                    value={dest}
                    onChange={(e) => setDest(e.target.value.toUpperCase())}
                    className={MOBILE.input}
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
                    placeholder="Mã hoặc tên khách…"
                    inputClassName={MOBILE.input}
                  />
                </Field>
                <Field label="Ghi chú nội bộ">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className={`${MOBILE.input} resize-none`}
                    placeholder="Ghi chú ngắn cho ops…"
                  />
                </Field>
                {showScscPrintFields ? (
                  <>
                    <Field
                      label="Tên hàng in phiếu cân"
                      hint={`${goodsDescriptionPrint.length}/${SCSC_GOODS_DESCRIPTION_PRINT_MAX}`}
                    >
                      <textarea
                        value={goodsDescriptionPrint}
                        onChange={(e) =>
                          setGoodsDescriptionPrint(clipScscGoodsDescriptionPrint(e.target.value))
                        }
                        rows={2}
                        className={`${MOBILE.input} resize-none`}
                        placeholder="GENERAL CARGO"
                      />
                    </Field>
                    <Field
                      label="Yêu cầu khác in phiếu"
                      hint={`${otherRequirementsPrint.length}/${SCSC_OTHER_REQUIREMENTS_PRINT_MAX}`}
                    >
                      <textarea
                        value={otherRequirementsPrint}
                        onChange={(e) =>
                          setOtherRequirementsPrint(clipScscOtherRequirementsPrint(e.target.value))
                        }
                        rows={2}
                        className={`${MOBILE.input} resize-none`}
                        placeholder="Không xếp chồng…"
                      />
                    </Field>
                  </>
                ) : null}
              </div>
            ) : null}

            {tab === "notify" ? (
              <div className="space-y-4">
                {savedConsignees.length > 0 ? (
                  <Field label="Chọn CNEE lưu sẵn">
                    <select
                      value={customerConsigneeId}
                      onChange={(e) => setCustomerConsigneeId(e.target.value)}
                      className={MOBILE.input}
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
                <div className={`rounded-2xl border p-4 ${OPS.panelSoft}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-apple-secondary dark:text-slate-400">
                    Nội dung thông báo
                  </p>
                  {notifyPreview.trim() ? (
                    <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-apple-label dark:text-slate-200">
                      {notifyPreview}
                    </pre>
                  ) : (
                    <p className="mt-2 text-[12px] text-apple-tertiary dark:text-slate-500">
                      Chọn khách và CNEE để xem nội dung sao chép.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={!notifyPreview.trim()}
                    onClick={() => void onCopyNotify()}
                    className={`mt-3 w-full rounded-full py-2.5 text-sm font-semibold disabled:opacity-40 ${
                      copyOk ? "bg-emerald-600 text-white" : MOBILE.primaryBtn
                    }`}
                  >
                    {copyOk ? "Đã sao chép" : "Sao chép thông báo"}
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-apple-tertiary dark:text-slate-500">
                  Trên điện thoại chỉ cần xem và sao chép thông báo. Cấu hình in chi tiết dùng trên máy tính.
                </p>
              </div>
            ) : null}

            {tab === "dim" ? (
              <div className="space-y-4">
                <Field label="Trạng thái">
                  <StatusSelect value={status} onChange={setStatus} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Kiện">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={pcs ?? ""}
                      onChange={(e) => setPcs(e.target.value === "" ? null : Number(e.target.value))}
                      className={MOBILE.input}
                    />
                  </Field>
                  <Field label="Kg">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={kg ?? ""}
                      onChange={(e) => setKg(e.target.value === "" ? null : Number(e.target.value))}
                      className={MOBILE.input}
                    />
                  </Field>
                </div>
                <div className={`rounded-2xl border p-4 ${OPS.panelSoft}`}>
                  {dimWeightKg != null ? (
                    <p className="text-[13px] font-semibold text-apple-label dark:text-slate-100">
                      DIM {formatShipmentDimWeightKg(shipment.flight, dimWeightKg)} kg
                      {(dimLines?.length ?? 0) > 0 ? (
                        <span className="font-normal text-apple-secondary dark:text-slate-400">
                          {" "}
                          · {dimLines!.length} nhóm
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-[13px] text-apple-tertiary dark:text-slate-500">Chưa có DIM</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setDimOpen(true)}
                    className={`mt-3 w-full ${MOBILE.primaryBtn}`}
                  >
                    Nhập DIM
                  </button>
                </div>
                {showEcargo && onEcargoVehicleChange && onEcargoAutoRegister && getEcargoSaveStatus ? (
                  <div className="rounded-2xl border border-sky-200/80 bg-sky-50/50 p-4 dark:border-sky-400/25 dark:bg-sky-500/10">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-sky-900 dark:text-sky-200">eCargo kho SCSC</p>
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
                    {ecargoJob &&
                    (isEcargoJobRunning(ecargoJob.status) || isEcargoJobTerminal(ecargoJob.status)) ? (
                      <EcargoRowNotice job={ecargoJob} awb={shipment.awb} compact className="mt-2" />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={`flex gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${OPS.border}`}>
            <button type="button" onClick={onClose} className={`flex-1 ${MOBILE.secondaryBtn}`}>
              Hủy
            </button>
            <button type="button" onClick={handleSave} className={`flex-1 ${MOBILE.primaryBtn}`}>
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
          arrivalDateForEcargo={ecargoLine?.arrivalDate ?? ""}
          arrivalTimeSlotForEcargo={ecargoLine?.arrivalTimeSlot ?? ""}
          vehicleTypeForEcargo={ecargoLine?.vehicleType ?? ""}
          viewSessionYmd={sessionDateYmd}
          saveStatus={getEcargoSaveStatus(shipment.id)}
          job={ecargoJob}
          markedSubmitted={ecargoLine?.markedSubmitted}
          autoRegistering={isEcargoAutoRegistering?.(shipment.id) ?? false}
          onClose={() => setEcargoOpen(false)}
          onVehicleChange={(raw) => onEcargoVehicleChange(shipment.id, raw)}
          onDriverChange={(name, id) => onEcargoDriverChange?.(shipment.id, name, id)}
          onWarehouseArrivalChange={(date, slot) => onEcargoWarehouseChange?.(shipment.id, date, slot)}
          onVehicleTypeChange={(type) => onEcargoVehicleTypeChange?.(shipment.id, type)}
          onAutoRegister={async (opts) => {
            await onEcargoAutoRegister(shipment, opts);
          }}
          onFetchQr={
            onEcargoFetchQr
              ? async () => {
                  await onEcargoFetchQr(shipment);
                }
              : undefined
          }
          fetchQrBusy={isEcargoFetchingQr?.(shipment.id) ?? false}
          onSaveVehicleAsDefault={onSaveCustomerVehicleForEcargo}
          onRefreshJob={() => void refreshEcargoJob?.(shipment.id)}
        />
      ) : null}
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className={MOBILE.fieldLabel}>{label}</label>
      {hint ? <p className="-mt-1 mb-1.5 text-[10px] text-apple-tertiary dark:text-slate-500">{hint}</p> : null}
      {children}
    </div>
  );
}