import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

type ExtPack = {
  dir: string;
  warehouse: "TCS";
  requiredFiles: string[];
  version: string;
  scriptVersion: string;
  mustHaveDownloadPdf: boolean;
};

const PACKS: ExtPack[] = [
  {
    dir: "chrome-extension-tcs",
    warehouse: "TCS",
    version: "1.5.3",
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
    expect(manifest.host_permissions.join("\n")).not.toMatch(/8765|8766/);
    expect(manifest.host_permissions).toEqual(
      expect.arrayContaining([
        "https://www.tcs.com.vn/*",
        "https://*.up.railway.app/*",
      ])
    );
  });

  it.each(PACKS)("$dir hỗ trợ DOWNLOAD_ESID_PDF + OCR trong Ext", (pack) => {
    const bg = readFileSync(
      path.join(ROOT, pack.dir, "background.js"),
      "utf8"
    );
    const content = readFileSync(
      path.join(ROOT, pack.dir, "content-tcs.js"),
      "utf8"
    );
    expect(bg).toContain('msg.type === "DOWNLOAD_ESID_PDF"');
    expect(bg).toContain("solveCaptchaInExtension");
    expect(bg).not.toContain("buildOcrAgentCandidates");
    expect(bg).not.toMatch(/127\.0\.0\.1:876[56]/);
    expect(bg).toContain(`PORTAL_WAREHOUSE = "${pack.warehouse}"`);
    expect(content).toContain('msg.type === "DOWNLOAD_ESID_PDF"');
    expect(content).toContain("runDownloadPdf");
    expect(content).toContain(`SCRIPT_VERSION = "${pack.scriptVersion}"`);
  });

  it("package script chỉ đóng gói Ext TCS + SCSC", () => {
    const script = readFileSync(
      path.join(ROOT, "scripts/package-chrome-extension.mjs"),
      "utf8"
    );
    expect(script).toContain('dirName: "chrome-extension-tcs"');
    expect(script).toContain('dirName: "chrome-extension-scsc"');
    expect(script).not.toContain('dirName: "chrome-extension"');
    expect(script).not.toContain("extension:package:tecs-tcs");
    const matches = script.match(/print-frame\.html/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
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
    expect(tcsOps).toContain('type: "EXT_READY"');
    expect(tcsOps).toContain('PORTAL_WAREHOUSE = "TCS"');
    expect(scscOps).toContain('PORTAL_WAREHOUSE = "SCSC"');
    expect(scscOps).toContain("ECARGO_OTP_PROVIDE");
    expect(scscOps).not.toContain('portalWarehouse: "TCS"');
    expect(existsSync(path.join(ROOT, "chrome-extension"))).toBe(false);
    const scscManifest = JSON.parse(
      readFileSync(path.join(ROOT, "chrome-extension-scsc/manifest.json"), "utf8")
    ) as { version: string; host_permissions: string[] };
    expect(scscManifest.version).toBe("1.0.3");
    expect(scscManifest.host_permissions.join("\n")).not.toMatch(/8765|8766/);
  });

  it("SCSC background có ECARGO_OTP_PROVIDE (hook Gmail mapping PC)", () => {
    const bg = readFileSync(
      path.join(ROOT, "chrome-extension-scsc/background.js"),
      "utf8"
    );
    expect(bg).toContain('msg.type === "ECARGO_OTP_PROVIDE"');
    expect(bg).toContain("ecargoOtpProvide");
  });
});
