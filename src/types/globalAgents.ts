/** Một Agent dùng chung cho mọi khách (chọn khi booking / in phiếu cân). */
export type GlobalAgentEntry = {
  id: string;
  /** Nhãn trong dropdown (VD: Agent A, Không có agent). */
  label: string;
  agentName: string;
  agentAddress: string;
  agentPhone: string;
  agentEmail: string;
  agentTaxCode: string;
  /** Không in thông tin agent trên phiếu cân. */
  isNone?: boolean;
};

export type GlobalAgentCatalog = {
  agents: GlobalAgentEntry[];
  /** Agent mặc định khi chọn khách mới (thường là «Không có agent»). */
  defaultAgentId: string;
};
