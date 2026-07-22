import {
  EsidProfileSettingsButton,
  type EsidProfileField,
} from "./EsidProfileSettingsButton";
import {
  ESID_AGENT_CHANGED_EVENT,
  agentIsComplete,
  getActiveEsidAgent,
  loadEsidAgentStore,
  setActiveEsidAgentId,
  switchOrCreateEsidAgent,
  updateActiveEsidAgent,
  type EsidAgentProfile,
} from "../utils/esidAgentProfile";
import { pushEsidAgentStore } from "../utils/esidProfilesSync";

type Props = {
  disabled?: boolean;
  compact?: boolean;
};

const AGENT_FIELDS: EsidProfileField<EsidAgentProfile>[] = [
  { key: "address", label: "Địa chỉ", multiline: true },
  { key: "tel", label: "Điện thoại", inputMode: "tel" },
  { key: "email", label: "Email", inputMode: "email" },
  { key: "vat", label: "MST / VAT" },
];

/** Nút cấu hình Agent ESID cố định (giống Người khai). */
export function EsidAgentSettingsButton({ disabled, compact }: Props) {
  return (
    <EsidProfileSettingsButton<EsidAgentProfile>
      disabled={disabled}
      compact={compact}
      compactLabel="Agent"
      buttonLabelPrefix="Agent"
      buttonNameMax={14}
      dialogTitle="Agent ESID (dùng chung mọi máy)"
      dialogAriaLabel="Hồ sơ Agent ESID"
      switchPrompt="Tên Agent mới (đổi agent — địa chỉ/SĐT nhập riêng cho hồ sơ này):"
      switchButtonLabel="Đổi tên Agent"
      incompleteTitle="Chưa có tên Agent ESID cố định"
      completeTitle={(active) => `Agent: ${active.name}`}
      changedEvent={ESID_AGENT_CHANGED_EVENT}
      loadStore={loadEsidAgentStore}
      getActive={getActiveEsidAgent}
      updateActive={updateActiveEsidAgent}
      switchOrCreate={switchOrCreateEsidAgent}
      setActiveId={setActiveEsidAgentId}
      pushStore={pushEsidAgentStore}
      isComplete={agentIsComplete}
      fields={AGENT_FIELDS}
      nameLabel="Họ tên / Name *"
    />
  );
}
