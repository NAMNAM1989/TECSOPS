import type { TcsExtPresence } from "../utils/tcsChromeExtension";

/** Token thanh cổng Ext (TCS + SCSC) — Round 3, không dual-path. */
export const PORTAL_BAR_UI = {
  chipBase:
    "inline-flex min-h-9 max-w-full shrink-0 items-center truncate rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset",
  chipTone: {
    offline: "bg-slate-100 text-slate-700 ring-slate-300/80",
    ready: "bg-sky-50 text-sky-950 ring-sky-300/80",
    logged_in: "bg-emerald-50 text-emerald-950 ring-emerald-300/80",
  } satisfies Record<TcsExtPresence, string>,
  btnBase:
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-xl px-3 text-[12px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45 touch-manipulation active:scale-[0.98]",
  btnPrimary:
    "bg-ui-primary text-white shadow-ui-sm hover:bg-ui-primary-hover",
  btnAccent:
    "border border-emerald-500/35 bg-emerald-50 text-emerald-950 hover:bg-emerald-100",
  hint: "px-0.5 text-[11px] leading-snug text-ui-text-muted",
  toolbar:
    "flex min-w-0 flex-wrap items-center gap-1.5",
} as const;

export const PORTAL_EXT_CHIP_LABEL: Record<TcsExtPresence, string> = {
  offline: "offline",
  ready: "sẵn sàng",
  logged_in: "đã login",
};

export const NEED_EXT_PC =
  "Cần Chrome Ext trên PC (menu «Tải Ext»: TCS + SCSC). Điện thoại không Đăng Nhập TCS / Quét / Điền / PDF được.";
