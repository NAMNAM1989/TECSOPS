import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const BASE =
  "w-full min-h-11 touch-manipulation rounded-xl border border-ui-border/90 bg-ui-surface px-3 py-2 text-base text-ui-text shadow-ui-sm outline-none transition placeholder:text-ui-text-muted/70 focus:border-ui-primary/55 focus:ring-2 focus:ring-ui-focus disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-9 sm:text-sm";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${BASE} ${className}`} {...rest} />;
}

export function TextArea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${BASE} min-h-[5rem] resize-y ${className}`} {...rest} />;
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${BASE} ${className}`} {...rest}>
      {children}
    </select>
  );
}
