import { useCallback, useEffect, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import { initialShipments } from "../data/mockShipments";
import { loadRows } from "../utils/shipmentStorage";
import {
  addLocalDays,
  formatLocalSessionDate,
  parseSessionDateYmd,
  startOfLocalDay,
} from "../utils/sessionDate";
import { useShipmentSync } from "../hooks/useShipmentSync";
import { DesktopShipmentTable } from "./DesktopShipmentTable";
import { MobileShipmentCards, StickyMobileActions } from "./MobileShipmentCards";
import { ShipmentBookingForm } from "./ShipmentBookingForm";
import { downloadDayReportExcel } from "../utils/exportDayReportExcel";

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
  const fallback = useMemo(() => ({ rows: loadRows() ?? initialShipments }), []);

  const { status, state, mutate, socketConnected } = useShipmentSync(fallback);
  const [selectedViewDate, setSelectedViewDate] = useState(() => startOfLocalDay(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);

  const selectedYmd = formatLocalSessionDate(selectedViewDate);
  const todayYmd = formatLocalSessionDate(startOfLocalDay(new Date()));
  const isViewingToday = selectedYmd === todayYmd;

  const allRows = state?.rows ?? [];
  const viewRows = useMemo(
    () => allRows.filter((r) => r.sessionDate === selectedYmd),
    [allRows, selectedYmd]
  );

  const daysWithData = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) s.add(r.sessionDate);
    return s.size;
  }, [allRows]);

  useEffect(() => {
    setSelectedId((s) => (s && viewRows.some((r) => r.id === s) ? s : null));
  }, [viewRows]);

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

  const totalPcs = viewRows.reduce((s, r) => s + (r.pcs ?? 0), 0);
  const totalKg = viewRows.reduce((s, r) => s + (r.kg ?? 0), 0);

  const workDateLabel = formatWorkDateLabel(selectedViewDate);

  const goPrevDay = () => setSelectedViewDate((d) => startOfLocalDay(addLocalDays(d, -1)));
  const goNextDay = () => setSelectedViewDate((d) => startOfLocalDay(addLocalDays(d, 1)));
  const goToday = () => setSelectedViewDate(startOfLocalDay(new Date()));

  const onDownloadDayExcel = useCallback(() => {
    downloadDayReportExcel(viewRows, selectedYmd);
  }, [viewRows, selectedYmd]);

  const openEdit = useCallback((s: Shipment) => {
    setShowForm(false);
    setSelectedId(null);
    setEditingShipment(s);
  }, []);

  const selected = viewRows.find((r) => r.id === selectedId) ?? null;

  if (status === "loading" || !state) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-16 text-center text-slate-600">
        <p className="font-semibold text-slate-800">Đang tải dữ liệu…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              CẬP NHẬT HÀNG LÊN SÂN BAY
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Phiên bảng theo ngày — chọn ngày để xem / nhập. Hôm sau mở{" "}
              <span className="font-semibold text-slate-700">Hôm nay</span> để có bảng mới (dữ liệu cũ vẫn lưu).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onDownloadDayExcel}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 shadow-sm hover:bg-emerald-100"
                title="Tải báo cáo các lô của ngày đang xem (Excel)"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Tải Excel (ngày này)
              </button>
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={goPrevDay}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  aria-label="Ngày trước"
                >
                  ‹
                </button>
                <input
                  type="date"
                  value={selectedYmd}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setSelectedViewDate(startOfLocalDay(parseSessionDateYmd(v)));
                  }}
                  className="rounded-lg border-0 bg-transparent px-2 py-1 font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                />
                <button
                  type="button"
                  onClick={goNextDay}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  aria-label="Ngày sau"
                >
                  ›
                </button>
              </div>
              <button
                type="button"
                onClick={goToday}
                disabled={isViewingToday}
                className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Hôm nay
              </button>
              {!isViewingToday && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200">
                  Đang xem ngày đã qua — vẫn có thể sửa / thêm lô cho ngày này
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-medium text-slate-600">
              Đang xem: <span className="font-bold text-slate-800">{workDateLabel}</span>
              {daysWithData > 0 && (
                <span className="ml-2 text-slate-400">
                  · {allRows.length} lô trên {daysWithData} ngày có dữ liệu
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SyncBadge status={status} socketConnected={socketConnected} />
            <StatPill label="Tổng lô (ngày này)" value={viewRows.length} />
            <StatPill label="Kiện" value={totalPcs} />
            <StatPill label="Kg" value={totalKg.toLocaleString()} />
            <button
              type="button"
              onClick={() => {
                setEditingShipment(null);
                setShowForm(true);
              }}
              className="hidden rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] md:inline-flex md:items-center md:gap-1.5"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nhập booking
            </button>
          </div>
        </div>

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

      {viewRows.length === 0 && (
        <div className="mb-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-600">
          <p className="font-bold text-slate-800">
            {isViewingToday ? "Bảng hôm nay đang trống" : "Không có lô cho ngày này"}
          </p>
          <p className="mt-1 text-sm">
            {isViewingToday ? (
              <>
                Bấm <span className="font-semibold text-emerald-700">Nhập booking</span> để thêm lô cho hôm nay.
              </>
            ) : (
              <>
                Có thể <span className="font-semibold text-emerald-700">Nhập booking</span> để bổ sung lô cho ngày đang
                xem, hoặc chọn ngày khác.
              </>
            )}
          </p>
        </div>
      )}

      <DesktopShipmentTable
        rows={viewRows}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onPrint={onRequestPrint}
        onEdit={openEdit}
      />

      <MobileShipmentCards
        rows={viewRows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onPrint={onRequestPrint}
        onEdit={openEdit}
      />

      <StickyMobileActions
        selected={selected}
        onDelete={() => selected && onDelete(selected.id)}
        onPrint={() => selected && onRequestPrint(selected)}
        onAdd={() => {
          setEditingShipment(null);
          setShowForm(true);
        }}
        onEdit={() => selected && openEdit(selected)}
      />

      {showForm && (
        <ShipmentBookingForm
          sessionDateYmd={selectedYmd}
          allRows={allRows}
          onAdd={onAdd}
          onClose={() => setShowForm(false)}
        />
      )}

      {editingShipment && (
        <ShipmentBookingForm
          mode="edit"
          sessionDateYmd={editingShipment.sessionDate}
          allRows={allRows}
          shipment={editingShipment}
          onSave={(patch) => onUpdate(editingShipment.id, patch)}
          onClose={() => setEditingShipment(null)}
        />
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
