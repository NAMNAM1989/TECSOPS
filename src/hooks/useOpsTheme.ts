import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tecsops-theme";

function readStoredDark(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Chế độ tối Ops — lưu localStorage, class `dark` trên `<html>`. */
export function useOpsTheme() {
  const [dark, setDark] = useState(readStoredDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  const toggle = useCallback(() => setDark((v) => !v), []);

  return { dark, setDark, toggle };
}
