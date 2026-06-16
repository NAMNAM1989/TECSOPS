/** Smoke test HTTP CSD routes (khởi tạo app tạm, không cần dev server). */
import express from "express";
import http from "node:http";
import { registerCsdPrintRoutes } from "../server/print/csdPrintRoutes.mjs";

const app = express();
app.use(express.json({ limit: "2mb" }));
registerCsdPrintRoutes(app);

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const base = `http://127.0.0.1:${port}`;

async function get(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  return { status: res.status, json: res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text };
}

async function postPdf(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, bytes: buf.length, ct: res.headers.get("content-type") };
}

console.log("\n=== API smoke (port", port, ") ===\n");

const catalog = await get("/api/print/csd/catalog");
console.log("GET /catalog →", catalog.status, catalog.json.summary);

const resolve = await get("/api/print/csd/resolve?awb=807-3783%205770");
console.log("GET /resolve →", resolve.status, resolve.json.templateStatus, resolve.json.useCustomTemplate);

const pdf = await postPdf("/api/print/pdf/csd", {
  shipment: {
    awb: "807-3783 5770",
    dest: "KUL",
    sessionDate: "2026-06-13",
    warehouse: "TECS-TCS",
    flight: "AK1493",
    flightDate: "13JUN",
    pcs: 27,
    kg: 254,
    customer: "SHOPEE",
    note: "E-commerce general cargo",
  },
});
console.log("POST /pdf/csd →", pdf.status, pdf.ct, `${Math.round(pdf.bytes / 1024)} KB`);

server.close();

if (catalog.status !== 200 || resolve.status !== 200 || pdf.status !== 200) process.exit(1);
if (!resolve.json.useCustomTemplate) process.exit(1);
if (pdf.bytes < 50_000) process.exit(1);
console.log("\nAPI smoke PASS\n");
