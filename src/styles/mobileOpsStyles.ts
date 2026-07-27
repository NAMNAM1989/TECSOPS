/** Token UI mobile OPS — Operational Signal (Đợt C). */
export const MOBILE = {
  sheet:
    "flex max-h-[92vh] flex-col rounded-t-[28px] border border-ui-border bg-ui-surface shadow-[0_-8px_32px_rgba(15,23,42,0.12)] animate-cnee-slide-up",
  sheetBackdrop:
    "fixed inset-0 z-[470] flex flex-col justify-end bg-black/40 md:hidden",
  /** Card lô densified — nhiều dòng hơn trên viewport điện thoại */
  card: "relative overflow-hidden rounded-lg border border-ui-border/80 bg-ui-surface",
  cardInner: "relative z-10 bg-transparent px-2 py-1",
  cardMeta: "truncate font-shipment-data text-[10px] font-medium leading-tight text-ui-text-muted",
  customerName: "truncate text-[11px] font-semibold leading-tight text-ui-text",
  awb: "font-shipment-data text-[13px] font-extrabold leading-none tracking-tight text-ui-danger",
  awbEmpty: "text-[12px] font-semibold text-ui-primary hover:text-ui-primary-hover",
  chip: "inline-flex items-center rounded-md bg-ui-surface-muted px-1.5 py-px text-[9px] font-bold uppercase tracking-wide tabular-nums text-ui-text",
  chipCutoff:
    "inline-flex items-center rounded-md bg-ui-danger px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white",
  primaryBtn:
    "inline-flex min-h-11 items-center justify-center rounded-xl bg-ui-primary px-4 text-[13px] font-bold text-white shadow-ui-sm transition hover:bg-ui-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus active:scale-[0.98]",
  secondaryBtn:
    "inline-flex min-h-11 items-center justify-center rounded-xl border border-ui-border bg-ui-surface px-4 text-[13px] font-semibold text-ui-text transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus active:scale-[0.98]",
  inputHero:
    "w-full min-h-12 rounded-xl border border-ui-border bg-ui-surface px-4 py-3 font-shipment-data text-base font-bold tracking-tight text-ui-text outline-none focus:border-ui-primary focus:ring-2 focus:ring-ui-focus",
  input:
    "w-full min-h-11 rounded-xl border border-ui-border bg-ui-surface px-3.5 py-2.5 font-semibold text-[13px] text-ui-text outline-none focus:border-ui-primary focus:ring-2 focus:ring-ui-focus",
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
