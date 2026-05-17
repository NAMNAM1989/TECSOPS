/** Đồng bộ với `src/utils/globalAgentsCore.ts` */
export const NONE_GLOBAL_AGENT_ID = "__none__";

const LIMITS = {
  label: 80,
  agentName: 120,
  agentAddress: 300,
  agentPhone: 40,
  agentEmail: 120,
  agentTaxCode: 40,
  agentCount: 12,
};

function clip(s, max) {
  return String(s ?? "").slice(0, max);
}

function defaultCatalog() {
  return {
    defaultAgentId: NONE_GLOBAL_AGENT_ID,
    agents: [
      {
        id: NONE_GLOBAL_AGENT_ID,
        label: "Không có agent",
        agentName: "",
        agentAddress: "",
        agentPhone: "",
        agentEmail: "",
        agentTaxCode: "",
        isNone: true,
      },
      {
        id: "agent-a",
        label: "Agent A",
        agentName: "AGENT A",
        agentAddress: "",
        agentPhone: "",
        agentEmail: "",
        agentTaxCode: "",
      },
      {
        id: "agent-b",
        label: "Agent B",
        agentName: "AGENT B",
        agentAddress: "",
        agentPhone: "",
        agentEmail: "",
        agentTaxCode: "",
      },
    ],
  };
}

export function normalizeGlobalAgentsLoose(raw) {
  const base = defaultCatalog();
  if (!raw || typeof raw !== "object") return base;
  const agentsRaw = Array.isArray(raw.agents) ? raw.agents : [];
  const agents = [];
  for (const x of agentsRaw) {
    if (!x || typeof x !== "object") continue;
    const isNone = Boolean(x.isNone);
    const id = clip(x.id, 80).trim() || (isNone ? NONE_GLOBAL_AGENT_ID : "");
    if (!id) continue;
    agents.push({
      id,
      label: clip(x.label, LIMITS.label).trim() || (isNone ? "Không có agent" : ""),
      agentName: isNone ? "" : clip(x.agentName, LIMITS.agentName).trim(),
      agentAddress: isNone ? "" : clip(x.agentAddress, LIMITS.agentAddress).trim(),
      agentPhone: isNone ? "" : clip(x.agentPhone, LIMITS.agentPhone).trim(),
      agentEmail: isNone ? "" : clip(x.agentEmail, LIMITS.agentEmail).trim(),
      agentTaxCode: isNone ? "" : clip(x.agentTaxCode, LIMITS.agentTaxCode).trim(),
      isNone: isNone || undefined,
    });
  }
  const withNone = agents.some((a) => a.id === NONE_GLOBAL_AGENT_ID || a.isNone)
    ? agents
    : [base.agents[0], ...agents];
  const list = withNone.slice(0, LIMITS.agentCount);
  const defaultAgentId = clip(raw.defaultAgentId, 80).trim();
  const resolvedDefault =
    list.find((a) => a.id === defaultAgentId)?.id ??
    list.find((a) => a.isNone)?.id ??
    list[0]?.id ??
    NONE_GLOBAL_AGENT_ID;
  return {
    agents: list.length ? list : base.agents,
    defaultAgentId: resolvedDefault,
  };
}
