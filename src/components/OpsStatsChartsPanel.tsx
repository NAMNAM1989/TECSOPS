import {
  OpsStatsDayTrendChart,
  OpsStatsDestChart,
  OpsStatsWarehouseChart,
  OpsStatsWarehouseKgChart,
} from "./OpsStatsCharts";
import type { WarehouseLayoutFilter } from "../constants/warehouses";
import type {
  OpsStatsDayRow,
  OpsStatsDestRow,
  OpsStatsWarehouseRow,
} from "../utils/opsStatsMetrics";

type Props = {
  byDay: readonly OpsStatsDayRow[];
  byWarehouse: readonly OpsStatsWarehouseRow[];
  byDest: readonly OpsStatsDestRow[];
  onSelectWarehouse: (wh: WarehouseLayoutFilter) => void;
  onSelectDest: (dest: string) => void;
};

/** Panel chart tách chunk — Recharts chỉ load khi Stats có dữ liệu. */
export function OpsStatsChartsPanel({
  byDay,
  byWarehouse,
  byDest,
  onSelectWarehouse,
  onSelectDest,
}: Props) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <OpsStatsDayTrendChart rows={byDay} />
      <OpsStatsWarehouseChart
        rows={byWarehouse}
        onSelect={(wh) => onSelectWarehouse(wh as WarehouseLayoutFilter)}
      />
      <OpsStatsDestChart rows={byDest} onSelect={onSelectDest} />
      <OpsStatsWarehouseKgChart rows={byWarehouse} />
    </div>
  );
}
