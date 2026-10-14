/**
 * Fill CSD-TH via app fillCsdPdfBytes — preview PDF + PNG.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fillCsdPdfBytes } from "../src/utils/csdForms.ts";

const outPdf = resolve("public/templates/csd/_preview-th-app-fill.pdf");
const template = Uint8Array.from(
  readFileSync(resolve("public/templates/csd/CSD-TH.pdf"))
);
const bold = Uint8Array.from(
  readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
);

const bytes = await fillCsdPdfBytes(
  "TH",
  {
    awb: "539-12345675",
    goods: "GARMENTS AND TEXTILES EXPORT",
    dest: "KUL",
    transfer: "KUL",
    raCode: "VN/RA3/00009-01",
    opsTeam: "SCSC",
    issuedOn: "20/09/2026  09:15",
  },
  template,
  { bold }
);
writeFileSync(outPdf, bytes);
console.log("wrote", outPdf);
