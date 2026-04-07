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

  const awbRef = useRef<HTMLInputElement>(null);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    persistNewCustomer(effectiveCustomer, CUSTOMERS);
    setCustomerListVersion((v) => v + 1);

    const cutoff = buildCutoffIso();
    const payloadCommon = {
      awb: awbDisplay,
      flight: flight.toUpperCase(),
      flightDate: formatFlightDate(),
      cutoff,
      cutoffNote: isEdit ? editShipment!.cutoffNote : "",
      dest: effectiveDest.toUpperCase(),
      warehouse,
      pcs: isEdit ? editShipment!.pcs : null,
      kg: isEdit ? editShipment!.kg : null,
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
      awbRef.current?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              {isEdit ? "Sửa lô hàng" : "Nhập booking mới"}
            </h2>
            <p className="text-xs text-slate-500">
              Phiên ngày <span className="font-mono font-bold text-slate-700">{props.sessionDateYmd}</span>
              {isEdit && (
                <>
                  {" "}
                  · AWB 11 số, không trùng trong toàn hệ thống
                </>
              )}
              {!isEdit && " — AWB 11 số tự format IATA"}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
              AWB (11 số)
            </label>
            <input
              ref={awbRef}
              type="text"
              inputMode="numeric"
              placeholder="VD: 78420042005"
              value={awbRaw}
              onChange={(e) => setAwbRaw(e.target.value.replace(/\D/g, "").slice(0, 11))}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-lg font-bold tracking-wide text-slate-900 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
            />
            {awbRaw.length > 0 && (
              <p className={`mt-1.5 font-mono text-sm font-bold ${awbValid && !awbConflict ? "text-emerald-600" : "text-amber-600"}`}>
                {awbDisplay}
                {!awbValid && (
                  <span className="ml-2 font-sans text-xs font-normal text-slate-400">({awbDigits.length}/11 số)</span>
                )}
                {awbValid && awbConflict && (
                  <span className="ml-2 font-sans text-xs font-bold text-red-600">Đã có lô khác dùng số này</span>
                )}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Chuyến bay
              </label>
              <input
                type="text"
                placeholder="VD: MH751"
                value={flight}
                onChange={(e) => setFlight(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold uppercase text-slate-900 placeholder:text-slate-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Ngày bay
              </label>
              <input
                type="date"
                value={flightDate}
                onChange={(e) => {
                  setFlightDate(e.target.value);
                  if (!cutoffDate) setCutoffDate(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Ngày cutoff
              </label>
              <input
                type="date"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Giờ cutoff (24h)
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  value={cutoffHour}
                  onChange={(e) => setCutoffHour(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-2 py-2.5 font-mono text-sm font-bold text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                  aria-label="Giờ 0–23"
                >
                  <option value="">—</option>
                  {HOURS_24.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="font-mono text-lg font-bold text-slate-400">:</span>
                <select
                  value={cutoffMinute}
                  onChange={(e) => setCutoffMinute(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-2 py-2.5 font-mono text-sm font-bold text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                  aria-label="Phút 0–59"
                >
                  <option value="">—</option>
                  {MINUTES_60.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Định dạng 24 giờ (00–23 : 00–59)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div ref={destRef} className="relative">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Điểm đến (DEST)
              </label>
              <p className="mb-1 text-[11px] text-slate-400">Gõ mã tùy ý hoặc chọn gợi ý.</p>
              <div
                className={`flex min-h-[42px] flex-wrap items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                  showDestList ? "border-sky-400 ring-2 ring-sky-400/30" : "border-slate-200"
                }`}
              >
                {dest && (
                  <span className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-white">
                    {dest}
                    <button
                      type="button"
                      onClick={() => {
                        setDest("");
                        setDestSearch("");
                      }}
                      className="ml-1.5 text-slate-400 hover:text-white"
                    >
                      ×
                    </button>
                  </span>
                )}
                <input
                  type="text"
                  placeholder={dest ? "" : "VD: KUL hoặc gõ mã mới…"}
                  value={destSearch}
                  onChange={(e) => {
                    setDestSearch(e.target.value.toUpperCase());
                    setShowDestList(true);
                  }}
                  onFocus={() => setShowDestList(true)}
                  className="min-w-[6rem] flex-1 bg-transparent text-sm font-bold uppercase text-slate-900 placeholder:text-slate-300 focus:outline-none"
                />
              </div>
              {showDestList && (
                <div className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  {canUseTypedDest && (
                    <button
                      type="button"
                      onClick={() => {
                        setDest(destSearchTrim);
                        setDestSearch("");
                        setShowDestList(false);
                      }}
                      className="block w-full border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-left text-sm font-bold text-emerald-800 hover:bg-emerald-100"
                    >
                      + Dùng mã «{destSearchTrim}»
                    </button>
                  )}
                  {filteredDests.length > 0 ? (
                    filteredDests.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          setDest(d);
                          setDestSearch("");
                          setShowDestList(false);
                        }}
                        className={`block w-full px-4 py-2.5 text-left text-sm font-bold transition-colors ${
                          dest === d ? "bg-sky-50 text-sky-800" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {d}
                      </button>
                    ))
                  ) : (
                    !canUseTypedDest && (
                      <p className="px-4 py-3 text-xs text-slate-400">Gõ mã DEST hoặc chọn từ danh sách</p>
                    )
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Kho hàng
              </label>
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value as Warehouse)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
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
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Khách hàng
            </label>
            <p className="mb-1 text-[11px] text-slate-400">
              Gõ tên mới rồi lưu — hệ thống tự nhớ lần sau.
            </p>
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                showCustomerList ? "border-sky-400 ring-2 ring-sky-400/30" : "border-slate-200"
              }`}
            >
              {customer && (
                <span className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-white">
                  {customer}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomer("");
                      setCustomerSearch("");
                    }}
                    className="ml-1.5 text-slate-400 hover:text-white"
                  >
                    ×
                  </button>
                </span>
              )}
              <input
                type="text"
                placeholder={customer ? "" : "Tìm, chọn hoặc gõ tên khách mới..."}
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerList(true);
                }}
                onFocus={() => setShowCustomerList(true)}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none"
              />
            </div>
            {showCustomerList && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                {canUseTypedCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomer(searchTrim);
                      setCustomerSearch("");
                      setShowCustomerList(false);
                    }}
                    className="block w-full border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-left text-sm font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    + Dùng tên mới «{searchTrim}» (sẽ được lưu)
                  </button>
                )}
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCustomer(c);
                        setCustomerSearch("");
                        setShowCustomerList(false);
                      }}
                      className={`block w-full px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                        customer === c ? "bg-sky-50 text-sky-800" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {c}
                    </button>
                  ))
                ) : (
                  !canUseTypedCustomer && (
                    <p className="px-4 py-3 text-xs text-slate-400">Không tìm thấy — gõ tên khách mới</p>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {isEdit ? "Lưu thay đổi" : "Thêm lô hàng"}
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}
