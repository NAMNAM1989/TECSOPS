import { useMemo } from "react";
import type { PrintDocumentType, PrinterProfile } from "../printTypes";
import { isA4WeighProfile, isThermalProfile } from "../printerProfileStorage";
import type { PrinterProfileStoreV1 } from "../printTypes";

type Props = {
  docType: PrintDocumentType;
  store: PrinterProfileStoreV1;
  onChangeActive: (profileId: string) => void;
  onEditProfiles?: () => void;
};

export function PrinterProfileSelector({ docType, store, onChangeActive, onEditProfiles }: Props) {
  const profiles = useMemo(() => {
    return store.profiles.filter((p) =>
      docType === "thermal-label" ? isThermalProfile(p) : isA4WeighProfile(p)
    );
  }, [store.profiles, docType]);

  const activeId =
    docType === "thermal-label" ? store.activeThermalProfileId : store.activeA4WeighProfileId;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold text-apple-label">Máy in / Profile</label>
        {onEditProfiles ? (
          <button
            type="button"
            onClick={onEditProfiles}
            className="text-[10px] font-semibold text-apple-blue hover:underline"
          >
            Quản lý
          </button>
        ) : null}
      </div>
      <select
        value={activeId}
        onChange={(e) => onChangeActive(e.target.value)}
        className="w-full rounded-xl border border-black/[0.12] bg-white px-3 py-2.5 text-sm text-apple-label outline-none focus:border-apple-blue"
      >
        {profiles.map((p: PrinterProfile) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {isThermalProfile(p) && p.host ? ` · ${p.host}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
