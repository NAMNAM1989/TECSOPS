import { useMemo } from "react";
import type { Shipment } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { listOpsCargoReportActions } from "./opsCargoReportItems";

type Variant = "desktop" | "mobile";

type Props = {
  viewRows: readonly Shipment[];
  copying?: boolean;
  onCopy: (kind: CargoDayReportCopyKind) => void;
  variant: Variant;
};

const KIND_TONE: Record<CargoDayReportCopyKind, string> = {
  vantage: "border-l-slate-500 bg-slate-50 text-slate-900 ring-slate-200/90",
  tecs: "border-l-teal-500 bg-teal-50 text-teal-950 ring-teal-200/90",
  tcs: "border-l-sky-500 bg-sky-50 text-sky-950 ring-sky-200/90",
  scsc: "border-l-violet-500 bg-violet-50 text-violet-950 ring-violet-200/90",
};

function CameraGlyph({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 7.5 8.1 5.85A1.5 1.5 0 0 1 9.2 5.4h5.6a1.5 1.5 0 0 1 1.1.45L17.25 7.5H19.5A1.5 1.5 0 0 1 21 9v8.25A1.5 1.5 0 0 1 19.5 18.75h-15A1.5 1.5 0 0 1 3 17.25V9A1.5 1.5 0 0 1 4.5 7.5h2.25Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.15a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z" />
    </svg>
  );
}

/**
 * 4 nút chụp ảnh báo cáo ngày — desktop nhóm compact, mobile chip ≥44px.
 * Không đụng `copyCargoDayReportImage` / phạm vi kho.
 */
export function OpsCargoReportToolbar({
  viewRows,
  copying = false,
  onCopy,
  variant,
}: Props) {
  const actions = useMemo(
    () => listOpsCargoReportActions({ viewRows, copying }),
    [copying, viewRows],
  );
  const isMobile = variant === "mobile";

  return (
    <div
      data-testid="ops-cargo-report-toolbar"
      data-variant={variant}
      role="group"
      aria-label="Ảnh báo cáo lô hàng"
      aria-busy={copying || undefined}
      className={
        isMobile
          ? "flex min-w-0 items-center gap-1.5"
          : "flex min-w-0 items-center gap-1.5"
      }
    >
      <span
        className={
          isMobile
            ? "inline-flex min-h-11 shrink-0 items-center gap-1 px-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ui-text-muted"
            : "inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-ui-text-muted"
        }
        title="Copy ảnh báo cáo ngày vào clipboard"
      >
        <CameraGlyph className={isMobile ? "h-3.5 w-3.5" : "h-3 w-3"} />
        Ảnh
      </span>

      <div
        className={
          isMobile
            ? "flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
            : "inline-flex min-w-0 items-center gap-1"
        }
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            data-testid={`ops-cargo-report-${action.id}`}
            data-kind={action.id}
            disabled={action.disabled}
            title={`${action.label} — ${action.description}${copying ? " · Đang copy…" : ""}`}
            aria-label={`Ảnh báo cáo ${action.label} — ${action.description}`}
            onClick={() => {
              if (action.disabled) return;
              onCopy(action.id);
            }}
            className={
              isMobile
                ? `inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded-xl border-l-[3px] px-2.5 text-[12px] font-extrabold ring-1 transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus disabled:cursor-not-allowed disabled:opacity-40 ${KIND_TONE[action.id]}`
                : `inline-flex min-h-9 shrink-0 items-center rounded-lg border-l-[3px] px-2 text-[11px] font-extrabold ring-1 transition hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus disabled:cursor-not-allowed disabled:opacity-40 ${KIND_TONE[action.id]}`
            }
          >
            {action.label}
          </button>
        ))}
      </div>

      {copying ? (
        <span className="shrink-0 text-[10px] font-semibold text-ui-text-muted" aria-live="polite">
          Đang copy…
        </span>
      ) : null}
    </div>
  );
}
