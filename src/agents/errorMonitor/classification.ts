import type { Classification, NormalizedErrorEvent, Severity } from "./types";

const VALIDATION_RE =
  /missing field|required field|customer not found|shipment not found|validation|không tìm thấy khách|thiếu trường|invalid (?:customer|awb|code)|bad request|body phải là|không hợp lệ/i;
const USER_INPUT_RE =
  /invalid json|invalid input|malformed|unprocessable|type phải là|warehouse không hỗ trợ/i;
const INFRA_RE =
  /database_url is not configured|econnrefused|enotfound|econnreset|postgres|postgresql|too many clients|connection terminated|db unavailable|database unavailable|could not connect to server|connect econnrefused|remaining connection slots/i;
const EXTERNAL_RE =
  /imap|gmail|google sheet|tcs\.com|scsc|ecargo|gemini|generativelanguage|upstream|bad gateway|gateway timeout|otp_timeout/i;
const AUTOMATION_RE =
  /playwright|locator|selector|waiting for|strict mode violation|timeout \d+ms exceeded|page\.click|page\.fill|ext_tcs|ext_scsc|chrome extension|cdp/i;
const SELECTOR_MISS_RE =
  /locator.*not found|waiting for locator|no node found|selector .* (?:not found|missing)|element not found|strict mode violation/i;
const SECURITY_RE =
  /unauthorized|forbidden|auth_required|csrf|xss|injection|privilege|token stolen|session hijack/i;
const SOFTWARE_RE =
  /typeerror|referenceerror|cannot read propert|is not a function|is not defined|internal server error|unhandled|uncaught|stack overflow/i;
const OUR_CODE_HINT_RE = /\/server\/|\/src\/|tecsops|air-cargo|errorMonitor|stateStore|portalJobs/i;

function textBlob(event: NormalizedErrorEvent): string {
  const auto = event.automation || {};
  return [
    event.message,
    event.error_type,
    event.stack_trace,
    event.module,
    event.source,
    auto.workflow,
    auto.step,
    auto.selector,
    auto.page_url,
    ...(auto.console_errors || []),
  ]
    .filter(Boolean)
    .join("\n");
}

export function classifyEvent(event: NormalizedErrorEvent): Classification {
  const blob = textBlob(event);
  const status = Number(event.http?.status);
  const source = String(event.source || "").toLowerCase();
  const pageUrl = String(event.automation?.page_url || event.url || "");
  const externalPortal = /tcs\.com\.vn|scsc|ecargo/i.test(pageUrl);

  if (SECURITY_RE.test(blob) && (status === 401 || status === 403 || /security/i.test(source))) {
    return { classification: "SECURITY_EVENT", subtype: null, confidence: 0.78, reason: "Auth/security signal" };
  }
  if (INFRA_RE.test(blob) || event.module === "db" || event.module === "postgres") {
    return {
      classification: "INFRASTRUCTURE_ERROR",
      subtype: null,
      confidence: 0.92,
      reason: "Database/infrastructure connectivity",
    };
  }
  if (AUTOMATION_RE.test(blob) || source === "automation" || source === "playwright" || source === "ext") {
    const selectorMissing = SELECTOR_MISS_RE.test(blob) || Boolean(event.automation?.selector);
    const ourCode = OUR_CODE_HINT_RE.test(event.stack_trace || "") || source === "ext";
    const subtype = selectorMissing
      ? externalPortal && !ourCode
        ? "EXTERNAL_UI_CHANGE"
        : ourCode
          ? "OUR_CODE_BUG"
          : "EXTERNAL_UI_CHANGE"
      : "WORKFLOW_TIMEOUT";
    return {
      classification: "AUTOMATION_ERROR",
      subtype,
      confidence: selectorMissing ? 0.88 : 0.72,
      reason: selectorMissing
        ? subtype === "EXTERNAL_UI_CHANGE"
          ? "Selector missing on external portal"
          : "Selector/automation failure in our stack"
        : "Automation workflow failure",
    };
  }
  if (VALIDATION_RE.test(blob) || status === 400 || status === 404 || status === 422) {
    if (USER_INPUT_RE.test(blob) && !VALIDATION_RE.test(blob)) {
      return { classification: "USER_INPUT_ERROR", subtype: null, confidence: 0.8, reason: "Malformed/invalid user input" };
    }
    return {
      classification: "BUSINESS_VALIDATION",
      subtype: null,
      confidence: 0.9,
      reason: "Business validation / missing entity",
    };
  }
  if (USER_INPUT_RE.test(blob)) {
    return { classification: "USER_INPUT_ERROR", subtype: null, confidence: 0.8, reason: "Invalid user input" };
  }
  if (EXTERNAL_RE.test(blob) && (status >= 502 || status === 504 || /timeout|unavailable/i.test(blob))) {
    return { classification: "EXTERNAL_SERVICE_ERROR", subtype: null, confidence: 0.75, reason: "Upstream/external service" };
  }
  if (status >= 500 || SOFTWARE_RE.test(blob) || source === "backend") {
    return {
      classification: "SOFTWARE_ERROR",
      subtype: null,
      confidence: status >= 500 ? 0.86 : 0.7,
      reason: status >= 500 ? "HTTP 5xx software failure" : "Runtime software exception",
    };
  }
  return { classification: "UNKNOWN", subtype: null, confidence: 0.35, reason: "Insufficient rule evidence" };
}

export function classifySeverity(event: NormalizedErrorEvent, classified: Classification): { severity: Severity; reason: string } {
  const status = Number(event.http?.status);
  const blob = textBlob(event);
  if (classified.classification === "SECURITY_EVENT") return { severity: "SEV-0", reason: "Security event" };
  if (classified.classification === "INFRASTRUCTURE_ERROR") {
    return { severity: "SEV-1", reason: "Infrastructure/DB unavailable" };
  }
  if (classified.classification === "SOFTWARE_ERROR" && (status >= 500 || /fatal|uncaught/i.test(blob))) {
    return { severity: "SEV-2", reason: "Backend software error" };
  }
  if (classified.classification === "AUTOMATION_ERROR") {
    return {
      severity: classified.subtype === "OUR_CODE_BUG" ? "SEV-2" : "SEV-3",
      reason: "Automation failure",
    };
  }
  if (classified.classification === "EXTERNAL_SERVICE_ERROR") {
    return { severity: "SEV-3", reason: "External dependency" };
  }
  if (classified.classification === "BUSINESS_VALIDATION" || classified.classification === "USER_INPUT_ERROR") {
    return { severity: "SEV-4", reason: "Validation / user input — not a product defect" };
  }
  if (status >= 500) return { severity: "SEV-2", reason: "HTTP 5xx" };
  return { severity: "SEV-3", reason: "Default moderate" };
}

export function shouldDispatchToBugFix(classified: Classification): boolean {
  if (classified.classification === "BUSINESS_VALIDATION") return false;
  if (classified.classification === "USER_INPUT_ERROR") return false;
  if (classified.classification === "EXTERNAL_SERVICE_ERROR") return false;
  if (classified.classification === "AUTOMATION_ERROR" && classified.subtype === "EXTERNAL_UI_CHANGE") {
    return false;
  }
  return true;
}

export function isHardClassification(classified: Classification): boolean {
  return classified.classification === "UNKNOWN" || Number(classified.confidence || 0) < 0.55;
}
