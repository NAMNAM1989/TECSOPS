import type { ReactNode } from "react";
import type { InvoiceDeclaration } from "../types/invoiceDeclaration";
import { LocaleNumberInput } from "./LocaleNumberInput";
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
  onBalanceQuantities: () => void;
  balanceNotice?: string | null;
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

function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-black/[0.08] bg-black/[0.03] p-1 dark:border-white/[0.08] dark:bg-black/25"
      role="group"
      aria-label={label}
    >
      <span className="hidden shrink-0 pl-1.5 pr-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 lg:inline">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-0.5">{children}</div>
    </div>
  );
}

function ToolBtn({
  onClick,
  disabled,
  title,
  children,
  active,
  variant = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
  active?: boolean;
  variant?: "default" | "primary" | "success" | "danger";
}) {
  const variantCls =
    variant === "primary"
      ? "bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
      : variant === "success"
        ? "text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-200"
        : variant === "danger"
          ? "text-red-700 hover:bg-red-500/10 dark:text-red-300"
          : active
            ? "bg-indigo-500/15 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-100"
            : "text-slate-700 hover:bg-black/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.08]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${variantCls}`}
    >
      {children}
    </button>
  );
}

function MenuBtn({
  onClick,
  disabled,
  children,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full px-3 py-2 text-left text-[11px] font-medium text-slate-700 hover:bg-indigo-500/10 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-indigo-500/15 ${className}`}
    >
      {children}
    </button>
  );
}

function DropdownPanel({
  summary,
  align = "right",
  children,
}: {
  summary: ReactNode;
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <details className="relative">
      <summary
        className={`cursor-pointer list-none rounded-lg border border-black/[0.1] bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-black/[0.04] dark:border-white/12 dark:bg-ops-elevated dark:text-slate-200 dark:hover:bg-white/[0.06] [&::-webkit-details-marker]:hidden`}
      >
        {summary}
      </summary>
      <div
        className={`absolute z-40 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-ops-elevated ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </div>
    </details>
  );
}

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
  onBalanceQuantities,
  balanceNotice,
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
    <div className={`shrink-0 border-t ${OPS.border}`}>
      {/* Tabs tờ khai */}
      <div className="flex flex-wrap items-center gap-1 border-b border-black/[0.04] px-3 py-2 dark:border-white/[0.04] sm:px-4">
        <span className="mr-1 hidden text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:inline">
          Tờ
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {declarations.map((d) => {
            const active = d.id === activeId;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelectTab(d.id)}
                className={`max-w-full truncate rounded-lg px-2.5 py-1.5 text-[11px] font-semibold tabular-nums transition ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/20"
                    : "border border-transparent bg-black/[0.04] text-slate-600 hover:border-indigo-500/30 hover:bg-indigo-500/10 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-indigo-500/15"
                }`}
              >
                {d.label}
                {d.targetPcs != null ? ` · ${d.targetPcs} CTNS` : ""}
                {d.targetKg != null ? ` · ${d.targetKg} kg` : ""}
              </button>
            );
          })}
        </div>
        <DropdownPanel summary="Tờ khai ▾" align="right">
          <MenuBtn onClick={onSplit}>Chia lô…</MenuBtn>
          <MenuBtn onClick={onAddDeclaration}>+ Tờ mới</MenuBtn>
          {multiDecl ? (
            <>
              <div className="my-1 border-t border-black/5 dark:border-white/5" />
              <MenuBtn onClick={onAutoDistribute}>Chia hàng tự động</MenuBtn>
              <MenuBtn onClick={() => onApplyTemplate("scale")}>Nhân mẫu tờ 1</MenuBtn>
              <MenuBtn onClick={() => onApplyTemplate("zero")}>Mẫu SL = 0</MenuBtn>
              <div className="border-t border-black/5 px-3 py-2 dark:border-white/5">
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
                <div className="mt-1.5 flex gap-1">
                  <button
                    type="button"
                    onClick={() => onCopyLines("append", false)}
                    className="flex-1 rounded-md border border-black/10 px-1 py-1 text-[10px] font-medium dark:border-white/10"
                  >
                    Copy →
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopyLines("append", true)}
                    className="flex-1 rounded-md border border-black/10 px-1 py-1 text-[10px] font-medium dark:border-white/10"
                  >
                    Mọi tờ
                  </button>
                </div>
              </div>
              <MenuBtn onClick={onRemoveDeclaration} className="text-red-600 dark:text-red-400">
                Xóa tờ này
              </MenuBtn>
            </>
          ) : null}
        </DropdownPanel>
      </div>

      {/* Mục tiêu kiện/kg — gọn trên một hàng */}
      {showTargets && activeDeclaration ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-black/[0.04] px-3 py-2 text-[11px] dark:border-white/[0.04] sm:px-4">
          <span className={`shrink-0 font-semibold ${OPS.secondary}`}>
            Mục tiêu {activeDeclaration.label}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 tabular-nums">
              <span className="text-slate-500 dark:text-slate-400">Kiện</span>
              <LocaleNumberInput
                integer
                nullable
                value={activeDeclaration.targetPcs ?? null}
                onCommit={(n) => onTargetPcsChange(n != null && n > 0 ? String(n) : "")}
                className="w-14 rounded-md py-1 text-right text-[11px]"
                placeholder="—"
              />
            </label>
            <label className="flex items-center gap-1.5 tabular-nums">
              <span className="text-slate-500 dark:text-slate-400">Kg</span>
              <LocaleNumberInput
                integer
                nullable
                value={activeDeclaration.targetKg ?? null}
                onCommit={(n) => onTargetKgChange(n != null && n > 0 ? String(n) : "")}
                className="w-14 rounded-md py-1 text-right text-[11px]"
                placeholder="—"
              />
            </label>
            <ToolBtn onClick={onRedistributeTargets}>Chia đều lô</ToolBtn>
          </div>
          <span
            className={`ml-auto rounded-lg px-2 py-1 text-[10px] font-semibold tabular-nums ${
              targetsLock.pcsOk && targetsLock.kgOk
                ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
                : "bg-amber-500/12 text-amber-900 dark:text-amber-100"
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

      {/* Thanh thao tác chính — nhóm logic */}
      <div
        className={`sticky top-0 z-20 flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4 ${OPS.footer}`}
      >
        <ToolGroup label="Soạn">
          <ToolBtn onClick={onAddBlank} title="Ctrl+Enter">
            + Dòng
          </ToolBtn>
          <ToolBtn onClick={onRandomPick}>Ngẫu nhiên</ToolBtn>
          <ToolBtn
            onClick={onBalanceQuantities}
            title="Tổng KG hàng nhỏ hơn kg tờ (chừa bao bì)"
          >
            Cân SL/KG
          </ToolBtn>
          <ToolBtn onClick={onOpenCatalog}>Danh mục</ToolBtn>
        </ToolGroup>

        <ToolGroup label="Xuất">
          <ToolBtn onClick={onExportExcel} disabled={busy} variant="success">
            Excel
          </ToolBtn>
          <ToolBtn onClick={onExportPdf} disabled={busy}>
            PDF
          </ToolBtn>
          {multiDecl && onExportAllExcel && onExportAllPdf ? (
            <DropdownPanel summary="ZIP ▾" align="left">
              <MenuBtn onClick={onExportAllExcel} disabled={busy}>
                ZIP Excel (mọi tờ)
              </MenuBtn>
              <MenuBtn onClick={onExportAllPdf} disabled={busy}>
                ZIP PDF (mọi tờ)
              </MenuBtn>
            </DropdownPanel>
          ) : null}
        </ToolGroup>

        {balanceNotice ? (
          <p
            className={`max-w-sm flex-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium leading-snug ${
              balanceNotice.startsWith("Đã cân") || balanceNotice.includes("Đã thêm")
                ? "bg-emerald-500/12 text-emerald-900 dark:text-emerald-100"
                : "bg-amber-500/12 text-amber-950 dark:text-amber-100"
            }`}
            role="status"
          >
            {balanceNotice}
          </p>
        ) : (
          <span className="hidden flex-1 sm:block" aria-hidden />
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <ToolBtn
            onClick={onSave}
            disabled={busy || !dirty}
            active={dirty}
            title="Ctrl+S"
          >
            {dirty ? "● Lưu" : "Đã lưu"}
          </ToolBtn>
          <ToolBtn onClick={onFinish} disabled={busy} variant="primary">
            Hoàn tất
          </ToolBtn>
        </div>
      </div>
    </div>
  );
}
