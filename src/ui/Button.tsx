import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-ui-primary text-white shadow-ui-sm hover:bg-ui-primary-hover focus-visible:ring-ui-focus disabled:bg-ui-primary/50",
  secondary:
    "border border-ui-border/90 bg-ui-surface text-ui-text shadow-ui-sm hover:bg-ui-surface-muted focus-visible:ring-ui-focus disabled:opacity-50",
  ghost:
    "bg-transparent text-ui-text hover:bg-ui-surface-muted focus-visible:ring-ui-focus disabled:opacity-50",
  danger:
    "bg-ui-danger text-white shadow-ui-sm hover:bg-red-800 focus-visible:ring-red-300 disabled:bg-ui-danger/50",
};

const SIZE: Record<Size, string> = {
  sm: "min-h-9 px-2.5 text-[12px] gap-1",
  md: "min-h-11 px-3.5 text-[13px] gap-1.5",
  lg: "min-h-12 px-4 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

/** Nút chuẩn Operational Signal — vùng chạm ≥44px (md/lg). */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-xl font-semibold btn-kinetic hover:shadow-ui-md disabled:active:scale-100 disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: Size;
  variant?: Variant;
  children: ReactNode;
}

export function IconButton({
  label,
  size = "md",
  variant = "ghost",
  className = "",
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  const box = size === "sm" ? "min-h-9 min-w-9" : size === "lg" ? "min-h-12 min-w-12" : "min-h-11 min-w-11";
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-xl btn-kinetic hover:shadow-ui-md disabled:active:scale-100 disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed ${VARIANT[variant]} ${box} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
