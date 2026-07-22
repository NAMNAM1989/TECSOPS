import {
  EsidProfileSettingsButton,
  type EsidProfileField,
} from "./EsidProfileSettingsButton";
import {
  ESID_REGISTRANT_CHANGED_EVENT,
  getActiveEsidRegistrant,
  loadEsidRegistrantStore,
  registrantIsComplete,
  setActiveEsidRegistrantId,
  switchOrCreateEsidRegistrant,
  updateActiveEsidRegistrant,
  type EsidRegistrantProfile,
} from "../utils/esidRegistrantProfile";
import { pushEsidRegistrantStore } from "../utils/esidProfilesSync";

type Props = {
  disabled?: boolean;
  compact?: boolean;
};

const REGISTRANT_FIELDS: EsidProfileField<EsidRegistrantProfile>[] = [
  { key: "tel", label: "Điện thoại", inputMode: "tel" },
  {
    key: "cccd",
    label: "Số CCCD",
    inputMode: "numeric",
    transform: (raw) => raw.replace(/\s+/g, ""),
  },
];

/**
 * Nút cấu hình người khai ESID (CCCD cố định).
 * Đổi người = nhập tên khác → tạo/chọn hồ sơ mới.
 */
export function EsidRegistrantSettingsButton({ disabled, compact }: Props) {
  return (
    <EsidProfileSettingsButton<EsidRegistrantProfile>
      disabled={disabled}
      compact={compact}
      compactLabel="CCCD"
      buttonLabelPrefix="Người khai"
      buttonNameMax={16}
      dialogTitle="Người khai ESID (dùng chung mọi máy)"
      dialogAriaLabel="Hồ sơ người khai ESID"
      switchPrompt="Tên người khai mới (đổi người khai — CCCD/SĐT sẽ nhập riêng cho hồ sơ này):"
      switchButtonLabel="Đổi tên người khai"
      incompleteTitle="Chưa đủ họ tên / SĐT / CCCD người khai ESID"
      completeTitle={(active) => `Người khai: ${active.name} · CCCD ${active.cccd}`}
      changedEvent={ESID_REGISTRANT_CHANGED_EVENT}
      loadStore={loadEsidRegistrantStore}
      getActive={getActiveEsidRegistrant}
      updateActive={updateActiveEsidRegistrant}
      switchOrCreate={switchOrCreateEsidRegistrant}
      setActiveId={setActiveEsidRegistrantId}
      pushStore={pushEsidRegistrantStore}
      isComplete={(draft) =>
        registrantIsComplete({
          name: draft.name ?? "",
          tel: String(draft.tel ?? ""),
          cccd: String(draft.cccd ?? ""),
        })
      }
      fields={REGISTRANT_FIELDS}
      nameLabel="Họ tên đầy đủ"
      nameAutoComplete="name"
      panelMaxWidthClass="w-[min(92vw,320px)]"
    />
  );
}
