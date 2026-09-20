import { useMemo } from "react";
import type { ShareSparkPoint } from "../../utils/opsStatsForecast";

/** Mini sparkline share % — SVG thuần, không dep chart. */
export function ShareSparkline({
  points,
  width = 72,
  height = 22,
}: {
  points: readonly ShareSparkPoint[];
  width?: number;
  height?: number;
}) {
  const path = useMemo(() => {
    if (points.length < 2) return "";
    const max = Math.max(...points.map((p) => p.shareKgPct), 1);
    const min = Math.min(...points.map((p) => p.shareKgPct), 0);
    const span = Math.max(max - min, 1);
    const step = width / (points.length - 1);
    return points
      .map((p, i) => {
        const x = i * step;
        const y = height - ((p.shareKgPct - min) / span) * (height - 2) - 1;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points, width, height]);

  if (points.length < 4 || !path) return null;

  const last = points[points.length - 1]!;
  const title = points.map((p) => `${p.weekStart}: ${p.shareKgPct}%`).join(" · ");

  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <svg width={width} height={height} className="overflow-visible" aria-hidden>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-teal-700" />
      </svg>
      <span className="font-mono text-[10px] tabular-nums text-ui-text-muted">{last.shareKgPct}%</span>
    </span>
  );
}
