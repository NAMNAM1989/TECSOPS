import { useState, useRef, useEffect, useMemo } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import { formatAwb, rawAwbDigits } from "../utils/awbFormat";
import { isAwbDigitsTaken } from "../utils/awbUnique";
import { mergeCustomerOptions, persistNewCustomer } from "../utils/customerStorage";
import { CUSTOMERS, WAREHOUSES, DESTINATIONS } from "../data/customers";
import { parseFlightDateDisplayToYmd, splitIsoToLocalDateTime } from "../utils/bookingDateParse";

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

type BaseProps = {
  sessionDateYmd: string;
  allRows: Shipment[];
  onClose: () => void;
};

type AddMode = BaseProps & {
  mode?: "add";
  onAdd: (shipment: Omit<Shipment, "id" | "stt">) => void;
};

type EditMode = BaseProps & {
  mode: "edit";
  shipment: Shipment;
  onSave: (patch: Partial<Shipment>) => void;
};

export type ShipmentBookingFormProps = AddMode | EditMode;

export function ShipmentBookingForm(props: ShipmentBookingFormProps) {
  const isEdit = props.mode === "edit";
  const editShipment = isEdit ? props.shipment : null;

  const [awbRaw, setAwbRaw] = useState("");
  const [flight, setFlight] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [cutoffHour, setCutoffHour] = useState("");
  const [cutoffMinute, setCutoffMinute] = useState("");
  const [cutoffDate, setCutoffDate] = useState("");
  const [dest, setDest] = useState("");
  const [destSearch, setDestSearch] = useState("");
  const [showDestList, setShowDestList] = useState(false);
  const [warehouse, setWarehouse] = useState<Warehouse>("TECS-TCS");
  const [customer, setCustomer] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [note, setNote] = useState("");
  const [dimKg, setDimKg] = useState("");

  const awbRef = useRef<HTMLInputElement>(null);
  const flightRef = useRef<HTMLInputElement>(null);
  const flightDateRef = useRef<HTMLInputElement>(null);
  const cutoffDateRef = useRef<HTMLInputElement>(null);
  const cutoffHourRef = useRef<HTMLSelectElement>(null);
  const cutoffMinuteRef = useRef<HTMLSelectElement>(null);
  const destInputRef = useRef<HTMLInputElement>(null);
  const warehouseRef = useRef<HTMLSelectElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEdit || !editShipment) return;
    const y = parseInt(editShipment.sessionDate.slice(0, 4), 10);
    setAwbRaw(rawAwbDigits(editShipment.awb));
    setFlight(editShipment.flight);
    setFlightDate(parseFlightDateDisplayToYmd(editShipment.flightDate, y) || "");
    const co = editShipment.cutoff ? splitIsoToLocalDateTime(editShipment.cutoff) : { date: "", hour: "", minute: "" };
    setCutoffDate(co.date);
    setCutoffHour(co.hour);
    setCutoffMinute(co.minute);
    setDest(editShipment.dest);
    setDestSearch("");
    setWarehouse(editShipment.warehouse);
    setCustomer(editShipment.customer);
    setCustomerSearch("");
    setNote(editShipment.note ?? "");
    setDimKg(editShipment.dimWeightKg != null ? String(editShipment.dimWeightKg) : "");
  }, [isEdit, editShipment?.id]);

  useEffect(() => {
    if (isEdit) return;
    awbRef.current?.focus();
  }, [isEdit]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!customerRef.current?.contains(t)) setShowCustomerList(false);
      if (!destRef.current?.contains(t)) setShowDestList(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [customerListVersion, setCustomerListVersion] = useState(0);
  const customerOptions = useMemo(
    () => mergeCustomerOptions(CUSTOMERS),
    [customerListVersion]
  );

  const filteredCustomers = customerOptions.filter((c) =>
    c.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const searchTrim = customerSearch.trim();
  const canUseTypedCustomer =
    searchTrim.length > 0 &&
    !customerOptions.some((c) => c.toLowerCase() === searchTrim.toLowerCase());

  const destOptions = useMemo(
    () => [...DESTINATIONS].sort((a, b) => a.localeCompare(b)),
    []
  );
  const filteredDests = destOptions.filter((d) =>
    d.toLowerCase().includes(destSearch.toLowerCase())
  );
  const destSearchTrim = destSearch.trim().toUpperCase();
  const canUseTypedDest =
    destSearchTrim.length > 0 &&
    !destOptions.some((d) => d.toUpperCase() === destSearchTrim);

  const awbDisplay = formatAwb(awbRaw);
  const awbDigits = rawAwbDigits(awbRaw);
  const awbValid = awbDigits.length === 11;
  const exceptId = isEdit ? editShipment!.id : null;
  const awbConflict =
    awbValid && isAwbDigitsTaken(props.allRows, awbDigits, exceptId);

  function buildCutoffIso(): string {
    if (!cutoffDate || cutoffHour === "" || cutoffMinute === "") return "";
    const [y, mo, d] = cutoffDate.split("-").map(Number);
    const h = Number(cutoffHour);
    const m = Number(cutoffMinute);
    if (Number.isNaN(h) || Number.isNaN(m)) return "";
    return new Date(y, mo - 1, d, h, m).toISOString();
  }

  function formatFlightDate(): string {
    if (!flightDate) return "";
    const d = new Date(flightDate);
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return `${day}${months[d.getMonth()]}`;
  }

  const effectiveCustomer = (customer || searchTrim).trim();
  const effectiveDest = (dest || destSearchTrim).trim();
  const canSubmitBase =
    awbValid && !awbConflict && flight && flightDate && effectiveDest.length > 0 && warehouse && effectiveCustomer.length > 0;
  const canSubmit = canSubmitBase;

  function focusNextFrom(el: EventTarget | null) {
    const order: (HTMLElement | null)[] = [
      awbRef.current,
      flightRef.current,
      flightDateRef.current,
      cutoffDateRef.current,
      cutoffHourRef.current,
      cutoffMinuteRef.current,
      destInputRef.current,
      warehouseRef.current,
      customerInputRef.current,
    ];
    const node = el as HTMLElement | null;
    const idx = node ? order.indexOf(node) : -1;
    if (idx >= 0 && idx < order.length - 1) {
      order[idx + 1]?.focus();
      return;
    }
    if (idx === order.length - 1) {
      submitBtnRef.current?.focus();
    }
  }

  function handleEnterAdvance(e: React.KeyboardEvent, field: "field" | "customer") {
    if (e.key !== "Enter" || (e.nativeEvent as KeyboardEvent).isComposing) return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

    if (field === "customer") {
      e.preventDefault();
      if (canSubmit) {
        (e.currentTarget.closest("form") as HTMLFormElement | null)?.requestSubmit();
      } else {
        submitBtnRef.current?.focus();
      }
      return;
    }

    e.preventDefault();
    focusNextFrom(e.currentTarget);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    persistNewCustomer(effectiveCustomer, CUSTOMERS);
    setCustomerListVersion((v) => v + 1);

    const cutoff = buildCutoffIso();
    const dimTrim = dimKg.trim();
    let dimWeightKg: number | null = null;
    if (dimTrim !== "") {
      const n = Number(dimTrim.replace(",", "."));
      if (Number.isNaN(n) || n < 0) {
        window.alert("DIM (kg) không hợp lệ — để trống hoặc nhập số ≥ 0.");
        return;
      }
      dimWeightKg = n;
    }

    const initialDimStr = isEdit && editShipment ? (editShipment.dimWeightKg != null ? String(editShipment.dimWeightKg) : "") : "";
    const dimFieldChanged = isEdit && dimTrim !== initialDimStr;
    const dimLinesPayload =
      isEdit && editShipment && !dimFieldChanged ? editShipment.dimLines : null;
    const dimDivisorPayload =
      isEdit && editShipment && !dimFieldChanged ? editShipment.dimDivisor : null;

    const payloadCommon = {
      awb: awbDisplay,
      flight: flight.toUpperCase(),
      flightDate: formatFlightDate(),
      cutoff,
      cutoffNote: isEdit ? editShipment!.cutoffNote : "",
      note: note.trim(),
      dest: effectiveDest.toUpperCase(),
      warehouse,
      pcs: isEdit ? editShipment!.pcs : null,
      kg: isEdit ? editShipment!.kg : null,
      dimWeightKg,
      dimLines: dimLinesPayload,
      dimDivisor: dimDivisorPayload,
      customer: effectiveCustomer,
      status: isEdit ? editShipment!.status : ("PENDING" as const),
    };

    if (isEdit) {
      props.onSave(payloadCommon);
      props.onClose();
    } else {
      props.onAdd({
        ...payloadCommon,
        sessionDate: props.sessionDateYmd,
      });
      setAwbRaw("");
      setFlight("");
      setFlightDate("");
      setCutoffHour("");
      setCutoffMinute("");
      setCutoffDate("");
      setDest("");
      setDestSearch("");
      setNote("");
      setDimKg("");
      awbRef.current?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 backdrop-blur-xl sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            props.onClose();
          }
        }}
        className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-black/[0.08] bg-white shadow-apple-md"
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <div>
            <h2 className="text-[19px] font-semibold tracking-tight text-apple-label">
              {isEdit ? "Sửa lô hàng" : "Nhập booking mới"}
            </h2>
            <p className="text-xs text-apple-secondary">
              Phiên ngày <span className="font-mono font-semibold text-apple-label">{props.sessionDateYmd}</span>
              {isEdit && (
                <>
                  {" "}
                  · AWB 11 số, không trùng trong toàn hệ thống
                </>
              )}
              {!isEdit && " — AWB 11 số tự format IATA"}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-apple-tertiary">
              <kbd className="rounded-md border border-black/[0.08] bg-black/[0.04] px-1.5 font-mono text-[10px]">Tab</kbd> chuyển ô ·{" "}
              <kbd className="rounded-md border border-black/[0.08] bg-black/[0.04] px-1.5 font-mono text-[10px]">Enter</kbd> sang ô tiếp
              (ngày bay, cutoff, giờ, kho…) · Enter ở khách hàng = gửi form ·{" "}
              <kbd className="rounded-md border border-black/[0.08] bg-black/[0.04] px-1.5 font-mono text-[10px]">Tab</kbd> sang Note ·{" "}
              <kbd className="rounded-md border border-black/[0.08] bg-black/[0.04] px-1.5 font-mono text-[10px]">Esc</kbd> đóng
            </p>
          </div>
          <button
            type="button"
            tabIndex={-1}
            onClick={props.onClose}
            className="rounded-full p-2 text-apple-tertiary hover:bg-black/[0.05] hover:text-apple-label"
            aria-label="Đóng (hoặc phím Esc)"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-apple-secondary">
              AWB (11 số)
            </label>
            <input
              ref={awbRef}
              type="text"
              inputMode="numeric"
              placeholder="VD: 78420042005"
              value={awbRaw}
              onChange={(e) => setAwbRaw(e.target.value.replace(/\D/g, "").slice(0, 11))}
              onKeyDown={(e) => handleEnterAdvance(e, "field")}
              className="w-full rounded-2xl border border-black/[0.08] bg-white px-4 py-3 font-mono text-lg font-semibold tracking-wide text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
            />
            {awbRaw.length > 0 && (
              <p className={`mt-1.5 font-mono text-sm font-bold ${awbValid && !awbConflict ? "text-emerald-600" : "text-amber-600"}`}>
                {awbDisplay}
                {!awbValid && (
                  <span className="ml-2 font-sans text-xs font-normal text-apple-tertiary">({awbDigits.length}/11 số)</span>
                )}
                {awbValid && awbConflict && (
                  <span className="ml-2 font-sans text-xs font-bold text-red-600">Đã có lô khác dùng số này</span>
                )}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Chuyến bay
              </label>
              <input
                ref={flightRef}
                type="text"
                placeholder="VD: MH751"
                value={flight}
                onChange={(e) => setFlight(e.target.value.toUpperCase())}
                onKeyDown={(e) => handleEnterAdvance(e, "field")}
                className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-semibold uppercase text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Ngày bay
              </label>
              <input
                ref={flightDateRef}
                type="date"
                value={flightDate}
                onChange={(e) => {
                  setFlightDate(e.target.value);
                  if (!cutoffDate) setCutoffDate(e.target.value);
                }}
                onKeyDown={(e) => handleEnterAdvance(e, "field")}
                className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Ngày cutoff
              </label>
              <input
                ref={cutoffDateRef}
                type="date"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                onKeyDown={(e) => handleEnterAdvance(e, "field")}
                className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Giờ cutoff (24h)
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  ref={cutoffHourRef}
                  value={cutoffHour}
                  onChange={(e) => setCutoffHour(e.target.value)}
                  onKeyDown={(e) => handleEnterAdvance(e, "field")}
                  className="min-w-0 flex-1 rounded-2xl border border-black/[0.08] bg-white px-2 py-2.5 font-mono text-sm font-bold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                  aria-label="Giờ cutoff 0–23 (mũi tên chọn, Enter sang phút)"
                >
                  <option value="">—</option>
                  {HOURS_24.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="font-mono text-lg font-semibold text-apple-tertiary">:</span>
                <select
                  ref={cutoffMinuteRef}
                  value={cutoffMinute}
                  onChange={(e) => setCutoffMinute(e.target.value)}
                  onKeyDown={(e) => handleEnterAdvance(e, "field")}
                  className="min-w-0 flex-1 rounded-2xl border border-black/[0.08] bg-white px-2 py-2.5 font-mono text-sm font-bold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                  aria-label="Phút cutoff 0–59 (Enter sang DEST)"
                >
                  <option value="">—</option>
                  {MINUTES_60.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-[11px] text-apple-tertiary">
                24 giờ — dùng ↑↓ trong ô giờ/phút, <span className="font-semibold text-apple-secondary">Enter</span> sang ô kế
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div ref={destRef} className="relative">
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Điểm đến (DEST)
              </label>
              <p className="mb-1 text-[11px] text-apple-tertiary">Gõ mã tùy ý hoặc chọn gợi ý.</p>
              <div
                className={`flex min-h-[42px] flex-wrap items-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-3 py-2 transition-colors ${
                  showDestList ? "border-apple-blue ring-2 ring-apple-blue/20" : ""
                }`}
              >
                {dest && (
                  <span className="shrink-0 rounded-full bg-apple-label px-2.5 py-1 text-xs font-semibold text-white">
                    {dest}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        setDest("");
                        setDestSearch("");
                      }}
                      className="ml-1.5 text-white/70 hover:text-white"
                    >
                      ×
                    </button>
                  </span>
                )}
                <input
                  ref={destInputRef}
                  type="text"
                  placeholder={dest ? "" : "VD: KUL hoặc gõ mã mới…"}
                  value={destSearch}
                  onChange={(e) => {
                    setDestSearch(e.target.value.toUpperCase());
                    setShowDestList(true);
                  }}
                  onFocus={() => setShowDestList(true)}
                  onKeyDown={(e) => handleEnterAdvance(e, "field")}
                  className="min-w-[6rem] flex-1 bg-transparent text-sm font-semibold uppercase text-apple-label placeholder:text-apple-tertiary focus:outline-none"
                />
              </div>
              {showDestList && (
                <div className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-y-auto rounded-2xl border border-black/[0.08] bg-white py-1 shadow-xl">
                  {canUseTypedDest && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        setDest(destSearchTrim);
                        setDestSearch("");
                        setShowDestList(false);
                      }}
                      className="block w-full border-b border-black/[0.06] bg-apple-blue/10 px-4 py-2.5 text-left text-sm font-semibold text-apple-blue hover:bg-apple-blue/15"
                    >
                      + Dùng mã «{destSearchTrim}»
                    </button>
                  )}
                  {filteredDests.length > 0 ? (
                    filteredDests.map((d) => (
                      <button
                        key={d}
                        type="button"
                        tabIndex={-1}
                        onClick={() => {
                          setDest(d);
                          setDestSearch("");
                          setShowDestList(false);
                        }}
                        className={`block w-full px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                          dest === d ? "bg-apple-blue/10 text-apple-blue" : "text-apple-label hover:bg-black/[0.03]"
                        }`}
                      >
                        {d}
                      </button>
                    ))
                  ) : (
                    !canUseTypedDest && (
                      <p className="px-4 py-3 text-xs text-apple-tertiary">Gõ mã DEST hoặc chọn từ danh sách</p>
                    )
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Kho hàng
              </label>
              <select
                ref={warehouseRef}
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value as Warehouse)}
                onKeyDown={(e) => handleEnterAdvance(e, "field")}
                className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-bold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                aria-label="Kho hàng (↑↓ chọn, Enter sang khách hàng)"
              >
                {WAREHOUSES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div ref={customerRef} className="relative">
            <label className="mb-1 block text-xs font-semibold text-apple-secondary">
              Khách hàng
            </label>
            <p className="mb-1 text-[11px] text-apple-tertiary">
              Gõ tên mới rồi lưu — hệ thống tự nhớ lần sau.
            </p>
            <div
              className={`flex items-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 transition-colors ${
                showCustomerList ? "border-apple-blue ring-2 ring-apple-blue/20" : ""
              }`}
            >
              {customer && (
                <span className="shrink-0 rounded-full bg-apple-label px-2.5 py-1 text-xs font-semibold text-white">
                  {customer}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setCustomer("");
                      setCustomerSearch("");
                    }}
                    className="ml-1.5 text-white/70 hover:text-white"
                  >
                    ×
                  </button>
                </span>
              )}
              <input
                ref={customerInputRef}
                type="text"
                placeholder={customer ? "" : "Tìm, chọn hoặc gõ tên khách mới..."}
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerList(true);
                }}
                onFocus={() => setShowCustomerList(true)}
                onKeyDown={(e) => handleEnterAdvance(e, "customer")}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-apple-label placeholder:text-apple-tertiary focus:outline-none"
              />
            </div>
            {showCustomerList && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-2xl border border-black/[0.08] bg-white py-1 shadow-xl">
                {canUseTypedCustomer && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setCustomer(searchTrim);
                      setCustomerSearch("");
                      setShowCustomerList(false);
                    }}
                    className="block w-full border-b border-black/[0.06] bg-apple-blue/10 px-4 py-2.5 text-left text-sm font-semibold text-apple-blue hover:bg-apple-blue/15"
                  >
                    + Dùng tên mới «{searchTrim}» (sẽ được lưu)
                  </button>
                )}
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((c) => (
                    <button
                      key={c}
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        setCustomer(c);
                        setCustomerSearch("");
                        setShowCustomerList(false);
                      }}
                      className={`block w-full px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                        customer === c ? "bg-apple-blue/10 text-apple-blue" : "text-apple-label hover:bg-black/[0.03]"
                      }`}
                    >
                      {c}
                    </button>
                  ))
                ) : (
                  !canUseTypedCustomer && (
                    <p className="px-4 py-3 text-xs text-apple-tertiary">Không tìm thấy — gõ tên khách mới</p>
                  )
                )}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="booking-note" className="mb-1 block text-xs font-semibold text-apple-secondary">
              Note
            </label>
            <p className="mb-1 text-[11px] text-apple-tertiary">Ghi chú thêm cho lô (tùy chọn).</p>
            <textarea
              id="booking-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="VD: hàng dễ vỡ, ưu tiên xuất kho…"
              className="w-full resize-y rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
            />
          </div>

          <div>
            <label htmlFor="booking-dim-kg" className="mb-1 block text-xs font-semibold text-apple-secondary">
              Dimensional weight (kg)
            </label>
            <p className="mb-1 text-[11px] text-apple-tertiary">Trọng lượng thể tích — tùy chọn.</p>
            <input
              id="booking-dim-kg"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={dimKg}
              onChange={(e) => setDimKg(e.target.value)}
              placeholder="VD: 120.5"
              className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-black/[0.06] px-5 py-4">
          <button
            ref={submitBtnRef}
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-full bg-apple-blue px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-apple-blue-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-apple-tertiary disabled:text-white/80"
          >
            {isEdit ? "Lưu thay đổi" : "Thêm lô hàng"}
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full border border-black/[0.12] bg-white px-6 py-3.5 text-sm font-semibold text-apple-label hover:bg-black/[0.03]"
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}
