import { createContext, useContext, type ReactNode } from "react";
import type { TcsPortalActions } from "../hooks/useTcsPortalActions";

const TcsPortalActionsContext = createContext<TcsPortalActions | null>(null);

export function TcsPortalActionsProvider({
  value,
  children,
}: {
  value: TcsPortalActions;
  children: ReactNode;
}) {
  return (
    <TcsPortalActionsContext.Provider value={value}>{children}</TcsPortalActionsContext.Provider>
  );
}

/** Menu dòng lấy PDF ESID từ Cổng TCS */
export function useTcsPortalActionsContext(): TcsPortalActions | null {
  return useContext(TcsPortalActionsContext);
}
