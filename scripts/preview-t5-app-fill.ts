/**
 * Fill CSD-T5 via app fillCsdPdfBytes — preview PDF + PNG.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fillCsdPdfBytes } from "../src/utils/csdForms.ts";

const outPdf = resolve("public/templates/csd/_preview-t5-app-fill.pdf");
const template = Uint8Array.from(
  readFileSync(resolve("public/templates/csd/CSD-T5.pdf"))
);
const bold = Uint8Array.from(
  readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
);

const bytes = await fillCsdPdfBytes(
  "T5",
  {
    awb: "496-12345675",
    goods: "GARMENTS AND TEXTILES",
    dest: "ASB",
    transfer: "ASB",
    raCode: "VN/RA3/00009-01",
    opsTeam: "SCSC",
    issuedOn: "090926  2215",
  },
  template,
  { bold }
);
writeFileSync(outPdf, bytes);
console.log("wrote", outPdf);
