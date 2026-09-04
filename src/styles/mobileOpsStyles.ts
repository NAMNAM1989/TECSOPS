/** Token UI mobile OPS — Day board sạch (Hướng A). */
export const MOBILE = {
  sheet:
    "flex w-full max-h-[min(92vh,92dvh)] max-w-[100vw] flex-col rounded-t-[28px] border border-ui-border bg-ui-surface shadow-ui-lg animate-cnee-slide-up",
  sheetBackdrop:
    "fixed inset-0 z-[560] flex flex-col justify-end bg-black/40 md:hidden",
  /** Card lô — hierarchy AWB → status → kg */
  card: "relative overflow-hidden rounded-xl border border-ui-border/70 bg-ui-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
  cardInner: "relative z-10 bg-transparent px-2.5 py-2",
  destBadge:
    "inline-flex shrink-0 items-center rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200/80",
  cardFlight:
    "truncate font-shipment-data text-[10px] font-medium leading-none text-ui-text-muted/90",
  cardQty: "font-mono text-[12px] font-extrabold tabular-nums text-teal-800",
  cardMeta: "truncate font-shipment-data text-[11px] font-medium leading-tight text-ui-text-muted",
  customerName:
    "font-vi inline-flex max-w-full truncate rounded-md bg-rose-50 px-1.5 py-0.5 font-sans text-[13px] font-extrabold leading-snug tracking-normal text-ui-awb ring-1 ring-rose-100/90",
  awb: "font-shipment-data text-[15px] font-extrabold leading-none tracking-tight tabular-nums text-ui-navy whitespace-nowrap",
  awbEmpty: "text-[13px] font-semibold leading-tight text-ui-primary hover:text-ui-primary-hover",
  chip: "inline-flex items-center rounded-md bg-ui-surface-muted px-1.5 py-px text-[9px] font-bold uppercase tracking-wide tabular-nums text-ui-text",
  chipCutoff:
    "inline-flex items-center rounded-md bg-ui-danger px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white",
  primaryBtn:
    "inline-flex min-h-11 items-center justify-center rounded-xl bg-ui-primary px-4 text-[13px] font-bold text-white shadow-ui-sm transition hover:bg-ui-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus active:scale-[0.98]",
  secondaryBtn:
    "inline-flex min-h-11 items-center justify-center rounded-xl border border-ui-border bg-ui-surface px-4 text-[13px] font-semibold text-ui-text transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus active:scale-[0.98]",
  inputHero:
    "box-border w-full min-h-12 min-w-0 rounded-xl border border-ui-border bg-ui-surface px-3 py-3 font-shipment-data text-[15px] font-bold tracking-tight text-ui-text outline-none focus:border-ui-primary focus:ring-2 focus:ring-ui-focus sm:px-4 sm:text-base",
  input:
    "box-border w-full min-h-11 min-w-0 rounded-xl border border-ui-border bg-ui-surface px-3.5 py-2.5 font-semibold text-[13px] text-ui-text outline-none focus:border-ui-primary focus:ring-2 focus:ring-ui-focus",
  fieldLabel: "mb-1 block text-[10px] font-bold uppercase tracking-wider text-ui-text-muted",
  tabActive:
    "flex-1 rounded-xl bg-ui-navy py-2.5 text-center text-[12px] font-semibold text-white transition",
  tabIdle:
    "flex-1 rounded-xl py-2.5 text-center text-[12px] font-semibold text-ui-text-muted transition hover:bg-ui-surface-muted",
  sectionEmpty:
    "rounded-2xl border border-dashed border-ui-border bg-ui-surface-muted/60 px-4 py-8 text-center",
} as const;

/** Ẩn trên desktop — bỏ qua khi bật xem mobile trên màn rộng. */
export function mobileOnlyVisibility(isMobileLayout: boolean): string {
  return isMobileLayout ? "" : "md:hidden";
}

export function mobileSheetBackdrop(isMobileLayout: boolean): string {
  return `${MOBILE.sheetBackdrop.replace(" md:hidden", "")} ${mobileOnlyVisibility(isMobileLayout)}`.trim();
}
