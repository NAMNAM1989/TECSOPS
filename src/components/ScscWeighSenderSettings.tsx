import type { ScscWeighPrintSettings, ScscWeighWarehouseKey } from "../types/scscWeighPrintSettings";
import { SCSC_WEIGH_WAREHOUSE_KEYS } from "../types/scscWeighPrintSettings";
import {
  patchScscSenderForWarehouse,
} from "../printing/scscWeigh/scscWeighPrintSettingsCore";
import { warehouseLabel } from "../constants/warehouses";
import { CD, cdInput } from "./customerDirectory/customerDirectoryStyles";
import { OPS } from "../styles/opsModalStyles";

type Props = {
  settings: ScscWeighPrintSettings;
  onChange: (next: ScscWeighPrintSettings) => void;
  compact?: boolean;
  activeWarehouse?: ScscWeighWarehouseKey;
};

function SenderBlock({
  warehouseKey,
  settings,
  onChange,
  compact,
  active,
}: {
  warehouseKey: ScscWeighWarehouseKey;
  settings: ScscWeighPrintSettings;
  onChange: (next: ScscWeighPrintSettings) => void;
  compact?: boolean;
  active?: boolean;
}) {
  const block = settings.senders[warehouseKey];
  const set = (patch: { senderName?: string; senderPhone?: string }) =>
    onChange(patchScscSenderForWarehouse(settings, warehouseKey, patch));

  return (
    <div
      className={
        active
          ? `rounded-xl border p-3 ${OPS.sectionProfile}`
          : compact
            ? `rounded-lg border p-2.5 ${CD.panelSoft}`
            : `rounded-xl border p-3 ${CD.panelSoft}`
      }
    >
      <p className={`mb-2 text-[10px] font-semibold uppercase ${active ? OPS.accent : CD.muted}`}>
        {warehouseLabel[warehouseKey]}
        {active ? " · áp dụng lô này" : ""}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`block text-[10px] font-semibold ${CD.muted}`}>
          Họ tên
          <input
            value={block.senderName}
            onChange={(e) => set({ senderName: e.target.value })}
            className={`mt-1 w-full text-sm ${cdInput}`}
            placeholder="Người làm phiếu cân"
          />
        </label>
        <label className={`block text-[10px] font-semibold ${CD.muted}`}>
          Số điện thoại
          <input
            value={block.senderPhone}
            onChange={(e) => set({ senderPhone: e.target.value })}
            className={`mt-1 w-full text-sm ${cdInput}`}
            placeholder="09xxxxxxxx"
          />
        </label>
      </div>
    </div>
  );
}

export function ScscWeighSenderSettings({ settings, onChange, compact, activeWarehouse }: Props) {
  if (compact && activeWarehouse) {
    const other = SCSC_WEIGH_WAREHOUSE_KEYS.find((k) => k !== activeWarehouse)!;
    return (
      <section className={`space-y-2 rounded-xl border p-3 ${CD.panelSoft}`}>
        <p className={`text-[11px] font-semibold uppercase ${CD.sectionSenderTitle}`}>Người gửi (cuối phiếu)</p>
        <p className={`text-[10px] leading-snug ${CD.sectionSenderHint}`}>
          Mỗi kho SCSC một bộ họ tên / SĐT. Sửa tại đây — đồng bộ máy chủ, áp dụng mọi lần in sau.
        </p>
        <SenderBlock
          warehouseKey={activeWarehouse}
          settings={settings}
          onChange={onChange}
          compact
          active
        />
        <details className="group">
          <summary className={`cursor-pointer list-none text-[10px] font-semibold ${OPS.accent}`}>
            Chỉnh cho {warehouseLabel[other]}
          </summary>
          <div className="mt-2">
            <SenderBlock warehouseKey={other} settings={settings} onChange={onChange} compact />
          </div>
        </details>
      </section>
    );
  }

  return (
    <section
      className={
        compact ? `rounded-xl border p-3 ${CD.panelSoft}` : `mb-4 rounded-2xl border p-3 ${CD.sectionSender}`
      }
    >
      <p className={`mb-1 text-[11px] font-semibold uppercase ${CD.sectionSenderTitle}`}>
        Người gửi (in phiếu cân SCSC)
      </p>
      <p className={`mb-3 text-[10px] leading-snug ${CD.sectionSenderHint}`}>
        TECS-SCSC và KHO SCSC có thể khác người làm phiếu. Họ tên + SĐT in ở cuối mọi phiếu — đồng bộ máy chủ.
      </p>
      <div className="space-y-3">
        {SCSC_WEIGH_WAREHOUSE_KEYS.map((key) => (
          <SenderBlock
            key={key}
            warehouseKey={key}
            settings={settings}
            onChange={onChange}
            active={activeWarehouse === key}
          />
        ))}
      </div>
    </section>
  );
}
