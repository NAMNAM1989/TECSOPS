import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildOcrAgentCandidates,
  extensionOcrBaseUrl,
  localAgentPortForWarehouse,
} from "./tcsOcrAgentEndpoints";

describe("tcsOcrAgentEndpoints", () => {
  it("port đúng kho", () => {
    expect(localAgentPortForWarehouse("TCS")).toBe(8766);
    expect(localAgentPortForWarehouse("TECS-TCS")).toBe(8765);
  });

  it("OCR kho TCS ưu tiên :8766 trước :8765", () => {
    const list = buildOcrAgentCandidates("TCS");
    expect(list[0]).toBe("http://127.0.0.1:8766");
    expect(list).toContain("http://127.0.0.1:8765");
    expect(list.indexOf("http://127.0.0.1:8766")).toBeLessThan(
      list.indexOf("http://127.0.0.1:8765")
    );
  });

  it("OCR kho TECS-TCS ưu tiên :8765 trước :8766", () => {
    const list = buildOcrAgentCandidates("TECS-TCS");
    expect(list[0]).toBe("http://127.0.0.1:8765");
    expect(list.indexOf("http://127.0.0.1:8765")).toBeLessThan(
      list.indexOf("http://127.0.0.1:8766")
    );
  });

  it("URL Ops truyền vào đứng đầu danh sách", () => {
    const list = buildOcrAgentCandidates(
      "TCS",
      "http://localhost:5173/tcs-agent"
    );
    expect(list[0]).toBe("http://localhost:5173/tcs-agent");
    expect(list).toContain("http://127.0.0.1:8766");
  });

  it("extensionOcrBaseUrl loopback đúng kho", () => {
    expect(extensionOcrBaseUrl("TCS")).toBe("http://127.0.0.1:8766");
    expect(extensionOcrBaseUrl("TECS-TCS")).toBe("http://127.0.0.1:8765");
  });
});

describe("background Ext — buildOcrAgentCandidates đồng bộ", () => {
  const files = [
    ["chrome-extension/background.js", "TECS-TCS", 8765],
    ["chrome-extension-tcs/background.js", "TCS", 8766],
  ] as const;

  it.each(files)("%s ưu tiên port %s", (file, warehouse, port) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("function buildOcrAgentCandidates");
    expect(source).toContain("X-Portal-Warehouse");
    expect(source).toContain(`PORTAL_WAREHOUSE === "TCS" ? 8766 : 8765`);
    const from = source.indexOf("function localAgentPortForWarehouse");
    const to = source.indexOf("async function solveCaptcha");
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const block = source.slice(from, to);
    const fn = new Function(
      "PORTAL_WAREHOUSE",
      `${block}; return buildOcrAgentCandidates;`
    )(warehouse) as (url?: string) => string[];
    const list = fn("");
    expect(list[0]).toBe(`http://127.0.0.1:${port}`);
  });
});
