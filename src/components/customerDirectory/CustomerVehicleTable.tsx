import { Fragment, useState } from "react";
import type { CustomerSavedVehicle } from "../../types/customerDirectory";
import { formatVehicleLicensePlate } from "../../utils/customerVehicleCore";

const inputCls =
  "w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/15";

function StarButton({ active, onClick, title }: { active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-lg px-1.5 py-0.5 text-base leading-none transition ${
        active ? "text-amber-500" : "text-apple-tertiary hover:text-amber-600"
      }`}
      aria-label={title}
      aria-pressed={active}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

type Props = {
  vehicles: readonly CustomerSavedVehicle[];
  defaultVehicleId?: string;
  onSetDefault: (id: string) => void;
  onPatch: (index: number, patch: Partial<CustomerSavedVehicle>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

/** Bảng xe / tài xế — ★ mặc định cho eCargo. */
export function CustomerVehicleTable({
  vehicles,
  defaultVehicleId,
  onSetDefault,
  onPatch,
  onRemove,
  onAdd,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      {vehicles.length === 0 ? (
        <p className="mb-2 rounded-xl border border-dashed border-black/[0.12] bg-white/80 px-3 py-4 text-center text-xs text-apple-tertiary">
          Chưa có xe / tài xế lưu sẵn.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[0.08] bg-white">
          <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-black/[0.08] bg-apple-bg/80 text-[10px] font-semibold uppercase text-apple-tertiary">
                <th className="w-10 px-2 py-1.5">MĐ</th>
                <th className="px-2 py-1.5">Biển số</th>
                <th className="px-2 py-1.5">Tài xế</th>
                <th className="px-2 py-1.5">CCCD</th>
                <th className="w-20 px-2 py-1.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v, idx) => {
                const expanded = expandedId === v.id;
                return (
                  <Fragment key={v.id}>
                    <tr className="border-b border-black/[0.06] hover:bg-apple-bg/30">
                      <td className="px-2 py-1.5 align-middle">
                        <StarButton
                          active={defaultVehicleId === v.id}
                          onClick={() => onSetDefault(v.id)}
                          title="Xe mặc định khi bấm eCargo"
                        />
                      </td>
                      <td className="max-w-[8rem] truncate px-2 py-1.5 font-mono font-bold uppercase text-apple-label">
                        {v.licensePlate || "—"}
                      </td>
                      <td className="max-w-[10rem] truncate px-2 py-1.5 font-medium text-apple-label">
                        {v.driverName || "—"}
                      </td>
                      <td className="max-w-[8rem] truncate px-2 py-1.5 tabular-nums text-apple-secondary">
                        {v.driverId || "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right align-middle">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : v.id)}
                          className="mr-0.5 rounded-lg px-2 py-1 text-[10px] font-semibold text-apple-blue hover:bg-apple-blue/10"
                        >
                          {expanded ? "Thu" : "Sửa"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(idx)}
                          className="rounded-lg px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={5} className="bg-apple-bg/40 px-3 py-2.5">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              className={`${inputCls} font-mono uppercase`}
                              placeholder="Biển số xe (VD: 50H17480)"
                              value={v.licensePlate}
                              onChange={(e) => onPatch(idx, { licensePlate: e.target.value })}
                              onBlur={(e) =>
                                onPatch(idx, { licensePlate: formatVehicleLicensePlate(e.target.value) })
                              }
                            />
                            <input
                              className={inputCls}
                              placeholder="Tên tài xế"
                              value={v.driverName}
                              onChange={(e) => onPatch(idx, { driverName: e.target.value })}
                            />
                            <input
                              className={`${inputCls} sm:col-span-2 font-mono`}
                              placeholder="CCCD / CMND"
                              inputMode="numeric"
                              value={v.driverId}
                              onChange={(e) => onPatch(idx, { driverId: e.target.value.replace(/\D/g, "") })}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 w-full rounded-full border border-dashed border-apple-blue/40 bg-white py-2 text-xs font-semibold text-apple-blue hover:bg-apple-blue/5"
      >
        + Thêm xe / tài xế
      </button>
    </div>
  );
}
