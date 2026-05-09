import { createRoot } from "react-dom/client";
import type { CustomerSavedConsignee } from "../types/customerDirectory";

export type ScscConsigneePrintChoice =
  | { type: "booking" }
  | { type: "saved"; id: string };

function titleLine(c: CustomerSavedConsignee): string {
  const lab = c.label.trim();
  const name = c.consigneeName.trim();
  if (lab && name) return `${lab} — ${name}`;
  return name || lab || "(Chưa đặt tên)";
}

function ConsigneePickerOverlay(props: {
  items: CustomerSavedConsignee[];
  onPick: (choice: ScscConsigneePrintChoice) => void;
  onCancel: () => void;
}) {
  const { items, onPick, onCancel } = props;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 p-4 backdrop-blur-md sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cnee-pick-title"
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-[24px] border border-black/[0.08] bg-white shadow-apple-md">
        <div className="border-b border-black/[0.06] px-5 py-4">
          <h2 id="cnee-pick-title" className="text-[17px] font-semibold text-apple-label">
            In phiếu cân — chọn CNEE
          </h2>
          <p className="mt-1 text-xs text-apple-secondary">
            Chọn nguồn người nhận hiển thị trên phiếu. Lựa chọn chỉ áp dụng cho lần in này (không đổi dữ liệu lô trừ khi bạn lưu ở form booking).
          </p>
        </div>
        <div className="max-h-[min(420px,55vh)] overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => onPick({ type: "booking" })}
            className="mb-2 w-full rounded-2xl border-2 border-apple-blue/25 bg-apple-blue/5 px-4 py-3 text-left transition hover:bg-apple-blue/10 hover:ring-2 hover:ring-apple-blue/25"
          >
            <span className="block text-sm font-semibold text-apple-label">Theo ô booking + hồ sơ khách</span>
            <span className="mt-1 block text-[11px] leading-snug text-apple-secondary">
              Ưu tiên đã nhập trên lô; không dùng CNEE lưu sẵn trong danh sách bên dưới. Phần còn trống lấy từ ô Consignee mặc định trên hồ sơ khách.
            </span>
          </button>
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-apple-tertiary">
            CNEE lưu sẵn trong danh bạ
          </p>
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick({ type: "saved", id: c.id })}
              className="mb-1.5 w-full rounded-2xl border border-black/[0.06] bg-apple-bg/50 px-4 py-3 text-left transition hover:bg-apple-blue/10 hover:ring-2 hover:ring-apple-blue/20"
            >
              <span className="block text-sm font-semibold text-apple-label">{titleLine(c)}</span>
              {c.consigneeAddress.trim() ? (
                <span className="mt-1 line-clamp-2 block text-[11px] text-apple-secondary">{c.consigneeAddress.trim()}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex gap-2 border-t border-black/[0.06] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-black/[0.12] bg-white py-2.5 text-sm font-semibold text-apple-label hover:bg-black/[0.03]"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}

/** `null` = đóng / hủy, không in. */
export function openScscConsigneePrintModal(params: {
  consignees: CustomerSavedConsignee[];
}): Promise<ScscConsigneePrintChoice | null> {
  const { consignees } = params;
  return new Promise((resolve) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    const finish = (choice: ScscConsigneePrintChoice | null) => {
      try {
        root.unmount();
      } catch {
        /* ignore */
      }
      el.remove();
      resolve(choice);
    };
    root.render(
      <ConsigneePickerOverlay
        items={consignees}
        onPick={(ch) => finish(ch)}
        onCancel={() => finish(null)}
      />
    );
  });
}
