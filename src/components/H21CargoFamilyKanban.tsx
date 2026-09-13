import type { H21CargoFamilyId } from "../utils/scscH21InvoiceCargoFamily";
import { labelForH21CargoFamily } from "../utils/scscH21InvoiceCargoFamily";
import type { H21CargoFamilyMode } from "../utils/scscH21InvoiceSplits";

export type CargoFamilyMode = H21CargoFamilyMode;

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
    mode: "customer",
    icon: "👤",
    title: "Data KH",
    hint: "Gán ở Danh mục",
    selectedCls: "border-emerald-700 bg-emerald-600 text-white",
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

/** Nhóm hàng khi đã khóa Data KH (không hiện lane Data KH — pool đã khóa). */
const FAMILY_MODES_WHEN_LOCKED = new Set<CargoFamilyMode>([
  "auto",
  "frozen",
  "fruit",
  "food",
  "garment",
  "general",
]);

type Props = {
  value: CargoFamilyMode;
  onChange: (mode: CargoFamilyMode) => void;
  detectedFamily: H21CargoFamilyId;
  goodsText?: string;
  counts: Partial<Record<H21CargoFamilyId, number>>;
  /** Số SP resolve được trong preset KH. */
  customerPresetCount?: number;
  customerLabel?: string;
  /**
   * KH đã gán Data H21 tại kho → pool chỉ Data KH.
   * Vẫn cho chọn nhóm hàng (TP / đông lạnh…) trong pool đó.
   */
  lockedToCustomer?: boolean;
};

/** Kanban lane — chọn nhóm hàng / Data KH khi tách nhiều tờ khai. */
export function H21CargoFamilyKanban({
  value,
  onChange,
  detectedFamily,
  goodsText,
  counts,
  customerPresetCount = 0,
  customerLabel,
  lockedToCustomer = false,
}: Props) {
  const lanes = lockedToCustomer
    ? LANES.filter((l) => FAMILY_MODES_WHEN_LOCKED.has(l.mode)).map((l) =>
        l.mode === "general"
          ? { ...l, hint: "Cả Data KH", title: "Tổng hợp" }
          : l
      )
    : LANES.filter(
        (l) => l.mode !== "customer" || customerPresetCount > 0 || value === "customer"
      );

  /** Mode `customer` legacy → coi như Tổng hợp trong Data KH. */
  const displayValue =
    lockedToCustomer && value === "customer" ? "general" : value;

  return (
    <div className="w-full">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-1">
        <span className="text-[11px] font-semibold text-ui-text-muted">
          {lockedToCustomer
            ? "Nguồn hàng tờ khai · Data KH + nhóm"
            : "Tờ khai theo nhóm hàng"}
        </span>
        <span className="text-[10px] text-ui-text-muted">
          {lockedToCustomer
            ? "Pool khóa Data KH — chọn nhóm (TP / đông lạnh…) trong list đã up."
            : "Data KH = pool SP gán trên trang Danh mục H21 theo kho."}
        </span>
      </div>

      {lockedToCustomer ? (
        <div className="mb-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300/80 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-950">
          <span className="inline-flex items-center gap-1 font-extrabold">
            <span aria-hidden>👤</span>
            Data KH
          </span>
          <span className="rounded-full bg-emerald-700 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
            Khóa
          </span>
          <span className="text-emerald-900/90">
            {customerLabel?.trim() || "—"} · {customerPresetCount} SP
          </span>
          <span className="text-[10px] text-emerald-800/80">
            — chọn nhóm bên dưới để lọc / tạo ngẫu nhiên cùng loại
          </span>
        </div>
      ) : null}

      <div
        className={`grid gap-1.5 ${
          lockedToCustomer
            ? "grid-cols-3 sm:grid-cols-6"
            : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-7"
        }`}
        role="listbox"
        aria-label="Nhóm hàng tờ khai"
        title={goodsText ? `Tên hàng lô: ${goodsText}` : "Chưa có tên hàng trên lô"}
      >
        {lanes.map((lane) => {
          const selected = displayValue === lane.mode;
          const suggested = lane.mode === "auto" && detectedFamily !== "general";
          const count =
            lane.mode === "auto"
              ? counts[detectedFamily]
              : lane.mode === "customer"
                ? customerPresetCount
                : counts[lane.mode];
          const hint =
            lane.mode === "customer" && customerLabel
              ? customerLabel
              : lane.hint;
          return (
            <button
              key={lane.mode}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChange(lane.mode)}
              disabled={lane.mode === "customer" && customerPresetCount <= 0}
              className={`flex min-h-[4.25rem] flex-col items-stretch rounded-xl border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
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
              <div
                className={`mt-0.5 text-[9px] leading-tight ${
                  selected ? "opacity-90" : "text-ui-text-muted"
                }`}
              >
                {hint}
                {typeof count === "number" ? ` · ${count} SP` : ""}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
