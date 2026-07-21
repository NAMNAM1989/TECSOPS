import { describe, expect, it, beforeEach } from "vitest";
import {
  getActiveEsidRegistrant,
  loadEsidRegistrantStore,
  registrantIsComplete,
  switchOrCreateEsidRegistrant,
  updateActiveEsidRegistrant,
} from "./esidRegistrantProfile";
import { buildEsidDeclareFillPayload } from "./buildEsidDeclareFillPayload";
import type { Shipment } from "../types/shipment";

const KEY = "tecsops-esid-registrant-v1";

describe("esidRegistrantProfile", () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it("lưu và đọc hồ sơ active", () => {
    updateActiveEsidRegistrant({ name: "Nguyen Van A", tel: "0901", cccd: "001122334455" });
    const a = getActiveEsidRegistrant();
    expect(a.name).toBe("Nguyen Van A");
    expect(a.cccd).toBe("001122334455");
    expect(registrantIsComplete(a)).toBe(true);
  });

  it("đổi tên người khai tạo hồ sơ mới", () => {
    updateActiveEsidRegistrant({ name: "A", tel: "1", cccd: "111" });
    const b = switchOrCreateEsidRegistrant("Tran Thi B");
    expect(b.name).toBe("Tran Thi B");
    expect(b.cccd).toBe("");
    expect(loadEsidRegistrantStore().profiles.length).toBe(2);
    updateActiveEsidRegistrant({ tel: "2", cccd: "222" });
    expect(getActiveEsidRegistrant().cccd).toBe("222");
    // Quay lại A
    switchOrCreateEsidRegistrant("A");
    expect(getActiveEsidRegistrant().cccd).toBe("111");
  });
});

describe("buildEsidDeclareFillPayload", () => {
  it("map shipment + registrant", () => {
    const s = {
      id: "x1",
      stt: 1,
      sessionDate: "2026-07-20",
      awb: "73807183061",
      flight: "VN0773",
      flightDate: "21JUL",
      cutoff: "",
      cutoffNote: "",
      note: "",
      dest: "icn",
      warehouse: "TECS-TCS",
      pcs: 2,
      kg: 10,
      dimWeightKg: null,
      dimLines: null,
      dimDivisor: null,
      customer: "C",
      customerCode: "",
      shipperNamePrint: "SHIP A",
      shipperAddressPrint: "ADDR",
      consigneeNamePrint: "CNEE",
      consigneeAddressPrint: "SEOUL",
      goodsDescriptionPrint: "GARM",
    } as Shipment;
    const p = buildEsidDeclareFillPayload(
      s,
      { name: "NV A", tel: "0901", cccd: "001" },
      {
        name: "TECS AGENT",
        address: "HN",
        tel: "024",
        email: "a@x.com",
        vat: "010",
        fax: "",
      }
    );
    expect(p?.shipment.awb).toBe("73807183061");
    expect(p?.shipment.flight_date).toBe("2026-07-21");
    expect(p?.shipment.dest).toBe("ICN");
    expect(p?.registrant.name).toBe("NV A");
    expect(p?.shipment.agent_name).toBe("TECS AGENT");
    expect(p?.choose_flight).toBe(true);
    expect(p?.shipment.payment_mode).toMatch(/Chuyển khoản/i);
    expect(p?.shipment.total_hawbs).toBe(0);
    expect(p?.submit).toBe(false);
  });
});
