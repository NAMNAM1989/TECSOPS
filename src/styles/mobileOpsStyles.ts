/** Token UI mobile OPS — thông báo & nhập booking nhanh. */
import { OPS } from "./opsModalStyles";

export const MOBILE = {
  sheet: `${OPS.modal} flex max-h-[92vh] flex-col rounded-t-[28px] border shadow-[0_-8px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_40px_rgba(0,0,0,0.45)]`,
  sheetBackdrop: "fixed inset-0 z-[470] flex flex-col justify-end bg-black/35 backdrop-blur-sm md:hidden",
  card: "relative overflow-hidden rounded-xl border border-black/[0.06] shadow-dashboard-card transition-all dark:border-white/[0.08]",
  cardInner: "relative z-10 bg-transparent px-2.5 py-2 transition-transform duration-200 ease-out",
  cardMeta: "text-[10px] font-medium text-apple-tertiary dark:text-slate-500",
  customerName:
    "truncate text-[13px] font-semibold uppercase leading-snug tracking-tight text-apple-label dark:text-slate-100",
  awb: "font-mono text-[15px] font-bold leading-tight tracking-tight text-dashboard-primary dark:text-dashboard-primary-dark",
  awbEmpty: "text-[13px] font-semibold text-apple-blue dark:text-sky-300",
  chip: "inline-flex items-center rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-apple-label dark:bg-white/[0.08] dark:text-slate-200",
  chipCutoff: "inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white",
  primaryBtn:
    "rounded-full bg-apple-blue py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(0,113,227,0.32)] transition active:scale-[0.98] dark:bg-sky-500 dark:shadow-[0_4px_14px_rgba(56,189,248,0.25)]",
  secondaryBtn: `rounded-full border py-3 text-sm font-semibold transition active:scale-[0.98] ${OPS.tabIdle}`,
  inputHero:
    "w-full rounded-2xl border-2 border-apple-blue/25 bg-white px-4 py-3.5 font-mono text-lg font-bold tracking-tight text-apple-label outline-none focus:border-apple-blue/60 focus:ring-2 focus:ring-apple-blue/20 dark:border-sky-400/35 dark:bg-ops-elevated dark:text-slate-100 dark:focus:border-sky-400/55 dark:focus:ring-sky-400/25",
  input: OPS.inputLg,
  fieldLabel: "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-apple-secondary dark:text-slate-400",
  tabActive: OPS.tabActive,
  tabIdle: "rounded-full py-2.5 text-[12px] font-semibold text-apple-secondary transition hover:bg-black/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.06]",
  sectionEmpty:
    "rounded-2xl border border-dashed border-black/[0.1] bg-apple-blue/[0.04] px-4 py-8 text-center dark:border-white/12 dark:bg-sky-500/10",
} as const;
