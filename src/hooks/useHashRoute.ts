import { useCallback, useEffect, useState } from "react";

export type AppRoute = "ops" | "customers";

function parseHashRoute(): AppRoute {
  const raw = window.location.hash.replace(/^#\/?/, "").trim().toLowerCase();
  if (raw === "customers" || raw.startsWith("customers/")) return "customers";
  return "ops";
}

function hashFor(route: AppRoute): string {
  return route === "customers" ? "#/customers" : "#/";
}

/** Định tuyến nhẹ bằng hash — không cần React Router. */
export function useHashRoute() {
  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window !== "undefined" ? parseHashRoute() : "ops"
  );

  useEffect(() => {
    const onHash = () => setRoute(parseHashRoute());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/`);
    }
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((next: AppRoute) => {
    const target = hashFor(next);
    if (window.location.hash === target) {
      setRoute(next);
      return;
    }
    window.location.hash = target;
  }, []);

  return { route, navigate };
}
