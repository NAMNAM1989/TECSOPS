/**
 * Kiểm tra nhanh API in + asset template (chạy khi dev server đang bật).
 * node scripts/test-print-local.mjs
 */
const vitePorts = [5173, 5174, 5175];
const apiPort = Number(process.env.API_PORT ?? 3001);

async function findVite() {
  if (process.env.VITE_URL) return process.env.VITE_URL;
  for (const port of vitePorts) {
    const base = `http://localhost:${port}`;
    try {
      const res = await fetch(`${base}/`);
      if (res.ok) return base;
    } catch {
      /* next */
    }
  }
  return null;
}

const vite = await findVite();
const api = process.env.API_URL ?? `http://localhost:${apiPort}`;

if (!vite) {
  console.error("FAIL: Không thấy Vite (5173–5175). Chạy: npm run dev");
  process.exit(1);
}

console.log(`Vite: ${vite}`);
console.log(`API:  ${api}`);

async function check(url, label) {
  const res = await fetch(url);
  const ok = res.ok;
  console.log(`${ok ? "OK" : "FAIL"} ${label}: ${res.status} ${url}`);
  return ok;
}

async function checkTsplBuild() {
  const body = {
    awb: "999-99999999",
    airline: "TEST",
    route: "SGN-HAN",
    pieces: 1,
    weightKg: 1,
    widthMm: 100,
    heightMm: 80,
    gapMm: 2,
    dpi: 203,
    offsetXmm: 0,
    offsetYmm: 0,
    rotateDeg: 90,
  };
  const res = await fetch(`${api}/api/tspl/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const ok = res.ok && text.includes("SIZE");
  console.log(`${ok ? "OK" : "FAIL"} TSPL build: ${res.status} (${text.length} bytes)`);
  return ok;
}

let failed = 0;
for (const fn of [
  () => check(`${vite}/`, "Vite app"),
  () => check(`${vite}/print-templates/scsc-weigh-template.png`, "SCSC template PNG"),
  () => check(`${vite}/print-templates/scsc-weigh-template.pdf`, "SCSC template PDF"),
  () => checkTsplBuild(),
]) {
  if (!(await fn())) failed += 1;
}
process.exit(failed > 0 ? 1 : 0);
