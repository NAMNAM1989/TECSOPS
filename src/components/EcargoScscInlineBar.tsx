import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { isEcargoScscWarehouse } from "../constants/warehouses";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import {
  EcargoRegisterActionsProvider,
  useEcargoRegisterActions,
  type EcargoRegisterActions,
} from "./EcargoRegisterActionsContext";
import { EcargoVctRegisterModal } from "./EcargoVctRegisterModal";
import {
  ECARGO_SCSC_CHANGED_EVENT,
  ecargoScscProfileIsComplete,
  getActiveEcargoScscProfile,
} from "../utils/ecargoScscProfile";
import {
  pingTcsExtension,
  subscribeTcsExtensionReady,
  tcsExtPresence,
  tcsExtPresenceLabel,
  type TcsExtResult,
} from "../utils/tcsChromeExtension";

type HostProps = {
  shipments: Shipment[];
  customers: CustomerDirectoryEntry[];
  children: ReactNode;
};

/** Modal + state riêng — không làm re-render bảng Ops khi mở/đóng. */
function EcargoScscModalBridge({
  shipments,
  customers,
  apiRef,
}: {
  shipments: Shipment[];
  customers: CustomerDirectoryEntry[];
  apiRef: MutableRefObject<EcargoRegisterActions | null>;
}) {
  const [open, setOpen] = useState(false);
  const [preferredShipmentId, setPreferredShipmentId] = useState<string | null>(null);
  const [singleShipmentMode, setSingleShipmentMode] = useState(false);

  const scscShipments = useMemo(
    () => shipments.filter((s) => isEcargoScscWarehouse(s.warehouse)),
    [shipments],
  );

  const openForShipment = useCallback((shipmentId: string) => {
    setPreferredShipmentId(shipmentId);
    setSingleShipmentMode(true);
    setOpen(true);
  }, []);

  const openRegister = useCallback((preferred?: string | null) => {
    setPreferredShipmentId(preferred ?? null);
    setSingleShipmentMode(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    apiRef.current = { openForShipment, openRegister };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, openForShipment, openRegister]);

  return (
    <EcargoVctRegisterModal
      open={open}
      onClose={() => {
        setOpen(false);
      }}
      shipments={scscShipments}
      customers={customers}
      preferredShipmentId={preferredShipmentId}
      singleShipmentMode={singleShipmentMode}
    />
  );
}

/**
 * Host 1 modal eCargo cho toàn Ops — toolbar + nút từng lô dùng chung context.
 */
export function EcargoScscProvider({ shipments, customers, children }: HostProps) {
  const apiRef = useRef<EcargoRegisterActions | null>(null);
  const api = useMemo<EcargoRegisterActions>(
    () => ({
      openForShipment: (shipmentId) => apiRef.current?.openForShipment(shipmentId),
      openRegister: (preferred) => apiRef.current?.openRegister(preferred),
    }),
    [],
  );

  return (
    <EcargoRegisterActionsProvider value={api}>
      {children}
      <EcargoScscModalBridge
        shipments={shipments}
        customers={customers}
        apiRef={apiRef}
      />
    </EcargoRegisterActionsProvider>
  );
}

type BarProps = {
  preferredShipmentId?: string | null;
  compact?: boolean;
};

/** Nút eCargo trên toolbar kho SCSC — mở modal chọn AWB. */
export function EcargoScscInlineBar({ preferredShipmentId, compact = false }: BarProps) {
  const api = useEcargoRegisterActions();
  const [complete, setComplete] = useState(() =>
    ecargoScscProfileIsComplete(getActiveEcargoScscProfile()),
  );
  const [extension, setExtension] = useState<TcsExtResult | null>(null);

  useEffect(() => {
    const sync = () => setComplete(ecargoScscProfileIsComplete(getActiveEcargoScscProfile()));
    window.addEventListener(ECARGO_SCSC_CHANGED_EVENT, sync);
    return () => window.removeEventListener(ECARGO_SCSC_CHANGED_EVENT, sync);
  }, []);

  const refreshExt = useCallback(async () => {
    const result = await pingTcsExtension(2_500, { warehouse: "SCSC" });
    setExtension(result);
  }, []);

  useEffect(() => {
    void refreshExt();
    const timer = window.setInterval(() => void refreshExt(), 10_000);
    const unsub = subscribeTcsExtensionReady((info) => {
      if (info.portalWarehouse && info.portalWarehouse !== "SCSC") return;
      void refreshExt();
    });
    return () => {
      window.clearInterval(timer);
      unsub();
    };
  }, [refreshExt]);

  const presence = tcsExtPresence(extension);
  const extChipClass =
    presence === "logged_in" || presence === "ready"
      ? "bg-sky-500/15 text-sky-900"
      : "bg-slate-500/15 text-slate-600";

  const btn =
    "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition active:scale-[0.98] border border-emerald-500/30 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${extChipClass}`}
        title={
          presence === "offline"
            ? "Chưa thấy Ext «TECSOPS — Kho SCSC eCargo». Cài từ «Tải Ext», Reload, F5 Ops."
            : "Ext SCSC eCargo online"
        }
        data-testid="ops-scsc-ext-status"
        data-ext-presence={presence}
      >
        {tcsExtPresenceLabel(extension, { compact: true })}
      </span>
      <button
        type="button"
        className={btn}
        title={
          complete
            ? "Đăng ký eCargo — chọn lô kho SCSC"
            : "Đăng ký eCargo SCSC — cần lưu hồ sơ đại lý lần đầu (Ext SCSC: nút «Tải Ext»)"
        }
        onClick={() => api?.openRegister(preferredShipmentId)}
        disabled={!api}
      >
        {compact ? "eCargo" : "Đăng ký eCargo"}
        {!complete ? <span className="text-amber-600">·</span> : null}
      </button>
    </span>
  );
}
