import { useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveH21UnitFactorKg } from "../../shared/scscH21CatalogNormalize.mjs";
import { OPS } from "../styles/opsModalStyles";

/** Dòng invoice tối thiểu — SCSC/TCS dùng chung. */
export type H21EditableInvoiceLine = {
  id: string;
  catalogItemId?: string | null;
  description: string;
  hsCode?: string;
  origin?: string;
  quantity: number;
  uom: string;
  weightKg: number;
  unitPrice: number;
  amount: number;
};

/** Làm tròn kg (3 chữ số) / USD (4 chữ số nội bộ, hiển thị 2 khi tổng). */
function roundKg(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function roundMoney(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Công thức chuẩn H21 dòng: */
export function calcLineAmount(qty1: number, unitPrice: number): number {
  return roundMoney((qty1 || 0) * (unitPrice || 0));
}
export function calcExpectedQty2(qty1: number, unitFactorKg: number): number | null {
  if (!(unitFactorKg > 0)) return null;
  return roundKg((qty1 || 0) * unitFactorKg);
}

const cellIn =
  "h-7 w-full min-w-0 rounded border border-ui-border/70 bg-white px-1 text-[11px] outline-none focus:border-apple-blue focus:ring-1 focus:ring-apple-blue/30";
const cellInBad = "border-amber-500 bg-amber-50 ring-1 ring-amber-400/40";

function CellNum({
  value,
  onCommit,
  decimal = false,
  title,
  className = "",
  invalid,
}: {
  value: number;
  onCommit: (n: number) => void;
  decimal?: boolean;
  title?: string;
  className?: string;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      title={title}
      aria-invalid={invalid || undefined}
      className={`${cellIn} tabular-nums text-right ${invalid ? cellInBad : ""} ${className}`}
      value={focused ? draft : String(value)}
      onFocus={() => {
        setFocused(true);
        setDraft(String(value));
      }}
      onChange={(e) => {
        const v = decimal
          ? e.target.value.replace(/[^\d.,\-]/g, "")
          : e.target.value.replace(/\D/g, "");
        setDraft(v);
      }}
      onBlur={() => {
        setFocused(false);
        const n = decimal
          ? parseFloat(draft.replace(",", ".")) || 0
          : parseInt(draft, 10) || 0;
        onCommit(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

function CellText({
  value,
  onCommit,
  title,
  className = "",
  upper,
  invalid,
}: {
  value: string;
  onCommit: (v: string) => void;
  title?: string;
  className?: string;
  upper?: boolean;
  invalid?: boolean;
}) {
  return (
    <input
      type="text"
      title={title}
      aria-invalid={invalid || undefined}
      className={`${cellIn} ${upper ? "uppercase" : ""} ${invalid ? cellInBad : ""} ${className}`}
      value={value}
      onChange={(e) => onCommit(upper ? e.target.value.toUpperCase() : e.target.value)}
    />
  );
}

function Th({
  children,
  className = "",
  title,
}: {
  children?: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <th
      title={title}
      className={`sticky top-0 z-[1] border-b border-slate-300 bg-slate-100 px-1 py-1.5 text-[9px] font-extrabold uppercase tracking-wide text-slate-600 ${className}`}
    >
      {children}
    </th>
  );
}

type Props = {
  lines: readonly H21EditableInvoiceLine[];
  /** KG tờ khai — đối chiếu Σ lượng 2. */
  declarationKg?: number;
  resolveUnitFactor?: (line: H21EditableInvoiceLine) => number;
  onPatch: (id: string, patch: Partial<H21EditableInvoiceLine>) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
};

function defaultFactor(line: H21EditableInvoiceLine): number {
  return resolveH21UnitFactorKg({
    description: line.description,
    unitFactor: 0,
    qty1: line.quantity,
    qty2: line.weightKg,
  });
}

/**
 * Bảng dòng invoice H21.
 *
 * Công thức:
 * - Quy cách (kg/ĐVT1) ← mô tả pack / catalog.unitFactor / (L2÷L1)
 * - Lượng 2 (KGM) = Lượng 1 × quy cách
 * - Trị giá (USD) = Lượng 1 × đơn giá
 */
export function H21InvoiceLinesEditor({
  lines,
  declarationKg = 0,
  resolveUnitFactor,
  onPatch,
  onRemove,
  onClearAll,
}: Props) {
  const factorOf = resolveUnitFactor ?? defaultFactor;

  const audit = useMemo(() => {
    let qty1 = 0;
    let qty2 = 0;
    let amountCalc = 0;
    let weightMismatches = 0;
    let amountMismatches = 0;
    let missingHs = 0;
    for (const line of lines) {
      const q1 = line.quantity || 0;
      const w = line.weightKg || 0;
      const amt = calcLineAmount(q1, line.unitPrice || 0);
      qty1 += q1;
      qty2 += w;
      amountCalc += amt;
      if (!String(line.hsCode ?? "").trim()) missingHs += 1;
      const f = factorOf(line);
      const expected = calcExpectedQty2(q1, f);
      if (expected != null && Math.abs(expected - w) > 0.05) weightMismatches += 1;
      if (Math.abs(amt - (line.amount || 0)) > 0.02) amountMismatches += 1;
    }
    qty2 = roundKg(qty2);
    amountCalc = Math.round(amountCalc * 100) / 100;
    const residual =
      declarationKg > 0 ? roundKg(declarationKg - qty2) : null;
    return {
      qty1,
      qty2,
      amount: amountCalc,
      weightMismatches,
      amountMismatches,
      missingHs,
      residual,
    };
  }, [declarationKg, factorOf, lines]);

  const hasWarn =
    audit.weightMismatches > 0 ||
    audit.amountMismatches > 0 ||
    audit.missingHs > 0 ||
    (audit.residual != null && Math.abs(audit.residual) > 0.05);

  return (
    <section className="flex min-h-0 flex-1 flex-col" data-testid="h21-invoice-lines-editor">
      {/* Thanh tóm tắt gọn — 1 hàng */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-black/[0.06] px-2.5 py-1.5 text-[10px]">
        <span className="font-semibold text-ui-text">
          Dòng invoice
          <span className="ml-1 font-normal text-ui-text-muted">({lines.length})</span>
        </span>
        {lines.length > 0 ? (
          <>
            <span className="tabular-nums text-ui-text-muted">
              ΣL1 <b className="text-ui-text">{audit.qty1}</b>
              {" · "}
              ΣL2 <b className="text-ui-text">{audit.qty2}</b> KGM
              {" · "}$<b className="text-ui-text">{audit.amount}</b>
            </span>
            {declarationKg > 0 ? (
              <span
                className={`tabular-nums ${
                  audit.residual != null && Math.abs(audit.residual) > 0.05
                    ? audit.residual! < 0
                      ? "font-bold text-red-700"
                      : "font-semibold text-amber-800"
                    : "text-indigo-800"
                }`}
                title="KG tờ khai − Σ lượng 2"
              >
                TK {declarationKg} · chênh{" "}
                {audit.residual != null && audit.residual > 0 ? "+" : ""}
                {audit.residual}
              </span>
            ) : null}
            <span
              className={
                hasWarn ? "font-semibold text-amber-900" : "font-medium text-emerald-800"
              }
            >
              {hasWarn
                ? [
                    audit.missingHs > 0 ? `${audit.missingHs} thiếu HS` : null,
                    audit.weightMismatches > 0
                      ? `${audit.weightMismatches} L2≠L1×QC`
                      : null,
                    audit.amountMismatches > 0
                      ? `${audit.amountMismatches} lệch trị giá`
                      : null,
                    audit.residual != null && Math.abs(audit.residual) > 0.05
                      ? "ΣL2≠KG TK"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Đối chiếu OK"}
            </span>
          </>
        ) : null}
        <button
          type="button"
          className="ml-auto text-[10px] font-semibold text-red-700 disabled:opacity-40"
          onClick={onClearAll}
          disabled={lines.length === 0}
        >
          Xóa hết
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {lines.length === 0 ? (
          <div className={`${OPS.empty} m-2 text-xs`}>
            Chưa có dòng hàng — tạo ngẫu nhiên hoặc chọn từ catalog.
          </div>
        ) : (
          <table className="w-full min-w-[860px] border-collapse text-[11px]">
            <thead>
              <tr>
                <Th className="w-7 text-center">#</Th>
                <Th className="min-w-[11rem]" title="Mô tả hàng hóa">
                  Tên hàng
                </Th>
                <Th className="w-[4.75rem]" title="Mã HS">
                  HS
                </Th>
                <Th
                  className="w-[3.75rem] text-right"
                  title="Số lượng theo ĐVT 1"
                >
                  Lượng 1
                </Th>
                <Th className="w-[2.75rem] text-center" title="Đơn vị tính 1">
                  ĐVT1
                </Th>
                <Th
                  className="w-[3.75rem] text-right"
                  title="Lượng 2 = Lượng 1 × quy cách (KGM)"
                >
                  Lượng 2
                </Th>
                <Th className="w-[2.5rem] text-center" title="Đơn vị tính 2">
                  ĐVT2
                </Th>
                <Th
                  className="w-[3.75rem] text-right"
                  title="Đơn giá USD / 1 ĐVT1"
                >
                  Đơn giá
                </Th>
                <Th
                  className="w-[4rem] text-right"
                  title="Trị giá = Lượng 1 × Đơn giá"
                >
                  Trị giá
                </Th>
                <Th
                  className="w-[4.25rem] text-right"
                  title="Quy cách = kg / 1 ĐVT1 · Lượng 2 = Lượng 1 × quy cách"
                >
                  Quy cách
                </Th>
                <Th className="w-7" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const factor = factorOf(line);
                const expectedL2 = calcExpectedQty2(line.quantity || 0, factor);
                const l2Mismatch =
                  expectedL2 != null &&
                  Math.abs(expectedL2 - (line.weightKg || 0)) > 0.05;
                const calcAmount = calcLineAmount(
                  line.quantity || 0,
                  line.unitPrice || 0
                );
                const amountMismatch =
                  Math.abs(calcAmount - (line.amount || 0)) > 0.02;
                const hsMissing = !String(line.hsCode ?? "").trim();
                const rowBad = l2Mismatch || amountMismatch || hsMissing;
                const uom1 = (line.uom || "đv").toUpperCase();

                return (
                  <tr
                    key={line.id}
                    className={`border-b border-black/[0.05] ${
                      rowBad
                        ? "bg-amber-50/60"
                        : idx % 2 === 0
                          ? "bg-white"
                          : "bg-slate-50/50"
                    }`}
                    data-testid={`h21-invoice-line-${idx + 1}`}
                  >
                    <td className="px-1 py-1 text-center align-middle text-[10px] font-bold tabular-nums text-ui-text-muted">
                      {idx + 1}
                    </td>

                    {/* Tên hàng — 1 dòng + xuất xứ nhỏ */}
                    <td className="px-1 py-1 align-middle">
                      <input
                        type="text"
                        className={`${cellIn} text-left`}
                        title="Tên hàng / mô tả"
                        value={line.description}
                        onChange={(e) =>
                          onPatch(line.id, { description: e.target.value })
                        }
                      />
                      {line.origin ? (
                        <span className="mt-0.5 inline-block text-[8px] font-bold uppercase tracking-wide text-slate-500">
                          XX {line.origin}
                        </span>
                      ) : null}
                    </td>

                    <td className="px-1 py-1 align-middle">
                      <CellText
                        value={line.hsCode ?? ""}
                        title="Mã HS"
                        upper
                        invalid={hsMissing}
                        className="font-mono tracking-tight"
                        onCommit={(hsCode) => onPatch(line.id, { hsCode })}
                      />
                    </td>

                    <td className="px-1 py-1 align-middle">
                      <CellNum
                        value={line.quantity ?? 0}
                        title="Lượng 1"
                        onCommit={(quantity) => onPatch(line.id, { quantity })}
                      />
                    </td>

                    <td className="px-0.5 py-1 align-middle">
                      <CellText
                        value={line.uom}
                        title="ĐVT 1"
                        upper
                        className="px-0.5 text-center font-semibold"
                        onCommit={(uom) => onPatch(line.id, { uom })}
                      />
                    </td>

                    <td className="px-1 py-1 align-middle">
                      <CellNum
                        value={line.weightKg ?? 0}
                        title={
                          expectedL2 != null
                            ? `Lượng 2 (KGM) · kỳ vọng ${expectedL2} = ${line.quantity}×${factor}`
                            : "Lượng 2 (KGM)"
                        }
                        decimal
                        invalid={l2Mismatch}
                        onCommit={(weightKg) => onPatch(line.id, { weightKg })}
                      />
                      {l2Mismatch && expectedL2 != null ? (
                        <button
                          type="button"
                          className="mt-0.5 block w-full text-right text-[8px] font-bold text-amber-900 underline"
                          title={`Áp L2 = L1 × quy cách = ${expectedL2}`}
                          onClick={() =>
                            onPatch(line.id, {
                              weightKg: expectedL2,
                              amount: calcAmount,
                            })
                          }
                        >
                          →{expectedL2}
                        </button>
                      ) : null}
                    </td>

                    <td
                      className="px-0.5 py-1 text-center align-middle text-[10px] font-bold text-slate-500"
                      title="ĐVT 2 cố định KGM"
                    >
                      KGM
                    </td>

                    <td className="px-1 py-1 align-middle">
                      <CellNum
                        value={line.unitPrice ?? 0}
                        title="Đơn giá USD / ĐVT1"
                        decimal
                        onCommit={(unitPrice) => onPatch(line.id, { unitPrice })}
                      />
                    </td>

                    {/* Trị giá — luôn = L1 × đơn giá (hiển thị công thức) */}
                    <td className="px-1 py-1 align-middle">
                      <div
                        className={`flex h-7 items-center justify-end rounded border px-1 font-semibold tabular-nums ${
                          amountMismatch
                            ? "border-amber-400 bg-amber-50 text-amber-950"
                            : "border-transparent bg-slate-100 text-ui-navy"
                        }`}
                        title={`Trị giá = ${line.quantity} × ${line.unitPrice} = ${calcAmount}`}
                      >
                        {calcAmount}
                      </div>
                      {amountMismatch ? (
                        <button
                          type="button"
                          className="mt-0.5 block w-full text-right text-[8px] font-bold text-amber-900 underline"
                          onClick={() => onPatch(line.id, { amount: calcAmount })}
                        >
                          sửa ${line.amount}
                        </button>
                      ) : null}
                    </td>

                    {/* Quy cách — 1 dòng: 0.5 kg/PCE */}
                    <td className="px-1 py-1 align-middle text-right">
                      <div
                        className="flex h-7 items-center justify-end gap-0.5 rounded bg-indigo-50 px-1 font-mono text-[11px] font-semibold tabular-nums text-indigo-900"
                        title={
                          factor > 0
                            ? `1 ${uom1} = ${factor} KGM · L2 = L1 × ${factor}`
                            : "Chưa có quy cách (mô tả pack / catalog)"
                        }
                      >
                        {factor > 0 ? (
                          <>
                            <span>{factor}</span>
                            <span className="text-[8px] font-bold text-indigo-600/80">
                              kg/{uom1}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </td>

                    <td className="px-0.5 py-1 text-center align-middle">
                      <button
                        type="button"
                        className="text-[10px] font-bold leading-none text-red-600 hover:text-red-800"
                        title="Xóa dòng"
                        aria-label="Xóa dòng"
                        onClick={() => onRemove(line.id)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100 text-[11px] font-bold">
                <td className="px-1 py-1.5 text-[10px] text-ui-text-muted" colSpan={3}>
                  TỔNG
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">{audit.qty1}</td>
                <td />
                <td className="px-1 py-1.5 text-right tabular-nums">{audit.qty2}</td>
                <td className="px-0.5 py-1.5 text-center text-[9px] text-slate-500">
                  KGM
                </td>
                <td />
                <td className="px-1 py-1.5 text-right tabular-nums text-ui-navy">
                  ${audit.amount}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </section>
  );
}
