import type { InvoiceDeclaration } from "../types/invoiceDeclaration";
import { OPS } from "../styles/opsModalStyles";

type TargetsLock = {
  pcsOk: boolean;
  kgOk: boolean;
  pcsRemaining: number;
  kgRemaining: number;
  assignedPcs: number;
  assignedKg: number;
};

type Props = {
  declarations: InvoiceDeclaration[];
  activeId: string;
  activeDeclaration: InvoiceDeclaration | undefined;
  shipmentPcs: number | null | undefined;
  shipmentKg: number | null | undefined;
  targetsLock: TargetsLock;
  busy: boolean;
  dirty: boolean;
  multiDecl: boolean;
  showTargets: boolean;
  onSelectTab: (id: string) => void;
  onTargetPcsChange: (value: string) => void;
  onTargetKgChange: (value: string) => void;
  onRedistributeTargets: () => void;
  onAddBlank: () => void;
  onRandomPick: () => void;
  onOpenCatalog: () => void;
  onSave: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onExportAllExcel?: () => void;
  onExportAllPdf?: () => void;
  onFinish: () => void;
  onSplit: () => void;
  onAddDeclaration: () => void;
  onAutoDistribute: () => void;
  onApplyTemplate: (mode: "zero" | "scale") => void;
  onCopyLines: (mode: "append" | "replace", toAll: boolean) => void;
  onRemoveDeclaration: () => void;
  copyTargetId: string;
  onCopyTargetChange: (id: string) => void;
};

export function HqWorkspaceToolbar({
  declarations,
  activeId,
  activeDeclaration,
  shipmentPcs,
  shipmentKg,
  targetsLock,
  busy,
  dirty,
  multiDecl,
  showTargets,
  onSelectTab,
  onTargetPcsChange,
  onTargetKgChange,
  onRedistributeTargets,
  onAddBlank,
  onRandomPick,
  onOpenCatalog,
  onSave,
  onExportExcel,
  onExportPdf,
  onExportAllExcel,
  onExportAllPdf,
  onFinish,
  onSplit,
  onAddDeclaration,
  onAutoDistribute,
  onApplyTemplate,
  onCopyLines,
  onRemoveDeclaration,
  copyTargetId,
  onCopyTargetChange,
}: Props) {
  return (
    <div className={`shrink-0 border-b ${OPS.border}`}>
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 sm:px-5">
        {declarations.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelectTab(d.id)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              d.id === activeId
                ? "bg-indigo-600 text-white"
                : "border border-black/10 bg-white text-slate-700 hover:bg-indigo-500/10 dark:border-white/10 dark:bg-ops-elevated dark:text-slate-200"
            }`}
          >
            {d.label}
            {d.targetPcs != null ? ` · ${d.targetPcs} CTNS` : ""}
            {d.targetKg != null ? ` · ${d.targetKg} kg` : ""}
          </button>
        ))}
      </div>

      {showTargets && activeDeclaration ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.06] px-4 py-2 text-[11px] dark:border-white/[0.06] sm:px-5">
          <span className={`font-semibold ${OPS.secondary}`}>Mục tiêu {activeDeclaration.label}:</span>
          <label className="flex items-center gap-1 tabular-nums">
            Kiện
            <input
              type="number"
              min={0}
              step={1}
              value={activeDeclaration.targetPcs ?? ""}
              onChange={(e) => onTargetPcsChange(e.target.value)}
              className={`${OPS.input} w-16 py-1 text-right text-[11px]`}
              aria-label="Mục tiêu kiện tờ này"
            />
          </label>
          <label className="flex items-center gap-1 tabular-nums">
            Kg
            <input
              type="number"
              min={0}
              step={1}
              value={activeDeclaration.targetKg ?? ""}
              onChange={(e) => onTargetKgChange(e.target.value)}
              className={`${OPS.input} w-16 py-1 text-right text-[11px]`}
              aria-label="Mục tiêu kg tờ này"
            />
          </label>
          <button type="button" onClick={onRedistributeTargets} className={OPS.btnSmallAccent}>
            Chia đều lô
          </button>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
              targetsLock.pcsOk && targetsLock.kgOk
                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                : "bg-amber-500/15 text-amber-900 dark:text-amber-100"
            }`}
          >
            Đã gán {targetsLock.assignedPcs}/{shipmentPcs ?? "—"} CTNS · {targetsLock.assignedKg}/
            {shipmentKg ?? "—"} kg
            {!targetsLock.pcsOk || !targetsLock.kgOk
              ? ` · còn ${targetsLock.pcsRemaining} CTNS, ${targetsLock.kgRemaining} kg`
              : ""}
          </span>
        </div>
      ) : null}

      <div
        className={`sticky top-0 z-20 flex flex-wrap items-center gap-2 border-t border-black/[0.06] px-4 py-2 dark:border-white/[0.06] sm:px-5 ${OPS.footer}`}
      >
        <button type="button" onClick={onAddBlank} className={OPS.btnSmallAccent}>
          + Dòng
        </button>
        <button type="button" onClick={onRandomPick} className={OPS.btnSmallAccent}>
          Ngẫu nhiên
        </button>
        <button type="button" onClick={onOpenCatalog} className={OPS.btnSmallAccent}>
          Danh mục
        </button>

        <span className="hidden h-5 w-px bg-black/10 sm:inline dark:bg-white/10" />

        <button
          type="button"
          onClick={onSave}
          disabled={busy || !dirty}
          className={`${OPS.btnSmallAccent} disabled:opacity-50`}
        >
          Lưu
        </button>
        <button
          type="button"
          onClick={onExportExcel}
          disabled={busy}
          className="rounded-full border border-emerald-600/50 bg-emerald-600/10 px-3 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-600/20 disabled:opacity-50 dark:text-emerald-200"
        >
          Excel A4
        </button>
        <button
          type="button"
          onClick={onExportPdf}
          disabled={busy}
          className="rounded-full border border-sky-600/50 bg-sky-600/10 px-3 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-600/20 disabled:opacity-50 dark:text-sky-200"
        >
          PDF A4
        </button>
        {multiDecl && onExportAllExcel && onExportAllPdf ? (
          <>
            <button
              type="button"
              onClick={onExportAllExcel}
              disabled={busy}
              className="rounded-full border border-emerald-700/40 px-2.5 py-1 text-[10px] font-semibold text-emerald-900 dark:text-emerald-200"
            >
              ZIP Excel
            </button>
            <button
              type="button"
              onClick={onExportAllPdf}
              disabled={busy}
              className="rounded-full border border-sky-700/40 px-2.5 py-1 text-[10px] font-semibold text-sky-950 dark:text-sky-100"
            >
              ZIP PDF
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={onFinish}
          disabled={busy}
          className="rounded-full bg-indigo-600 px-4 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Hoàn tất
        </button>

        <details className="relative ml-auto">
          <summary className={`cursor-pointer list-none rounded-md border px-2.5 py-1 text-[11px] font-medium ${OPS.border}`}>
            Tờ khai ▾
          </summary>
          <div className="absolute right-0 z-30 mt-1 min-w-[12rem] rounded-lg border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-ops-elevated">
            <button type="button" onClick={onSplit} className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-indigo-500/10">
              Chia lô…
            </button>
            <button type="button" onClick={onAddDeclaration} className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-indigo-500/10">
              + Tờ mới
            </button>
            {multiDecl ? (
              <>
                <button type="button" onClick={onAutoDistribute} className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-indigo-500/10">
                  Chia hàng tự động
                </button>
                <button type="button" onClick={() => onApplyTemplate("scale")} className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-indigo-500/10">
                  Nhân mẫu tờ 1
                </button>
                <button type="button" onClick={() => onApplyTemplate("zero")} className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-indigo-500/10">
                  Mẫu SL = 0
                </button>
                <div className="border-t border-black/5 px-3 py-1.5 dark:border-white/5">
                  <select
                    value={copyTargetId}
                    onChange={(e) => onCopyTargetChange(e.target.value)}
                    className={`${OPS.input} w-full py-1 text-[10px]`}
                  >
                    <option value="">Copy sang…</option>
                    {declarations
                      .filter((d) => d.id !== activeId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                  </select>
                  <div className="mt-1 flex gap-1">
                    <button type="button" onClick={() => onCopyLines("append", false)} className="flex-1 rounded border px-1 py-0.5 text-[10px]">
                      Copy →
                    </button>
                    <button type="button" onClick={() => onCopyLines("append", true)} className="flex-1 rounded border px-1 py-0.5 text-[10px]">
                      Copy mọi tờ
                    </button>
                  </div>
                </div>
                <button type="button" onClick={onRemoveDeclaration} className="block w-full px-3 py-1.5 text-left text-[11px] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  Xóa tờ này
                </button>
              </>
            ) : null}
          </div>
        </details>
      </div>
    </div>
  );
}
