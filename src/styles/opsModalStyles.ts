/** Token modal / menu Ops — semantic `ui-*` (Operational Signal). */

export const OPS = {
  modal: "bg-ui-surface text-ui-text",
  aside: "border-ui-border bg-ui-surface-muted",
  border: "border-ui-border ",
  title: "text-ui-navy ",
  muted: "text-ui-text-muted ",
  secondary: "text-ui-text-muted ",
  accent: "text-ui-primary ",
  input:
    "rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1.5 text-ui-text outline-none focus:border-ui-primary/50 focus:ring-1 focus:ring-ui-focus",
  inputInvalid:
    "border-red-500/80 ring-1 ring-red-500/25 focus:border-red-500 focus:ring-red-500/30 ",
  inputLg:
    "rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-sm text-ui-text outline-none focus:border-ui-primary/50 focus:ring-1 focus:ring-ui-focus",
  navActive: "bg-ui-surface shadow-sm ring-1 ring-ui-primary/30",
  navIdle: "hover:bg-ui-surface/80 ",
  listActive: "bg-ui-surface shadow-sm ring-1 ring-ui-primary/25",
  listIdle: "text-ui-text-muted hover:bg-ui-surface/80",
  card: "rounded-xl border border-ui-border bg-ui-surface",
  panelSoft: "rounded-xl border border-ui-border bg-ui-surface-muted/80",
  tableWrap: "overflow-hidden rounded-xl border border-ui-border bg-ui-surface",
  tableHead:
    "border-b border-ui-border bg-ui-surface-muted text-[10px] font-semibold uppercase text-ui-text-muted",
  tableRow: "border-b border-ui-border/80 hover:bg-ui-surface-muted",
  tableCell: "font-medium text-ui-text ",
  tableDetail: "bg-ui-surface-muted ",
  empty:
    "rounded-xl border border-dashed border-ui-border bg-ui-surface px-3 py-4 text-center text-xs text-ui-text-muted",
  btnAdd:
    "rounded-full border border-dashed border-ui-primary/40 bg-ui-surface py-2 text-xs font-semibold text-ui-primary hover:bg-ui-primary/5",
  btnSmallAccent:
    "rounded-full border border-ui-border px-2.5 py-1 text-[10px] font-semibold text-ui-primary hover:bg-ui-primary/10",
  btnResetAmber:
    "rounded-full border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100",
  sectionProfile: "rounded-xl border border-ui-primary/20 bg-ui-primary/[0.04]",
  sectionViolet: "rounded-lg border border-violet-200/50 bg-violet-50/80",
  sectionVioletTitle: "text-violet-900 ",
  sectionAgents: "rounded-xl border border-violet-200/60 bg-violet-50/40",
  sectionAgentsTitle: "text-violet-900 ",
  sectionAgentsHint: "text-violet-900/80 ",
  sectionSender: "rounded-2xl border border-sky-200/60 bg-sky-50/40",
  sectionSenderTitle: "text-sky-900 ",
  sectionSenderHint: "text-sky-900/80 ",
  footer: "border-t border-ui-border bg-ui-surface",
  tabActive: "bg-ui-primary text-white shadow-sm",
  tabIdle:
    "border border-ui-border bg-ui-surface text-ui-text hover:bg-ui-surface-muted",
  dropdown:
    "overflow-hidden rounded-lg border border-ui-border bg-ui-surface py-0.5 shadow-ui-md",
  dropdownLg:
    "overflow-hidden rounded-xl border border-ui-border bg-ui-surface py-1 shadow-ui-md",
  dropdownItem:
    "block w-full px-2.5 py-1.5 text-left text-[11px] font-semibold text-ui-text hover:bg-ui-surface-muted",
  dropdownItemLg:
    "block w-full px-3 py-2.5 text-left text-sm font-semibold text-ui-text hover:bg-ui-surface-muted",
  dropdownItemDanger: "text-red-700 hover:bg-red-50",
  pickPrimary:
    "mb-2 flex cursor-pointer items-start gap-2 rounded-xl border border-ui-primary/20 bg-ui-primary/5 px-3 py-2",
  pickItem:
    "mb-1.5 flex cursor-pointer items-start gap-2 rounded-xl border border-ui-border px-3 py-2 hover:bg-ui-surface-muted",
  pickHero:
    "mb-2 w-full rounded-2xl border-2 border-ui-primary/25 bg-ui-primary/5 px-4 py-3 text-left transition hover:bg-ui-primary/10",
  pickSaved:
    "mb-1.5 w-full rounded-2xl border border-ui-border bg-ui-surface-muted px-4 py-3 text-left transition hover:bg-ui-primary/10",
  actionIcon:
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ui-border bg-ui-surface text-ui-text shadow-sm transition-colors hover:bg-ui-surface-muted focus:outline-none focus:ring-2 focus:ring-ui-focus",
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
    "rounded-xl bg-ui-surface-muted px-3 py-2 text-center text-xs text-ui-text",
  formatBtnOn:
    "border-emerald-600 bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400/40",
  formatBtnOff:
    "border-emerald-300/80 bg-emerald-50 text-emerald-950 hover:border-emerald-500 hover:bg-emerald-100",
  formatBtnSubOn: "text-emerald-100",
  formatBtnSubOff: "text-emerald-800/75 ",
  /** Khung xem trước — nền xám nhạt. */
  printPreviewFrame:
    "relative overflow-hidden rounded-xl border border-ui-border bg-[#e8eaee] shadow-inner",
  printCoordsToggle:
    "flex cursor-pointer items-center gap-1.5 rounded-full border border-sky-200/80 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold text-sky-900",
  printCoordsToolbarOn:
    "rounded-xl border border-ui-primary/30 bg-ui-primary/5 px-3 py-2",
  printCoordsToolbarOff:
    "rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-2",
  printCoordsPanel:
    "flex min-h-0 flex-col rounded-xl border border-sky-200/60 bg-sky-50/40",
  printCoordsPanelHead: "border-b border-sky-200/50 px-3 py-2 ",
  printCoordsPanelTitle: "text-[10px] font-semibold uppercase text-sky-900 ",
  printCoordsPanelHint: "text-[10px] text-sky-900/75 ",
  printCoordsTableHead: "sticky top-0 bg-sky-100/90 text-sky-950",
  printSummaryCard:
    "rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-2",
  printStepperBtn:
    "min-w-[1.75rem] rounded border border-ui-border bg-ui-surface px-1.5 py-0.5 text-xs font-bold text-ui-text hover:bg-ui-surface-muted",
  printStepperInput:
    "w-14 rounded border border-ui-border bg-ui-surface px-1 py-0.5 text-center text-[10px] tabular-nums",
} as const;
