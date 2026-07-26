/** Wordmark TECS (navy) + OPS (teal) — Operational Signal. */
export function Wordmark({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const cls =
    size === "sm"
      ? "text-sm"
      : size === "lg"
        ? "text-2xl sm:text-3xl"
        : "text-xl sm:text-2xl";
  return (
    <span
      className={`inline-flex font-extrabold tracking-tight text-ui-navy ${cls} ${className}`}
      aria-label="TECSOPS"
    >
      TECS<span className="text-ui-primary">OPS</span>
    </span>
  );
}
