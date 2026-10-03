import type { OpsUrgentNotice } from "../content/opsUrgentNotices";

type Props = {
  notices: readonly OpsUrgentNotice[];
};

/** Dòng ghi chú gấp chạy ngang. Dừng khi rê chuột; đứng yên nếu hệ thống tắt chuyển động. */
export function OpsUrgentNoticeMarquee({ notices }: Props) {
  const items = notices.filter((n) => n.text.trim().length > 0);
  const line = items.map((n) => n.text.trim()).join("   ·   ");
  const durationSec = Math.min(48, Math.max(16, Math.round(line.length * 0.22)));

  return (
    <div
      className="flex h-8 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-full border border-amber-200/90 bg-amber-50/90 px-2.5"
      data-testid="ops-urgent-marquee"
      role="region"
      aria-label="Ghi chú gấp"
    >
      <span className="shrink-0 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        Gấp
      </span>
      {line ? (
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="ops-urgent-marquee flex w-max items-center"
            style={{ animationDuration: `${durationSec}s` }}
          >
            <span className="pr-10 text-[12px] font-semibold text-amber-950">{line}</span>
            <span className="pr-10 text-[12px] font-semibold text-amber-950" aria-hidden>
              {line}
            </span>
          </div>
        </div>
      ) : (
        <p className="m-0 min-w-0 flex-1 truncate text-[12px] text-amber-900/70">
          Chưa có ghi chú gấp
        </p>
      )}
    </div>
  );
}
