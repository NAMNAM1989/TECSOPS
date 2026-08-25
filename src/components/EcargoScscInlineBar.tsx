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
  type TcsExtResult,
} from "../utils/tcsChromeExtension";
import { PortalExtStatusChip } from "./PortalExtStatusChip";
import { PORTAL_BAR_UI } from "./portalBarUi";

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
  const extTitle =
    presence === "offline"
      ? "Chưa thấy Ext «TECSOPS — Kho SCSC eCargo». Cài từ «Tải Ext», Reload, F5 Ops."
      : presence === "logged_in"
        ? "Ext SCSC eCargo online · đã login"
        : "Ext SCSC eCargo online · sẵn sàng";

  return (
    <span className={`${PORTAL_BAR_UI.toolbar} shrink-0`}>
      <PortalExtStatusChip
        presence={presence}
        title={extTitle}
        testId="ops-scsc-ext-status"
      />
      <button
        type="button"
        className={`${PORTAL_BAR_UI.btnBase} ${PORTAL_BAR_UI.btnAccent}`}
        title={
          complete
            ? "Đăng ký eCargo — chọn lô kho SCSC (Ext SCSC trên PC)"
            : "Đăng ký eCargo SCSC — cần lưu hồ sơ đại lý lần đầu (Ext SCSC: menu «Tải Ext»)"
        }
        onClick={() => api?.openRegister(preferredShipmentId)}
        disabled={!api}
      >
        {compact ? "eCargo" : "Đăng ký eCargo"}
        {!complete ? (
          <span className="text-amber-800" aria-hidden>
            ·
          </span>
        ) : null}
      </button>
    </span>
  );
}
