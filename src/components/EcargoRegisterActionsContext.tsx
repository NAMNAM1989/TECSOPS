import { createContext, useContext, type ReactNode } from "react";

export type EcargoRegisterActions = {
  /** Mở modal đăng ký nhanh cho đúng 1 lô SCSC. */
  openForShipment: (shipmentId: string) => void;
  /** Mở modal chọn AWB (toolbar). */
  openRegister: (preferredShipmentId?: string | null) => void;
};

const EcargoRegisterActionsContext = createContext<EcargoRegisterActions | null>(null);

export function EcargoRegisterActionsProvider({
  value,
  children,
}: {
  value: EcargoRegisterActions;
  children: ReactNode;
}) {
  return (
    <EcargoRegisterActionsContext.Provider value={value}>
      {children}
    </EcargoRegisterActionsContext.Provider>
  );
}

export function useEcargoRegisterActions(): EcargoRegisterActions | null {
  return useContext(EcargoRegisterActionsContext);
}
