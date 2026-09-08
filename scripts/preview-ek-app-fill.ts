/**
 * Fill CSD-EK via app fillCsdPdfBytes and write preview PDF + PNGs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fillCsdPdfBytes } from "../src/utils/csdForms.ts";

const outPdf = resolve("public/templates/csd/_preview-ek-app-fill.pdf");
const template = Uint8Array.from(
  readFileSync(resolve("public/templates/csd/CSD-EK.pdf"))
);

const bytes = await fillCsdPdfBytes(
  "EK",
  {
    awb: "176-2121 6812",
    goods: "FRESH FRUITS",
    dest: "MAD",
    origin: "SGN",
    transfer: "DXB",
    raCode: "VN/RA3/00009-01",
    routing: "SGN-DXB-MAD",
    companyBlock: "ACME IMPORTS LTD\nMadrid, Spain",
    pcs: "120",
    kg: "850",
    letterDate: "08-Sep-2026",
    issuedBy: "NGUYEN VAN A",
    issuedTitle: "STAFF",
    signCompany: "SAIGON CARGO SERVICE CORP.",
    issuedDateTime: "08-Sep-2026  15:30",
    additionalSecurity: "NO HAWB",
  },
  template
);

writeFileSync(outPdf, bytes);
console.log("wrote", outPdf, bytes.byteLength);
