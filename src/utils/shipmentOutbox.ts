import type { AppState, ShipmentMutation } from "./shipmentMutations";
import type { Shipment } from "../types/shipment";
import { OUTBOX_DEBOUNCE_MS, OUTBOX_FLUSH_SIZE } from "../config/tableUx";

export type CellStatus = "idle" | "pending" | "error";

export type OutboxItem = {
  id: string;
  mutation: ShipmentMutation;
  localId?: string;
  rowId: string;
  stt?: number;
  touchedFields: string[];
  previousValues: Record<string, unknown>;
  createdAt: number;
};

export const FIELD_DISPLAY_NAMES: Record<string, string> = {
  awb: "AWB",
  hawb: "HAWB",
  flight: "Chuyến bay",
  flightDate: "Ngày bay",
  dest: "Điểm đến (DEST)",
  pcs: "Số kiện (PCS)",
  kg: "Trọng lượng (KG)",
  dimKg: "Trọng lượng DIM",
  customer: "Khách hàng",
  note: "Ghi chú",
};

export function getFieldDisplayName(field: string): string {
  return FIELD_DISPLAY_NAMES[field] || field.toUpperCase();
}

/**
 * Đo performance.mark và performance.measure quanh applyLocal.
 * Tự động log console khi query param có ?perf=1
 */
export function measureApplyLocal<T>(actionName: string, fn: () => T): T {
  const markStart = `applyLocal:${actionName}:start`;
  const markEnd = `applyLocal:${actionName}:end`;
  const measureName = `applyLocal:${actionName}`;

  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    performance.mark(markStart);
  }
  const result = fn();
  if (
    typeof performance !== "undefined" &&
    typeof performance.mark === "function" &&
    typeof performance.measure === "function"
  ) {
    performance.mark(markEnd);
    try {
      performance.measure(measureName, markStart, markEnd);
      const entries = performance.getEntriesByName(measureName);
      const latest = entries[entries.length - 1];
      if (
        typeof window !== "undefined" &&
        window.location?.search?.includes("perf=1") &&
        latest
      ) {
        console.log(`[perf] applyLocal ${actionName} took ${latest.duration.toFixed(2)} ms`);
      }
    } catch {
      // performance.measure may fail in non-browser or test environments without throwing
    }
  }
  return result;
}

/**
 * Gộp các mutation trong outbox trước khi gửi lên server qua POST /api/mutations.
 * - Nhiều UPDATE cùng id: gộp patch (field sau ghi đè field trước).
 * - ADD đi riêng: nếu gặp ADD, chỉ gửi các mutation trước đó (nếu có) hoặc chính ADD đó
 *   để chờ server trả id thật rồi remap các UPDATE theo localId bằng remapMutationId.
 */
export function consolidateOutboxMutations(queue: OutboxItem[]): {
  toSend: ShipmentMutation[];
  itemsInBatch: OutboxItem[];
  remainingQueue: OutboxItem[];
  isAddBatch: boolean;
} {
  if (queue.length === 0) {
    return { toSend: [], itemsInBatch: [], remainingQueue: [], isAddBatch: false };
  }

  // Nếu mục đầu tiên là ADD: gửi riêng mục này
  if (queue[0].mutation.action === "ADD") {
    return {
      toSend: [queue[0].mutation],
      itemsInBatch: [queue[0]],
      remainingQueue: queue.slice(1),
      isAddBatch: true,
    };
  }

  // Tìm vị trí ADD đầu tiên (nếu có): dừng gom trước ADD để ADD đi riêng
  const firstAddIdx = queue.findIndex((item) => item.mutation.action === "ADD");
  const batchSlice = firstAddIdx === -1 ? queue : queue.slice(0, firstAddIdx);
  const remaining = firstAddIdx === -1 ? [] : queue.slice(firstAddIdx);

  // Gộp các UPDATE cùng ID trong batchSlice
  const updateMap = new Map<string, { mergedPatch: Partial<Shipment>; items: OutboxItem[] }>();
  const nonUpdates: { mutation: ShipmentMutation; item: OutboxItem }[] = [];

  for (const item of batchSlice) {
    const { mutation } = item;
    if (mutation.action === "UPDATE") {
      const existing = updateMap.get(mutation.id);
      if (existing) {
        existing.mergedPatch = { ...existing.mergedPatch, ...mutation.patch };
        existing.items.push(item);
      } else {
        updateMap.set(mutation.id, {
          mergedPatch: { ...mutation.patch },
          items: [item],
        });
      }
    } else {
      nonUpdates.push({ mutation, item });
    }
  }

  const toSend: ShipmentMutation[] = [];
  const itemsInBatch: OutboxItem[] = [];

  for (const [id, { mergedPatch, items }] of updateMap.entries()) {
    toSend.push({ action: "UPDATE", id, patch: mergedPatch });
    itemsInBatch.push(...items);
  }

  for (const { mutation, item } of nonUpdates) {
    toSend.push(mutation);
    itemsInBatch.push(item);
  }

  return {
    toSend,
    itemsInBatch,
    remainingQueue: remaining,
    isAddBatch: false,
  };
}

export function remapMutationId(
  mutation: ShipmentMutation,
  idMap: Map<string, string>,
): ShipmentMutation {
  if (mutation.action !== "UPDATE" && mutation.action !== "DELETE") return mutation;
  const mapped = idMap.get(mutation.id);
  return mapped ? { ...mutation, id: mapped } : mutation;
}

export function remapOutboxItemIds(
  queue: OutboxItem[],
  idMap: Map<string, string>,
): OutboxItem[] {
  if (idMap.size === 0) return queue;
  return queue.map((item) => {
    const nextMutation = remapMutationId(item.mutation, idMap);
    const mappedRowId = idMap.get(item.rowId) ?? item.rowId;
    return {
      ...item,
      rowId: mappedRowId,
      mutation: nextMutation,
    };
  });
}

/**
 * Socket sync: Server thắng, TRỪ ô đang pending trong outbox.
 * Áp lại các patch local đang chờ gửi lên state mới từ server.
 */
export function applyPendingPatchesOverServerState(
  serverState: AppState,
  pendingItems: OutboxItem[],
): AppState {
  if (!pendingItems.length) return serverState;

  const rows = [...serverState.rows];

  for (const item of pendingItems) {
    if (item.mutation.action === "UPDATE") {
      const { id, patch } = item.mutation;
      const idx = rows.findIndex((r) => r.id === id);
      if (idx !== -1) {
        rows[idx] = { ...rows[idx], ...patch };
      }
    } else if (item.mutation.action === "DELETE") {
      const deleteId = item.mutation.id;
      const idx = rows.findIndex((r) => r.id === deleteId);
      if (idx !== -1) {
        rows.splice(idx, 1);
      }
    }
  }

  return {
    ...serverState,
    rows,
  };
}

/**
 * Rollback chính xác chỉ field bị lỗi khi server trả về 400 hoặc 500.
 */
export function rollbackSingleField(
  state: AppState,
  rowId: string,
  field: string,
  previousValue: unknown,
): AppState {
  return {
    ...state,
    rows: state.rows.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        [field]: previousValue,
      };
    }),
  };
}

export { OUTBOX_DEBOUNCE_MS, OUTBOX_FLUSH_SIZE };
