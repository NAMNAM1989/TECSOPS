/**
 * Test in CSD mẫu cho AWB prefix 807 — chạy: node scripts/test-csd-807.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pdf } from "pdf-to-img";
import { buildCsdValuesFromShipment } from "../server/print/csdFormValues.mjs";
import { generateCsdPdfBuffer, resolveCsdRenderMode } from "../server/print/csdPdfService.mjs";
import { isAirlineTemplateReady, loadCsdTemplateBundle } from "../server/print/csdTemplateLoader.mjs";
import { listCsdTemplateCatalog, resolveCsdTemplateForAwb } from "../server/print/csdTemplateRegistry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "print-templates", "csd", "airlines", "807", "_test-run");

const SAMPLE = {
  id: "test-807",
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
};

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log("  ✓", msg);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("\n=== Test CSD prefix 807 (AIR ASIA) — vector mode ===\n");

console.log("1. Slot template");
ok(isAirlineTemplateReady("807"), "807 ready (renderMode vector)");
const slot807 = listCsdTemplateCatalog().airlines.find((a) => a.awbPrefix === "807");
ok(slot807?.status === "ready", `catalog status = ready (${slot807?.status})`);
ok(slot807?.renderMode === "vector", `renderMode = vector (${slot807?.renderMode})`);

console.log("\n2. Resolve AWB");
const resolved = resolveCsdTemplateForAwb(SAMPLE.awb);
ok(resolved.awbPrefix === "807", `prefix = 807`);
ok(resolved.useCustomTemplate === true, "dùng mẫu hãng (không fallback _default)");
ok(resolved.airlineName === "AIR ASIA", `hãng = ${resolved.airlineName}`);
ok(resolved.status === "ready", `status = ready`);
ok(resolved.renderMode === "vector", `renderMode = vector`);
ok(resolved.templateDir.includes("807"), `templateDir = ${resolved.templateDir}`);

const fieldKeys = resolved.bundle.fields.map((f) => f.field_key);
ok(fieldKeys.includes("raCategoryIdentifier"), "có field RA (vector in đầy đủ)");
ok(fieldKeys.includes("securityStatus"), "có field security status");
ok(fieldKeys.includes("screeningMethod"), "có field screening method");
ok(fieldKeys.includes("uniqueConsignmentId"), "có field AWB");
ok(!fieldKeys.some((f) => resolved.bundle.fields.find((x) => x.field_key === f)?.wipe), "không wipe overlay");

console.log("\n3. So sánh fallback mặc định");
const fallback = resolveCsdTemplateForAwb(SAMPLE.awb, { forceDefault: true });
ok(fallback.useCustomTemplate === false, "forceDefault → mẫu IATA _default");
ok(fallback.templateDir === "_default", "templateDir = _default");
ok(fallback.renderMode === "vector", "default cũng vector");

console.log("\n4. Sinh PDF");
const values = buildCsdValuesFromShipment(SAMPLE);
ok(values.uniqueConsignmentId === SAMPLE.awb, `AWB trong values = ${values.uniqueConsignmentId}`);
ok(values.destination === "KUL", `dest = KUL`);
ok(values.origin === "SGN", `origin = SGN`);

const bundle = loadCsdTemplateBundle(resolved.templateDir);
ok(resolveCsdRenderMode(bundle) === "vector", "bundle renderMode vector");
const pdfBuf = await generateCsdPdfBuffer({ values, bundle });
ok(pdfBuf.length > 30_000, `PDF ${Math.round(pdfBuf.length / 1024)} KB`);

const pdfPath = path.join(OUT_DIR, "CSD_807_sample.pdf");
fs.writeFileSync(pdfPath, pdfBuf);
console.log("  →", pdfPath);

console.log("\n5. Render preview PNG");
const doc = await pdf(pdfPath, { scale: 2 });
for await (const img of doc) {
  const pngPath = path.join(OUT_DIR, "CSD_807_sample_preview.png");
  fs.writeFileSync(pngPath, img);
  console.log("  →", pngPath, `(${Math.round(img.length / 1024)} KB)`);
  break;
}

console.log("\n=== Tất cả kiểm tra PASS ===\n");
