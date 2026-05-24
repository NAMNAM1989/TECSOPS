import type { GlobalAgentCatalog, GlobalAgentEntry } from "../types/globalAgents";
import {
  clampGlobalAgentEntry,
  emptyGlobalAgentEntry,
  NONE_GLOBAL_AGENT_ID,
} from "../utils/globalAgentsCore";
import { formatVnPhoneDisplay, normalizeAgentCode } from "../utils/customerProfileInputFormat";
import { CD, cdInput } from "./customerDirectory/customerDirectoryStyles";

type Props = {
  catalog: GlobalAgentCatalog;
  onChange: (next: GlobalAgentCatalog) => void;
};

export function GlobalAgentsSettings({ catalog, onChange }: Props) {
  function patchAgent(index: number, patch: Partial<GlobalAgentEntry>) {
    const list = [...catalog.agents];
    const cur = list[index];
    if (!cur) return;
    list[index] = clampGlobalAgentEntry({ ...cur, ...patch });
    onChange({ ...catalog, agents: list });
  }

  function removeAgent(index: number) {
    const removed = catalog.agents[index];
    if (!removed) return;
    const list = catalog.agents.filter((_, i) => i !== index);
    const defaultAgentId =
      catalog.defaultAgentId === removed.id
        ? list.find((a) => a.isNone)?.id ?? list[0]?.id ?? NONE_GLOBAL_AGENT_ID
        : catalog.defaultAgentId;
    onChange({ agents: list, defaultAgentId });
  }

  function addAgent() {
    onChange({
      ...catalog,
      agents: [...catalog.agents, emptyGlobalAgentEntry({ label: `Agent ${catalog.agents.length}` })],
    });
  }

  return (
    <section className={`mb-3 p-2.5 ${CD.sectionAgents}`}>
      <p className={`mb-0.5 text-[10px] font-semibold uppercase ${CD.sectionAgentsTitle}`}>Agent chung (mọi khách)</p>
      <p className={`mb-2 text-[10px] leading-snug ${CD.sectionAgentsHint}`}>
        Nhãn/mã agent tự viết HOA · SĐT tự format
      </p>
      <label className={`mb-3 block text-[10px] font-semibold ${CD.muted}`}>
        Agent mặc định
        <select
          value={catalog.defaultAgentId}
          onChange={(e) => onChange({ ...catalog, defaultAgentId: e.target.value })}
          className={`mt-1 w-full text-sm font-medium ${cdInput}`}
        >
          {catalog.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label.trim() || a.agentName.trim() || a.id}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-2">
        {catalog.agents.map((ag, idx) => (
          <div key={ag.id} className={`p-2.5 ${CD.card}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={`text-[10px] font-semibold uppercase ${CD.muted}`}>
                {ag.isNone ? "Không agent" : `Agent #${idx + 1}`}
              </span>
              {!ag.isNone && ag.id !== NONE_GLOBAL_AGENT_ID ? (
                <button
                  type="button"
                  onClick={() => removeAgent(idx)}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/15"
                >
                  Xóa
                </button>
              ) : null}
            </div>
            <input
              value={ag.label}
              disabled={Boolean(ag.isNone)}
              onChange={(e) => patchAgent(idx, { label: e.target.value.toUpperCase() })}
              onBlur={(e) => patchAgent(idx, { label: normalizeAgentCode(e.target.value) })}
              className={`mb-1.5 w-full font-mono text-xs font-bold uppercase disabled:opacity-60 ${cdInput} bg-apple-bg/40 dark:bg-black/25`}
              placeholder="Mã / nhãn (VD: CTL)"
            />
            {!ag.isNone ? (
              <>
                <input
                  value={ag.agentName}
                  onChange={(e) => patchAgent(idx, { agentName: e.target.value })}
                  className={`mb-1.5 w-full text-sm ${cdInput}`}
                  placeholder="Tên in trên phiếu cân"
                />
                <textarea
                  value={ag.agentAddress}
                  onChange={(e) => patchAgent(idx, { agentAddress: e.target.value })}
                  rows={2}
                  className={`mb-1.5 w-full resize-y text-sm ${cdInput}`}
                  placeholder="Địa chỉ — Enter để xuống dòng khi in"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className={`mb-0.5 block text-[10px] font-semibold ${CD.muted}`}>Số điện thoại</label>
                    <input
                      type="text"
                      value={ag.agentPhone}
                      onChange={(e) => patchAgent(idx, { agentPhone: e.target.value })}
                      onBlur={(e) => patchAgent(idx, { agentPhone: formatVnPhoneDisplay(e.target.value) })}
                      maxLength={24}
                      className={`w-full text-sm tabular-nums ${cdInput}`}
                      placeholder="SĐT"
                    />
                  </div>
                  <div>
                    <label className={`mb-0.5 block text-[10px] font-semibold ${CD.muted}`}>Email</label>
                    <input
                      type="email"
                      value={ag.agentEmail}
                      onChange={(e) => patchAgent(idx, { agentEmail: e.target.value })}
                      maxLength={50}
                      className={`w-full text-sm ${cdInput}`}
                      placeholder="Email"
                    />
                  </div>
                  <div>
                    <label className={`mb-0.5 block text-[10px] font-semibold ${CD.muted}`}>Mã số thuế</label>
                    <input
                      type="text"
                      value={ag.agentTaxCode}
                      onChange={(e) => patchAgent(idx, { agentTaxCode: e.target.value })}
                      maxLength={24}
                      className={`w-full text-sm ${cdInput}`}
                      placeholder="MST"
                    />
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={addAgent}
          className={`w-full rounded-full border border-dashed border-violet-400/50 py-2 text-xs font-semibold hover:bg-violet-100 ${CD.sectionVioletTitle} dark:border-violet-400/35 dark:hover:bg-violet-500/15`}
        >
          + Thêm Agent
        </button>
      </div>
    </section>
  );
}
