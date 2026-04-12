/**
 * Ghi file Excel mẫu vào samples/ — cùng định dạng với nút DOWNLOAD EXCEL trên app.
 * Chạy: npm run sample:day-report
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Shipment } from "../src/types/shipment";
import { buildDayReportWorkbook } from "../src/utils/exportDayReportExcel";

function row(p: Partial<Shipment> & Pick<Shipment, "id" | "stt" | "awb" | "dest" | "customer">): Shipment {
  return {
    flight: "",
    flightDate: "",
    cutoff: "",
    cutoffNote: "",
    note: "",
    warehouse: "TECS-TCS",
    pcs: null,
    kg: null,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    status: "PENDING",
    sessionDate: "2026-04-06",
    ...p,
  };
}

const SESSION_YMD = "2026-04-06";

const sampleRows: Shipment[] = [
  row({
    id: "sample-1",
    stt: 1,
    awb: "232-1825 3045",
    dest: "KUL",
    pcs: 20,
    kg: 230,
    customer: "CITYLINK",
    note: "",
  }),
  row({
    id: "sample-2",
    stt: 2,
    awb: "738-8888 8888",
    dest: "CAN",
    pcs: 40,
    kg: 50,
    dimWeightKg: 800,
    customer: "Demo khách",
    note: "Ví dụ có VOLUME WEIGHT",
  }),
  row({
    id: "sample-3",
    stt: 3,
    warehouse: "TECS-SCSC",
    awb: "157-8899 1001",
    dest: "DOH",
    pcs: 41,
    kg: 612,
    dimWeightKg: 590,
    customer: "ORIENT CARGO",
    note: "Dòng mẫu kho SCSC",
  }),
];

async function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = path.join(root, "samples");
  fs.mkdirSync(outDir, { recursive: true });

  const wb = await buildDayReportWorkbook(sampleRows, SESSION_YMD);
  const fname = `TECSOPS-bao-cao-ngay-MAU-${SESSION_YMD}.xlsx`;
  const outPath = path.join(outDir, fname);
  await wb.xlsx.writeFile(outPath);

  console.info("Đã tạo file mẫu:\n", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
