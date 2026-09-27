import { useState, useCallback } from "react";
import { formatAwb, rawAwbDigits } from "../utils/awbFormat";

export type AwbTextProps = {
  awb: string;
  size?: "sm" | "md" | "lg";
  copyable?: boolean;
  highlight?: string;
  flags?: Array<"incomplete" | "duplicate">;
  className?: string;
  "data-testid"?: string;
};

export function AwbText({
  awb,
  size = "md",
  copyable = false,
  highlight,
  flags,
  className = "",
  "data-testid": testId,
}: AwbTextProps) {
  const [copied, setCopied] = useState(false);

  const digits = rawAwbDigits(awb);
  const formattedAwb = digits.length === 11 ? formatAwb(digits) : (awb || "—");

  const sizeClasses = {
    sm: "text-2xs",
    md: "text-xs",
    lg: "text-sm",
  }[size];

  const hasIncomplete = flags?.includes("incomplete");
  const hasDuplicate = flags?.includes("duplicate");

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!awb || copied) return;
    try {
      await navigator.clipboard.writeText(awb.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [awb, copied]);

  const renderHighlightedText = () => {
    if (!highlight || !formattedAwb.includes(highlight)) {
      return formattedAwb;
    }
    const index = formattedAwb.indexOf(highlight);
    const before = formattedAwb.slice(0, index);
    const match = formattedAwb.slice(index, index + highlight.length);
    const after = formattedAwb.slice(index + highlight.length);

    return (
      <>
        {before}
        <span className="underline decoration-teal-600 decoration-2 underline-offset-2">
          {match}
        </span>
        {after}
      </>
    );
  };

  const content = (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 font-mono font-bold tracking-tight text-ui-text ${sizeClasses} ${className}`}
    >
      {hasIncomplete ? (
        <span
          title="AWB chưa đủ 11 số"
          aria-label="Cảnh báo: AWB chưa đủ 11 số"
          className="text-red-600 dark:text-red-400 select-none"
        >
          ⚠
        </span>
      ) : null}

      {hasDuplicate ? (
        <span
          title="Trùng số AWB"
          aria-label="Cảnh báo: Trùng số AWB"
          className="text-rose-600 dark:text-rose-400 select-none"
        >
          ⚑
        </span>
      ) : null}

      <span className={hasDuplicate ? "text-rose-700 underline decoration-rose-500" : ""}>
        {renderHighlightedText()}
      </span>

      {copyable && awb ? (
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? "Đã chép" : "Sao chép AWB"}
          aria-label={`Sao chép AWB ${awb}`}
          className="ml-0.5 rounded px-1 py-0.5 text-2xs text-ui-text-muted hover:bg-black/5 hover:text-ui-text transition-colors"
        >
          {copied ? "✓" : "📋"}
        </button>
      ) : null}
    </span>
  );

  return content;
}
