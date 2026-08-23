import { Button } from "../ui";
import { formatOpsWorkDateYmd } from "../utils/opsDateFormat";

interface Props {
  value: string;
  onChange: (ymd: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isViewingToday: boolean;
  /** Gọn — mobile header (vùng chạm ≥44px). Desktop mặc định slim. */
  compact?: boolean;
  /** Không stretch full-width — nằm trong hàng identity mobile. */
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
  const opsLabel = formatOpsWorkDateYmd(value);
  const stepBtn = compact
    ? "inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full px-1 text-[14px] font-semibold text-ui-primary hover:bg-ui-surface-muted"
    : "inline-flex h-8 w-8 items-center justify-center rounded-lg text-[14px] font-semibold text-ui-primary hover:bg-ui-surface-muted";

  return (
    <div
      className={`inline-flex min-w-0 items-center ${compact && !inline ? "w-full gap-1" : "gap-0.5"}`}
    >
      <div
        className={`inline-flex min-w-0 items-center border border-ui-border bg-ui-surface shadow-ui-sm ${
          compact && !inline ? "flex-1" : ""
        } ${compact ? "rounded-full p-0.5" : "rounded-xl p-0.5"}`}
      >
        <button type="button" onClick={onPrev} className={stepBtn} aria-label="Ngày trước">
          ‹
        </button>
        <div className={`relative min-w-0 ${compact && !inline ? "flex-1" : "w-[7.75rem]"}`}>
          <span
            className={`pointer-events-none block truncate text-center font-mono font-semibold tabular-nums text-ui-navy ${
              compact ? "py-1 text-[11px]" : "py-0.5 text-[12px]"
            }`}
            aria-hidden
          >
            {opsLabel}
          </span>
          <input
            aria-label="Ngày phiên Ops"
            type="date"
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              if (v) onChange(v);
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </div>
        <button type="button" onClick={onNext} className={stepBtn} aria-label="Ngày sau">
          ›
        </button>
      </div>
      {compact ? (
        !isViewingToday ? (
          <button
            type="button"
            onClick={onToday}
            className="inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded-full bg-ui-primary px-2.5 text-[11px] font-semibold text-white shadow-ui-sm hover:bg-ui-primary-hover"
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
