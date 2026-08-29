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
};

/** Modal DIM — tải chunk riêng khi mở lần đầu. */
export function LazyMobileDimKgModal(props: Props) {
  return (
    <Suspense fallback={null}>
      <MobileDimKgModalLazy {...props} />
    </Suspense>
  );
}
