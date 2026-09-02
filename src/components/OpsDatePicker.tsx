import { useRef } from "react";
import { Button } from "../ui";
import { formatOpsWorkDateYmd } from "../utils/opsDateFormat";

interface Props {
  value: string;
  onChange: (ymd: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isViewingToday: boolean;
  /** Gọn — mobile header. Desktop mặc định slim. */
  compact?: boolean;
  /** Không stretch full-width — nằm trong hàng identity mobile (dense ~32px). */
  inline?: boolean;
}

/** Bộ chọn ngày phiên — luôn hiện `23-AUG-2026`, không lộ locale US của input date. */
export function OpsDatePicker({
  value,
  onChange,
  onPrev,
  onNext,
  onToday,
  isViewingToday,
  compact = false,
  inline = false,
}: Props) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const opsLabel = formatOpsWorkDateYmd(value);
  /** compact+inline = chrome sticky mobile — thấp hơn full compact. */
  const dense = compact && inline;
  const stepBtn = dense
    ? "inline-flex h-8 w-7 touch-manipulation items-center justify-center rounded-md text-[13px] font-semibold text-ui-primary hover:bg-ui-surface-muted"
    : compact
      ? "inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full px-1 text-[14px] font-semibold text-ui-primary hover:bg-ui-surface-muted"
      : "inline-flex h-8 w-8 items-center justify-center rounded-lg text-[14px] font-semibold text-ui-primary hover:bg-ui-surface-muted";

  const openCalendar = () => {
    const el = dateInputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      /* showPicker có thể bị chặn nếu không từ user gesture — fallback focus/click */
    }
    el.focus();
    el.click();
  };

  return (
    <div
      className={`inline-flex min-w-0 items-center ${compact && !inline ? "w-full gap-1" : "gap-0.5"}`}
    >
      <div
        className={`inline-flex min-w-0 items-center border border-ui-border bg-ui-surface ${
          dense ? "shadow-none" : "shadow-ui-sm"
        } ${compact && !inline ? "flex-1" : ""} ${
          dense ? "rounded-lg p-0" : compact ? "rounded-full p-0.5" : "rounded-xl p-0.5"
        }`}
      >
        <button type="button" onClick={onPrev} className={stepBtn} aria-label="Ngày trước">
          ‹
        </button>
        <button
          type="button"
          onClick={openCalendar}
          className={`relative min-w-0 cursor-pointer hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
            dense ? "rounded-md" : "rounded-lg"
          } ${compact && !inline ? "flex-1" : dense ? "w-[6.75rem]" : "w-[7.75rem]"}`}
          aria-label={`Ngày phiên Ops ${opsLabel}. Bấm để chọn ngày`}
          title="Chọn ngày phiên"
        >
          <span
            className={`pointer-events-none block truncate text-center font-mono font-semibold tabular-nums text-ui-navy ${
              dense ? "py-1 text-[11px] leading-none" : compact ? "py-1 text-[11px]" : "py-0.5 text-[12px]"
            }`}
            aria-hidden
          >
            {opsLabel}
          </span>
          <input
            ref={dateInputRef}
            aria-hidden
            tabIndex={-1}
            type="date"
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              if (v) onChange(v);
            }}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        </button>
        <button type="button" onClick={onNext} className={stepBtn} aria-label="Ngày sau">
          ›
        </button>
      </div>
      {compact ? (
        !isViewingToday ? (
          <button
            type="button"
            onClick={onToday}
            className={`inline-flex shrink-0 touch-manipulation items-center rounded-full bg-ui-primary font-semibold text-white hover:bg-ui-primary-hover ${
              dense
                ? "h-8 px-2 text-[10px]"
                : "min-h-11 px-2.5 text-[11px] shadow-ui-sm"
            }`}
          >
            Nay
          </button>
        ) : null
      ) : !isViewingToday ? (
        <Button variant="secondary" size="sm" onClick={onToday} className="px-2 text-[11px]">
          Hôm nay
        </Button>
      ) : null}
    </div>
  );
}
