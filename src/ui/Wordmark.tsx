/** Wordmark TECS (navy) + OPS (teal) — Operational Signal Round 2. */
export function Wordmark({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const cls =
    size === "sm"
      ? "text-[13px] tracking-tight"
      : size === "lg"
        ? "text-2xl tracking-tight sm:text-3xl"
        : "text-xl tracking-tight sm:text-2xl";
  return (
    <span
      className={`inline-flex font-extrabold text-ui-navy ${cls} ${className}`}
      aria-label="TECSOPS"
    >
      TECS<span className="text-ui-primary">OPS</span>
    </span>
  );
}
