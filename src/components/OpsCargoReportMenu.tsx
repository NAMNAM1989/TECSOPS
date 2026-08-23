import { useMemo } from "react";
import type { Shipment } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { OverflowMenu } from "../ui/OverflowMenu";
import { buildOpsCargoReportItems } from "./opsCargoReportItems";

type Props = {
  viewRows: readonly Shipment[];
  copying?: boolean;
  onCopy: (kind: CargoDayReportCopyKind) => void;
};

/** Desktop — 4 loại ảnh báo cáo trong một overflow, không cạnh tranh CTA Booking. */
export function OpsCargoReportMenu({ viewRows, copying = false, onCopy }: Props) {
  const items = useMemo(
    () => buildOpsCargoReportItems({ viewRows, copying, onCopy }),
    [copying, onCopy, viewRows],
  );

  return <OverflowMenu label="Báo cáo" align="right" items={items} />;
}
