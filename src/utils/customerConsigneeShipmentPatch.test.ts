import { describe, expect, it } from "vitest";
import { buildShipmentPatchForSavedConsignee } from "./customerConsigneeShipmentPatch";

describe("buildShipmentPatchForSavedConsignee", () => {
  it("gán snapshot in khi chọn CNEE", () => {
    const patch = buildShipmentPatchForSavedConsignee({
      id: "cn1",
      label: "SYD",
      consigneeName: "ACME PTY",
      consigneeAddress: "1 MAIN ST",
      consigneePhone: "0399",
      consigneeEmail: "a@b.com",
      notifyName: "NOTIFY CO",
    });
    expect(patch.customerConsigneeId).toBe("cn1");
    expect(patch.consigneeNamePrint).toBe("ACME PTY");
    expect(patch.consigneePhonePrint).toBe("0399");
  });

  it("xóa khi bỏ chọn", () => {
    expect(buildShipmentPatchForSavedConsignee(undefined).customerConsigneeId).toBe("");
    expect(buildShipmentPatchForSavedConsignee(undefined).consigneeNamePrint).toBe("");
  });
});
