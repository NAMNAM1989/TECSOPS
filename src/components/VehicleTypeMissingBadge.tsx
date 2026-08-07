import { useState } from "react";
import type {
  CustomerDirectoryEntry,
  CustomerSavedVehicle,
  CustomerVehicleType,
} from "../types/customerDirectory";
import { findCustomerEntry } from "../utils/customerBookingResolve";
import type { Shipment } from "../types/shipment";
import { trackAiEvent } from "../utils/aiOpsClient";

const VEHICLE_TYPES: { value: CustomerVehicleType; label: string }[] = [
  { value: "OTO", label: "Ô tô" },
  { value: "XEMAY", label: "Xe máy" },
  { value: "BAGAC", label: "Ba gác" },
  { value: "DIBO", label: "Đi bộ" },
];

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  onUpdateCustomers: (customers: CustomerDirectoryEntry[]) => Promise<boolean | void>;
};

function vehiclesMissingType(entry: CustomerDirectoryEntry | null | undefined) {
  return (entry?.savedVehicles ?? []).filter(
    (v) => !v.vehicleType || String(v.vehicleType).trim() === ""
  );
}

/**
 * Cảnh báo vàng khi khách của lô có xe chưa chọn loại — chọn nhanh tại chỗ.
 */
export function VehicleTypeMissingBadge({
  shipment,
  customerDirectory,
  onUpdateCustomers,
}: Props) {
  const entry = findCustomerEntry(shipment, customerDirectory);
  const missing = vehiclesMissingType(entry);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!entry || missing.length === 0) return null;

  const applyType = async (vehicle: CustomerSavedVehicle, type: CustomerVehicleType) => {
    setBusyId(vehicle.id);
    try {
      const next = customerDirectory.map((c) => {
        if (c.id !== entry.id) return c;
        return {
          ...c,
          savedVehicles: (c.savedVehicles ?? []).map((v) =>
            v.id === vehicle.id ? { ...v, vehicleType: type } : v
          ),
        };
      });
      const ok = await onUpdateCustomers(next);
      if (ok !== false) {
        trackAiEvent("vehicle.type.quick_update.ok", {
          vehicleType: type,
        });
        setOpen(false);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="relative shrink-0"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title="Phương tiện chưa được chọn loại xe."
        aria-label="Phương tiện chưa được chọn loại xe."
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-[12px] font-bold text-amber-700 ring-1 ring-amber-300 hover:bg-amber-200"
      >
        ⚠
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-amber-200 bg-white p-2 shadow-lg">
          <p className="mb-1.5 text-[10px] font-semibold text-amber-900">
            Chọn loại xe nhanh ({missing.length})
          </p>
          <ul className="space-y-1.5">
            {missing.map((v) => (
              <li key={v.id} className="rounded-lg bg-amber-50/80 px-1.5 py-1">
                <p className="truncate font-mono text-[10px] font-bold text-slate-800">
                  {v.licensePlate || "(không biển)"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {VEHICLE_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      disabled={busyId === v.id}
                      onClick={() => void applyType(v, t.value)}
                      className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
