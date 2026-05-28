import { memo, useCallback, useEffect, useState, type KeyboardEvent } from "react";
import {
  formatDecimalInput,
  formatIntegerInput,
  parseLocaleInteger,
  parseLocaleNumber,
} from "../utils/localeNumberInput";
import { OPS } from "../styles/opsModalStyles";

type Props = {
  value: number | null | undefined;
  onCommit: (value: number | null) => void;
  integer?: boolean;
  maxDecimals?: number;
  /** Cho phép để trống — commit null. */
  nullable?: boolean;
  className?: string;
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
};

function toDisplay(
  value: number | null | undefined,
  nullable: boolean,
  format: (n: number) => string,
): string {
  if (nullable && value == null) return "";
  return format(value ?? 0);
}

/** Ô nhập số text — tránh type=number gây nhảy số theo locale trình duyệt. */
export const LocaleNumberInput = memo(function LocaleNumberInput({
  value,
  onCommit,
  integer = false,
  maxDecimals = 4,
  nullable = false,
  className = "",
  placeholder,
  onKeyDown,
}: Props) {
  const format = useCallback(
    (n: number) => (integer ? formatIntegerInput(n) : formatDecimalInput(n, maxDecimals)),
    [integer, maxDecimals],
  );

  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => toDisplay(value, nullable, format));

  useEffect(() => {
    if (!focused) setText(toDisplay(value, nullable, format));
  }, [focused, format, nullable, value]);

  const commit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (nullable && trimmed === "") {
        onCommit(null);
        setText("");
        return;
      }
      const parsed = integer ? parseLocaleInteger(raw) : parseLocaleNumber(raw);
      if (parsed == null) {
        if (nullable) {
          onCommit(null);
          setText("");
        } else {
          onCommit(0);
          setText(format(0));
        }
        return;
      }
      const next = integer ? Math.max(0, Math.round(parsed)) : Math.max(0, parsed);
      onCommit(next);
      setText(format(next));
    },
    [format, integer, nullable, onCommit],
  );

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      autoComplete="off"
      spellCheck={false}
      value={focused ? text : toDisplay(value, nullable, format)}
      placeholder={placeholder}
      onFocus={() => {
        setFocused(true);
        setText(toDisplay(value, nullable, format));
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit(text);
          (e.target as HTMLInputElement).blur();
        }
        onKeyDown?.(e);
      }}
      className={`${OPS.input} ${className}`}
    />
  );
});
