import { useCallback, useEffect, useState } from "react";

export type AppRoute = "ops" | "customers" | "stats" | "airlines" | "scsc-h21" | "tcs-h21";

function parseHashRoute(): AppRoute {
  const raw = window.location.hash.replace(/^#\/?/, "").trim().toLowerCase();
  if (raw === "customers" || raw.startsWith("customers/")) return "customers";
  if (raw === "stats" || raw.startsWith("stats/")) return "stats";
  if (raw === "airlines" || raw.startsWith("airlines/") || raw === "hang" || raw.startsWith("hang/")) {
    return "airlines";
  }
  if (
    raw === "scsc-h21" ||
    raw.startsWith("scsc-h21/") ||
    raw === "h21" ||
    raw.startsWith("h21/") ||
    raw === "scsc-goods" ||
    raw.startsWith("scsc-goods/")
  ) {
    return "scsc-h21";
  }
  if (
    raw === "tcs-h21" ||
    raw.startsWith("tcs-h21/") ||
    raw === "h21-tcs" ||
    raw.startsWith("h21-tcs/") ||
    raw === "tcs-goods" ||
    raw.startsWith("tcs-goods/")
  ) {
    return "tcs-h21";
  }
  return "ops";
}

function hashFor(route: AppRoute): string {
  if (route === "customers") return "#/customers";
  if (route === "stats") return "#/stats";
  if (route === "airlines") return "#/airlines";
  if (route === "scsc-h21") return "#/scsc-h21";
  if (route === "tcs-h21") return "#/tcs-h21";
  return "#/";
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
