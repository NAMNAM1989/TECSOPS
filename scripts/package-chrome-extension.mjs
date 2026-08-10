import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "public", "downloads");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const file of files) {
    const name = Buffer.from(file.name.replaceAll("\\", "/"), "utf8");
    const data = Buffer.from(file.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function packageExt({
  dirName,
  files,
  stableZipName,
  versionedPrefix,
  installText,
  logTag,
}) {
  const dir = path.join(root, dirName);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf8")
  );
  const entries = [
    ...files.map((name) => ({
      name,
      data: fs.readFileSync(path.join(dir, name)),
    })),
    { name: "INSTALL.txt", data: Buffer.from(installText(manifest.version), "utf8") },
  ];
  const archive = createZip(entries);
  const versionedName = `${versionedPrefix}-v${manifest.version}.zip`;
  fs.writeFileSync(path.join(outputDir, stableZipName), archive);
  fs.writeFileSync(path.join(outputDir, versionedName), archive);
  console.info(
    `[${logTag}] v${manifest.version} · ${versionedName} · ${entries.length} files · ${archive.length} bytes`
  );
}

fs.mkdirSync(outputDir, { recursive: true });

packageExt({
  dirName: "chrome-extension",
  files: [
    "manifest.json",
    "background.js",
    "content-ops.js",
    "content-tcs.js",
    "popup.html",
    "popup.js",
    "locators.json",
    "print-frame.html",
  ],
  stableZipName: "tecsops-chrome-extension.zip",
  versionedPrefix: "tecsops-chrome-extension",
  logTag: "extension:package:tecs-tcs",
  installText: (v) => `TECSOPS — Kho TECS-TCS ESID v${v}

Ext riêng ESID kho TECS-TCS (tcs.com.vn).
eCargo → Ext SCSC riêng. Kho TCS → Ext TCS trên Chrome profile khác.

1. Giải nén ZIP vào thư mục cố định.
2. chrome://extensions → Load unpacked.
3. F5 Ops → chọn kho TECS-TCS → Đăng nhập / Quét / Điền.
`,
});

packageExt({
  dirName: "chrome-extension-tcs",
  files: [
    "manifest.json",
    "background.js",
    "content-ops.js",
    "content-tcs.js",
    "popup.html",
    "popup.js",
    "locators.json",
    "print-frame.html",
    "README.md",
  ],
  stableZipName: "tecsops-chrome-extension-tcs.zip",
  versionedPrefix: "tecsops-chrome-extension-tcs",
  logTag: "extension:package:tcs",
  installText: (v) => `TECSOPS — Kho TCS ESID v${v}

Ext riêng ESID kho TCS. BẮT BUỘC Chrome profile riêng với Ext TECS-TCS.

1. Giải nén ZIP vào thư mục cố định.
2. chrome://extensions → Load unpacked.
3. F5 Ops → chọn kho TCS → Đăng nhập / Quét / Điền.
eCargo → Ext SCSC riêng.
`,
});

packageExt({
  dirName: "chrome-extension-scsc",
  files: [
    "manifest.json",
    "background.js",
    "content-ops.js",
    "content-ecargo.js",
    "popup.html",
    "popup.js",
    "README.md",
  ],
  stableZipName: "tecsops-chrome-extension-scsc.zip",
  versionedPrefix: "tecsops-chrome-extension-scsc",
  logTag: "extension:package:scsc",
  installText: (v) => `TECSOPS — Kho SCSC eCargo v${v}

Ext riêng đăng ký eCargo SCSC (VCT 1-click OTP+QR).

1. Giải nén ZIP vào thư mục cố định.
2. chrome://extensions → Load unpacked.
3. F5 Ops → chọn kho SCSC → Đăng ký eCargo.
`,
});
