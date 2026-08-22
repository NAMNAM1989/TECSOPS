/**
 * ErrorFingerprinter — fingerprint ổn định để khử trùng.
 * Bỏ số động, UUID, timestamp, AWB để 100 lỗi giống nhau = 1 fingerprint.
 */

import crypto from "node:crypto";
import { sanitizeText } from "./secretSanitizer.mjs";

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const ISO_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g;
const AWB_RE = /\b\d{3}-?\d{8}\b/g;
const HEX_RE = /\b[0-9a-f]{16,}\b/gi;
const NUMBER_RE = /\b\d{2,}\b/g;
const PATH_LINE_RE = /(:\d+)(:\d+)?/g;

export function stabilizeMessage(message) {
  return sanitizeText(String(message || ""))
    .replace(UUID_RE, "<id>")
    .replace(ISO_RE, "<ts>")
    .replace(AWB_RE, "<awb>")
    .replace(HEX_RE, "<hex>")
    .replace(NUMBER_RE, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 400);
}

export function firstStackFrame(stack) {
  const lines = String(stack || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const frame = lines.find((l) => l.startsWith("at ")) || lines[1] || "";
  return frame.replace(PATH_LINE_RE, "").slice(0, 240);
}

/**
 * @param {import("./errorNormalizer.mjs").NormalizedEvent | Record<string, unknown>} event
 */
export function fingerprintEvent(event) {
  const http = event.http || {};
  const auto = event.automation || {};
  const material = [
    String(event.service || "tecsops"),
    String(event.source || "unknown"),
    String(event.module || "unknown"),
    String(event.error_type || "Error"),
    stabilizeMessage(event.message),
    firstStackFrame(event.stack_trace),
    http.status != null ? `http:${http.status}` : "",
    http.route || http.path || "",
    auto.workflow || "",
    auto.step || "",
    auto.selector ? stabilizeMessage(auto.selector) : "",
  ]
    .filter(Boolean)
    .join("|");

  const hash = crypto.createHash("sha256").update(material).digest("hex").slice(0, 24);
  return {
    fingerprint: `fp_${hash}`,
    material,
  };
}
