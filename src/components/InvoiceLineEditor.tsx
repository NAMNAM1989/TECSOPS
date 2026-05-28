import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  invoiceLineAmountUsd,
  invoiceLineGrossWeightKg,
  type InvoiceLineItem,
} from "../types/invoiceItem";
import { OPS } from "../styles/opsModalStyles";
import { LocaleNumberInput } from "./LocaleNumberInput";

type Props = {
  index: number;
  item: InvoiceLineItem;
  onPatch: (lineId: string, patch: Partial<InvoiceLineItem>) => void;
  onRemove: (lineId: string) => void;
};

export const InvoiceLineEditor = memo(function InvoiceLineEditor({
  index,
  item,
  onPatch,
  onRemove,
}: Props) {
  const [local, setLocal] = useState(item);
  const syncTimer = useRef<number | undefined>(undefined);
  const lineIdRef = useRef(item.lineId);

  useEffect(() => {
    if (item.lineId !== lineIdRef.current) {
      lineIdRef.current = item.lineId;
      setLocal(item);
    }
  }, [item]);

  const flush = useCallback(
    (next: InvoiceLineItem) => {
      onPatch(next.lineId, next);
    },
    [onPatch]
  );

  const scheduleSync = useCallback(
    (next: InvoiceLineItem) => {
      window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => flush(next), 80);
    },
    [flush]
  );

  const updateField = useCallback(
    (patch: Partial<InvoiceLineItem>) => {
      setLocal((prev) => {
        const next = { ...prev, ...patch };
        scheduleSync(next);
        return next;
      });
    },
    [scheduleSync]
  );

  const handleBlur = useCallback(() => {
    window.clearTimeout(syncTimer.current);
    flush(local);
  }, [flush, local]);

  useEffect(
    () => () => {
      window.clearTimeout(syncTimer.current);
    },
    []
  );

  return (
    <div
      className={`rounded-lg border p-2.5 ${OPS.border} bg-white/60 dark:bg-white/[0.03]`}
      onBlur={handleBlur}
    >
      <div className="mb-1.5 flex items-start justify-between gap-1">
        <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          {index + 1}
        </span>
        <span className="text-[10px] tabular-nums text-slate-500">
          {invoiceLineGrossWeightKg(local).toFixed(1)}kg · ${invoiceLineAmountUsd(local).toFixed(2)}
        </span>
        <button
          type="button"
          onClick={() => onRemove(local.lineId)}
          className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
          aria-label="Xóa dòng"
        >
          ×
        </button>
      </div>
      <input
        value={local.description}
        onChange={(e) => updateField({ description: e.target.value })}
        placeholder="Mô tả hàng hóa"
        className={`${OPS.input} mb-1.5 w-full py-1.5 text-xs`}
      />
      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <label className="mb-0.5 block text-[9px] text-slate-500">HS code</label>
          <input
            value={local.hsCode}
            onChange={(e) => updateField({ hsCode: e.target.value })}
            className={`${OPS.input} w-full py-1 text-xs`}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[9px] text-slate-500">Xuất xứ</label>
          <input
            value={local.origin}
            onChange={(e) => updateField({ origin: e.target.value.toUpperCase() })}
            className={`${OPS.input} w-full py-1 text-xs`}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[9px] text-slate-500">Đơn vị</label>
          <input
            value={local.unit}
            onChange={(e) => updateField({ unit: e.target.value.toUpperCase() })}
            className={`${OPS.input} w-full py-1 text-xs`}
          />
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <div>
          <label className="mb-0.5 block text-[9px] text-slate-500">Số lượng</label>
          <LocaleNumberInput
            integer
            value={local.quantity}
            onCommit={(quantity) => updateField({ quantity: quantity ?? 0 })}
            className="w-full py-1 text-right text-xs tabular-nums"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[9px] text-slate-500">Đơn giá $</label>
          <LocaleNumberInput
            value={local.unitPriceUsd}
            maxDecimals={2}
            onCommit={(unitPriceUsd) => updateField({ unitPriceUsd: unitPriceUsd ?? 0 })}
            className="w-full py-1 text-right text-xs tabular-nums"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[9px] text-slate-500">kg/đv</label>
          <LocaleNumberInput
            value={local.kgPerUnit}
            maxDecimals={3}
            onCommit={(kgPerUnit) => updateField({ kgPerUnit: kgPerUnit ?? 0 })}
            className="w-full py-1 text-right text-xs tabular-nums"
          />
        </div>
      </div>
    </div>
  );
});
