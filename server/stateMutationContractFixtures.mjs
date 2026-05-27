/** Fixture dùng chung cho contract test client/server mutation. */

export function baseContractRow(id = "c-1") {
  return {
    id,
    stt: 1,
    sessionDate: "2026-05-28",
    awb: "618-54405131",
    flight: "SQ185",
    flightDate: "28MAY",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "SIN",
    warehouse: "TECS-SCSC",
    pcs: 20,
    kg: 100,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "ACME",
    customerCode: "ACME",
    customerId: "cust-1",
    globalAgentId: "",
    customerGoodsId: "",
    customerShipperId: "",
    customerConsigneeId: "",
    status: "PENDING",
  };
}

export function baseContractState() {
  return {
    version: 10,
    rows: [baseContractRow()],
    customers: [
      {
        id: "cust-1",
        code: "ACME",
        name: "ACME Logistics",
        savedShippers: [],
        savedConsignees: [],
        savedGoods: [],
        savedVehicles: [],
        parties: [],
      },
    ],
    globalAgents: { agents: [], defaultAgentId: "" },
    airlineLabelOverrides: { byAwbPrefix: {}, byFlightPrefix: {} },
    printerProfiles: { profiles: [], activeProfileId: "" },
    scscWeighPrintSettings: {
      senders: {
        "TECS-SCSC": { name: "", address: "", phone: "" },
        "KHO-SCSC": { name: "", address: "", phone: "" },
      },
      defaultWarehouse: "TECS-SCSC",
    },
    ecargoKhoScsc: {},
    invoiceCatalog: { version: 1, items: [] },
  };
}

/** Bỏ trường thay đổi theo thời gian — so sánh contract ổn định. */
export function normalizeStateForContract(state) {
  const ecargo = {};
  for (const [id, line] of Object.entries(state.ecargoKhoScsc ?? {})) {
    const { updatedAt: _u, ...rest } = line;
    ecargo[id] = rest;
  }
  const printerProfiles = state.printerProfiles
    ? (() => {
        const { updatedAt: _t, ...rest } = state.printerProfiles;
        return rest;
      })()
    : state.printerProfiles;
  return {
    version: state.version,
    rows: state.rows.map((r) => ({ ...r })),
    customers: state.customers,
    globalAgents: state.globalAgents,
    airlineLabelOverrides: state.airlineLabelOverrides,
    printerProfiles,
    scscWeighPrintSettings: state.scscWeighPrintSettings,
    ecargoKhoScsc: ecargo,
    invoiceCatalog: state.invoiceCatalog ?? { version: 1, items: [] },
  };
}
