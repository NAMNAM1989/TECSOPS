import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractZipEntry,
  hasUsableOnnx,
} from "./fetch-ext-captcha-ocr.mjs";
import { deflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function zipOneDeflated(name, data) {
  const raw = Buffer.from(data);
  const compressed = deflateRawSync(raw);
  const nameBuf = Buffer.from(name, "utf8");
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);

  const localLen = local.length + nameBuf.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBuf.length, 12);
  end.writeUInt32LE(localLen, 16);

  return Buffer.concat([local, nameBuf, compressed, central, nameBuf, end]);
}

describe("ext:fetch-ocr helpers", () => {
  it("hasUsableOnnx false khi thiếu / quá nhỏ", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tecsops-ocr-"));
    const onnx = path.join(dir, "common.onnx");
    expect(hasUsableOnnx(onnx)).toBe(false);
    writeFileSync(onnx, "tiny");
    expect(hasUsableOnnx(onnx)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("hasUsableOnnx true khi file > 1MB", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tecsops-ocr-"));
    const onnx = path.join(dir, "common.onnx");
    writeFileSync(onnx, Buffer.alloc(1_000_001, 7));
    expect(hasUsableOnnx(onnx)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("extractZipEntry lấy common.onnx từ wheel giả (deflate)", () => {
    const payload = Buffer.from("onnx-bytes-for-test");
    const zip = zipOneDeflated("ddddocr/common.onnx", payload);
    const extracted = extractZipEntry(zip, (name) => name.endsWith("common.onnx"));
    expect(extracted?.equals(payload)).toBe(true);
  });
});

describe("Docker OCR hotfix invariants", () => {
  it("Dockerfile multi-stage: python ocr + node builder + node runtime, không Playwright/agent", () => {
    const df = readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
    expect(df).toMatch(/FROM python:3\.12-slim-bookworm AS ocr/);
    expect(df).toMatch(/FROM node:20-bookworm-slim AS builder/);
    expect(df).toMatch(/FROM node:20-bookworm-slim AS runtime/);
    expect(df).toContain("extract-ddddocr-onnx.py");
    expect(df).toContain("ddddocr==");
    expect(df).toContain("npm run ext:fetch-ocr && npm run build");
    expect(df).toContain("EXT_OCR_REQUIRED=1");
    expect(df).toContain('CMD ["node", "scripts/start-fullstack.mjs"]');
    expect(df).not.toMatch(/playwright install/i);
    expect(df).not.toMatch(/FROM\s+mcr\.microsoft\.com/);
    expect(df).not.toMatch(/ENV\s+TCS_AGENT_/);
    expect(df).not.toMatch(/tcs-awb-automation/);
  });

  it("fetch-ocr không còn phụ thuộc Python-only; package vẫn đóng TCS+SCSC", () => {
    const fetch = readFileSync(
      path.join(ROOT, "scripts/fetch-ext-captcha-ocr.mjs"),
      "utf8"
    );
    const pack = readFileSync(
      path.join(ROOT, "scripts/package-chrome-extension.mjs"),
      "utf8"
    );
    expect(fetch).toContain("downloadOnnxFromPypi");
    expect(fetch).toContain("EXT_OCR_ONNX_URL");
    expect(fetch).toContain("hasUsableOnnx");
    expect(pack).toContain('dirName: "chrome-extension-tcs"');
    expect(pack).toContain('dirName: "chrome-extension-scsc"');
    expect(pack).toContain("EXT_OCR_REQUIRED");
    expect(pack).not.toContain('dirName: "chrome-extension"');
  });

  it("start-fullstack không spawn Python / TCS_AGENT", () => {
    const start = readFileSync(
      path.join(ROOT, "scripts/start-fullstack.mjs"),
      "utf8"
    );
    expect(start).toContain("server/index.mjs");
    expect(start).not.toMatch(/spawnTcsAgent|tcs-awb-automation|TCS_AGENT_/);
  });
});
