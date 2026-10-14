import type { ShipmentMutation } from "./shipmentMutations";

export interface PersistentMutationItem {
  id: string;
  mutation: ShipmentMutation;
  localId?: string;
  enqueuedAt: number;
}

const DB_NAME = "tecsops_db";
const STORE_NAME = "persistent_outbox";
const DB_VERSION = 1;
const FALLBACK_KEY = "tecsops.persistentOutbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Cannot open IndexedDB"));
  });
}

function saveToLocalStorage(items: PersistentMutationItem[]): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

function loadFromLocalStorage(): PersistentMutationItem[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as PersistentMutationItem[];
    items.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    return items;
  } catch {
    return [];
  }
}

function clearLocalStorage(): void {
  try {
    localStorage.removeItem(FALLBACK_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Lưu toàn bộ danh sách mutation chờ gửi vào IndexedDB (fallback localStorage)
 */
export async function savePersistentQueue(
  items: PersistentMutationItem[]
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        for (const it of items) {
          store.put(it);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Đồng bộ cả fallback để an toàn tối đa
    saveToLocalStorage(items);
  } catch {
    saveToLocalStorage(items);
  }
}

/**
 * Đọc danh sách mutation chờ gửi từ IndexedDB (fallback localStorage)
 */
export async function loadPersistentQueue(): Promise<PersistentMutationItem[]> {
  try {
    const db = await openDb();
    const items = await new Promise<PersistentMutationItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as PersistentMutationItem[]);
      req.onerror = () => reject(req.error);
    });
    if (items.length > 0) {
      items.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      return items;
    }
    return loadFromLocalStorage();
  } catch {
    return loadFromLocalStorage();
  }
}

/**
 * Xóa sạch danh sách mutation chờ gửi
 */
export async function clearPersistentQueue(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  } finally {
    clearLocalStorage();
  }
}
