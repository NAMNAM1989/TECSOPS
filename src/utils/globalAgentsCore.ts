import type { GlobalAgentCatalog, GlobalAgentEntry } from "../types/globalAgents";

export const NONE_GLOBAL_AGENT_ID = "__none__";

const LIMITS = {
  label: 80,
  agentName: 120,
  agentAddress: 300,
  agentPhone: 40,
  agentEmail: 120,
  agentTaxCode: 40,
  agentCount: 12,
} as const;

function clip(s: unknown, max: number): string {
  return String(s ?? "").slice(0, max);
}

function newAgentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyGlobalAgentEntry(partial?: Partial<GlobalAgentEntry>): GlobalAgentEntry {
  return clampGlobalAgentEntry({
    id: newAgentId(),
    label: "",
    agentName: "",
    agentAddress: "",
    agentPhone: "",
    agentEmail: "",
    agentTaxCode: "",
    ...partial,
  });
}

export function clampGlobalAgentEntry(a: GlobalAgentEntry): GlobalAgentEntry {
  const isNone = Boolean(a.isNone);
  return {
    id: clip(a.id, 80).trim() || newAgentId(),
    label: clip(a.label, LIMITS.label).trim() || (isNone ? "Không có agent" : ""),
    agentName: isNone ? "" : clip(a.agentName, LIMITS.agentName).trim(),
    agentAddress: isNone ? "" : clip(a.agentAddress, LIMITS.agentAddress).trim(),
    agentPhone: isNone ? "" : clip(a.agentPhone, LIMITS.agentPhone).trim(),
    agentEmail: isNone ? "" : clip(a.agentEmail, LIMITS.agentEmail).trim(),
    agentTaxCode: isNone ? "" : clip(a.agentTaxCode, LIMITS.agentTaxCode).trim(),
    isNone: isNone || undefined,
  };
}

const BUILTIN_DEFAULT_CATALOG: GlobalAgentCatalog = {
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

export function defaultGlobalAgentCatalog(): GlobalAgentCatalog {
  return clampGlobalAgentCatalog(BUILTIN_DEFAULT_CATALOG);
}

export function clampGlobalAgentCatalog(raw: unknown): GlobalAgentCatalog {
  const base = BUILTIN_DEFAULT_CATALOG;
  if (!raw || typeof raw !== "object") return { ...base, agents: [...base.agents] };
  const o = raw as Record<string, unknown>;
  const agentsRaw = Array.isArray(o.agents) ? o.agents : [];
  const agents = agentsRaw
    .filter((x): x is GlobalAgentEntry => Boolean(x) && typeof x === "object")
    .map((x) => clampGlobalAgentEntry(x as GlobalAgentEntry))
    .filter((x) => x.label || x.agentName || x.isNone)
    .slice(0, LIMITS.agentCount);
  const withNone = agents.some((a) => a.id === NONE_GLOBAL_AGENT_ID || a.isNone)
    ? agents
    : [base.agents[0], ...agents];
  const defaultAgentId = clip(o.defaultAgentId, 80).trim();
  const resolvedDefault =
    withNone.find((a) => a.id === defaultAgentId)?.id ??
    withNone.find((a) => a.isNone)?.id ??
    withNone[0]?.id ??
    NONE_GLOBAL_AGENT_ID;
  return { agents: withNone.length ? withNone : base.agents, defaultAgentId: resolvedDefault };
}

export function findGlobalAgentById(
  catalog: GlobalAgentCatalog,
  id: string | undefined
): GlobalAgentEntry | undefined {
  const key = id?.trim();
  if (!key) return undefined;
  return catalog.agents.find((a) => a.id.trim() === key);
}
