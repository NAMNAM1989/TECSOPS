/**
 * Chuẩn bị asset OCR CAPTCHA cho Chrome Ext (ddddocr common.onnx + ORT WASM).
 * Chạy: npm run ext:fetch-ocr
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  path.join(root, "chrome-extension-tcs", "ocr"),
  path.join(root, "chrome-extension", "ocr"),
];
const primary = targets[0];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.info(`[ext:fetch-ocr] ${path.relative(root, dest)} (${fs.statSync(dest).size} bytes)`);
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

function exportFromPython(outDir) {
  const py = `
import json, pathlib, shutil, sys
try:
    import ddddocr
except ImportError:
    sys.exit(2)
pkg = pathlib.Path(ddddocr.__file__).parent
onnx = pkg / "common.onnx"
if not onnx.exists():
    sys.exit(3)
out = pathlib.Path(r"""${outDir.replaceAll("\\", "/")}""")
out.mkdir(parents=True, exist_ok=True)
shutil.copy2(onnx, out / "common.onnx")
ocr = ddddocr.DdddOcr(show_ad=False)
chars = list(ocr.get_charset())
(out / "charsets.json").write_text(json.dumps(chars, ensure_ascii=False), encoding="utf-8")
print("ok", len(chars), onnx.stat().st_size)
`;
  const result = spawnSync("python", ["-c", py], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.status === 0) {
    console.info(`[ext:fetch-ocr] python ddddocr → ${result.stdout.trim()}`);
    return true;
  }
  if (result.status === 2) {
    console.warn("[ext:fetch-ocr] Chưa cài ddddocr (pip install ddddocr)");
  } else {
    console.warn("[ext:fetch-ocr] python export fail:", result.stderr || result.stdout);
  }
  return false;
}

function ensureModelAndCharset() {
  const onnxPath = path.join(primary, "common.onnx");
  const charsetPath = path.join(primary, "charsets.json");
  if (fs.existsSync(onnxPath) && fs.statSync(onnxPath).size > 1_000_000 && fs.existsSync(charsetPath)) {
    console.info("[ext:fetch-ocr] Đã có common.onnx + charsets.json");
    return;
  }
  if (exportFromPython(primary)) return;
  throw new Error(
    "Thiếu chrome-extension-tcs/ocr/common.onnx. Cài ddddocr rồi chạy lại: pip install ddddocr && npm run ext:fetch-ocr"
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
  const sharedJs = ["offscreen.html", "offscreen.js"];
  for (const name of sharedJs) {
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

fs.mkdirSync(primary, { recursive: true });
ensureModelAndCharset();
ensureOrtFiles();
syncSharedJsAndAssets();
console.info("[ext:fetch-ocr] xong — Reload Ext sau khi load unpacked.");
