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
      <div className="mx-auto max-w-[1600px] px-4 py-16 text-center text-apple-secondary">
        <p className="font-semibold text-apple-label">Đang tải dữ liệu…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-apple-label sm:text-[1.75rem] sm:leading-tight">
              Hàng lên sân bay
            </h1>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-apple-secondary">
              Bảng theo ngày — chọn ngày để xem hoặc nhập. Mỗi ngày một phiên; dữ liệu các ngày trước vẫn được lưu.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onDownloadDayExcel}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3.5 py-2 text-xs font-semibold text-apple-label shadow-apple transition-colors hover:bg-black/[0.03]"
                title="Tải báo cáo các lô của ngày đang xem (Excel)"
              >
                <svg className="h-4 w-4 shrink-0 text-apple-blue" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Tải Excel
              </button>
              <div className="inline-flex items-center gap-0.5 rounded-full border border-black/[0.08] bg-white p-0.5 shadow-apple">
                <button
                  type="button"
                  onClick={goPrevDay}
                  className="rounded-full px-3 py-2 text-sm font-semibold text-apple-label hover:bg-black/[0.05]"
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
                  className="rounded-full border-0 bg-transparent px-2 py-1.5 font-mono text-sm font-semibold text-apple-label focus:outline-none focus:ring-2 focus:ring-apple-blue/25"
                />
                <button
                  type="button"
                  onClick={goNextDay}
                  className="rounded-full px-3 py-2 text-sm font-semibold text-apple-label hover:bg-black/[0.05]"
                  aria-label="Ngày sau"
                >
                  ›
                </button>
              </div>
              <button
                type="button"
                onClick={goToday}
                disabled={isViewingToday}
                className="rounded-full bg-apple-blue px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:bg-apple-tertiary disabled:text-white/80"
              >
                Hôm nay
              </button>
              {!isViewingToday && (
                <span className="rounded-full bg-amber-100/90 px-3 py-1.5 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/80">
                  Đang xem ngày khác — vẫn sửa / thêm lô được
                </span>
              )}
            </div>
            <p className="mt-3 text-sm text-apple-secondary">
              Đang xem{" "}
              <span className="font-semibold text-apple-label">{workDateLabel}</span>
              {daysWithData > 0 && (
                <span className="text-apple-tertiary">
                  {" "}
                  · {allRows.length} lô / {daysWithData} ngày có dữ liệu
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SyncBadge status={status} socketConnected={socketConnected} />
            <StatPill label="Lô" value={viewRows.length} />
            <StatPill label="Kiện" value={totalPcs} />
            <StatPill label="Kg" value={totalKg.toLocaleString()} />
            <button
              type="button"
              onClick={() => {
                setEditingShipment(null);
                setShowForm(true);
              }}
              className="hidden rounded-full bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-apple-blue-hover active:scale-[0.98] md:inline-flex md:items-center md:gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nhập booking
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold text-apple-secondary">
          <Legend color="bg-amber-400" label="BOOKING" />
          <Legend color="bg-emerald-500" label="Đã nhận" />
          <Legend color="bg-orange-500" label="Sắp trễ" />
          <Legend color="bg-red-500" label="Hàng gấp" />
          <Legend color="bg-sky-500" label="Đã xong" />
          <Legend color="bg-violet-500" label="Đã kéo OLA" />
          <Legend color="bg-neutral-400" label="Hoàn thành" />
        </div>
      </header>

      {viewRows.length === 0 && (
        <div className="mb-8 rounded-apple-lg border border-dashed border-black/[0.12] bg-white/60 px-5 py-12 text-center shadow-apple backdrop-blur-sm">
          <p className="text-[17px] font-semibold text-apple-label">
            {isViewingToday ? "Hôm nay chưa có lô" : "Không có lô cho ngày này"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-apple-secondary">
            {isViewingToday ? (
              <>
                Chọn <span className="font-semibold text-apple-blue">Nhập booking</span> (máy tính) hoặc nút dưới cùng (điện thoại) để thêm lô.
              </>
            ) : (
              <>
                Bạn có thể <span className="font-semibold text-apple-blue">Nhập booking</span> cho ngày đang xem, hoặc đổi ngày.
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
        className="rounded-full bg-black/[0.06] px-3 py-1.5 text-[11px] font-semibold text-apple-secondary"
        title="Không kết nối máy chủ — dữ liệu chỉ lưu trên trình duyệt này"
      >
        Chỉ máy này
      </span>
    );
  }
  if (status === "degraded" || !socketConnected) {
    return (
      <span
        className="rounded-full bg-amber-100/90 px-3 py-1.5 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/80"
        title="Máy chủ OK nhưng kênh realtime đang ngắt — thay đổi vẫn gửi được; F5 nếu không thấy cập nhật từ người khác"
      >
        Đồng bộ hạn chế
      </span>
    );
  }
  return (
    <span
      className="rounded-full bg-emerald-100/90 px-3 py-1.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/80"
      title="Đang nhận cập nhật tức thì từ các máy khác"
    >
      Realtime
    </span>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/90 px-3 py-2 text-sm shadow-apple backdrop-blur-sm">
      <span className="text-apple-secondary">{label}</span>{" "}
      <span className="font-semibold tabular-nums text-apple-label">{value}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/90 px-3 py-1.5 shadow-apple backdrop-blur-sm">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
