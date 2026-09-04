/** Token modal / menu Ops — đồng bộ light/dark (ops-surface, ops-elevated). */

export const OPS = {
  modal: "bg-white text-apple-label",
  aside: "border-black/[0.08] bg-apple-bg/90",
  border: "border-black/[0.06] ",
  title: "text-apple-label ",
  muted: "text-apple-tertiary ",
  secondary: "text-apple-secondary ",
  accent: "text-apple-blue ",
  input:
    "rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-apple-label outline-none focus:border-apple-blue/50 focus:ring-1 focus:ring-apple-blue/25",
  inputInvalid:
    "border-red-500/80 ring-1 ring-red-500/25 focus:border-red-500 focus:ring-red-500/30 ",
  inputLg:
    "rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label outline-none focus:border-apple-blue/50 focus:ring-1 focus:ring-apple-blue/25",
  navActive: "bg-white shadow-sm ring-1 ring-apple-blue/30",
  navIdle: "hover:bg-white/80 ",
  listActive: "bg-white shadow-sm ring-1 ring-apple-blue/25",
  listIdle: "text-apple-secondary hover:bg-white/80",
  card: "rounded-xl border border-black/[0.08] bg-white",
  panelSoft: "rounded-xl border border-black/[0.08] bg-apple-bg/40",
  tableWrap: "overflow-hidden rounded-xl border border-black/[0.08] bg-white",
  tableHead:
    "border-b border-black/[0.08] bg-apple-bg/90 text-[10px] font-semibold uppercase text-apple-tertiary",
  tableRow: "border-b border-black/[0.06] hover:bg-apple-bg/40",
  tableCell: "font-medium text-apple-label ",
  tableDetail: "bg-apple-bg/50 ",
  empty:
    "rounded-xl border border-dashed border-black/[0.12] bg-white/90 px-3 py-4 text-center text-xs text-apple-tertiary",
  btnAdd:
    "rounded-full border border-dashed border-apple-blue/40 bg-white py-2 text-xs font-semibold text-apple-blue hover:bg-apple-blue/5",
  btnSmallAccent:
    "rounded-full border border-black/[0.1] px-2.5 py-1 text-[10px] font-semibold text-apple-blue hover:bg-apple-blue/10",
  btnResetAmber:
    "rounded-full border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100",
  sectionProfile: "rounded-xl border border-apple-blue/20 bg-apple-blue/[0.04]",
  sectionViolet: "rounded-lg border border-violet-200/50 bg-violet-50/80",
  sectionVioletTitle: "text-violet-900 ",
  sectionAgents: "rounded-xl border border-violet-200/60 bg-violet-50/40",
  sectionAgentsTitle: "text-violet-900 ",
  sectionAgentsHint: "text-violet-900/80 ",
  sectionSender: "rounded-2xl border border-sky-200/60 bg-sky-50/40",
  sectionSenderTitle: "text-sky-900 ",
  sectionSenderHint: "text-sky-900/80 ",
  footer: "border-t border-black/[0.08] bg-white/95",
  tabActive: "bg-apple-blue text-white shadow-sm",
  tabIdle:
    "border border-black/[0.1] bg-white text-apple-label hover:bg-black/[0.03]",
  dropdown:
    "overflow-hidden rounded-lg border border-black/[0.1] bg-white py-0.5 shadow-apple-md",
  dropdownLg:
    "overflow-hidden rounded-xl border border-black/[0.1] bg-white py-1 shadow-apple-md",
  dropdownItem:
    "block w-full px-2.5 py-1.5 text-left text-[11px] font-semibold text-apple-label hover:bg-black/[0.04]",
  dropdownItemLg:
    "block w-full px-3 py-2.5 text-left text-sm font-semibold text-apple-label hover:bg-black/[0.04]",
  dropdownItemDanger: "text-red-700 hover:bg-red-50",
  pickPrimary:
    "mb-2 flex cursor-pointer items-start gap-2 rounded-xl border border-apple-blue/20 bg-apple-blue/5 px-3 py-2",
  pickItem:
    "mb-1.5 flex cursor-pointer items-start gap-2 rounded-xl border border-black/[0.06] px-3 py-2 hover:bg-apple-bg/60",
  pickHero:
    "mb-2 w-full rounded-2xl border-2 border-apple-blue/25 bg-apple-blue/5 px-4 py-3 text-left transition hover:bg-apple-blue/10",
  pickSaved:
    "mb-1.5 w-full rounded-2xl border border-black/[0.06] bg-apple-bg/50 px-4 py-3 text-left transition hover:bg-apple-blue/10",
  actionIcon:
    "btn-kinetic inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ui-border bg-ui-surface text-ui-text shadow-sm hover:bg-ui-surface-muted hover:border-ui-border/80 hover:-translate-y-0.5 hover:shadow-ui-sm focus:outline-none focus:ring-2 focus:ring-ui-focus",
  actionIconOpen:
    "border-ui-primary/55 bg-ui-primary/10 text-ui-primary ring-1 ring-ui-primary/35",
  actionIconEmerald:
    "border-emerald-500/40 text-emerald-700 hover:border-emerald-500/55 hover:bg-emerald-500/10",
  actionIconCustoms:
    "border-indigo-500/45 text-indigo-800 hover:border-indigo-500/60 hover:bg-indigo-500/10",
  actionToolbar:
    "inline-flex max-w-full flex-nowrap items-center gap-0.5 rounded-xl border border-ui-border bg-ui-surface p-0.5 shadow-sm",
  actionIconSky: "border-sky-400/45 text-sky-700",
  actionIconSkyOpen:
    "border-sky-500/60 bg-sky-500/12 text-sky-700 ring-1 ring-sky-500/35",
  stickyBar: "border-t border-ui-border bg-ui-surface shadow-sm",
  msgBox:
    "rounded-xl bg-black/[0.04] px-3 py-2 text-center text-xs text-apple-label",
  formatBtnOn:
    "border-emerald-600 bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400/40",
  formatBtnOff:
    "border-emerald-300/80 bg-emerald-50 text-emerald-950 hover:border-emerald-500 hover:bg-emerald-100",
  formatBtnSubOn: "text-emerald-100",
  formatBtnSubOff: "text-emerald-800/75 ",
  /** Khung xem trước — nền xám nhạt (light) / tối (dark). */
  printPreviewFrame:
    "relative overflow-hidden rounded-xl border border-black/[0.1] bg-[#e8eaee] shadow-inner",
  printCoordsToggle:
    "flex cursor-pointer items-center gap-1.5 rounded-full border border-sky-200/80 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold text-sky-900",
  printCoordsToolbarOn:
    "rounded-xl border border-apple-blue/30 bg-apple-blue/5 px-3 py-2",
  printCoordsToolbarOff:
    "rounded-xl border border-black/[0.06] bg-black/[0.02] px-3 py-2",
  printCoordsPanel:
    "flex min-h-0 flex-col rounded-xl border border-sky-200/60 bg-sky-50/40",
  printCoordsPanelHead: "border-b border-sky-200/50 px-3 py-2 ",
  printCoordsPanelTitle: "text-[10px] font-semibold uppercase text-sky-900 ",
  printCoordsPanelHint: "text-[10px] text-sky-900/75 ",
  printCoordsTableHead: "sticky top-0 bg-sky-100/90 text-sky-950",
  printSummaryCard:
    "rounded-lg border border-black/[0.06] bg-apple-bg/50 px-2.5 py-2",
  printStepperBtn:
    "min-w-[1.75rem] rounded border border-black/[0.08] bg-white px-1.5 py-0.5 text-xs font-bold text-apple-label hover:bg-black/[0.04]",
  printStepperInput:
    "w-14 rounded border border-black/[0.08] bg-white px-1 py-0.5 text-center text-[10px] tabular-nums",
} as const;
