import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import { clampScscWeighPrintSettings } from "../printing/scscWeigh/scscWeighPrintSettingsCore";
import { CD, cdInput } from "./customerDirectory/customerDirectoryStyles";

type Props = {
  settings: ScscWeighPrintSettings;
  onChange: (next: ScscWeighPrintSettings) => void;
  compact?: boolean;
};

export function ScscWeighSenderSettings({ settings, onChange, compact }: Props) {
  const set = (patch: Partial<ScscWeighPrintSettings>) =>
    onChange(clampScscWeighPrintSettings({ ...settings, ...patch }));

  return (
    <section
      className={
        compact
          ? `rounded-xl border p-3 ${CD.panelSoft}`
          : `mb-4 rounded-2xl border p-3 ${CD.sectionSender}`
      }
    >
      <p className={`mb-1 text-[11px] font-semibold uppercase ${CD.sectionSenderTitle}`}>Người gửi (in chung SCSC)</p>
      <p className={`mb-3 text-[10px] leading-snug ${CD.sectionSenderHint}`}>
        Họ tên và SĐT in ở cuối mọi phiếu cân SCSC. Sửa một lần — áp dụng cho toàn bộ lần in (đồng bộ máy chủ).
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`block text-[10px] font-semibold ${CD.muted}`}>
          Họ tên
          <input
            value={settings.senderName}
            onChange={(e) => set({ senderName: e.target.value })}
            className={`mt-1 w-full text-sm ${cdInput}`}
            placeholder="Người làm phiếu cân"
          />
        </label>
        <label className={`block text-[10px] font-semibold ${CD.muted}`}>
          Số điện thoại
          <input
            value={settings.senderPhone}
            onChange={(e) => set({ senderPhone: e.target.value })}
            className={`mt-1 w-full text-sm ${cdInput}`}
            placeholder="09xxxxxxxx"
          />
        </label>
      </div>
    </section>
  );
}
