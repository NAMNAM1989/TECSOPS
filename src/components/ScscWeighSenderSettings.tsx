import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import { clampScscWeighPrintSettings } from "../printing/scscWeigh/scscWeighPrintSettingsCore";

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
          ? "rounded-xl border border-black/[0.08] bg-black/[0.02] p-3"
          : "mb-4 rounded-2xl border border-sky-200/60 bg-sky-50/40 p-3"
      }
    >
      <p className="mb-1 text-[11px] font-semibold uppercase text-sky-900">Người gửi (in chung SCSC)</p>
      <p className="mb-3 text-[10px] leading-snug text-sky-900/80">
        Họ tên và SĐT in ở cuối mọi phiếu cân SCSC. Sửa một lần — áp dụng cho toàn bộ lần in (đồng bộ máy chủ).
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[10px] font-semibold text-apple-tertiary">
          Họ tên
          <input
            value={settings.senderName}
            onChange={(e) => set({ senderName: e.target.value })}
            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label"
            placeholder="Người làm phiếu cân"
          />
        </label>
        <label className="block text-[10px] font-semibold text-apple-tertiary">
          Số điện thoại
          <input
            value={settings.senderPhone}
            onChange={(e) => set({ senderPhone: e.target.value })}
            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label"
            placeholder="09xxxxxxxx"
          />
        </label>
      </div>
    </section>
  );
}
