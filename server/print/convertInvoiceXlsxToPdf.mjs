import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { invoicePayloadFromXlsxBuffer } from "./invoiceXlsxToPayload.mjs";
import { generateShipmentInvoicePdfBuffer } from "./shipmentInvoicePdfService.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const PS1 = path.join(ROOT, "scripts", "convert-invoice-xlsx-to-pdf.ps1");

const LO_CANDIDATES = [
  process.env.LIBREOFFICE_PATH,
  "soffice",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "/usr/bin/libreoffice",
  "/usr/bin/soffice",
].filter(Boolean);

async function convertViaExcelCom(xlsxPath, pdfPath) {
  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      PS1,
      "-XlsxPath",
      xlsxPath,
      "-PdfPath",
      pdfPath,
    ],
    { timeout: 120_000, windowsHide: true }
  );
}

async function convertViaLibreOffice(xlsxPath, outDir) {
  let lastErr;
  for (const bin of LO_CANDIDATES) {
    try {
      await execFileAsync(
        bin,
        ["--headless", "--convert-to", "pdf", "--outdir", outDir, xlsxPath],
        { timeout: 120_000 }
      );
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("LibreOffice không khả dụng");
}

async function tryNativeXlsxToPdf(xlsxPath, pdfPath, tmpDir) {
  if (process.platform === "win32") {
    try {
      await convertViaExcelCom(xlsxPath, pdfPath);
      return pdfPath;
    } catch (excelErr) {
      console.warn("[convertInvoiceXlsxToPdf] Excel COM:", excelErr?.message ?? excelErr);
    }
  }
  await convertViaLibreOffice(xlsxPath, tmpDir);
  const alt = path.join(tmpDir, path.basename(xlsxPath, ".xlsx") + ".pdf");
  return fs.existsSync(pdfPath) ? pdfPath : alt;
}

/**
 * PDF từ INV.xlsx đã điền: ưu tiên Excel/LibreOffice (khớp INV.pdf), fallback PDFKit + Times TTF.
 * @param {Buffer} xlsxBuffer
 * @returns {Promise<Buffer>}
 */
export async function convertInvoiceXlsxToPdf(xlsxBuffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tecsops-inv-"));
  const xlsxPath = path.join(tmpDir, "INV.xlsx");
  const pdfPath = path.join(tmpDir, "INV.pdf");
  fs.writeFileSync(xlsxPath, xlsxBuffer);

  try {
    try {
      const outPdf = await tryNativeXlsxToPdf(xlsxPath, pdfPath, tmpDir);
      if (outPdf && fs.existsSync(outPdf)) {
        return fs.readFileSync(outPdf);
      }
    } catch (nativeErr) {
      console.warn("[convertInvoiceXlsxToPdf] Native convert failed:", nativeErr?.message ?? nativeErr);
    }

    console.warn(
      "[convertInvoiceXlsxToPdf] Dùng PDF fallback (Times New Roman). Cài Excel hoặc LibreOffice để khớp 100% INV.pdf."
    );
    const payload = await invoicePayloadFromXlsxBuffer(xlsxBuffer);
    return generateShipmentInvoicePdfBuffer(payload);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
