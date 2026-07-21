import { describe, expect, it, beforeEach } from "vitest";
import {
  agentIsComplete,
  getActiveEsidAgent,
  loadEsidAgentStore,
  switchOrCreateEsidAgent,
  updateActiveEsidAgent,
} from "./esidAgentProfile";

const KEY = "tecsops-esid-agent-v1";

describe("esidAgentProfile", () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it("lưu và đọc Agent active", () => {
    updateActiveEsidAgent({
      name: "TECS LOGISTICS",
      address: "No.1",
      tel: "024123",
      email: "ops@tecs.vn",
      vat: "0100123456",
    });
    const a = getActiveEsidAgent();
    expect(a.name).toBe("TECS LOGISTICS");
    expect(a.vat).toBe("0100123456");
    expect(agentIsComplete(a)).toBe(true);
  });

  it("đổi tên Agent tạo hồ sơ mới", () => {
    updateActiveEsidAgent({ name: "A Co", tel: "1", address: "x" });
    const b = switchOrCreateEsidAgent("B Co");
    expect(b.name).toBe("B Co");
    expect(b.tel).toBe("");
    expect(loadEsidAgentStore().profiles.length).toBe(2);
    updateActiveEsidAgent({ tel: "2", address: "y" });
    expect(getActiveEsidAgent().tel).toBe("2");
    switchOrCreateEsidAgent("A Co");
    expect(getActiveEsidAgent().tel).toBe("1");
  });
});
