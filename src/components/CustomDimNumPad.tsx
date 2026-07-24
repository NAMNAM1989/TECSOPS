import React from "react";

interface CustomDimNumPadProps {
  onKeyPress: (num: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onAction: () => void;
  actionLabel: "Tiếp" | "Thêm";
}

const QUICK_SIZES = ["20", "25", "30", "40", "50", "60", "80", "100", "120"];

export const CustomDimNumPad: React.FC<CustomDimNumPadProps> = ({
  onKeyPress,
  onDelete,
  onClear,
  onAction,
  actionLabel,
}) => {
  const handleNumClick = (e: React.MouseEvent<HTMLButtonElement>, val: string) => {
    e.preventDefault();
    onKeyPress(val);
  };

  const handleFuncClick = (e: React.MouseEvent<HTMLButtonElement>, action: () => void) => {
    e.preventDefault();
    action();
  };

  return (
    <div className="select-none rounded-2xl border border-black/[0.06] bg-slate-50 p-2 shadow-inner">
      {/* Hàng chọn nhanh kích thước chục */}
      <div className="mb-2 flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {QUICK_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onClick={(e) => handleNumClick(e, size)}
            className="flex h-9 min-w-[2.5rem] shrink-0 items-center justify-center rounded-lg border border-black/[0.06] bg-white text-xs font-bold text-slate-800 shadow-sm active:bg-slate-100"
          >
            {size}
          </button>
        ))}
      </div>

      {/* Bàn phím lưới 4 cột */}
      <div className="grid grid-cols-4 gap-1.5">
        {/* Số 7, 8, 9 */}
        <button
          type="button"
          onClick={(e) => handleNumClick(e, "7")}
          className="flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          7
        </button>
        <button
          type="button"
          onClick={(e) => handleNumClick(e, "8")}
          className="flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          8
        </button>
        <button
          type="button"
          onClick={(e) => handleNumClick(e, "9")}
          className="flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          9
        </button>
        
        {/* Nút Xóa ⌫ */}
        <button
          type="button"
          onClick={(e) => handleFuncClick(e, onDelete)}
          className="flex h-11 items-center justify-center rounded-xl bg-red-50 font-semibold text-red-600 shadow-sm active:bg-red-100"
          title="Xóa lùi"
        >
          ⌫
        </button>

        {/* Số 4, 5, 6 */}
        <button
          type="button"
          onClick={(e) => handleNumClick(e, "4")}
          className="flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          4
        </button>
        <button
          type="button"
          onClick={(e) => handleNumClick(e, "5")}
          className="flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          5
        </button>
        <button
          type="button"
          onClick={(e) => handleNumClick(e, "6")}
          className="flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          6
        </button>

        {/* Nút Xóa hết C */}
        <button
          type="button"
          onClick={(e) => handleFuncClick(e, onClear)}
          className="flex h-11 items-center justify-center rounded-xl bg-slate-200 text-xs font-bold text-slate-700 shadow-sm active:bg-slate-300"
        >
          C
        </button>

        {/* Số 1, 2, 3 */}
        <button
          type="button"
          onClick={(e) => handleNumClick(e, "1")}
          className="flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          1
        </button>
        <button
          type="button"
          onClick={(e) => handleNumClick(e, "2")}
          className="flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          2
        </button>
        <button
          type="button"
          onClick={(e) => handleNumClick(e, "3")}
          className="flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          3
        </button>

        {/* Nút Action: Tiếp/Thêm */}
        <button
          type="button"
          onClick={(e) => handleFuncClick(e, onAction)}
          className={`row-span-2 flex h-24 items-center justify-center rounded-xl font-bold text-white shadow-md active:opacity-90 ${
            actionLabel === "Thêm" ? "bg-emerald-600 active:bg-emerald-700" : "bg-apple-blue active:bg-blue-700"
          }`}
        >
          {actionLabel}
        </button>

        {/* Số 0, dấu chấm . */}
        <button
          type="button"
          onClick={(e) => handleNumClick(e, "0")}
          className="col-span-2 flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          0
        </button>
        <button
          type="button"
          onClick={(e) => handleNumClick(e, ".")}
          className="flex h-11 items-center justify-center rounded-xl bg-white text-base font-bold text-slate-800 shadow-sm active:bg-slate-100"
        >
          .
        </button>
      </div>
    </div>
  );
};
