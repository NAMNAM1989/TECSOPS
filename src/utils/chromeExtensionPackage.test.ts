import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

type ExtPack = {
  dir: string;
  warehouse: "TECS-TCS" | "TCS";
  requiredFiles: string[];
  version: string;
  scriptVersion: string;
  mustHaveDownloadPdf: boolean;
};

const PACKS: ExtPack[] = [
  {
    dir: "chrome-extension",
    warehouse: "TECS-TCS",
    version: "2.6.1",
    scriptVersion: "2.0.26",
    mustHaveDownloadPdf: true,
    requiredFiles: [
      "manifest.json",
      "background.js",
      "content-ops.js",
      "content-tcs.js",
      "popup.html",
      "popup.js",
      "locators.json",
      "print-frame.html",
    ],
  },
  {
    dir: "chrome-extension-tcs",
    warehouse: "TCS",
    version: "1.5.2",
    scriptVersion: "2.0.29",
    mustHaveDownloadPdf: true,
    requiredFiles: [
      "manifest.json",
      "background.js",
      "content-ops.js",
      "content-tcs.js",
      "popup.html",
      "popup.js",
      "locators.json",
      "print-frame.html",
    ],
  },
];

describe("chrome extension packaging invariants", () => {
  it.each(PACKS)("$dir có đủ file + version $version", (pack) => {
    const dir = path.join(ROOT, pack.dir);
    for (const file of pack.requiredFiles) {
      expect(existsSync(path.join(dir, file)), `${pack.dir}/${file}`).toBe(
        true
      );
    }
    const manifest = JSON.parse(
      readFileSync(path.join(dir, "manifest.json"), "utf8")
    ) as {
      version: string;
      permissions: string[];
      host_permissions: string[];
    };
    expect(manifest.version).toBe(pack.version);
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(["cookies", "downloads", "debugger"])
    );
    expect(manifest.host_permissions).toEqual(
      expect.arrayContaining([
        "http://127.0.0.1:8765/*",
        "http://127.0.0.1:8766/*",
      ])
    );
  });

  it.each(PACKS)("$dir hỗ trợ DOWNLOAD_ESID_PDF + OCR dual-port", (pack) => {
    const bg = readFileSync(
      path.join(ROOT, pack.dir, "background.js"),
      "utf8"
    );
    const content = readFileSync(
      path.join(ROOT, pack.dir, "content-tcs.js"),
      "utf8"
    );
    expect(bg).toContain('msg.type === "DOWNLOAD_ESID_PDF"');
    expect(bg).toContain("buildOcrAgentCandidates");
    expect(bg).toContain(`PORTAL_WAREHOUSE = "${pack.warehouse}"`);
    expect(content).toContain('msg.type === "DOWNLOAD_ESID_PDF"');
    expect(content).toContain("runDownloadPdf");
    expect(content).toContain(`SCRIPT_VERSION = "${pack.scriptVersion}"`);
  });

  it("package script gồm print-frame cho cả 2 Ext ESID", () => {
    const script = readFileSync(
      path.join(ROOT, "scripts/package-chrome-extension.mjs"),
      "utf8"
    );
    const matches = script.match(/print-frame\.html/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("content-ops chuẩn: EXT_READY + portalWarehouse đúng kho", () => {
    const tcsOps = readFileSync(
      path.join(ROOT, "chrome-extension-tcs/content-ops.js"),
      "utf8"
    );
    const scscOps = readFileSync(
      path.join(ROOT, "chrome-extension-scsc/content-ops.js"),
      "utf8"
    );
    const legacyOps = readFileSync(
      path.join(ROOT, "chrome-extension/content-ops.js"),
      "utf8"
    );
    expect(tcsOps).toContain('type: "EXT_READY"');
    expect(tcsOps).toContain('PORTAL_WAREHOUSE = "TCS"');
    expect(scscOps).toContain('PORTAL_WAREHOUSE = "SCSC"');
    expect(scscOps).not.toContain('portalWarehouse: "TCS"');
    expect(legacyOps).toMatch(/DEPRECATED|deprecated/i);
    expect(legacyOps).toContain('PORTAL_WAREHOUSE = "TECS-TCS"');
  });
});
