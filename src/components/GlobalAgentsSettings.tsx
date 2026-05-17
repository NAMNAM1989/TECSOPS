import type { GlobalAgentCatalog, GlobalAgentEntry } from "../types/globalAgents";
import {
  clampGlobalAgentEntry,
  emptyGlobalAgentEntry,
  NONE_GLOBAL_AGENT_ID,
} from "../utils/globalAgentsCore";

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
    <section className="mb-4 rounded-2xl border border-violet-200/60 bg-violet-50/40 p-3">
      <p className="mb-1 text-[11px] font-semibold uppercase text-violet-900">Agent chung (mọi khách)</p>
      <p className="mb-3 text-[10px] leading-snug text-violet-900/80">
        Chọn Agent A / B / Không có agent khi booking. Mặc định áp dụng cho tất cả khách khi chọn khách mới.
      </p>
      <label className="mb-3 block text-[10px] font-semibold text-apple-tertiary">
        Agent mặc định
        <select
          value={catalog.defaultAgentId}
          onChange={(e) => onChange({ ...catalog, defaultAgentId: e.target.value })}
          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-medium text-apple-label"
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
          <div key={ag.id} className="rounded-xl border border-black/[0.08] bg-white p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase text-apple-tertiary">
                {ag.isNone ? "Không agent" : `Agent #${idx + 1}`}
              </span>
              {!ag.isNone && ag.id !== NONE_GLOBAL_AGENT_ID ? (
                <button
                  type="button"
                  onClick={() => removeAgent(idx)}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                >
                  Xóa
                </button>
              ) : null}
            </div>
            <input
              value={ag.label}
              disabled={Boolean(ag.isNone)}
              onChange={(e) => patchAgent(idx, { label: e.target.value })}
              className="mb-1.5 w-full rounded-lg border border-black/[0.08] bg-apple-bg/40 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
              placeholder="Nhãn (VD: Agent A)"
            />
            {!ag.isNone ? (
              <>
                <input
                  value={ag.agentName}
                  onChange={(e) => patchAgent(idx, { agentName: e.target.value })}
                  className="mb-1.5 w-full rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-sm"
                  placeholder="Tên in trên phiếu cân"
                />
                <textarea
                  value={ag.agentAddress}
                  onChange={(e) => patchAgent(idx, { agentAddress: e.target.value })}
                  rows={2}
                  className="mb-1.5 w-full resize-y rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-sm"
                  placeholder="Địa chỉ — Enter để xuống dòng khi in"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="mb-0.5 block text-[10px] font-semibold text-apple-tertiary">Số điện thoại</label>
                    <input
                      type="text"
                      value={ag.agentPhone}
                      onChange={(e) => patchAgent(idx, { agentPhone: e.target.value })}
                      maxLength={24}
                      className="w-full rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-sm"
                      placeholder="SĐT"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-semibold text-apple-tertiary">Email</label>
                    <input
                      type="email"
                      value={ag.agentEmail}
                      onChange={(e) => patchAgent(idx, { agentEmail: e.target.value })}
                      maxLength={50}
                      className="w-full rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-sm"
                      placeholder="Email"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-semibold text-apple-tertiary">Mã số thuế</label>
                    <input
                      type="text"
                      value={ag.agentTaxCode}
                      onChange={(e) => patchAgent(idx, { agentTaxCode: e.target.value })}
                      maxLength={24}
                      className="w-full rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-sm"
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
          className="w-full rounded-full border border-dashed border-violet-400/50 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100"
        >
          + Thêm Agent
        </button>
      </div>
    </section>
  );
}
