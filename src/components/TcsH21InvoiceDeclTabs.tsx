import type { RefObject } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { buildH21InvoiceNo } from "../../shared/scscH21InvoiceCore.mjs";
import {
  parseAllocateKgFromDraft,
  type H21DeclSplit,
} from "../utils/scscH21InvoiceSplits";
import type { H21CargoFamilyId } from "../utils/scscH21InvoiceCargoFamily";
import { labelForH21CargoFamily } from "../utils/scscH21InvoiceCargoFamily";
import { Button } from "../ui";

type InvoiceFooterSummary = {
  linesKg: number;
  grossKg: number;
  residualKg: number;
  totalCartonPkgs: number;
  declarationPcs: number;
};

type Props = {
  shipment: Shipment;
  customerEntry: CustomerDirectoryEntry | null | undefined;
  splits: readonly H21DeclSplit[];
  activeSplitId: string | undefined;
  tabsScrollRef: RefObject<HTMLDivElement | null>;
  isDirty: boolean;
  filledSplitCount: number;
  invoiceSeq: number;
  invoiceSeqTotal: number;
  lotKg: number;
  lotPcs: number;
  remainLotKg: number;
  allocateKgDraft: string;
  lineCountDraft: string;
  pcsDraft: string;
  linesLength: number;
  footer: InvoiceFooterSummary;
  effectiveCargoFamily: H21CargoFamilyId;
  onSelectSplit: (id: string) => void;
  onRemoveSplit: (id: string) => void;
  onAddSplit: () => void;
  onAllocateKgChange: (value: string) => void;
  onAllocateKgBlur: () => void;
  onLineCountChange: (value: string) => void;
  onLineCountBlur: () => void;
  onPcsChange: (value: string) => void;
  onPcsBlur: () => void;
  onRandomGenerate: () => void;
};

const fieldClass =
  "h-8 w-full rounded-lg border border-ui-border/80 bg-white px-2 font-mono text-[13px] font-semibold tabular-nums text-ui-navy outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50";

/** Tab tờ khai + toolbar — gọn 2 hàng, thao tác nhanh. */
export function TcsH21InvoiceDeclTabs({
  shipment,
  customerEntry,
  splits,
  activeSplitId,
  tabsScrollRef,
  isDirty,
  filledSplitCount,
  invoiceSeq,
  invoiceSeqTotal,
  lotKg,
  lotPcs,
  remainLotKg,
  allocateKgDraft,
  lineCountDraft,
  pcsDraft,
  linesLength,
  footer,
  effectiveCargoFamily,
  onSelectSplit,
  onRemoveSplit,
  onAddSplit,
  onAllocateKgChange,
  onAllocateKgBlur,
  onLineCountChange,
  onLineCountBlur,
  onPcsChange,
  onPcsBlur,
  onRandomGenerate,
}: Props) {
  return (
    <div className="shrink-0 space-y-1.5 border-b border-ui-border/70 bg-ui-surface px-3 py-2 sm:px-4">
      {/* Hàng 1: tiêu đề + tab strip */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[12px] font-extrabold text-ui-navy">Tờ khai</span>
          {invoiceSeqTotal > 1 ? (
            <span className="text-[10px] font-semibold text-ui-text-muted">{invoiceSeqTotal} INV</span>
          ) : null}
          {isDirty ? (
            <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-bold text-amber-900">
              chưa lưu
            </span>
          ) : filledSplitCount > 0 ? (
            <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold text-emerald-800">
              đã lưu
            </span>
          ) : null}
        </div>

        <div
          ref={tabsScrollRef as RefObject<HTMLDivElement>}
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Tờ khai H21"
        >
          {splits.map((s, idx) => {
            const seq = idx + 1;
            const suggested = buildH21InvoiceNo(shipment, customerEntry, {
              seq,
              total: invoiceSeqTotal,
            });
            const no = String(s.invoiceNoDraft ?? "").trim() || suggested;
            const selected = s.id === activeSplitId;
            const hasLines = s.lines.length > 0;
            const kg = parseAllocateKgFromDraft(s.kgDraft, lotKg);
            return (
              <div
                key={s.id}
                data-split-id={s.id}
                role="tab"
                aria-selected={selected}
                className={`group relative flex h-9 shrink-0 items-center gap-1.5 rounded-xl border pl-2.5 pr-1.5 transition ${
                  selected
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                    : "border-ui-border/80 bg-slate-50 text-ui-text hover:border-indigo-300 hover:bg-white"
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 max-w-[14rem] items-center gap-1.5 text-left focus:outline-none"
                  onClick={() => onSelectSplit(s.id)}
                  title={no || undefined}
                >
                  <span className="shrink-0 text-[10px] font-extrabold">TK{seq}</span>
                  <span
                    className={`hidden truncate font-mono text-[11px] font-semibold sm:inline ${
                      selected ? "text-white/95" : "text-indigo-900"
                    }`}
                  >
                    {no || "—"}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-[11px] font-bold tabular-nums ${
                      selected ? "text-white/90" : "text-ui-text-muted"
                    }`}
                  >
                    {kg || "—"}kg
                  </span>
                  <span
                    className={`shrink-0 rounded px-1 text-[9px] font-bold ${
                      hasLines
                        ? selected
                          ? "bg-white/20"
                          : "bg-emerald-100 text-emerald-800"
                        : selected
                          ? "bg-white/15 text-white/85"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {hasLines ? `${s.lines.length}d` : "trống"}
                  </span>
                </button>
                {splits.length > 1 ? (
                  <button
                    type="button"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold transition ${
                      selected
                        ? "text-white/80 hover:bg-white/15 hover:text-white"
                        : "text-ui-text-muted opacity-0 hover:bg-red-50 hover:text-red-700 group-hover:opacity-100"
                    }`}
                    title="Xóa tờ khai"
                    aria-label={`Xóa tờ khai ${seq}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSplit(s.id);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/70 px-2.5 text-[11px] font-bold text-indigo-800 transition hover:bg-indigo-100"
            onClick={onAddSplit}
            title="Thêm tờ khai mới (INV tăng -1, -2…)"
          >
            <span className="text-base leading-none">+</span>
            Thêm
          </button>
          {remainLotKg > 0 ? (
            <span className="shrink-0 text-[10px] font-semibold text-indigo-700">
              còn {remainLotKg}/{lotKg} kg
            </span>
          ) : null}
        </div>
      </div>

      {/* Hàng 2: chỉnh TK + hành động + tóm tắt 1 dòng */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-ui-border/60 bg-slate-50/80 px-2 py-1.5">
        <span className="inline-flex h-7 shrink-0 items-center rounded-lg bg-indigo-600 px-2 text-[10px] font-extrabold text-white">
          TK {invoiceSeq}
        </span>

        <label className="inline-flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-ui-text-muted">Kg</span>
          <input
            type="text"
            inputMode="decimal"
            className={`${fieldClass} w-[4.5rem]`}
            value={allocateKgDraft}
            aria-label="KG tờ khai"
            onChange={(e) => onAllocateKgChange(e.target.value.replace(/[^\d.,]/g, ""))}
            onBlur={onAllocateKgBlur}
          />
        </label>
        <label className="inline-flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-ui-text-muted">Dòng</span>
          <input
            type="text"
            inputMode="numeric"
            className={`${fieldClass} w-12`}
            value={lineCountDraft}
            aria-label="Số dòng"
            onChange={(e) => onLineCountChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
            onBlur={onLineCountBlur}
          />
        </label>
        <label className="inline-flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-ui-text-muted">Kiện</span>
          <input
            type="text"
            inputMode="numeric"
            className={`${fieldClass} w-14`}
            value={pcsDraft}
            aria-label="Số kiện"
            title="Tổng số kiện (Total carton) trên invoice"
            onChange={(e) => onPcsChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onBlur={onPcsBlur}
          />
        </label>

        <span className="hidden h-5 w-px bg-ui-border/80 sm:block" aria-hidden />

        <div className="flex items-center gap-1">
          <Button type="button" variant="secondary" size="sm" className="!min-h-8 !px-2.5" onClick={onRandomGenerate}>
            Ngẫu nhiên
          </Button>
        </div>

        <p
          className="ml-auto min-w-0 truncate text-right font-mono text-[11px] font-semibold tabular-nums text-ui-text-muted"
          title={`${linesLength} dòng · ${footer.linesKg}/${footer.grossKg} kg · ${labelForH21CargoFamily(effectiveCargoFamily)} · ${footer.totalCartonPkgs} PKGS${footer.residualKg > 0 ? ` · dư ${footer.residualKg} kg` : ""}${lotPcs > 0 ? ` · lô ${lotPcs} kiện` : ""}`}
        >
          <span className="text-ui-navy">{linesLength}</span>d
          <span className="mx-1 text-ui-border">·</span>
          <span className="text-indigo-800">
            {footer.linesKg}/{footer.grossKg}kg
          </span>
          <span className="mx-1 text-ui-border">·</span>
          {labelForH21CargoFamily(effectiveCargoFamily)}
          <span className="mx-1 text-ui-border">·</span>
          <span className="text-emerald-800">{footer.totalCartonPkgs} PKGS</span>
          {footer.residualKg > 0 ? (
            <>
              <span className="mx-1 text-ui-border">·</span>
              <span className="text-amber-800">dư {footer.residualKg}</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
