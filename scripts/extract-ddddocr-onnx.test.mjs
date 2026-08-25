import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/extract-ddddocr-onnx.py");

function pythonBin() {
  for (const bin of ["python3", "python"]) {
    try {
      execFileSync(bin, ["-c", "import zipfile"], { stdio: "pipe" });
      return bin;
    } catch {
      /* try next */
    }
  }
  return null;
}

describe("extract-ddddocr-onnx.py", () => {
  const bin = pythonBin();

  it.skipIf(!bin)("extract common.onnx từ wheel giả", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tecsops-whl-"));
    const wheelDir = path.join(dir, "wheels");
    mkdirSync(wheelDir);
    const maker = `
import zipfile, pathlib
p = pathlib.Path(r"${wheelDir.replaceAll("\\", "/")}") / "ddddocr-1.5.6-py3-none-any.whl"
with zipfile.ZipFile(p, "w") as z:
    z.writestr("ddddocr/common.onnx", bytes([9]) * 1000123)
`;
    execFileSync(bin, ["-c", maker]);
    const dest = path.join(dir, "common.onnx");
    const out = execFileSync(bin, [SCRIPT, wheelDir, dest], { encoding: "utf8" });
    expect(out).toMatch(/ok ddddocr-1\.5\.6/);
    expect(readFileSync(dest).length).toBe(1_000_123);
    rmSync(dir, { recursive: true, force: true });
  });

  it("script tồn tại và không import ddddocr/playwright", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toContain("common.onnx");
    expect(src).toContain("zipfile");
    expect(src).not.toMatch(/^import ddddocr/m);
    expect(src).not.toContain("playwright install");
  });
});
