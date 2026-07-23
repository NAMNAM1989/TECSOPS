import { describe, expect, it, beforeEach } from "vitest";
import {
  buildThermalPrintDocumentHtml,
  buildThermalPrintOverrides,
  buildRepeatedLabelPagesHtml,
  resolveThermalLabelPrintHost,
  stripAtPageRules,
  thermalPageMm,
} from "./printThermalLabelIframe";

describe("thermal print document", () => {
  it("khóa một tem đúng một trang và không tạo page break sau trang cuối", () => {
    const css = buildThermalPrintOverrides("100x80", "xp470b", false, true);

    expect(css).toContain("size: 100mm 80mm");
    expect(css).toContain("margin: 0 !important");
    expect(css).toContain("height: 80mm !important");
    expect(css).toContain("max-height: 80mm !important");
    expect(css).toContain("overflow: hidden !important");
    expect(css).toContain(".print-label-page:not(:last-child)");
    expect(css).toMatch(/\.print-label-page:last-child\s*\{[\s\S]*?break-after: auto !important/);
    const pageRule = css.match(/\.print-label-page \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(pageRule).not.toContain("page-break-after: always");
  });

  it("tạo tài liệu in tối giản, không đưa tiêu đề tem vào browser header", () => {
    const html = buildThermalPrintDocumentHtml({
      format: "100x50",
      mode: "xp470b",
      flipCcw: false,
      inner: '<div class="print-label-page">LABEL</div>',
      singlePage: true,
    });

    expect(html).toContain("<title>&#8203;</title>");
    expect(html).not.toContain("<title>Tem ");
    expect(html).toContain('data-label-page-mm="100x50"');
    expect(html).toContain("size: 100mm 50mm");
  });

  it("cho phép nhiều trang nhưng chỉ ngắt giữa các tem", () => {
    const css = buildThermalPrintOverrides("100x50", "xp470b", false, false);

    expect(css).toContain("height: auto !important");
    expect(css).toContain(".print-label-page:not(:last-child)");
    expect(css).toContain("page-break-before: auto !important");
  });
});

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

describe("buildRepeatedLabelPagesHtml", () => {
  it("nhân bản 1 trang mẫu N lần", () => {
    const host = document.createElement("div");
    host.className = "print-label-host";
    host.innerHTML =
      '<div class="print-label-page"><div class="print-label-spin"><div class="label print-label-sheet lbl-sheet">A</div></div></div>';
    const html = buildRepeatedLabelPagesHtml(host, 3);
    expect(html.split("print-label-page").length - 1).toBe(3);
    expect(html).toContain("lbl-sheet");
  });

  it("copies=1 chỉ 1 trang", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<div class="print-label-page"><div class="lbl-sheet">x</div></div>';
    const html = buildRepeatedLabelPagesHtml(host, 1);
    expect(html.split("print-label-page").length - 1).toBe(1);
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

describe("thermalPageMm — XP-470B vs cuộn hẹp", () => {
  it("xp470b 100x80 = trang đúng khổ tem (SIZE 100×80)", () => {
    expect(thermalPageMm("100x80", "xp470b")).toMatchObject({
      w: "100mm",
      h: "80mm",
      labelH: 80,
      wMm: 100,
      hMm: 80,
    });
  });

  it("xp470b 100x50 = trang đúng khổ tem", () => {
    expect(thermalPageMm("100x50", "xp470b")).toMatchObject({
      w: "100mm",
      h: "50mm",
      labelH: 50,
      wMm: 100,
      hMm: 50,
    });
  });

  it("narrow80 100x80 = trang 80×100 (xoay)", () => {
    expect(thermalPageMm("100x80", "narrow80")).toMatchObject({
      w: "80mm",
      h: "100mm",
      labelH: 80,
      wMm: 80,
      hMm: 100,
    });
  });

  it("narrow80 100x50 = trang 50×100 (xoay)", () => {
    expect(thermalPageMm("100x50", "narrow80")).toMatchObject({
      w: "50mm",
      h: "100mm",
      labelH: 50,
      wMm: 50,
      hMm: 100,
    });
  });
});
