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
import { OPS } from "../styles/opsModalStyles";
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
  goodsListFileRef: RefObject<HTMLInputElement | null>;
  isDirty: boolean;
  filledSplitCount: number;
  invoiceSeq: number;
  invoiceSeqTotal: number;
  lotKg: number;
  lotPcs: number;
  remainLotKg: number;
  allocateKgDraft: string;
  lineCountDraft: string;
  linesLength: number;
  footer: InvoiceFooterSummary;
  effectiveCargoFamily: H21CargoFamilyId;
  importingList: boolean;
  loading: boolean;
  onSelectSplit: (id: string) => void;
  onRemoveSplit: (id: string) => void;
  onAddSplit: () => void;
  onAllocateKgChange: (value: string) => void;
  onAllocateKgBlur: () => void;
  onLineCountChange: (value: string) => void;
  onLineCountBlur: () => void;
  onRandomGenerate: () => void;
  onGoodsListFile: (file: File | null) => void;
  onUploadListClick: () => void;
};

/** Tab tờ khai + toolbar KG/dòng/upload — tách khỏi modal để giảm kích thước file. */
export function ScscH21InvoiceDeclTabs({
  shipment,
  customerEntry,
  splits,
  activeSplitId,
  tabsScrollRef,
  goodsListFileRef,
  isDirty,
  filledSplitCount,
  invoiceSeq,
  invoiceSeqTotal,
  lotKg,
  lotPcs,
  remainLotKg,
  allocateKgDraft,
  lineCountDraft,
  linesLength,
  footer,
  effectiveCargoFamily,
  importingList,
  loading,
  onSelectSplit,
  onRemoveSplit,
  onAddSplit,
  onAllocateKgChange,
  onAllocateKgBlur,
  onLineCountChange,
  onLineCountBlur,
  onRandomGenerate,
  onGoodsListFile,
  onUploadListClick,
}: Props) {
  return (
    <div className="shrink-0 space-y-2 border-b border-ui-border/60 px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-ui-text-muted">
          Tab tờ khai
          {invoiceSeqTotal > 1 ? ` · ${invoiceSeqTotal} INV` : ""}
          {isDirty ? (
            <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
              chưa lưu
            </span>
          ) : filledSplitCount > 0 ? (
            <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
              đã lưu
            </span>
          ) : null}
        </span>
        <span className="text-[10px] text-ui-text-muted">
          Alt+1…9 chuyển tab · Esc đóng · Lưu giữ cửa sổ mở
        </span>
      </div>

      <div
        ref={tabsScrollRef as RefObject<HTMLDivElement>}
        className="flex items-stretch gap-1.5 overflow-x-auto pb-0.5"
        role="tablist"
        aria-label="Tờ khai H21"
      >
        {splits.map((s, idx) => {
          const seq = idx + 1;
          const no = buildH21InvoiceNo(shipment, customerEntry, {
            seq,
            total: invoiceSeqTotal,
          });
          const selected = s.id === activeSplitId;
          const hasLines = s.lines.length > 0;
          return (
            <div
              key={s.id}
              data-split-id={s.id}
              role="tab"
              aria-selected={selected}
              className={`group relative flex min-w-[9.5rem] max-w-[14rem] shrink-0 flex-col rounded-xl border px-2.5 py-1.5 transition ${
                selected
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-ui-border/80 bg-white hover:border-indigo-300"
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onSelectSplit(s.id)}
              >
                <div
                  className={`flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wide ${
                    selected ? "text-white/80" : "text-ui-text-muted"
                  }`}
                >
                  <span>TK {seq}</span>
                  {hasLines ? (
                    <span
                      className={`rounded px-1 ${
                        selected ? "bg-white/20" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {s.lines.length} dòng
                    </span>
                  ) : (
                    <span className={selected ? "text-white/70" : "text-amber-700"}>trống</span>
                  )}
                </div>
                <div
                  className={`mt-0.5 truncate font-mono text-[11px] font-semibold ${
                    selected ? "text-white" : "text-indigo-800"
                  }`}
                  title={no || undefined}
                >
                  {no || "—"}
                </div>
                <div className={`text-[10px] ${selected ? "text-white/85" : "text-ui-text-muted"}`}>
                  {parseAllocateKgFromDraft(s.kgDraft, lotKg) || "—"} kg
                </div>
              </button>
              {splits.length > 1 ? (
                <button
                  type="button"
                  className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shadow ${
                    selected
                      ? "bg-white text-red-700"
                      : "bg-red-50 text-red-700 opacity-0 group-hover:opacity-100"
                  }`}
                  title="Xóa tờ khai"
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
          className="flex min-w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-2 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
          onClick={onAddSplit}
          title="Thêm tờ khai mới (INV tăng -1, -2…)"
        >
          <span className="text-lg leading-none">+</span>
          <span>Thêm</span>
        </button>
      </div>

      {remainLotKg > 0 ? (
        <div className="text-[10px] font-medium text-indigo-700">
          Còn {remainLotKg} kg / {lotKg} kg lô — bấm + Thêm để tách tờ tiếp
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-ui-border/50 bg-ui-surface-muted/40 px-2.5 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-800">
          Đang sửa TK {invoiceSeq}
        </div>
        <label className="text-[11px] font-semibold text-ui-text-muted">
          KG tờ khai
          <input
            type="text"
            inputMode="decimal"
            className={`${OPS.input} mt-0.5 w-24`}
            value={allocateKgDraft}
            onChange={(e) => onAllocateKgChange(e.target.value.replace(/[^\d.,]/g, ""))}
            onBlur={onAllocateKgBlur}
          />
        </label>
        <label className="text-[11px] font-semibold text-ui-text-muted">
          Số dòng
          <input
            type="text"
            inputMode="numeric"
            className={`${OPS.input} mt-0.5 w-16`}
            value={lineCountDraft}
            onChange={(e) => onLineCountChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
            onBlur={onLineCountBlur}
          />
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={onRandomGenerate}>
          Tạo ngẫu nhiên
        </Button>
        <input
          ref={goodsListFileRef as RefObject<HTMLInputElement>}
          type="file"
          accept=".xlsx,.xls,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void onGoodsListFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={importingList || loading}
          title="Upload list hàng khách gửi — hệ thống khớp mặt hàng tương tự trong catalog H21"
          onClick={onUploadListClick}
        >
          {importingList ? "Đang khớp…" : "Upload list hàng"}
        </Button>
        <div className="ml-auto text-[10px] font-medium leading-snug text-ui-text-muted">
          <div>
            {linesLength} dòng · {footer.linesKg}/{footer.grossKg} kg
            <span className="text-indigo-700">
              {" "}
              · {labelForH21CargoFamily(effectiveCargoFamily)}
            </span>
          </div>
          <div>
            Dư {footer.residualKg} kg → <strong>{footer.totalCartonPkgs} PKGS</strong>
            {lotKg > 0 && footer.grossKg < lotKg ? (
              <span className="text-indigo-700">
                {" "}
                · ~{footer.declarationPcs}/{lotPcs} kiện
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
