import { useCallback, useEffect, useState } from "react";
import { isDesktopViewport } from "../utils/hqRoute";

const STORAGE_KEY = "tecsops-force-mobile-layout";

function readForceMobileFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function readForceMobileFromUrl(): boolean | null {
  if (typeof window === "undefined") return null;
  const layout = new URLSearchParams(window.location.search).get("layout");
  if (layout === "mobile") return true;
  if (layout === "desktop") return false;
  return null;
}

/** Bật giao diện mobile trên màn hình rộng — dùng khi thiết kế UI mobile trên desktop. */
export function useMobileLayout() {
  const [forceMobile, setForceMobileState] = useState(() => {
    const fromUrl = readForceMobileFromUrl();
    if (fromUrl !== null) return fromUrl;
    return readForceMobileFromStorage();
  });
  const [viewportMobile, setViewportMobile] = useState(() => !isDesktopViewport());

  useEffect(() => {
    const fromUrl = readForceMobileFromUrl();
    if (fromUrl === true) {
      setForceMobileState(true);
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
    } else if (fromUrl === false) {
      setForceMobileState(false);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setViewportMobile(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const isMobile = forceMobile || viewportMobile;

  const setForceMobile = useCallback((next: boolean) => {
    setForceMobileState(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleForceMobile = useCallback(() => {
    setForceMobile(!forceMobile);
  }, [forceMobile, setForceMobile]);

  return { isMobile, forceMobile, setForceMobile, toggleForceMobile };
}
