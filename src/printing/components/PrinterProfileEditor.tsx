import { useState } from "react";
import { createPortal } from "react-dom";
import type { A4WeighReceiptPrinterProfile, PrinterProfile, ThermalLabelPrinterProfile } from "../printTypes";
import { DEFAULT_A4_WEIGH_PROFILE, DEFAULT_THERMAL_LABEL_PROFILE } from "../printerProfiles";
import { labelSheetFormatLabel, withThermalLabelFormat } from "../thermalLabelFormat";
import type { LabelSheetFormat } from "../../utils/labelSheetFormat";

type Props = {
  open: boolean;
  profiles: PrinterProfile[];
  onSave: (profile: PrinterProfile) => void;
  onClose: () => void;
};

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

export function PrinterProfileEditor({ open, profiles, onSave, onClose }: Props) {
  const [kind, setKind] = useState<"thermal-tspl" | "a4-browser">("thermal-tspl");
  const [draft, setDraft] = useState<PrinterProfile>(DEFAULT_THERMAL_LABEL_PROFILE);

  if (!open || typeof document === "undefined") return null;

  const startNew = (k: "thermal-tspl" | "a4-browser") => {
    setKind(k);
    if (k === "thermal-tspl") {
      setDraft(
        withThermalLabelFormat(
          { ...DEFAULT_THERMAL_LABEL_PROFILE, id: newId("thermal"), name: "Máy nhãn mới" },
          "100x80"
        )
      );
    } else {
      setDraft({ ...DEFAULT_A4_WEIGH_PROFILE, id: newId("a4"), name: "Máy A4 mới" });
    }
  };

  const loadExisting = (p: PrinterProfile) => {
    setDraft(p);
    setKind(p.type);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-black/[0.1] bg-white p-4 shadow-apple-md">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-apple-label">Quản lý profile máy in</h3>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-sm text-apple-secondary hover:bg-black/[0.05]">
            Đóng
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => startNew("thermal-tspl")} className="rounded-full border px-3 py-1.5 text-xs font-semibold">
            + Nhãn nhiệt
          </button>
          <button type="button" onClick={() => startNew("a4-browser")} className="rounded-full border px-3 py-1.5 text-xs font-semibold">
            + Tờ cân A4
          </button>
        </div>

        <div className="mb-3 max-h-28 overflow-y-auto rounded-lg border border-black/[0.08] p-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => loadExisting(p)}
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-black/[0.04]"
            >
              {p.name} <span className="text-apple-tertiary">({p.type})</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-apple-secondary">Tên profile</label>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        {kind === "thermal-tspl" ? (
          <ThermalFields draft={draft as ThermalLabelPrinterProfile} onChange={setDraft} />
        ) : (
          <A4Fields draft={draft as A4WeighReceiptPrinterProfile} onChange={setDraft} />
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() =>
              onSave(
                draft.type === "thermal-tspl"
                  ? withThermalLabelFormat(draft as ThermalLabelPrinterProfile)
                  : draft
              )
            }
            className="rounded-full bg-apple-blue px-4 py-2 text-xs font-semibold text-white"
          >
            Lưu profile
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ThermalFields({
  draft,
  onChange,
}: {
  draft: ThermalLabelPrinterProfile;
  onChange: (p: PrinterProfile) => void;
}) {
  const set = (patch: Partial<ThermalLabelPrinterProfile>) =>
    onChange(withThermalLabelFormat({ ...draft, ...patch }));
  const setFormat = (format: LabelSheetFormat) => onChange(withThermalLabelFormat(draft, format));
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <label className="col-span-2">
        <span className="mb-0.5 block font-semibold text-apple-secondary">Khổ tem cố định (máy chuyên)</span>
        <select
          value={draft.labelSheetFormat ?? "100x80"}
          onChange={(e) => setFormat(e.target.value as LabelSheetFormat)}
          className="w-full rounded border px-2 py-1.5"
        >
          <option value="100x80">{labelSheetFormatLabel("100x80")}</option>
          <option value="100x50">{labelSheetFormatLabel("100x50")}</option>
        </select>
      </label>
      <Field label="IP máy in" value={draft.host ?? ""} onChange={(v) => set({ host: v })} className="col-span-2" />
      <Field label="Port" value={String(draft.port ?? 9100)} onChange={(v) => set({ port: Number(v) || 9100 })} />
      <Field label="DPI" value={String(draft.dpi)} onChange={(v) => set({ dpi: Number(v) || 203 })} />
      <Field label="Tem rộng mm" value={String(draft.labelWidthMm)} onChange={(v) => set({ labelWidthMm: Number(v) })} />
      <Field label="Tem cao mm" value={String(draft.labelHeightMm)} onChange={(v) => set({ labelHeightMm: Number(v) })} />
      <Field label="Gap mm" value={String(draft.gapMm)} onChange={(v) => set({ gapMm: Number(v) })} />
      <Field label="Offset X mm" value={String(draft.offsetXmm)} onChange={(v) => set({ offsetXmm: Number(v) })} />
      <Field label="Offset Y mm" value={String(draft.offsetYmm)} onChange={(v) => set({ offsetYmm: Number(v) })} />
    </div>
  );
}

function A4Fields({
  draft,
  onChange,
}: {
  draft: A4WeighReceiptPrinterProfile;
  onChange: (p: PrinterProfile) => void;
}) {
  const set = (patch: Partial<A4WeighReceiptPrinterProfile>) => onChange({ ...draft, ...patch });
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <Field label="Offset X mm" value={String(draft.offsetXmm)} onChange={(v) => set({ offsetXmm: Number(v) })} />
      <Field label="Offset Y mm" value={String(draft.offsetYmm)} onChange={(v) => set({ offsetYmm: Number(v) })} />
      <Field label="Scale X" value={String(draft.scaleX)} onChange={(v) => set({ scaleX: Number(v) })} />
      <Field label="Scale Y" value={String(draft.scaleY)} onChange={(v) => set({ scaleY: Number(v) })} />
      <Field
        label="Khoảng cách dòng địa chỉ (mm)"
        value={String(draft.partyLineGapMm ?? 6)}
        onChange={(v) => set({ partyLineGapMm: Number(v) })}
      />
      <Field
        label="Cỡ chữ địa chỉ (mm)"
        value={String(draft.partyAddressFontMm ?? 3)}
        onChange={(v) => set({ partyAddressFontMm: Number(v) })}
      />
      <Field
        label="Cỡ chữ tên Shipper/Agent/CNEE (mm)"
        value={String(draft.partyNameFontMm ?? 4)}
        onChange={(v) => set({ partyNameFontMm: Number(v) })}
      />
      <Field
        label="Cỡ chữ SĐT/Email/MST (mm)"
        value={String(draft.partyContactFontMm ?? 3)}
        onChange={(v) => set({ partyContactFontMm: Number(v) })}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-0.5 block font-semibold text-apple-secondary">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border px-2 py-1.5" />
    </label>
  );
}
