import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "chrome-extension");
const outputDir = path.join(root, "public", "downloads");
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf8")
);

const runtimeFiles = [
  "manifest.json",
  "background.js",
  "content-ops.js",
  "content-tcs.js",
  "popup.html",
  "popup.js",
  "locators.json",
];

const installText = `TECSOPS Chrome Extension v${manifest.version}

CÀI TRÊN MÁY MỚI
1. Giải nén toàn bộ file ZIP này vào một thư mục cố định.
2. Mở Chrome: chrome://extensions
3. Bật "Chế độ dành cho nhà phát triển".
4. Chọn "Tải tiện ích đã giải nén" (Load unpacked).
5. Chọn đúng thư mục vừa giải nén.
6. Mở popup extension và kiểm tra phiên bản v${manifest.version}.
7. F5 trang Ops rồi bấm "Đồng bộ TCS".

CẬP NHẬT
Tải ZIP mới, giải nén đè vào thư mục cũ, sau đó bấm nút tải lại tại
chrome://extensions và F5 cả Ops lẫn tab TCS.
`;

const entries = [
  ...runtimeFiles.map((name) => ({
    name,
    data: fs.readFileSync(path.join(extensionDir, name)),
  })),
  { name: "INSTALL.txt", data: Buffer.from(installText, "utf8") },
];

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

fs.mkdirSync(outputDir, { recursive: true });
const archive = createZip(entries);
const stablePath = path.join(outputDir, "tecsops-chrome-extension.zip");
const versionedPath = path.join(
  outputDir,
  `tecsops-chrome-extension-v${manifest.version}.zip`
);
fs.writeFileSync(stablePath, archive);
fs.writeFileSync(versionedPath, archive);
console.info(
  `[extension:package] v${manifest.version} · ${entries.length} files · ${archive.length} bytes`
);
