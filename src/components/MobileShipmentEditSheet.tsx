import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Shipment, ShipmentStatus } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { DESTINATIONS } from "../data/customers";
import { findCustomerEntry } from "../utils/customerBookingResolve";
import {
  buildShipmentPatchForCustomerSelection,
  normalizeCustomerNameInput,
} from "../utils/customerShipmentPatch";
import {
  buildShipmentPatchForSavedConsignee,
  formatSavedConsigneeOptionLabel,
} from "../utils/customerConsigneeShipmentPatch";
import {
  buildShipmentPatchForSavedGoods,
  buildShipmentPatchForSavedShipper,
  formatSavedGoodsDetailTitle,
  formatSavedGoodsShortLabel,
  isSavedGoodsSelectable,
} from "../utils/customerPrintProfileLink";
import {
  parseBookingDateLoose,
  formatYmdToFlightDateDdMon,
} from "../utils/bookingDateParse";
import { StatusSelect } from "./StatusBadge";
import {
  LazyMobileDimKgModal,
  type MobileDimSavePayload,
} from "./LazyMobileDimKgModal";
import {
  formatShipmentDimWeightDisplay,
  resolveShipmentDimWeightKg,
} from "../utils/volumetricDim";
import { isScscWarehouse } from "../constants/warehouses";
import {
  clipScscOtherRequirementsPrint,
  SCSC_OTHER_REQUIREMENTS_PRINT_MAX,
} from "../utils/scscPrintContent";
import { CustomerPickerField } from "./CustomerPickerField";
import { buildShipmentCneeDisplayLines } from "../utils/shipmentCneeCopyBlock";
import { copyTextToClipboard } from "../utils/copyTextToClipboard";
import { MOBILE, mobileSheetBackdrop } from "../styles/mobileOpsStyles";
import { useIsMobile } from "../hooks/useIsMobile";
import { OPS } from "../styles/opsModalStyles";
import {
  useOpsMobileOverlayLock,
  useVisualViewportBottomInset,
} from "../hooks/useOpsMobileOverlayLock";

type TabId = "lot" | "notify" | "dim";

export type MobileEditFocus = "awb" | "hawb" | null;

type Props = {
  open: boolean;
  shipment: Shipment | null;
  sessionDateYmd: string;
  customerDirectory: readonly CustomerDirectoryEntry[];
  initialTab?: TabId;
  focusField?: MobileEditFocus;
  onClose: () => void;
  onSave: (patch: Partial<Shipment>) => void;
  onUpdateCustomers?: (
    customers: CustomerDirectoryEntry[],
  ) => Promise<boolean | void> | boolean | void;
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
  initialTab = "lot",
  focusField = null,
  onClose,
  onSave,
  onUpdateCustomers,
}: Props) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<TabId>("lot");
  const [dimOpen, setDimOpen] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const awbRef = useRef<HTMLInputElement>(null);
  const hawbRef = useRef<HTMLInputElement>(null);
  const sheetOpen = open && shipment != null && isMobile;
  useOpsMobileOverlayLock(sheetOpen && !dimOpen);
  const keyboardInset = useVisualViewportBottomInset(sheetOpen);

  const sessionYear = useMemo(() => {
    const y = parseInt(
      (sessionDateYmd || shipment?.sessionDate || "").slice(0, 4),
      10,
    );
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
  const [otherRequirementsPrint, setOtherRequirementsPrint] = useState("");
  const [customerShipperId, setCustomerShipperId] = useState("");
  const [customerConsigneeId, setCustomerConsigneeId] = useState("");
  const [customerGoodsId, setCustomerGoodsId] = useState("");
  const [pcs, setPcs] = useState<number | null>(null);
  const [kg, setKg] = useState<number | null>(null);
  const [status, setStatus] = useState<ShipmentStatus>("PENDING");
  const [dimWeightKg, setDimWeightKg] = useState<number | null>(null);
  const [dimLines, setDimLines] = useState<Shipment["dimLines"]>(null);

  const applyCustomerFromDirectory = (
    name: string,
    entry?: CustomerDirectoryEntry,
  ) => {
    const patch = buildShipmentPatchForCustomerSelection(
      customerDirectory,
      name,
      entry,
      {
        customerShipperId,
        customerConsigneeId,
        customerGoodsId,
      },
    );
    setCustomer(normalizeCustomerNameInput(patch.customer ?? name));
    setCustomerId((patch.customerId ?? "").trim());
    if (patch.customerShipperId != null) {
      setCustomerShipperId(patch.customerShipperId);
    }
    if (patch.customerConsigneeId != null) {
      setCustomerConsigneeId(patch.customerConsigneeId);
    }
    if (patch.customerGoodsId != null) {
      setCustomerGoodsId(patch.customerGoodsId);
    }
    if (patch.otherRequirementsPrint != null) {
      setOtherRequirementsPrint(patch.otherRequirementsPrint);
    }
  };

  useEffect(() => {
    if (!open || !shipment) return;
    setTab(initialTab);
    setDimOpen(false);
    setCopyOk(false);
    setAwb((shipment.awb ?? "").trim());
    setHawb((shipment.hawb ?? "").trim());
    setFlight((shipment.flight ?? "").trim());
    setFlightDateText((shipment.flightDate ?? "").trim());
    setDest((shipment.dest ?? "").trim());
    setCustomer((shipment.customer ?? "").trim());
    setCustomerId((shipment.customerId ?? "").trim());
    setNote((shipment.note ?? "").trim());
    setOtherRequirementsPrint((shipment.otherRequirementsPrint ?? "").trim());
    setCustomerShipperId((shipment.customerShipperId ?? "").trim());
    setCustomerConsigneeId((shipment.customerConsigneeId ?? "").trim());
    setCustomerGoodsId((shipment.customerGoodsId ?? "").trim());
    setPcs(shipment.pcs);
    setKg(shipment.kg);
    setStatus(shipment.status);
    setDimWeightKg(shipment.dimWeightKg);
    setDimLines(shipment.dimLines);
  }, [open, shipment, initialTab]);

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
      { sessionYmdFallback: sessionDateYmd },
    ).join("\n");
  }, [
    shipment,
    customer,
    customerConsigneeId,
    customerDirectory,
    sessionDateYmd,
  ]);

  if (!open || !shipment) return null;

  const entry =
    findCustomerEntry(
      { ...shipment, customer, customerId, customerShipperId, customerConsigneeId, customerGoodsId },
      customerDirectory,
    ) ?? findCustomerEntry(shipment, customerDirectory);
  const savedShippers = entry?.savedShippers ?? [];
  const savedConsignees = entry?.savedConsignees ?? [];
  const savedGoods = (entry?.savedGoods ?? []).filter(isSavedGoodsSelectable);
  const showScscPrintFields = isScscWarehouse(shipment.warehouse);

  const handleSave = () => {
    const ymd = parseBookingDateLoose(flightDateText.trim(), sessionYear);
    const flightDate = ymd
      ? formatYmdToFlightDateDdMon(ymd)
      : flightDateText.trim();
    const customerPatch = buildShipmentPatchForCustomerSelection(
      customerDirectory,
      customer,
      undefined,
      {
        customerShipperId,
        customerConsigneeId,
        customerGoodsId,
      },
    );
    const shipperPatch = buildShipmentPatchForSavedShipper(
      savedShippers.find((x) => x.id === customerShipperId),
    );
    const consigneePatch = buildShipmentPatchForSavedConsignee(
      savedConsignees.find((x) => x.id === customerConsigneeId),
    );
    const goodsPatch = buildShipmentPatchForSavedGoods(
      savedGoods.find((x) => x.id === customerGoodsId),
    );
    const patch: Partial<Shipment> = {
      awb: awb.trim(),
      hawb: hawb.trim().slice(0, 32),
      flight: flight.trim().toUpperCase(),
      flightDate,
      dest: dest.trim().toUpperCase(),
      ...customerPatch,
      ...shipperPatch,
      ...consigneePatch,
      ...goodsPatch,
      note: note.trim(),
      ...(showScscPrintFields
        ? {
            otherRequirementsPrint: clipScscOtherRequirementsPrint(
              otherRequirementsPrint,
            ),
          }
        : {}),
      pcs,
      kg,
      status,
      dimWeightKg,
      dimLines,
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
        className={mobileSheetBackdrop(isMobile)}
        role="dialog"
        aria-modal="true"
        aria-label="Sửa lô hàng"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className={MOBILE.sheet}>
          <div className="flex items-center justify-between border-b border-ui-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold text-ui-text">
                {awb.trim() ? "Sửa lô" : "Booking mới"}
              </h2>
              <p className="truncate font-shipment-data text-[11px] text-ui-text-muted">
                {shipment.warehouse} · {sessionDateYmd}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ui-text-muted hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>

          <div className="mx-3 my-2 flex gap-1 rounded-xl bg-ui-surface-muted p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={tab === t.id ? MOBILE.tabActive : MOBILE.tabIdle}
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
                    onChange={(e) =>
                      setHawb(e.target.value.toUpperCase().slice(0, 32))
                    }
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
                      onChange={(e) =>
                        setFlightDateText(e.target.value.toUpperCase())
                      }
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
                    onChange={(name, entry) =>
                      applyCustomerFromDirectory(name, entry)
                    }
                    placeholder="Mã hoặc tên khách…"
                    inputClassName={MOBILE.input}
                  />
                </Field>
                <div className={`space-y-2 rounded-2xl border p-3 ${OPS.panelSoft}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-apple-secondary">
                    Thông tin KH
                  </p>
                  <Field label="Shipper">
                    <select
                      value={customerShipperId}
                      onChange={(e) => setCustomerShipperId(e.target.value)}
                      disabled={savedShippers.length === 0}
                      className={MOBILE.input}
                    >
                      <option value="">
                        {savedShippers.length ? "— Chọn Shipper —" : "— Chưa có Shipper —"}
                      </option>
                      {savedShippers.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.label.trim() || sc.shipperName.trim() || sc.id}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="CNEE">
                    <select
                      value={customerConsigneeId}
                      onChange={(e) => setCustomerConsigneeId(e.target.value)}
                      disabled={savedConsignees.length === 0}
                      className={MOBILE.input}
                    >
                      <option value="">
                        {savedConsignees.length ? "— Chọn CNEE —" : "— Chưa có CNEE —"}
                      </option>
                      {savedConsignees.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {formatSavedConsigneeOptionLabel(sc)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tên hàng">
                    <select
                      value={customerGoodsId}
                      onChange={(e) => setCustomerGoodsId(e.target.value)}
                      disabled={savedGoods.length === 0}
                      className={MOBILE.input}
                    >
                      <option value="">
                        {savedGoods.length ? "— Chọn tên hàng —" : "— Chưa có tên hàng —"}
                      </option>
                      {savedGoods.map((g) => (
                        <option key={g.id} value={g.id} title={formatSavedGoodsDetailTitle(g)}>
                          {formatSavedGoodsShortLabel(g)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="text-[11px] leading-relaxed text-apple-tertiary">
                    Chọn từ hồ sơ đã lưu trong Danh bạ khách.
                  </p>
                </div>
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
                  <Field
                    label="Yêu cầu xử lý"
                    hint={`${otherRequirementsPrint.length}/${SCSC_OTHER_REQUIREMENTS_PRINT_MAX}`}
                  >
                    <textarea
                      value={otherRequirementsPrint}
                      onChange={(e) =>
                        setOtherRequirementsPrint(
                          clipScscOtherRequirementsPrint(e.target.value),
                        )
                      }
                      rows={2}
                      className={`${MOBILE.input} resize-none`}
                      placeholder="Không xếp chồng…"
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}

            {tab === "notify" ? (
              <div className="space-y-4">
                <div className={`rounded-2xl border p-4 ${OPS.panelSoft}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-apple-secondary">
                    Nội dung thông báo
                  </p>
                  {notifyPreview.trim() ? (
                    <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-apple-label">
                      {notifyPreview}
                    </pre>
                  ) : (
                    <p className="mt-2 text-[12px] text-apple-tertiary">
                      Chọn khách và CNEE ở tab Booking để xem nội dung sao chép.
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
                <p className="text-[11px] leading-relaxed text-apple-tertiary">
                  Hồ sơ Shipper / CNEE / Tên hàng được quản lý trong Danh bạ.
                </p>
              </div>
            ) : null}

            {tab === "dim" ? (
              <div className="space-y-4">
                <Field label="Trạng thái">
                  <StatusSelect
                    value={status}
                    warehouse={shipment.warehouse}
                    onChange={setStatus}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Kiện">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={pcs ?? ""}
                      onChange={(e) =>
                        setPcs(
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      className={MOBILE.input}
                    />
                  </Field>
                  <Field label="Kg">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={kg ?? ""}
                      onChange={(e) =>
                        setKg(
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      className={MOBILE.input}
                    />
                  </Field>
                </div>
                <div className={`rounded-2xl border p-4 ${OPS.panelSoft}`}>
                  {resolveShipmentDimWeightKg({
                    ...shipment,
                    dimWeightKg,
                    dimLines,
                  }) != null ? (
                    <p className="text-[13px] font-semibold text-apple-label">
                      DIM{" "}
                      {formatShipmentDimWeightDisplay({
                        ...shipment,
                        dimWeightKg,
                        dimLines,
                      })}{" "}
                      kg
                      {(dimLines?.length ?? 0) > 0 ? (
                        <span className="font-normal text-apple-secondary">
                          {""}· {dimLines!.length} nhóm
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-[13px] text-apple-tertiary">
                      Chưa có DIM
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setDimOpen(true)}
                    className={`mt-3 w-full ${MOBILE.primaryBtn}`}
                  >
                    Nhập DIM
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div
            className="shrink-0 border-t border-ui-border bg-ui-surface px-4 pt-3"
            style={{
              paddingBottom: `max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px))`,
            }}
            data-testid="mobile-edit-sheet-footer"
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`flex-1 ${MOBILE.secondaryBtn}`}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSave}
                className={`flex-1 ${MOBILE.primaryBtn}`}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      </div>

      {dimOpen ? (
        <LazyMobileDimKgModal
          row={{ ...shipment, dimWeightKg, dimLines }}
          customerDirectory={customerDirectory}
          onUpdateCustomers={onUpdateCustomers}
          onClose={() => setDimOpen(false)}
          onSave={onDimSave}
        />
      ) : null}
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className={MOBILE.fieldLabel}>{label}</label>
      {hint ? (
        <p className="-mt-1 mb-1.5 text-[10px] text-ui-text-muted">{hint}</p>
      ) : null}
      {children}
    </div>
  );
}
