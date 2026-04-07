import { useEffect, useMemo, useState } from "react";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

interface CutoffCountdownProps {
  iso: string;
  className?: string;
}

export function CutoffCountdown({ iso, className = "" }: CutoffCountdownProps) {
  const target = useMemo(() => new Date(iso).getTime(), [iso]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = target - now;
  const past = diff <= 0;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);

  if (past) {
    return (
      <span
        className={`font-mono font-bold text-rose-600 ${className || "text-xs"}`}
        title={new Date(iso).toLocaleString()}
      >
        -{h}:{pad(m)}:{pad(s)}
      </span>
    );
  }

  const urgent = h === 0 && m < 30;
  const warning = h < 2;

  return (
    <span
      className={`font-mono font-semibold ${
        urgent
          ? "text-rose-600 animate-pulse"
          : warning
            ? "text-amber-700"
            : "text-slate-600"
      } ${className || "text-xs"}`}
      title={new Date(iso).toLocaleString()}
    >
      {h}:{pad(m)}:{pad(s)}
    </span>
  );
}
