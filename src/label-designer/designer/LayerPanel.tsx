import type { LabelTemplateV1 } from "../core/types";

type Props = {
  template: LabelTemplateV1;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (id: string, dir: "up" | "down") => void;
};

const TYPE_ICON: Record<string, string> = {
  text: "Aa",
  line: "╱",
  rect: "□",
  image: "⊡",
  barcode: "▥",
  qr: "⊞",
  table: "⊟",
};

export function LayerPanel({ template, selectedId, onSelect, onReorder }: Props) {
  const objects = [...template.objects].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));

  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.09] bg-white shadow-sm">
      <div className="border-b border-black/[0.07] bg-slate-100/80 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Lớp · {objects.length}
        </p>
      </div>

      <ul className="max-h-48 overflow-y-auto">
        {objects.length === 0 && (
          <li className="px-3 py-3 text-[10px] text-slate-400">Chưa có đối tượng nào.</li>
        )}
        {objects.map((obj) => {
          const isSelected = selectedId === obj.id;
          return (
            <li
              key={obj.id}
              className={`group flex cursor-pointer select-none items-center gap-2 border-b border-black/[0.05] px-2 py-1.5 transition-colors last:border-b-0 ${
                isSelected
                  ? "bg-blue-50 text-blue-700"
                  : "hover:bg-black/[0.03] text-slate-700"
              }`}
              onClick={() => onSelect(obj.id)}
            >
              {/* Type icon */}
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold ${
                  isSelected ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-500"
                }`}
              >
                {TYPE_ICON[obj.type] ?? "?"}
              </span>

              <span className="min-w-0 flex-1 truncate text-[10px] font-medium">
                {obj.type}
                <span className="ml-1 font-mono text-[8px] opacity-50">{obj.id.slice(-5)}</span>
              </span>

              {/* Reorder buttons */}
              <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Lên trên"
                  className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-200 text-[10px] text-slate-600 transition-all hover:bg-slate-300 active:scale-90"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReorder(obj.id, "up");
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="Xuống dưới"
                  className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-200 text-[10px] text-slate-600 transition-all hover:bg-slate-300 active:scale-90"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReorder(obj.id, "down");
                  }}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
