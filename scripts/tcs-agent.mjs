/**
 * Khởi động sidecar TCS AWB agent (localhost:8765) cho kho TECS-TCS.
 *
 * Usage:
 *   npm run tcs:agent          # mock (an toàn)
 *   npm run tcs:agent:real     # thật — cần login TCS
 *
 * `npm run dev` cũng tự start agent real (trừ khi TCS_AGENT_AUTO=0).
 */
import { spawnTcsAgent } from "./spawnTcsAgent.mjs";

const wantReal = process.argv.includes("--real");
const child = spawnTcsAgent({ real: wantReal, stdio: "inherit" });

console.info(
  wantReal
    ? "[tcs:agent] REAL — Ops proxy /tcs-agent → :8765. Login: nút Login trên Ops hoặc POST /session/open."
    : "[tcs:agent] MOCK — không cần login TCS."
);

child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  console.error(`[tcs:agent] Không spawn được Python: ${err?.message || err}`);
  console.error("  Cài: cd tcs-awb-automation && python -m venv .venv && pip install -r requirements.txt");
  process.exit(1);
});
