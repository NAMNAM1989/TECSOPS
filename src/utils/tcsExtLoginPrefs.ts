import type { TcsPortalExtWarehouse } from "./tcsChromeExtension";

const STORAGE_KEY = "tecsops-tcs-ext-login-v1";

type Slot = {
  username: string;
  remember: boolean;
};

type Store = Partial<Record<TcsPortalExtWarehouse, Slot>>;

function readStore(): Store {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(next: Store) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

export function loadTcsExtLoginPrefs(warehouse: TcsPortalExtWarehouse): Slot {
  const slot = readStore()[warehouse];
  return {
    username: String(slot?.username || "").trim(),
    remember: slot?.remember !== false,
  };
}

export function saveTcsExtLoginPrefs(
  warehouse: TcsPortalExtWarehouse,
  prefs: { username: string; remember: boolean }
) {
  const store = readStore();
  if (!prefs.remember) {
    delete store[warehouse];
    writeStore(store);
    return;
  }
  store[warehouse] = {
    username: String(prefs.username || "").trim(),
    remember: true,
  };
  writeStore(store);
}

export function tcsExtLabel(warehouse: TcsPortalExtWarehouse): string {
  return warehouse === "TCS" ? "Ext kho TCS" : "Ext TECS-TCS";
}
