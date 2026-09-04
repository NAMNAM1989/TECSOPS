import { lazy, Suspense } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { MobileDimSavePayload } from "./MobileDimKgModal";

const MobileDimKgModalLazy = lazy(() =>
  import("./MobileDimKgModal").then((m) => ({ default: m.MobileDimKgModal })),
);

export type { MobileDimSavePayload };

type Props = {
  row: Shipment;
  customerDirectory?: readonly CustomerDirectoryEntry[];
  onClose: () => void;
  onSave: (payload: MobileDimSavePayload) => void;
  onUpdateCustomers?: (
    customers: CustomerDirectoryEntry[],
  ) => Promise<boolean | void> | boolean | void;
};

function DimModalSuspenseFallback({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3"
      role="status"
      aria-busy="true"
      aria-label="Đang tải modal DIM"
      data-testid="dim-modal-suspense"
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-ui-border bg-ui-surface shadow-ui-lg">
        <div className="flex items-center justify-between border-b border-ui-border px-4 py-3">
          <div className="h-4 w-40 animate-pulse rounded bg-ui-surface-muted" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-[12px] font-semibold text-ui-text-muted hover:bg-ui-surface-muted"
          >
            Đóng
          </button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="h-24 animate-pulse rounded-xl bg-ui-surface-muted" />
            <div className="h-10 animate-pulse rounded-xl bg-ui-surface-muted" />
            <div className="h-32 animate-pulse rounded-xl bg-ui-surface-muted" />
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-ui-surface-muted" />
        </div>
        <div className="flex justify-end gap-2 border-t border-ui-border px-4 py-3">
          <div className="h-11 w-24 animate-pulse rounded-xl bg-ui-surface-muted" />
          <div className="h-11 w-40 animate-pulse rounded-xl bg-ui-surface-muted" />
        </div>
      </div>
    </div>
  );
}

/** Modal DIM — tải chunk riêng khi mở lần đầu. */
export function LazyMobileDimKgModal(props: Props) {
  return (
    <Suspense fallback={<DimModalSuspenseFallback onClose={props.onClose} />}>
      <MobileDimKgModalLazy {...props} />
    </Suspense>
  );
}
