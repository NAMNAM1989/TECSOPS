/**
 * Cầu nối in tem TSPL trên Windows — 2 máy USB (XPrinter 470B) in theo **tên hàng đợi Windows**.
 *
 * Chạy trên PC quầy (cùng máy cắm USB):
 *   npm run print-bridge
 *
 * OPS (trình duyệt) gửi TSPL → http://127.0.0.1:9470/print
 * Không mở hộp thoại chọn máy / khổ giấy.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TECSOPS_PRINT_BRIDGE_PORT ?? 9470);
const PS_SCRIPT = join(root, "scripts", "win-raw-print.ps1");

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS_SCRIPT, ...args],
      { windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exit ${code}`));
    });
  });
}

function listWindowsPrinters() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress",
      ],
      { windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `list printers exit ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim() || "[]");
        const names = Array.isArray(parsed) ? parsed : [parsed];
        resolve(names.filter((n) => typeof n === "string" && n.trim()));
      } catch {
        resolve(
          stdout
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        );
      }
    });
  });
}

async function printRawToWindows(printerName, tspl) {
  const tmp = join(tmpdir(), `tecsops-${randomBytes(8).toString("hex")}.tspl`);
  await writeFile(tmp, tspl, "utf8");
  try {
    await runPowerShell(["-PrinterName", printerName, "-FilePath", tmp]);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const send = (status, obj) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(JSON.stringify(obj));
  };

  if (req.method === "OPTIONS") {
    send(204, {});
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      const printers = await listWindowsPrinters();
      send(200, { ok: true, service: "tecsops-print-bridge", port: PORT, printers });
      return;
    }

    if (req.method === "GET" && req.url === "/printers") {
      const printers = await listWindowsPrinters();
      send(200, { ok: true, printers });
      return;
    }

    if (req.method === "POST" && req.url === "/print") {
      const body = await readBody(req);
      const printerName = String(body.printerName ?? "").trim();
      const tspl = String(body.tspl ?? "");
      if (!printerName) {
        send(400, { ok: false, error: "Missing printerName" });
        return;
      }
      if (!tspl.trim()) {
        send(400, { ok: false, error: "Missing tspl" });
        return;
      }
      await printRawToWindows(printerName, tspl);
      send(200, { ok: true, printerName, bytes: Buffer.byteLength(tspl, "utf8") });
      return;
    }

    send(404, { ok: false, error: "Not found" });
  } catch (e) {
    console.error("[print-bridge]", e);
    send(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.info(`[print-bridge] Listening http://127.0.0.1:${PORT}`);
  console.info("[print-bridge] GET /health — GET /printers — POST /print { printerName, tspl }");
  console.info("[print-bridge] Gán tên máy trong OPS (profile 100×80 / 100×50) trùng tên trong Windows.");
});
