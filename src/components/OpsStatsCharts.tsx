import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKgTotal } from "../utils/formatKgTotal";
import type {
  OpsStatsDayRow,
  OpsStatsDestRow,
  OpsStatsWarehouseRow,
} from "../utils/opsStatsMetrics";

const COLORS = {
  actual: "#0f766e",
  dim: "#0284c7",
  chargeable: "#b45309",
  delta: "#d97706",
  lots: "#134e4a",
  warehouse: ["#0f766e", "#0369a1", "#b45309", "#7c3aed"],
  dest: ["#0d9488", "#0284c7", "#ca8a04", "#c026d3", "#ea580c", "#4f46e5", "#059669", "#e11d48"],
};

function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-[260px] flex-col overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm ${className}`}
    >
      <header className="shrink-0 border-b border-ui-border/60 bg-gradient-to-b from-slate-50/80 to-transparent px-3.5 py-2.5 sm:px-4">
        <h3 className="m-0 text-[13px] font-extrabold tracking-tight text-ui-navy">
          {title}
        </h3>
        {subtitle ? (
          <p className="m-0 mt-0.5 text-[11px] text-ui-text-muted">{subtitle}</p>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 p-2.5 sm:p-3">{children}</div>
    </section>
  );
}

function kgTip(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? `${formatKgTotal(n)} kg` : "—";
}

/** Xu hướng kg theo ngày phiên. */
export function OpsStatsDayTrendChart({ rows }: { rows: readonly OpsStatsDayRow[] }) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        day: r.sessionDate.slice(5), // MM-DD
        full: r.sessionDate,
        actualKg: Math.round(r.actualKg * 1000) / 1000,
        dimKg: Math.round(r.dimKg * 1000) / 1000,
        chargeableKg: Math.round(r.chargeableKg * 1000) / 1000,
        lots: r.lots,
      })),
    [rows]
  );

  if (data.length === 0) {
    return (
      <ChartCard
        title="Xu hướng theo ngày"
        subtitle="Kg thực · DIM · Chargeable"
        className="lg:col-span-2"
      >
        <p className="flex h-full min-h-[200px] items-center justify-center text-sm text-ui-text-muted">
          Chưa có dữ liệu
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Xu hướng theo ngày"
      subtitle="Kg thực · DIM · Chargeable"
      className="lg:col-span-2"
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={44} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => {
              if (name === "lots") return [value, "Lô"];
              const labels: Record<string, string> = {
                actualKg: "Kg thực",
                dimKg: "DIM",
                chargeableKg: "Chargeable",
              };
              return [kgTip(value), labels[name] ?? name];
            }}
            labelFormatter={(_, payload) => {
              const full = payload?.[0]?.payload?.full;
              return full ? `Ngày ${full}` : "";
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(v) =>
              ({ actualKg: "Kg thực", dimKg: "DIM", chargeableKg: "Chargeable", lots: "Lô" } as Record<
                string,
                string
              >)[v] ?? v
            }
          />
          <Line
            type="monotone"
            dataKey="actualKg"
            stroke={COLORS.actual}
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="dimKg"
            stroke={COLORS.dim}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="chargeableKg"
            stroke={COLORS.chargeable}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Phân bổ theo kho. */
export function OpsStatsWarehouseChart({
  rows,
  onSelect,
}: {
  rows: readonly OpsStatsWarehouseRow[];
  onSelect?: (warehouse: string) => void;
}) {
  const data = useMemo(
    () =>
      rows
        .filter((r) => r.lots > 0)
        .map((r) => ({
          name: r.label,
          warehouse: r.warehouse,
          lots: r.lots,
          actualKg: Math.round(r.actualKg * 1000) / 1000,
          chargeableKg: Math.round(r.chargeableKg * 1000) / 1000,
          deltaKg: Math.round(r.deltaKg * 1000) / 1000,
        })),
    [rows]
  );

  return (
    <ChartCard title="Theo kho hàng" subtitle="Số lô · click để lọc">
      {data.length === 0 ? (
        <p className="flex h-full items-center justify-center text-sm text-ui-text-muted">
          Chưa có dữ liệu
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="lots"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={76}
              paddingAngle={3}
              stroke="none"
              onClick={(entry) => {
                const wh = (entry as { warehouse?: string })?.warehouse;
                if (wh && onSelect) onSelect(wh);
              }}
              style={{ cursor: onSelect ? "pointer" : undefined }}
            >
              {data.map((_, i) => (
                <Cell key={data[i]!.warehouse} fill={COLORS.warehouse[i % COLORS.warehouse.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                fontSize: 12,
              }}
              formatter={(value: number, name: string, item) => {
                if (name === "lots") {
                  const p = item?.payload as {
                    actualKg?: number;
                    chargeableKg?: number;
                    deltaKg?: number;
                  };
                  return [
                    `${value} lô · ${kgTip(p?.actualKg)} thực · CW ${kgTip(p?.chargeableKg)} · Δ ${kgTip(p?.deltaKg)}`,
                    "Kho",
                  ];
                }
                return [value, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/** Top điểm đến. */
export function OpsStatsDestChart({
  rows,
  onSelect,
  topN = 8,
}: {
  rows: readonly OpsStatsDestRow[];
  onSelect?: (dest: string) => void;
  topN?: number;
}) {
  const data = useMemo(
    () =>
      rows.slice(0, topN).map((r) => ({
        dest: r.dest,
        lots: r.lots,
        actualKg: Math.round(r.actualKg * 1000) / 1000,
        chargeableKg: Math.round(r.chargeableKg * 1000) / 1000,
        deltaKg: Math.round(r.deltaKg * 1000) / 1000,
      })),
    [rows, topN]
  );

  return (
    <ChartCard title="Theo điểm đến (dest)" subtitle={`Top ${topN} theo số lô · click để lọc`}>
      {data.length === 0 ? (
        <p className="flex h-full items-center justify-center text-sm text-ui-text-muted">
          Chưa có dữ liệu
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="dest" width={52} tick={{ fontSize: 11, fill: "#334155" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                fontSize: 12,
              }}
              formatter={(value: number, name: string, item) => {
                if (name === "lots") {
                  const p = item?.payload as {
                    actualKg?: number;
                    chargeableKg?: number;
                    deltaKg?: number;
                  };
                  return [
                    `${value} lô · ${kgTip(p?.actualKg)} · CW ${kgTip(p?.chargeableKg)} · Δ ${kgTip(p?.deltaKg)}`,
                    "Dest",
                  ];
                }
                return [value, name];
              }}
            />
            <Bar
              dataKey="lots"
              radius={[0, 6, 6, 0]}
              onClick={(entry) => {
                const dest = (entry as { dest?: string })?.dest;
                if (dest && onSelect) onSelect(dest);
              }}
              style={{ cursor: onSelect ? "pointer" : undefined }}
            >
              {data.map((_, i) => (
                <Cell key={data[i]!.dest} fill={COLORS.dest[i % COLORS.dest.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/** So sánh kg thực vs chargeable theo kho (cột). */
export function OpsStatsWarehouseKgChart({ rows }: { rows: readonly OpsStatsWarehouseRow[] }) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        name: r.label.replace("TECS-", ""),
        actualKg: Math.round(r.actualKg * 1000) / 1000,
        chargeableKg: Math.round(r.chargeableKg * 1000) / 1000,
        deltaKg: Math.round(r.deltaKg * 1000) / 1000,
      })),
    [rows]
  );

  return (
    <ChartCard
      title="Kg theo kho"
      subtitle="Kg thực vs Chargeable · Δ phí kho"
      className="lg:col-span-2"
    >
      {data.every((d) => d.actualKg === 0 && d.chargeableKg === 0) ? (
        <p className="flex h-full min-h-[200px] items-center justify-center text-sm text-ui-text-muted">
          Chưa có dữ liệu
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={44} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                fontSize: 12,
              }}
              formatter={(v: number, name: string) => [
                kgTip(v),
                name === "actualKg" ? "Kg thực" : name === "chargeableKg" ? "Chargeable" : "Δ",
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(v) =>
                ({ actualKg: "Kg thực", chargeableKg: "Chargeable", deltaKg: "Δ" } as Record<
                  string,
                  string
                >)[v] ?? v
              }
            />
            <Bar dataKey="actualKg" fill={COLORS.actual} radius={[6, 6, 0, 0]} />
            <Bar dataKey="chargeableKg" fill={COLORS.chargeable} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
