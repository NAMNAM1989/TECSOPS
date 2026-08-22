/**
 * AutomationMonitor — Playwright / ext_tcs / ext_scsc.
 * Selector fail → EXTERNAL_UI_CHANGE vs OUR_CODE_BUG.
 */

import { AUTOMATION_SUBTYPES, ERROR_CLASSES } from "./constants.mjs";
import { classifyEvent } from "./classification.mjs";

export function trackAutomationRun(raw) {
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((s, i) => ({
        index: i,
        name: String(s.name || s.step || `step_${i}`).slice(0, 80),
        status: String(s.status || "unknown").slice(0, 32),
        page_url: s.page_url || null,
        selector: s.selector || null,
        screenshot: s.screenshot || null,
        error: s.error || null,
        duration_ms: Number(s.duration_ms) || null,
      }))
    : [];
  const failed = steps.find((s) => s.status === "failed" || s.error);
  return {
    automation_id: raw.automation_id || raw.id || null,
    run_id: raw.run_id || null,
    workflow: raw.workflow || "unknown",
    source: raw.source || "automation",
    steps,
    failed_step: failed || null,
    page_url: raw.page_url || failed?.page_url || null,
    screenshot: raw.screenshot || failed?.screenshot || null,
    console_errors: raw.console_errors || [],
    network_errors: raw.network_errors || [],
  };
}

export function automationEventFromRun(run, extra = {}) {
  const failed = run.failed_step;
  const message =
    extra.message ||
    failed?.error ||
    (failed?.selector
      ? `Timeout waiting for locator('${failed.selector}')`
      : "Automation run failed");
  return {
    source: run.source || "playwright",
    service: "tecsops",
    module: extra.module || `automation:${run.workflow}`,
    error_type: extra.error_type || "TimeoutError",
    message,
    url: run.page_url,
    automation: {
      automation_id: run.automation_id,
      run_id: run.run_id,
      workflow: run.workflow,
      step: failed?.name,
      selector: failed?.selector || extra.selector,
      page_url: run.page_url,
      screenshot: run.screenshot,
      console_errors: run.console_errors,
      network_errors: run.network_errors,
    },
    metadata: { steps: run.steps },
  };
}

export function classifyAutomationFailure(event) {
  const classified = classifyEvent(event);
  if (classified.classification !== ERROR_CLASSES.AUTOMATION_ERROR) {
    return {
      ...classified,
      classification: ERROR_CLASSES.AUTOMATION_ERROR,
      subtype: classified.subtype || AUTOMATION_SUBTYPES.EXTERNAL_UI_CHANGE,
    };
  }
  return classified;
}
