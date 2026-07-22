import { describe, expect, it, beforeEach } from "vitest";
import {
  extractSingleLabelPageHtml,
  resolveThermalLabelPrintHost,
  stripAtPageRules,
  thermalPageMm,
} from "./printThermalLabelIframe";

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

describe("extractSingleLabelPageHtml", () => {
  it("lấy đúng 1 trang tem", () => {
    const host = document.createElement("div");
    host.className = "print-label-host";
    host.innerHTML =
      '<div class="print-label-page"><div class="print-label-spin"><div class="label print-label-sheet lbl-sheet">A</div></div></div>';
    const html = extractSingleLabelPageHtml(host);
    expect(html.split("print-label-page").length - 1).toBe(1);
    expect(html).toContain("lbl-sheet");
  });

  it("bọc lbl-sheet thành 1 trang nếu thiếu print-label-page", () => {
    const host = document.createElement("div");
    host.innerHTML = '<div class="label print-label-sheet lbl-sheet">x</div>';
    const html = extractSingleLabelPageHtml(host);
    expect(html).toContain("print-label-page");
    expect(html).toContain("lbl-sheet");
  });
});

describe("stripAtPageRules", () => {
  it("gỡ @page cứng để tránh PDF lệch khổ", () => {
    const css = "@media print { @page { size: 100mm 80mm; margin: 0; } } .x{color:red}";
    const out = stripAtPageRules(css);
    expect(out).not.toMatch(/size:\s*100mm/);
    expect(out).toContain(".x{color:red}");
  });
});

describe("thermalPageMm — XP-470B (trang = tem, không xoay)", () => {
  it("100x80 = trang đúng khổ tem (SIZE 100×80)", () => {
    expect(thermalPageMm("100x80")).toMatchObject({
      w: "100mm",
      h: "80mm",
      labelH: 80,
      wMm: 100,
      hMm: 80,
    });
  });

  it("100x50 = trang đúng khổ tem", () => {
    expect(thermalPageMm("100x50")).toMatchObject({
      w: "100mm",
      h: "50mm",
      labelH: 50,
      wMm: 100,
      hMm: 50,
    });
  });
});
