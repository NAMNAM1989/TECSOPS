import { createPortal } from "react-dom";
import { OPS, opsInput } from "../styles/opsModalStyles";

type Props = {
  open: boolean;
  offsetX: number;
  offsetY: number;
  onChangeOffsetX: (v: number) => void;
  onChangeOffsetY: (v: number) => void;
  onTestPrint: () => void;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
};

function parseNumberInput(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function PrintCalibrationModal({
  open,
  offsetX,
  offsetY,
  onChangeOffsetX,
  onChangeOffsetY,
  onTestPrint,
  onSave,
  onReset,
  onClose,
}: Props) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full max-w-md rounded-2xl border p-4 shadow-apple ${OPS.modal} ${OPS.border}`}>
        <h3 className={`text-base font-semibold ${OPS.title}`}>Căn chỉnh in</h3>
        <p className={`mt-1 text-xs ${OPS.secondary}`}>
          Nếu chữ in bị lệch sang trái/phải hoặc lên/xuống, hãy chỉnh X/Y theo đơn vị mm rồi bấm Test in.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <label className="space-y-1">
            <span className={`block text-xs font-semibold ${OPS.secondary}`}>Dịch ngang X (mm)</span>
            <input
              type="number"
              step="0.1"
              value={Number.isFinite(offsetX) ? offsetX : 0}
              onChange={(e) => onChangeOffsetX(parseNumberInput(e.target.value))}
              className={`w-full text-sm ${opsInput}`}
            />
            <span className={`block text-[11px] ${OPS.muted}`}>X &gt; 0 sang phải, X &lt; 0 sang trái</span>
          </label>

          <label className="space-y-1">
            <span className={`block text-xs font-semibold ${OPS.secondary}`}>Dịch dọc Y (mm)</span>
            <input
              type="number"
              step="0.1"
              value={Number.isFinite(offsetY) ? offsetY : 0}
              onChange={(e) => onChangeOffsetY(parseNumberInput(e.target.value))}
              className={`w-full text-sm ${opsInput}`}
            />
            <span className={`block text-[11px] ${OPS.muted}`}>Y &gt; 0 xuống dưới, Y &lt; 0 lên trên</span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onTestPrint}
            className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200 dark:hover:bg-sky-500/25"
          >
            Test in
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-full bg-apple-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-apple-blue-hover"
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={onReset}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${OPS.tabIdle}`}
          >
            Reset về mặc định
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`ml-auto rounded-full border px-3 py-1.5 text-xs font-semibold ${OPS.tabIdle}`}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

