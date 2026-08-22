import { sanitizeText } from "./sanitizer";
import type { NormalizedErrorEvent } from "./types";

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const ISO_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g;
const AWB_RE = /\b\d{3}-?\d{8}\b/g;
const HEX_RE = /\b[0-9a-f]{16,}\b/gi;
const NUMBER_RE = /\b\d{2,}\b/g;
const PATH_LINE_RE = /(:\d+)(:\d+)?/g;

export function stabilizeMessage(message: string): string {
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

export function firstStackFrame(stack: string | null | undefined): string {
  const lines = String(stack || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const frame = lines.find((line) => line.startsWith("at ")) || lines[1] || "";
  return frame.replace(PATH_LINE_RE, "").slice(0, 240);
}

export function extractFile(stack: string | null | undefined, moduleName?: string): string | undefined {
  const fromStack = String(stack || "").match(/(?:src|server)\/[\w./-]+\.\w+/)?.[0];
  if (fromStack) return fromStack;
  if (moduleName && moduleName !== "unknown" && moduleName.includes("/")) return moduleName;
  return undefined;
}

/** FNV-1a 32-bit — không dùng Node crypto trong core. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function fingerprintEvent(event: NormalizedErrorEvent): { fingerprint: string; material: string } {
  const http = event.http || {};
  const auto = event.automation || {};
  const material = [
    event.service || "tecsops",
    event.source || "unknown",
    event.module || "unknown",
    event.error_type || "Error",
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
  return { fingerprint: `fp_${fnv1a(material)}${fnv1a(material.split("").reverse().join(""))}`, material };
}
