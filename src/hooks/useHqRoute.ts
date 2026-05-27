import { useCallback, useEffect, useState } from "react";
import { closeHqPage, openHqPage, parseHqHash } from "../utils/hqRoute";

export function useHqRoute() {
  const [shipmentId, setShipmentId] = useState<string | null>(() =>
    typeof window !== "undefined" ? parseHqHash() : null
  );

  useEffect(() => {
    const sync = () => setShipmentId(parseHqHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const open = useCallback((id: string) => {
    openHqPage(id);
    setShipmentId(id);
  }, []);

  const close = useCallback(() => {
    closeHqPage();
    setShipmentId(null);
  }, []);

  return { shipmentId, open, close };
}
