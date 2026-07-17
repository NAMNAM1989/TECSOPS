/**
 * Khởi động sidecar TCS AWB agent (localhost:8765) cho kho TECS-TCS.
 * Mặc định mock + dry-run — an toàn, không cần login cổng TCS.
 *
 * Usage:
 *   npm run tcs:agent
 *   npm run tcs:agent -- --real   # tắt mock (vẫn cần discovery trước)
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentDir = path.join(root, "tcs-awb-automation");
const venvPy = path.join(agentDir, ".venv", "Scripts", "python.exe");
const py = fs.existsSync(venvPy) ? venvPy : "python";

const wantReal = process.argv.includes("--real");
const args = ["-m", "app.main", "agent"];
if (wantReal) args.push("--real");
else args.push("--mock", "--dry-run");

const env = {
  ...process.env,
  TCS_MOCK: wantReal ? "0" : "1",
  TCS_DRY_RUN: wantReal ? process.env.TCS_DRY_RUN || "1" : "1",
  PYTHONIOENCODING: "utf-8",
  PYTHONUNBUFFERED: "1",
};

console.log(`[tcs:agent] ${py} ${args.join(" ")}`);
console.log(`[tcs:agent] cwd=${agentDir} mock=${env.TCS_MOCK} dry_run=${env.TCS_DRY_RUN}`);
console.log("[tcs:agent] Ops → http://127.0.0.1:8765 — giữ cửa sổ này mở.");
if (wantReal) {
  console.log("[tcs:agent] REAL: sau khi agent lên, POST /session/open (hoặc Ops nút Mở Chrome), đăng nhập tay, rồi tắt Mock.");
}

// shell:false — tránh cmd bọc đôi / nhiều python agent tranh cổng 8765 trên Windows
const child = spawn(py, args, {
  cwd: agentDir,
  env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 1));
