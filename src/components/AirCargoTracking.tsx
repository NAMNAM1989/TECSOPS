import { useCallback, useEffect, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import { initialShipments } from "../data/mockShipments";
import { loadRows, loadWorkDate } from "../utils/shipmentStorage";
import { useShipmentSync } from "../hooks/useShipmentSync";
import { DesktopShipmentTable } from "./DesktopShipmentTable";
import { MobileShipmentCards, StickyMobileActions } from "./MobileShipmentCards";
import { AddShipmentForm } from "./AddShipmentForm";

interface AirCargoTrackingProps {
  onRequestPrint: (s: Shipment) => void;
}

function formatWorkDateLabel(d: Date): string {
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

export function AirCargoTracking({ onRequestPrint }: AirCargoTrackingProps) {
  const fallback = useMemo(
    () => ({
      rows: loadRows() ?? initialShipments,
      workDateIso: (loadWorkDate() ?? new Date()).toISOString(),
    }),
    []
  );

  const { status, state, mutate, socketConnected } = useShipmentSync(fallback);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const rows = state?.rows ?? [];
  const workDate = state ? new Date(state.workDateIso) : new Date();

  useEffect(() => {
    setSelectedId((s) => (s && !rows.some((r) => r.id === s) ? null : s));
  }, [rows]);

  const runMutate = useCallback(
    async (cmd: Parameters<typeof mutate>[0]) => {
      try {
        await mutate(cmd);
      } catch (e) {
        console.error(e);
        window.alert(e instanceof Error ? e.message : "Không gửi được thay đổi lên máy chủ.");
      }
    },
    [mutate]
  );

  const onUpdate = useCallback(
    (id: string, patch: Partial<Shipment>) => {
      void runMutate({ action: "UPDATE", id, patch });
    },
    [runMutate]
  );

  const onDelete = useCallback(
    (id: string) => {
      void runMutate({ action: "DELETE", id });
    },
    [runMutate]
  );

  const onAdd = useCallback(
    (data: Omit<Shipment, "id" | "stt">) => {
      void runMutate({ action: "ADD", shipment: data });
    },
    [runMutate]
  );

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
    void runMutate({ action: "CLEAR_DAY" });
    setSelectedId(null);
  }, [rows.length, workDateLabel, runMutate]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  if (status === "loading" || !state) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-16 text-center text-slate-600">
        <p className="font-semibold text-slate-800">Đang tải dữ liệu…</p>
      </div>
    );
  }

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
            <SyncBadge status={status} socketConnected={socketConnected} />
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
          <Legend color="bg-yellow-400" label="BOOKING" />
          <Legend color="bg-green-500" label="Đã nhận" />
          <Legend color="bg-orange-500" label="Sắp trễ" />
          <Legend color="bg-red-600" label="Hàng gấp" />
          <Legend color="bg-blue-500" label="Đã xong" />
          <Legend color="bg-violet-500" label="Đã kéo OLA" />
          <Legend color="bg-gray-400" label="Hoàn thành" />
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

      <DesktopShipmentTable
        rows={rows}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onPrint={onRequestPrint}
      />

      <MobileShipmentCards
        rows={rows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onPrint={onRequestPrint}
      />

      <StickyMobileActions
        selected={selected}
        onDelete={() => selected && onDelete(selected.id)}
        onPrint={() => selected && onRequestPrint(selected)}
        onAdd={() => setShowForm(true)}
        onClearDay={clearBoardForNewDay}
        canClearDay={rows.length > 0}
      />

      {showForm && (
        <AddShipmentForm onAdd={onAdd} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}

function SyncBadge({
  status,
  socketConnected,
}: {
  status: "live" | "degraded" | "offline";
  socketConnected: boolean;
}) {
  if (status === "offline") {
    return (
      <span
        className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700"
        title="Không kết nối máy chủ — dữ liệu chỉ lưu trên trình duyệt này"
      >
        Chỉ máy này
      </span>
    );
  }
  if (status === "degraded" || !socketConnected) {
    return (
      <span
        className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 ring-1 ring-amber-300/80"
        title="Máy chủ OK nhưng kênh realtime đang ngắt — thay đổi vẫn gửi được; F5 nếu không thấy cập nhật từ người khác"
      >
        Đồng bộ hạn chế
      </span>
    );
  }
  return (
    <span
      className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900 ring-1 ring-emerald-300/80"
      title="Đang nhận cập nhật tức thì từ các máy khác"
    >
      Realtime
    </span>
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
