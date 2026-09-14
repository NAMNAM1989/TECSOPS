/**
 * Fill CSD-MF via app fillCsdPdfBytes — preview PDF + PNG.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fillCsdPdfBytes } from "../src/utils/csdForms.ts";

const outPdf = resolve("public/templates/csd/_preview-mf-app-fill.pdf");
const template = Uint8Array.from(
  readFileSync(resolve("public/templates/csd/CSD-MF.pdf"))
);
const bold = Uint8Array.from(
  readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
);

const bytes = await fillCsdPdfBytes(
  "MF",
  {
    awb: "731-9899 6634",
    goods: "GARMENTS AND TEXTILES EXPORT",
    dest: "YVR",
    transfer: "XMN",
    raCode: "VN/RA3/00013-01",
    opsTeam: "TECS",
    issuedOn: "14/09/2026  08:15",
  },
  template,
  { bold }
);
writeFileSync(outPdf, bytes);
console.log("wrote", outPdf);
