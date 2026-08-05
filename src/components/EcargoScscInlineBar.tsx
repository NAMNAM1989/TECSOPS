import { useEffect, useMemo, useState } from "react";
import { isEcargoScscWarehouse } from "../constants/warehouses";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { EcargoVctRegisterModal } from "./EcargoVctRegisterModal";
import {
  ECARGO_SCSC_CHANGED_EVENT,
  ecargoScscProfileIsComplete,
  getActiveEcargoScscProfile,
} from "../utils/ecargoScscProfile";

type Props = {
  shipments: Shipment[];
  customers: CustomerDirectoryEntry[];
  preferredShipmentId?: string | null;
  compact?: boolean;
};

/** Nút eCargo — chỉ kho SCSC trực tiếp (không TECS-SCSC / TCS). */
export function EcargoScscInlineBar({
  shipments,
  customers,
  preferredShipmentId,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [complete, setComplete] = useState(() =>
    ecargoScscProfileIsComplete(getActiveEcargoScscProfile())
  );

  const scscShipments = useMemo(
    () => shipments.filter((s) => isEcargoScscWarehouse(s.warehouse)),
    [shipments],
  );

  useEffect(() => {
    const sync = () => setComplete(ecargoScscProfileIsComplete(getActiveEcargoScscProfile()));
    window.addEventListener(ECARGO_SCSC_CHANGED_EVENT, sync);
    return () => window.removeEventListener(ECARGO_SCSC_CHANGED_EVENT, sync);
  }, []);

  const btn =
    "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition active:scale-[0.98] border border-emerald-500/30 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";

  return (
    <>
      <button
        type="button"
        className={btn}
        title={
          complete
            ? "Đăng ký eCargo — chỉ lô kho SCSC"
            : "Đăng ký eCargo SCSC — cần lưu hồ sơ đại lý lần đầu"
        }
        onClick={() => setOpen(true)}
      >
        {compact ? "eCargo" : "Đăng ký eCargo"}
        {!complete ? <span className="text-amber-600">·</span> : null}
      </button>
      <EcargoVctRegisterModal
        open={open}
        onClose={() => setOpen(false)}
        shipments={scscShipments}
        customers={customers}
        preferredShipmentId={preferredShipmentId}
      />
    </>
  );
}
