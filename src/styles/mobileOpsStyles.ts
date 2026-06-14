/** Token UI mobile OPS — thông báo & nhập booking nhanh. */
import { OPS } from "./opsModalStyles";

export const MOBILE = {
  sheet: `glass-panel flex max-h-[92vh] flex-col rounded-t-[32px] border shadow-[0_-12px_48px_rgba(0,0,0,0.12)] animate-cnee-slide-up`,
  sheetBackdrop: "fixed inset-0 z-[470] flex flex-col justify-end bg-black/40 backdrop-blur-md md:hidden animate-cnee-magnify-backdrop",
  card: "relative overflow-hidden rounded-[20px] border border-black/[0.04] bg-white dark:bg-dashboard-surface-dark shadow-apple transition-all duration-200 hover:shadow-apple-md dark:border-white/[0.05]",
  cardInner: "relative z-10 bg-transparent px-2.5 py-1.5 transition-transform duration-200 ease-out",
  cardMeta: "truncate text-[10px] font-medium leading-tight text-apple-secondary dark:text-slate-400",
  customerName:
    "truncate text-[11px] font-extrabold uppercase tracking-wide leading-tight text-indigo-700 dark:text-indigo-300",
  awb: "font-mono text-[13px] font-extrabold leading-none tracking-tight text-dashboard-primary dark:text-dashboard-primary-dark",
  awbEmpty: "text-[13px] font-semibold text-apple-blue hover:text-apple-blue-hover dark:text-sky-400 dark:hover:text-sky-300",
  chip: "inline-flex items-center rounded-full bg-black/[0.04] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide tabular-nums text-apple-label dark:bg-white/[0.06] dark:text-slate-200",
  chipCutoff: "inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wide",
  primaryBtn:
    "rounded-full bg-apple-blue py-3 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,113,227,0.24)] transition-all active:scale-[0.96] dark:bg-sky-500 dark:shadow-[0_4px_16px_rgba(56,189,248,0.2)]",
  secondaryBtn: `rounded-full border py-3 text-sm font-semibold transition-all active:scale-[0.96] ${OPS.tabIdle}`,
  inputHero:
    "w-full rounded-2xl border border-black/[0.08] bg-white px-4 py-3 font-mono text-base font-bold tracking-tight text-apple-label outline-none focus:border-apple-blue/50 focus:ring-4 focus:ring-apple-blue/10 dark:border-white/10 dark:bg-ops-elevated dark:text-slate-100 dark:focus:border-sky-500/50 dark:focus:ring-sky-500/10",
  input: `rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-apple-blue/50 focus:ring-4 focus:ring-apple-blue/10 dark:border-white/10 dark:bg-ops-elevated dark:text-slate-200 dark:focus:border-sky-500/50 dark:focus:ring-sky-500/10`,
  fieldLabel: "mb-1 block text-[10px] font-bold uppercase tracking-wider text-apple-secondary dark:text-slate-400",
  tabActive: "rounded-full bg-dashboard-primary text-white shadow-[0_2px_10px_rgba(15,23,42,0.15)] dark:bg-white/15 dark:text-dashboard-primary-dark dark:shadow-[0_2px_12px_rgba(96,165,250,0.18)] py-2.5 text-[12px] font-semibold flex-1 text-center transition-all",
  tabIdle: "rounded-full py-2.5 text-[12px] font-semibold text-apple-secondary transition hover:bg-black/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.06] flex-1 text-center transition-all",
  sectionEmpty:
    "rounded-[24px] border border-dashed border-black/[0.08] bg-apple-blue/[0.02] px-4 py-8 text-center dark:border-white/10 dark:bg-sky-500/5",
} as const;

/** Ẩn trên desktop — bỏ qua khi bật xem mobile trên màn rộng. */
export function mobileOnlyVisibility(isMobileLayout: boolean): string {
  return isMobileLayout ? "" : "md:hidden";
}

export function mobileSheetBackdrop(isMobileLayout: boolean): string {
  return `${MOBILE.sheetBackdrop.replace(" md:hidden", "")} ${mobileOnlyVisibility(isMobileLayout)}`.trim();
}
