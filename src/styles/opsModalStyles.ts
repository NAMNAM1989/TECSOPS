/** Token modal / menu Ops — đồng bộ light/dark (ops-surface, ops-elevated). */

export const OPS = {
  modal: "bg-white text-apple-label dark:bg-ops-surface dark:text-slate-100",
  aside: "border-black/[0.08] bg-apple-bg/90 dark:border-white/[0.08] dark:bg-dashboard-canvas-dark",
  border: "border-black/[0.06] dark:border-white/[0.08]",
  title: "text-apple-label dark:text-slate-100",
  muted: "text-apple-tertiary dark:text-slate-400",
  secondary: "text-apple-secondary dark:text-slate-300",
  accent: "text-apple-blue dark:text-sky-300",
  input:
    "rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-apple-label outline-none focus:border-apple-blue/50 focus:ring-1 focus:ring-apple-blue/25 dark:border-white/12 dark:bg-ops-elevated dark:text-slate-100 dark:placeholder:text-slate-500",
  inputLg:
    "rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label outline-none focus:border-apple-blue/50 focus:ring-1 focus:ring-apple-blue/25 dark:border-white/12 dark:bg-ops-elevated dark:text-slate-100 dark:placeholder:text-slate-500",
  navActive: "bg-white shadow-sm ring-1 ring-apple-blue/30 dark:bg-ops-elevated dark:ring-sky-400/40",
  navIdle: "hover:bg-white/80 dark:hover:bg-white/[0.06]",
  listActive:
    "bg-white shadow-sm ring-1 ring-apple-blue/25 dark:bg-ops-elevated dark:ring-sky-400/35 dark:text-slate-100",
  listIdle: "text-apple-secondary hover:bg-white/80 dark:text-slate-400 dark:hover:bg-white/[0.06]",
  card: "rounded-xl border border-black/[0.08] bg-white dark:border-white/10 dark:bg-ops-elevated",
  panelSoft: "rounded-xl border border-black/[0.08] bg-apple-bg/40 dark:border-white/10 dark:bg-black/25",
  tableWrap: "overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/10 dark:bg-ops-elevated",
  tableHead:
    "border-b border-black/[0.08] bg-apple-bg/90 text-[10px] font-semibold uppercase text-apple-tertiary dark:border-white/10 dark:bg-black/30 dark:text-slate-400",
  tableRow: "border-b border-black/[0.06] hover:bg-apple-bg/40 dark:border-white/[0.06] dark:hover:bg-white/[0.04]",
  tableCell: "font-medium text-apple-label dark:text-slate-200",
  tableDetail: "bg-apple-bg/50 dark:bg-black/20",
  empty:
    "rounded-xl border border-dashed border-black/[0.12] bg-white/90 px-3 py-4 text-center text-xs text-apple-tertiary dark:border-white/15 dark:bg-black/20 dark:text-slate-400",
  btnAdd:
    "rounded-full border border-dashed border-apple-blue/40 bg-white py-2 text-xs font-semibold text-apple-blue hover:bg-apple-blue/5 dark:border-sky-400/35 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20",
  btnSmallAccent:
    "rounded-full border border-black/[0.1] px-2.5 py-1 text-[10px] font-semibold text-apple-blue hover:bg-apple-blue/10 dark:border-white/12 dark:bg-ops-elevated dark:text-sky-300 dark:hover:bg-sky-500/15",
  btnResetAmber:
    "rounded-full border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25",
  sectionProfile:
    "rounded-xl border border-apple-blue/20 bg-apple-blue/[0.04] dark:border-sky-400/30 dark:bg-sky-500/10",
  sectionViolet:
    "rounded-lg border border-violet-200/50 bg-violet-50/80 dark:border-violet-400/25 dark:bg-violet-500/10",
  sectionVioletTitle: "text-violet-900 dark:text-violet-200",
  sectionAgents:
    "rounded-xl border border-violet-200/60 bg-violet-50/40 dark:border-violet-400/25 dark:bg-violet-500/10",
  sectionAgentsTitle: "text-violet-900 dark:text-violet-200",
  sectionAgentsHint: "text-violet-900/80 dark:text-violet-300/90",
  sectionSender:
    "rounded-2xl border border-sky-200/60 bg-sky-50/40 dark:border-sky-400/25 dark:bg-sky-500/10",
  sectionSenderTitle: "text-sky-900 dark:text-sky-200",
  sectionSenderHint: "text-sky-900/80 dark:text-sky-300/90",
  footer:
    "border-t border-black/[0.08] bg-white/95 dark:border-white/[0.08] dark:bg-ops-surface/95",
  tabActive: "bg-apple-blue text-white shadow-sm",
  tabIdle:
    "border border-black/[0.1] bg-white text-apple-label hover:bg-black/[0.03] dark:border-white/12 dark:bg-ops-elevated dark:text-slate-200 dark:hover:bg-white/[0.06]",
  dropdown:
    "overflow-hidden rounded-lg border border-black/[0.1] bg-white py-0.5 shadow-apple-md dark:border-white/12 dark:bg-ops-elevated",
  dropdownLg:
    "overflow-hidden rounded-xl border border-black/[0.1] bg-white py-1 shadow-apple-md dark:border-white/12 dark:bg-ops-elevated",
  dropdownItem:
    "block w-full px-2.5 py-1.5 text-left text-[11px] font-semibold text-apple-label hover:bg-black/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.06]",
  dropdownItemLg:
    "block w-full px-3 py-2.5 text-left text-sm font-semibold text-apple-label hover:bg-black/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.06]",
  dropdownItemDanger: "text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/15",
  pickPrimary:
    "mb-2 flex cursor-pointer items-start gap-2 rounded-xl border border-apple-blue/20 bg-apple-blue/5 px-3 py-2 dark:border-sky-400/30 dark:bg-sky-500/10",
  pickItem:
    "mb-1.5 flex cursor-pointer items-start gap-2 rounded-xl border border-black/[0.06] px-3 py-2 hover:bg-apple-bg/60 dark:border-white/10 dark:hover:bg-white/[0.06]",
  pickHero:
    "mb-2 w-full rounded-2xl border-2 border-apple-blue/25 bg-apple-blue/5 px-4 py-3 text-left transition hover:bg-apple-blue/10 dark:border-sky-400/35 dark:bg-sky-500/10 dark:hover:bg-sky-500/20",
  pickSaved:
    "mb-1.5 w-full rounded-2xl border border-black/[0.06] bg-apple-bg/50 px-4 py-3 text-left transition hover:bg-apple-blue/10 dark:border-white/10 dark:bg-black/25 dark:hover:bg-sky-500/10",
  actionIcon:
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-black/[0.08] bg-white/80 text-apple-secondary shadow-sm transition-all hover:border-black/[0.12] hover:bg-white hover:text-apple-label active:scale-[0.96] dark:border-white/10 dark:bg-ops-elevated/90 dark:text-slate-400 dark:hover:bg-ops-elevated dark:hover:text-slate-100",
  actionIconOpen:
    "border-apple-blue/40 text-apple-blue dark:border-sky-400/50 dark:text-sky-300",
  stickyBar:
    "border-t border-black/[0.08] bg-white/80 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.08] dark:bg-ops-surface/90",
  msgBox: "rounded-xl bg-black/[0.04] px-3 py-2 text-center text-xs text-apple-label dark:bg-white/[0.06] dark:text-slate-200",
  formatBtnOn: "border-emerald-600 bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400/40",
  formatBtnOff:
    "border-emerald-300/80 bg-emerald-50 text-emerald-950 hover:border-emerald-500 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/25",
  formatBtnSubOn: "text-emerald-100",
  formatBtnSubOff: "text-emerald-800/75 dark:text-emerald-200/80",
} as const;

/** @deprecated Dùng OPS — giữ alias cho modal Khách hàng. */
export const CD = OPS;

export const opsInput = OPS.input;
export const cdInput = OPS.input;
