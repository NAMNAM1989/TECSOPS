import { useState, useRef, useEffect } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import { formatAwb, rawAwbDigits } from "../utils/awbFormat";
import { CUSTOMERS, WAREHOUSES, DESTINATIONS } from "../data/customers";

interface AddShipmentFormProps {
  onAdd: (shipment: Omit<Shipment, "id" | "stt">) => void;
  onClose: () => void;
}

export function AddShipmentForm({ onAdd, onClose }: AddShipmentFormProps) {
  const [awbRaw, setAwbRaw] = useState("");
  const [flight, setFlight] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [cutoffTime, setCutoffTime] = useState("");
  const [cutoffDate, setCutoffDate] = useState("");
  const [dest, setDest] = useState("");
  const [warehouse, setWarehouse] = useState<Warehouse>("TECS-TCS");
  const [customer, setCustomer] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerList, setShowCustomerList] = useState(false);

  const awbRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    awbRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!customerRef.current?.contains(e.target as Node)) {
        setShowCustomerList(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredCustomers = CUSTOMERS.filter((c) =>
    c.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const awbDisplay = formatAwb(awbRaw);
  const awbDigits = rawAwbDigits(awbRaw);
  const awbValid = awbDigits.length === 11;

  function buildCutoffIso(): string {
    if (!cutoffTime || !cutoffDate) return "";
    const [y, mo, d] = cutoffDate.split("-").map(Number);
    const [h, m] = cutoffTime.split(":").map(Number);
    return new Date(y, mo - 1, d, h, m).toISOString();
  }

  function formatFlightDate(): string {
    if (!flightDate) return "";
    const d = new Date(flightDate);
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return `${day}${months[d.getMonth()]}`;
  }

  const canSubmit = awbValid && flight && flightDate && dest && warehouse && customer;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    onAdd({
      awb: awbDisplay,
      flight: flight.toUpperCase(),
      flightDate: formatFlightDate(),
      cutoff: buildCutoffIso(),
      cutoffNote: "",
      dest: dest.toUpperCase(),
      warehouse,
      pcs: null,
      kg: null,
      customer,
      status: "PENDING",
    });

    setAwbRaw("");
    setFlight("");
    setFlightDate("");
    setCutoffTime("");
    setCutoffDate("");
    setDest("");
    setCustomer("");
    setCustomerSearch("");
    awbRef.current?.focus();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Title */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Nhập booking mới</h2>
            <p className="text-xs text-slate-500">Nhập AWB 11 số → tự format chuẩn IATA</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* AWB */}
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
              <p className={`mt-1.5 font-mono text-sm font-bold ${awbValid ? "text-emerald-600" : "text-amber-600"}`}>
                {awbDisplay}
                {!awbValid && <span className="ml-2 font-sans text-xs font-normal text-slate-400">({awbDigits.length}/11 số)</span>}
              </p>
            )}
          </div>

          {/* Flight + Flight Date */}
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

          {/* Cutoff Date + Time */}
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
                Giờ cutoff
              </label>
              <input
                type="time"
                value={cutoffTime}
                onChange={(e) => setCutoffTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
              />
            </div>
          </div>

          {/* DEST + Warehouse */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Điểm đến (DEST)
              </label>
              <select
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
              >
                <option value="">Chọn DEST</option>
                {DESTINATIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
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
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Customer dropdown */}
          <div ref={customerRef} className="relative">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Khách hàng
            </label>
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                showCustomerList
                  ? "border-sky-400 ring-2 ring-sky-400/30"
                  : "border-slate-200"
              }`}
            >
              {customer && (
                <span className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-white">
                  {customer}
                  <button
                    type="button"
                    onClick={() => { setCustomer(""); setCustomerSearch(""); }}
                    className="ml-1.5 text-slate-400 hover:text-white"
                  >
                    ×
                  </button>
                </span>
              )}
              <input
                type="text"
                placeholder={customer ? "" : "Tìm hoặc chọn khách hàng..."}
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
                        customer === c
                          ? "bg-sky-50 text-sky-800"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {c}
                    </button>
                  ))
                ) : (
                  <p className="px-4 py-3 text-xs text-slate-400">Không tìm thấy</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            Thêm lô hàng
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Đóng
          </button>
        </div>
      </form>
    </div>
  );
}
