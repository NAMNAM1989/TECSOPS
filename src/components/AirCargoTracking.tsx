import { useCallback, useState } from "react";
import type { Shipment } from "../types/shipment";
import { initialShipments } from "../data/mockShipments";
import { DesktopShipmentTable } from "./DesktopShipmentTable";
import { MobileShipmentCards, StickyMobileActions } from "./MobileShipmentCards";
import { AddShipmentForm } from "./AddShipmentForm";

interface AirCargoTrackingProps {
  onRequestPrint: (s: Shipment) => void;
}

let nextId = 100;

function formatWorkDateLabel(d: Date): string {
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

export function AirCargoTracking({ onRequestPrint }: AirCargoTrackingProps) {
  const [rows, setRows] = useState<Shipment[]>(initialShipments);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  /** Ngày làm việc hiển thị trên bảng; đổi khi bấm “xóa bảng ngày này” để bắt đầu phiên mới */
  const [workDate, setWorkDate] = useState(() => new Date());

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const onUpdate = useCallback((id: string, patch: Partial<Shipment>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const onDelete = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const onAdd = useCallback((data: Omit<Shipment, "id" | "stt">) => {
    setRows((prev) => {
      const whGroup = prev.filter((r) => r.warehouse === data.warehouse);
      const stt = whGroup.length + 1;
      const id = `new-${++nextId}`;
      return [...prev, { ...data, id, stt }];
    });
  }, []);

  const totalPcs = rows.reduce((s, r) => s + (r.pcs ?? 0), 0);
  const totalKg = rows.reduce((s, r) => s + (r.kg ?? 0), 0);

  const workDateLabel = formatWorkDateLabel(workDate);

  const clearBoardForNewDay = useCallback(() => {
    if (rows.length === 0) return;
    const ok = window.confirm(
      `Xóa toàn bộ ${rows.length} lô hàng của ngày ${workDateLabel}?\n\n` +
        "Dùng khi đã xong việc hôm nay và ngày mai nhập bảng mới. Thao tác không hoàn tác."
    );
    if (!ok) return;
    setRows([]);
    setSelectedId(null);
    setWorkDate(new Date());
  }, [rows.length, workDateLabel]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              CẬP NHẬT HÀNG LÊN SÂN BAY
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Ngày làm việc{" "}
              <span className="font-bold text-slate-700">{workDateLabel}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatPill label="Tổng lô" value={rows.length} />
            <StatPill label="Kiện" value={totalPcs} />
            <StatPill label="Kg" value={totalKg.toLocaleString()} />
            <button
              type="button"
              onClick={clearBoardForNewDay}
              disabled={rows.length === 0}
              title="Xóa hết lô trong bảng để nhập ngày mới"
              className="rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 shadow-sm hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 md:px-4"
            >
              Xóa bảng ngày này
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="hidden rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] md:inline-flex md:items-center md:gap-1.5"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nhập booking
            </button>
          </div>
        </div>

        {/* Chú thích màu */}
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold">
          <Legend color="bg-yellow-400" label="Chờ hàng" />
          <Legend color="bg-green-500" label="Đã nhận" />
          <Legend color="bg-orange-500" label="Sắp trễ" />
          <Legend color="bg-red-600" label="Quá giờ" />
          <Legend color="bg-blue-500" label="Đã đóng" />
          <Legend color="bg-violet-500" label="Đã bay" />
          <Legend color="bg-gray-400" label="Đã giao" />
        </div>
      </header>

      {rows.length === 0 && (
        <div className="mb-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-600">
          <p className="font-bold text-slate-800">Bảng trống — sẵn sàng cho ngày mới</p>
          <p className="mt-1 text-sm">
            Bấm <span className="font-semibold text-emerald-700">Nhập booking</span> để thêm lô hàng.
          </p>
        </div>
      )}

      {/* Desktop table */}
      <DesktopShipmentTable
        rows={rows}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onPrint={onRequestPrint}
      />

      {/* Mobile cards */}
      <MobileShipmentCards
        rows={rows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onPrint={onRequestPrint}
      />

      {/* Mobile sticky bar */}
      <StickyMobileActions
        selected={selected}
        onDelete={() => selected && onDelete(selected.id)}
        onPrint={() => selected && onRequestPrint(selected)}
        onAdd={() => setShowForm(true)}
        onClearDay={clearBoardForNewDay}
        canClearDay={rows.length > 0}
      />

      {/* Form nhập liệu */}
      {showForm && (
        <AddShipmentForm onAdd={onAdd} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm">
      <span className="text-slate-500">{label}</span>{" "}
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200/80">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
