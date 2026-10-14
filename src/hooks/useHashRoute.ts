import { useCallback, useEffect, useState } from "react";

export type AppRoute = "ops" | "customers" | "stats" | "scsc-h21" | "tcs-h21";

/** Path hash không gồm query (`#/stats?mode=week` → `stats`). */
export function hashPath(hash: string): string {
  const raw = hash.replace(/^#\/?/, "").trim().toLowerCase();
  return (raw.split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
}

/** Định tuyến từ hash — nhận cả `#/stats?mode=today`. */
export function parseAppHashRoute(hash: string): AppRoute {
  const path = hashPath(hash);
  if (path === "customers" || path.startsWith("customers/")) return "customers";
  if (path === "stats" || path.startsWith("stats/")) return "stats";
  // Legacy #/airlines → Ops (catalog lấy từ Supabase, không còn trang riêng)
  if (path === "airlines" || path.startsWith("airlines/") || path === "hang" || path.startsWith("hang/")) {
    return "ops";
  }
  if (
    path === "scsc-h21" ||
    path.startsWith("scsc-h21/") ||
    path === "h21" ||
    path.startsWith("h21/") ||
    path === "scsc-goods" ||
    path.startsWith("scsc-goods/")
  ) {
    return "scsc-h21";
  }
  if (
    path === "tcs-h21" ||
    path.startsWith("tcs-h21/") ||
    path === "h21-tcs" ||
    path.startsWith("h21-tcs/") ||
    path === "tcs-goods" ||
    path.startsWith("tcs-goods/")
  ) {
    return "tcs-h21";
  }
  return "ops";
}

function parseHashRoute(): AppRoute {
  if (typeof window === "undefined") return "ops";
  return parseAppHashRoute(window.location.hash);
}

function hashFor(route: AppRoute): string {
  if (route === "customers") return "#/customers";
  if (route === "stats") return "#/stats";
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
    if (parseAppHashRoute(window.location.hash) === next) {
      setRoute(next);
      return;
    }
    window.location.hash = hashFor(next);
  }, []);

  return { route, navigate };
}
