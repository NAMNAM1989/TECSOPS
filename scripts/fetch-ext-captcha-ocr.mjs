/**
 * Chuẩn bị asset OCR CAPTCHA cho Chrome Ext (ddddocr common.onnx + ORT WASM).
 * Chạy: npm run ext:fetch-ocr
 *
 * Thứ tự lấy common.onnx (không commit ~54MB vào git):
 *   1. File đã có (Docker COPY từ stage Python / local)
 *   2. EXT_OCR_ONNX_URL (GitHub Release asset hoặc URL tùy chọn)
 *   3. GitHub Release latest `common.onnx` (bỏ qua nếu 404)
 *   4. PyPI wheel ddddocr (giải nén, không cần pip install)
 *   5. python + ddddocr (site-packages)
 *
 * charsets.json giữ trong repo (không bắt buộc API get_charset).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [path.join(root, "chrome-extension-tcs", "ocr")];
const primary = targets[0];
const MIN_ONNX_BYTES = 1_000_000;
const DDDDOCR_VERSION = process.env.DDDDOCR_VERSION || "1.5.6";
const GITHUB_OCR_RELEASE_ASSET =
  process.env.EXT_OCR_GITHUB_ASSET_URL ||
  "https://github.com/NAMNAM1989/TECSOPS/releases/latest/download/common.onnx";

export function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.info(
    `[ext:fetch-ocr] ${path.relative(root, dest)} (${fs.statSync(dest).size} bytes)`
  );
}

export function hasUsableOnnx(onnxPath = path.join(primary, "common.onnx")) {
  return fs.existsSync(onnxPath) && fs.statSync(onnxPath).size > MIN_ONNX_BYTES;
}

function findOrtDist() {
  const dist = path.join(root, "node_modules", "onnxruntime-web", "dist");
  if (!fs.existsSync(dist)) {
    throw new Error(
      "Thiếu onnxruntime-web. Chạy: npm install onnxruntime-web"
    );
  }
  return dist;
}

function runPython(code) {
  for (const bin of ["python3", "python"]) {
    const result = spawnSync(bin, ["-c", code], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    if (result.error?.code === "ENOENT") continue;
    return result;
  }
  return { status: 127, stdout: "", stderr: "python not found" };
}

function exportFromPython(outDir) {
  const outPosix = outDir.replaceAll("\\", "/");
  const py = `
import pathlib, shutil, sys
try:
    import ddddocr
except ImportError:
    sys.exit(2)
pkg = pathlib.Path(ddddocr.__file__).parent
onnx = pkg / "common.onnx"
if not onnx.exists():
    sys.exit(3)
out = pathlib.Path(r"""${outPosix}""")
out.mkdir(parents=True, exist_ok=True)
shutil.copy2(onnx, out / "common.onnx")
charset = out / "charsets.json"
if charset.exists() and charset.stat().st_size > 1000:
    print("ok-onnx", onnx.stat().st_size, "charset-cached")
    raise SystemExit(0)
# Cố gắng export charset; không bắt buộc nếu đã có file trong repo.
chars = None
try:
    ocr = ddddocr.DdddOcr(show_ad=False)
    if hasattr(ocr, "get_charset"):
        chars = list(ocr.get_charset())
    elif hasattr(ocr, "charset_manager") and getattr(ocr.charset_manager, "charset", None):
        chars = list(ocr.charset_manager.charset)
except Exception as exc:
    print("charset-skip", type(exc).__name__, str(exc)[:120], file=sys.stderr)
if chars:
    import json
    charset.write_text(json.dumps(chars, ensure_ascii=False), encoding="utf-8")
    print("ok", len(chars), onnx.stat().st_size)
    raise SystemExit(0)
if charset.exists() and charset.stat().st_size > 1000:
    print("ok-onnx", onnx.stat().st_size, "charset-kept")
    raise SystemExit(0)
sys.exit(4)
`;
  const result = runPython(py);
  if (result.status === 0) {
    console.info(`[ext:fetch-ocr] python ddddocr → ${String(result.stdout || "").trim()}`);
    return true;
  }
  if (result.status === 2) {
    console.warn("[ext:fetch-ocr] Chưa cài ddddocr (pip install ddddocr)");
  } else {
    console.warn(
      "[ext:fetch-ocr] python export fail:",
      String(result.stderr || result.stdout || result.status).slice(0, 400)
    );
  }
  return false;
}

/** Giải một file từ buffer ZIP (store / deflate). */
export function extractZipEntry(zipBuf, predicate) {
  let eocd = -1;
  const start = Math.max(0, zipBuf.length - 22 - 65535);
  for (let i = zipBuf.length - 22; i >= start; i -= 1) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP không hợp lệ (thiếu EOCD)");
  const cdOffset = zipBuf.readUInt32LE(eocd + 16);
  const cdSize = zipBuf.readUInt32LE(eocd + 12);
  let p = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (p + 46 <= cdEnd) {
    if (zipBuf.readUInt32LE(p) !== 0x02014b50) break;
    const method = zipBuf.readUInt16LE(p + 10);
    const compSize = zipBuf.readUInt32LE(p + 20);
    const nameLen = zipBuf.readUInt16LE(p + 28);
    const extraLen = zipBuf.readUInt16LE(p + 30);
    const commentLen = zipBuf.readUInt16LE(p + 32);
    const localOff = zipBuf.readUInt32LE(p + 42);
    const name = zipBuf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (predicate(name.replaceAll("\\", "/"))) {
      const localNameLen = zipBuf.readUInt16LE(localOff + 26);
      const localExtraLen = zipBuf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + localNameLen + localExtraLen;
      const compressed = zipBuf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return Buffer.from(compressed);
      if (method === 8) return zlib.inflateRawSync(compressed);
      throw new Error(`ZIP method ${method} không hỗ trợ (${name})`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

async function downloadBuffer(url, timeoutMs) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "tecsops-ext-fetch-ocr" },
  });
  if (!res.ok) {
    const err = new Error(`${url} → HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

function writeOnnx(destPath, data, label) {
  if (!data || data.length <= MIN_ONNX_BYTES) {
    throw new Error(`${label}: common.onnx quá nhỏ (${data?.length || 0})`);
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, data);
  console.info(`[ext:fetch-ocr] ${label} → ${path.relative(root, destPath)} (${data.length} bytes)`);
  return true;
}

export async function downloadOnnxFromUrl(url, destPath, timeoutMs = 180_000) {
  const data = await downloadBuffer(url, timeoutMs);
  return writeOnnx(destPath, data, url);
}

function pickPypiWheelUrl(meta) {
  const urls = Array.isArray(meta?.urls) ? meta.urls : [];
  const wheels = urls.filter(
    (u) =>
      u?.packagetype === "bdist_wheel" &&
      typeof u.url === "string" &&
      u.url.endsWith(".whl")
  );
  const any = wheels.find((u) => /py3-none-any\.whl$/i.test(u.filename || u.url));
  return (any || wheels[0])?.url || null;
}

export async function downloadOnnxFromPypi(destPath, version = DDDDOCR_VERSION) {
  const api = version
    ? `https://pypi.org/pypi/ddddocr/${version}/json`
    : "https://pypi.org/pypi/ddddocr/json";
  const meta = JSON.parse((await downloadBuffer(api, 30_000)).toString("utf8"));
  const wheelUrl = pickPypiWheelUrl(meta);
  if (!wheelUrl) {
    throw new Error(`PyPI ddddocr ${version || "latest"} không có wheel`);
  }
  console.info(`[ext:fetch-ocr] tải wheel ${wheelUrl}`);
  const wheel = await downloadBuffer(wheelUrl, 180_000);
  const onnx = extractZipEntry(wheel, (name) => name.endsWith("common.onnx"));
  if (!onnx) throw new Error("Wheel ddddocr không chứa common.onnx");
  return writeOnnx(destPath, onnx, `pypi ddddocr==${meta.info?.version || version}`);
}

async function tryGithubReleaseOnnx(destPath) {
  try {
    await downloadOnnxFromUrl(GITHUB_OCR_RELEASE_ASSET, destPath, 15_000);
    return true;
  } catch (err) {
    if (err?.status === 404) {
      console.info("[ext:fetch-ocr] Không có GitHub Release asset common.onnx — bỏ qua");
      return false;
    }
    console.warn(
      "[ext:fetch-ocr] GitHub Release OCR:",
      String(err?.message || err).slice(0, 200)
    );
    return false;
  }
}

export async function ensureModelAndCharset() {
  const onnxPath = path.join(primary, "common.onnx");
  const charsetPath = path.join(primary, "charsets.json");
  if (!fs.existsSync(charsetPath) || fs.statSync(charsetPath).size < 1000) {
    throw new Error("Thiếu chrome-extension-tcs/ocr/charsets.json trong repo");
  }
  if (hasUsableOnnx(onnxPath)) {
    console.info("[ext:fetch-ocr] Đã có common.onnx + charsets.json");
    return;
  }

  const url = String(process.env.EXT_OCR_ONNX_URL || "").trim();
  if (url) {
    await downloadOnnxFromUrl(url, onnxPath);
    return;
  }
  if (await tryGithubReleaseOnnx(onnxPath)) return;

  try {
    await downloadOnnxFromPypi(onnxPath);
    return;
  } catch (err) {
    console.warn(
      "[ext:fetch-ocr] PyPI wheel fail:",
      String(err?.message || err).slice(0, 300)
    );
  }

  if (exportFromPython(primary) && hasUsableOnnx(onnxPath)) return;

  throw new Error(
    "Thiếu chrome-extension-tcs/ocr/common.onnx. Docker dùng stage Python; local: pip install ddddocr==1.5.6 && npm run ext:fetch-ocr (hoặc set EXT_OCR_ONNX_URL)"
  );
}

function ensureOrtFiles() {
  const dist = findOrtDist();
  const names = [
    "ort.min.js",
    "ort-wasm-simd-threaded.wasm",
    "ort-wasm-simd-threaded.mjs",
  ];
  for (const name of names) {
    const src = path.join(dist, name);
    if (!fs.existsSync(src)) {
      throw new Error(`Thiếu ${src}`);
    }
    copyFile(src, path.join(primary, name));
  }
}

function syncSharedJsAndAssets() {
  for (const name of ["offscreen.html", "offscreen.js", "charsets.json"]) {
    const src = path.join(primary, name);
    if (!fs.existsSync(src)) {
      throw new Error(`Thiếu ${src} — giữ file này trong repo`);
    }
  }
  const assetNames = [
    "common.onnx",
    "charsets.json",
    "ort.min.js",
    "ort-wasm-simd-threaded.wasm",
    "ort-wasm-simd-threaded.mjs",
    "offscreen.html",
    "offscreen.js",
    "README.md",
  ];
  for (const destDir of targets.slice(1)) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const name of assetNames) {
      const src = path.join(primary, name);
      if (!fs.existsSync(src)) continue;
      copyFile(src, path.join(destDir, name));
    }
  }
}

export async function main() {
  fs.mkdirSync(primary, { recursive: true });
  await ensureModelAndCharset();
  ensureOrtFiles();
  syncSharedJsAndAssets();
  console.info("[ext:fetch-ocr] xong — Reload Ext sau khi load unpacked.");
}

const isCli =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCli) {
  main().catch((err) => {
    console.error(`[ext:fetch-ocr] ${err?.message || err}`);
    process.exit(1);
  });
}
