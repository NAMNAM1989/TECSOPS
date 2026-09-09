/**
 * Fill CSD-VU với lô thật TECS-SCSC (VU131 / SHOPEE) — kiểm tra Contents đủ chữ.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fillCsdPdfBytes, buildCsdFields } from "../src/utils/csdForms.ts";

const outPdf = resolve("public/templates/csd/_preview-vu-app-fill.pdf");
const template = Uint8Array.from(
  readFileSync(resolve("public/templates/csd/CSD-VU.pdf"))
);
const bold = Uint8Array.from(
  readFileSync(resolve("public/fonts/NotoSans-Bold.ttf"))
);

const goods =
  "E-COMMERCE GOODS HOME&LIVING HS CODE:9099099 WOMEN CLOTHES HS CODE: 9099099 BABY&KID FASHION HS CODE: 62092090 MUSLIM FA";

const fields = buildCsdFields(
  {
    awb: "759-0025 6583",
    flight: "VU131",
    dest: "BKK",
    warehouse: "TECS-SCSC",
    pcs: 9,
    kg: 128,
    customer: "SHOPEE",
    goodsDescriptionPrint: goods,
  } as never,
  "VU"
);

const bytes = await fillCsdPdfBytes("VU", fields, template, { bold });
writeFileSync(outPdf, bytes);
console.log("wrote", outPdf);
console.log("goods len", goods.length, goods);
