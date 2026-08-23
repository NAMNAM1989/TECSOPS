import type { OverflowMenuItem } from "../ui/OverflowMenu";
import type { Shipment } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { isTecsHub } from "../constants/warehouses";

/** Menu copy ảnh báo cáo ngày — dùng chung desktop (Báo cáo) và mobile (Ảnh). */
export function buildOpsCargoReportItems(opts: {
  viewRows: readonly Shipment[];
  copying?: boolean;
  onCopy: (kind: CargoDayReportCopyKind) => void;
}): OverflowMenuItem[] {
  const { viewRows, copying = false, onCopy } = opts;
  const hasTecs = viewRows.some((r) => isTecsHub(r.warehouse));
  const hasTcs = viewRows.some((r) => r.warehouse === "TCS");
  const hasScsc = viewRows.some((r) => r.warehouse === "SCSC");
  const busyLabel = copying ? "Đang copy…" : null;

  return [
    {
      id: "vantage",
      label: busyLabel ?? "Vantage",
      description: "TECS hub · ẩn khách",
      disabled: copying || !hasTecs,
      onSelect: () => onCopy("vantage"),
    },
    {
      id: "tecs",
      label: busyLabel ?? "Tecs",
      description: "TECS hub · short code",
      disabled: copying || !hasTecs,
      onSelect: () => onCopy("tecs"),
    },
    {
      id: "tcs",
      label: busyLabel ?? "TCS",
      description: "Chỉ kho TCS",
      disabled: copying || !hasTcs,
      onSelect: () => onCopy("tcs"),
    },
    {
      id: "scsc",
      label: busyLabel ?? "SCSC",
      description: "Chỉ kho SCSC",
      disabled: copying || !hasScsc,
      onSelect: () => onCopy("scsc"),
    },
  ];
}
