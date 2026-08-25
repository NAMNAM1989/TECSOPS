import type { OverflowMenuItem } from "../ui/OverflowMenu";
import type { Shipment } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { isTecsHub } from "../constants/warehouses";

export type OpsCargoReportAction = {
  id: CargoDayReportCopyKind;
  label: string;
  description: string;
  /** Không có lô đúng phạm vi — nút xám, vẫn hiện để nhớ vị trí. */
  disabled: boolean;
};

const REPORTS: readonly {
  id: CargoDayReportCopyKind;
  label: string;
  description: string;
  scope: "tecs" | "tcs" | "scsc";
}[] = [
  {
    id: "vantage",
    label: "Vantage",
    description: "TECS hub · ẩn khách",
    scope: "tecs",
  },
  {
    id: "tecs",
    label: "Tecs",
    description: "TECS hub · short code",
    scope: "tecs",
  },
  {
    id: "tcs",
    label: "TCS",
    description: "Chỉ kho TCS",
    scope: "tcs",
  },
  {
    id: "scsc",
    label: "SCSC",
    description: "Chỉ kho SCSC",
    scope: "scsc",
  },
];

/** 4 loại ảnh báo cáo ngày — disable theo phạm vi kho, không đổi logic copy. */
export function listOpsCargoReportActions(opts: {
  viewRows: readonly Shipment[];
  copying?: boolean;
}): OpsCargoReportAction[] {
  const { viewRows, copying = false } = opts;
  const hasTecs = viewRows.some((r) => isTecsHub(r.warehouse));
  const hasTcs = viewRows.some((r) => r.warehouse === "TCS");
  const hasScsc = viewRows.some((r) => r.warehouse === "SCSC");
  const hasScope = { tecs: hasTecs, tcs: hasTcs, scsc: hasScsc };

  return REPORTS.map((report) => ({
    id: report.id,
    label: report.label,
    description: report.description,
    disabled: copying || !hasScope[report.scope],
  }));
}

/** Adapter overflow — giữ cho chỗ còn dùng menu ⋯. */
export function buildOpsCargoReportItems(opts: {
  viewRows: readonly Shipment[];
  copying?: boolean;
  onCopy: (kind: CargoDayReportCopyKind) => void;
}): OverflowMenuItem[] {
  const { onCopy, ...rest } = opts;
  return listOpsCargoReportActions(rest).map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    disabled: item.disabled,
    onSelect: () => onCopy(item.id),
  }));
}
