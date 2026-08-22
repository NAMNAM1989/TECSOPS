import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  padding = "md",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md";
  as?: "div" | "section" | "article";
}) {
  const pad =
    padding === "none" ? "" : padding === "sm" ? "p-2.5 sm:p-3" : "p-3.5 sm:p-4";
  return (
    <Tag
      className={`rounded-2xl border border-ui-border/90 bg-ui-surface shadow-ui-md ${pad} ${className}`}
    >
      {children}
    </Tag>
  );
}
