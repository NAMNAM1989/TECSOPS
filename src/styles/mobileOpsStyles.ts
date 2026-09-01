/** Nav 52px + min 12px / Safari safe-area. */
export const MOBILE_BOTTOM_NAV_H = 52;
export const MOBILE_FAB_SIZE = 56;
export const MOBILE_FAB_GAP = 16;
export const MOBILE_LIST_AFTER_FAB = 24;
/** 52 + 16 + 56 + 24 — list pad dưới FAB, chưa kể safe-area. */
export const MOBILE_LIST_FAB_CLEARANCE =
  MOBILE_BOTTOM_NAV_H + MOBILE_FAB_GAP + MOBILE_FAB_SIZE + MOBILE_LIST_AFTER_FAB;

/** Token UI mobile OPS — hierarchy Ngày → Kho → List → 1 CTA. */
export const MOBILE = {
  sheet:
    "flex w-full max-h-[min(92vh,92dvh)] max-w-[100vw] flex-col rounded-t-ui-lg border border-ui-border bg-ui-surface shadow-ui-lg animate-cnee-slide-up",
  sheetBackdrop:
    "fixed inset-0 z-[560] flex flex-col justify-end bg-black/40 md:hidden",
  /** Card lô — 3 dòng, ~88–104px, accent kho 3px. */
  card: "relative overflow-hidden rounded-ui-md border border-ui-border bg-ui-surface shadow-ui-sm",
  cardInner: "relative z-10 bg-transparent px-3 py-3",
  destBadge:
    "inline-flex h-7 shrink-0 items-center rounded-ui-md bg-ui-surface-muted px-2 text-[13px] font-semibold leading-[18px] text-ui-text",
  cardFlight:
    "truncate text-[13px] font-medium leading-[18px] text-ui-text-muted",
  cardQty: "font-mono text-base font-semibold leading-6 tabular-nums text-ui-text",
  cardMeta: "truncate text-[12px] font-medium leading-4 text-ui-text-muted",
  customerName: "truncate text-base font-medium leading-6 tracking-tight text-ui-text",
  awb: "font-shipment-data text-[15px] font-semibold leading-5 tracking-tight tabular-nums text-ui-awb whitespace-nowrap",
  awbEmpty: "text-[13px] font-semibold leading-[18px] text-ui-primary hover:text-ui-primary-hover",
  /** FAB + list: bottomNav 52 + safe-area + 16; list thêm 56 + 24. */
  fabWrap:
    "no-print fixed right-4 z-40 bottom-[calc(52px+max(12px,env(safe-area-inset-bottom))+16px)] [[data-ops-mobile-overlay=sheet]_&]:pointer-events-none [[data-ops-mobile-overlay=sheet]_&]:invisible",
  listClearance:
    "pb-[calc(148px+max(12px,env(safe-area-inset-bottom)))] scroll-pb-[calc(148px+max(12px,env(safe-area-inset-bottom)))]",
  cardScrollMargin:
    "scroll-mb-[calc(148px+max(12px,env(safe-area-inset-bottom)))]",
  navSafePad: "pb-[max(12px,env(safe-area-inset-bottom))]",
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
