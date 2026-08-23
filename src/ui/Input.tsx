import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const BASE =
  "w-full min-h-11 touch-manipulation rounded-xl border border-ui-border/90 bg-ui-surface px-3 py-2 text-base text-ui-text shadow-ui-sm outline-none transition placeholder:text-ui-text-muted/70 focus:border-ui-primary/55 focus:ring-2 focus:ring-ui-focus disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-9 sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${BASE} ${className}`} {...rest} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className = "", ...rest }, ref) {
    return <textarea ref={ref} className={`${BASE} min-h-[5rem] resize-y ${className}`} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${BASE} ${className}`} {...rest}>
        {children}
      </select>
    );
  },
);
