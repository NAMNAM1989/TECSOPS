import { createRoot } from "react-dom/client";
import type { CustomerSavedConsignee } from "../types/customerDirectory";
import { OPS } from "../styles/opsModalStyles";

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
      <div className={`max-h-[85vh] w-full max-w-md overflow-hidden rounded-[24px] border shadow-apple-md ${OPS.modal} ${OPS.border}`}>
        <div className={`border-b px-5 py-4 ${OPS.border}`}>
          <h2 id="cnee-pick-title" className={`text-[17px] font-semibold ${OPS.title}`}>
            In phiếu cân — chọn CNEE
          </h2>
          <p className={`mt-1 text-xs ${OPS.secondary}`}>
            Chọn nguồn người nhận hiển thị trên phiếu. Lựa chọn chỉ áp dụng cho lần in này (không đổi dữ liệu lô trừ khi bạn lưu ở form booking).
          </p>
        </div>
        <div className="max-h-[min(420px,55vh)] overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => onPick({ type: "booking" })}
            className={`${OPS.pickHero} hover:ring-2 hover:ring-apple-blue/25 dark:hover:ring-sky-400/35`}
          >
            <span className={`block text-sm font-semibold ${OPS.title}`}>Theo ô booking + hồ sơ khách</span>
            <span className={`mt-1 block text-[11px] leading-snug ${OPS.secondary}`}>
              Ưu tiên đã nhập trên lô; không dùng CNEE lưu sẵn trong danh sách bên dưới. Phần còn trống lấy từ ô Consignee mặc định trên hồ sơ khách.
            </span>
          </button>
          <p className={`mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide ${OPS.muted}`}>
            CNEE lưu sẵn trong danh bạ
          </p>
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick({ type: "saved", id: c.id })}
              className={`${OPS.pickSaved} hover:ring-2 hover:ring-apple-blue/20 dark:hover:ring-sky-400/30`}
            >
              <span className={`block text-sm font-semibold ${OPS.title}`}>{titleLine(c)}</span>
              {c.consigneeAddress.trim() ? (
                <span className={`mt-1 line-clamp-2 block text-[11px] ${OPS.secondary}`}>{c.consigneeAddress.trim()}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className={`flex gap-2 border-t px-4 py-3 ${OPS.footer}`}>
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 rounded-full border py-2.5 text-sm font-semibold ${OPS.tabIdle}`}
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
