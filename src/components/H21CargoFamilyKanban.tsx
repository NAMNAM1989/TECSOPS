import type { H21CargoFamilyId } from "../utils/scscH21InvoiceCargoFamily";
import { labelForH21CargoFamily } from "../utils/scscH21InvoiceCargoFamily";

export type CargoFamilyMode = "auto" | H21CargoFamilyId;

type Lane = {
  mode: CargoFamilyMode;
  icon: string;
  title: string;
  hint: string;
  selectedCls: string;
};

const LANES: Lane[] = [
  {
    mode: "auto",
    icon: "✦",
    title: "Tự động",
    hint: "Theo tên hàng lô",
    selectedCls: "border-slate-800 bg-slate-800 text-white",
  },
  {
    mode: "frozen",
    icon: "❄",
    title: "Đông lạnh",
    hint: "IQF / -18°C",
    selectedCls: "border-sky-600 bg-sky-600 text-white",
  },
  {
    mode: "fruit",
    icon: "🥭",
    title: "Trái cây",
    hint: "Tươi · sấy · ĐL",
    selectedCls: "border-amber-600 bg-amber-500 text-white",
  },
  {
    mode: "food",
    icon: "🍜",
    title: "Thực phẩm",
    hint: "Bánh · khô · gia vị",
    selectedCls: "border-orange-700 bg-orange-600 text-white",
  },
  {
    mode: "garment",
    icon: "👕",
    title: "Quần áo",
    hint: "Dệt may · giày dép",
    selectedCls: "border-violet-700 bg-violet-600 text-white",
  },
  {
    mode: "general",
    icon: "▦",
    title: "Tổng hợp",
    hint: "Cả catalog",
    selectedCls: "border-indigo-700 bg-indigo-600 text-white",
  },
];

type Props = {
  value: CargoFamilyMode;
  onChange: (mode: CargoFamilyMode) => void;
  detectedFamily: H21CargoFamilyId;
  goodsText?: string;
  counts: Partial<Record<H21CargoFamilyId, number>>;
};

/** Kanban lane — chọn nhóm hàng khi tách nhiều tờ khai trên cùng lô. */
export function H21CargoFamilyKanban({
  value,
  onChange,
  detectedFamily,
  goodsText,
  counts,
}: Props) {
  return (
    <div className="w-full">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-1">
        <span className="text-[11px] font-semibold text-ui-text-muted">
          Tờ khai theo nhóm hàng
        </span>
        <span className="text-[10px] text-ui-text-muted">
          Chọn cột → chọn tờ khai → Tạo ngẫu nhiên. Lặp lại cho tờ khai tiếp theo.
        </span>
      </div>
      <div
        className="grid grid-cols-3 gap-1.5 sm:grid-cols-6"
        role="listbox"
        aria-label="Nhóm hàng tờ khai"
        title={goodsText ? `Tên hàng lô: ${goodsText}` : "Chưa có tên hàng trên lô"}
      >
        {LANES.map((lane) => {
          const selected = value === lane.mode;
          const suggested = lane.mode === "auto" && detectedFamily !== "general";
          const count =
            lane.mode === "auto"
              ? counts[detectedFamily]
              : counts[lane.mode];
          return (
            <button
              key={lane.mode}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChange(lane.mode)}
              className={`flex min-h-[4.25rem] flex-col items-stretch rounded-xl border px-2 py-1.5 text-left transition ${
                selected
                  ? `${lane.selectedCls} shadow-sm`
                  : "border-ui-border/80 bg-white text-ui-text hover:border-indigo-300 hover:bg-indigo-50/50"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm leading-none" aria-hidden>
                  {lane.icon}
                </span>
                {suggested ? (
                  <span
                    className={`rounded px-1 text-[8px] font-bold uppercase tracking-wide ${
                      selected ? "bg-white/20" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {labelForH21CargoFamily(detectedFamily)}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-[11px] font-extrabold leading-tight">{lane.title}</div>
              <div className={`mt-0.5 text-[9px] leading-tight ${selected ? "opacity-90" : "text-ui-text-muted"}`}>
                {lane.hint}
                {typeof count === "number" ? ` · ${count} SP` : ""}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
