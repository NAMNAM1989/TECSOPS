import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fillCsdPdfBytes } from "../src/utils/csdForms.ts";

const outPdf = resolve("public/templates/csd/_preview-pr-app-fill.pdf");
const template = Uint8Array.from(
  readFileSync(resolve("public/templates/csd/CSD-PR.pdf"))
);
const bold = Uint8Array.from(
  readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
);

const bytes = await fillCsdPdfBytes(
  "PR",
  {
    awb: "079-1234 5675",
    goods: "GARMENTS AND TEXTILES FOR EXPORT SHIPMENT",
    dest: "MNL",
    origin: "SGN",
    raCode: "VN/RA3/00010-01",
    shipperName: "SAIGON EXPORT CO",
    shipperAddress: "Tan Son Nhat Airport",
    shipperPhone: "0281234567",
    pcs: "40",
    kg: "520",
    pcsWeight: "40 / 520 kg",
    flightDest: "PR598/MNL",
    formDate: "12-Sep-2026",
    verifiedBy: "TCS Co., Ltd. - PAL Cargo Handler",
  },
  template,
  { bold }
);

writeFileSync(outPdf, bytes);
console.log("wrote", outPdf, bytes.byteLength);
