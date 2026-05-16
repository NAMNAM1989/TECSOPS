import { describe, expect, it, beforeEach } from "vitest";
import { resolveThermalLabelPrintHost } from "./printThermalLabelIframe";

describe("resolveThermalLabelPrintHost", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("ưu tiên host truyền vào khi có lbl-sheet", () => {
    const good = document.createElement("div");
    good.className = "print-label-host";
    good.innerHTML = '<div class="label print-label-sheet lbl-sheet">ok</div>';
    const empty = document.createElement("div");
    empty.className = "print-label-host";
    empty.setAttribute("data-print-job", "1");
    document.body.append(empty, good);
    expect(resolveThermalLabelPrintHost(good)).toBe(good);
  });

  it("bỏ qua host rỗng đầu tiên, lấy host có lbl-sheet", () => {
    const empty = document.createElement("div");
    empty.className = "print-label-host";
    empty.setAttribute("data-print-job", "1");
    const good = document.createElement("div");
    good.className = "print-label-host";
    good.innerHTML = '<div class="label print-label-sheet lbl-sheet">x</div>';
    document.body.append(empty, good);
    expect(resolveThermalLabelPrintHost(null)).toBe(good);
  });
});
