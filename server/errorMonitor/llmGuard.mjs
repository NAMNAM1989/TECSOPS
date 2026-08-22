/**
 * LLM chỉ cho phân loại khó / correlation / tóm tắt.
 * Storm + rate-limit bắt buộc — không gọi AI từng event.
 */

import { DEFAULTS, OBS_EVENTS } from "./constants.mjs";

export function createLlmGuard({
  now = () => Date.now(),
  classifyFn = null,
  maxCallsPerWindow = DEFAULTS.llmMaxCallsPerWindow,
  windowMs = DEFAULTS.llmWindowMs,
  stormThreshold = DEFAULTS.stormThreshold,
  observability = null,
} = {}) {
  const callTimes = [];
  let callCount = 0;
  let skipped = 0;

  function prune(ts) {
    while (callTimes.length && ts - callTimes[0] > windowMs) callTimes.shift();
  }

  function isRateLimited(ts = now()) {
    prune(ts);
    return callTimes.length >= maxCallsPerWindow;
  }

  /**
   * @param {{ storm?: boolean, eventsInWindow?: number, hard?: boolean, purpose?: string }} ctx
   * @param {() => Promise<unknown> | unknown} [fn]
   */
  async function maybeCall(ctx, fn) {
    const ts = now();
    const storm =
      ctx?.storm === true || Number(ctx?.eventsInWindow || 0) >= stormThreshold;
    const hard = ctx?.hard !== false;
    if (!classifyFn && !fn) {
      skipped += 1;
      observability?.emit(OBS_EVENTS.LLM_SKIPPED, { reason: "no_llm" });
      return null;
    }
    if (storm) {
      skipped += 1;
      observability?.emit(OBS_EVENTS.LLM_SKIPPED, { reason: "storm" });
      return null;
    }
    if (!hard) {
      skipped += 1;
      observability?.emit(OBS_EVENTS.LLM_SKIPPED, { reason: "rule_confident" });
      return null;
    }
    if (isRateLimited(ts)) {
      skipped += 1;
      observability?.emit(OBS_EVENTS.RATE_LIMITED, { target: "llm" });
      observability?.emit(OBS_EVENTS.LLM_SKIPPED, { reason: "rate_limit" });
      return null;
    }
    callTimes.push(ts);
    callCount += 1;
    observability?.emit(OBS_EVENTS.LLM_CALLED, { purpose: ctx?.purpose || "classify" });
    const runner = fn || (() => classifyFn(ctx));
    try {
      return await runner();
    } catch (err) {
      observability?.emit(OBS_EVENTS.LLM_SKIPPED, {
        reason: "llm_error",
        message: String(err?.message || err).slice(0, 160),
      });
      return null;
    }
  }

  return {
    maybeCall,
    isRateLimited,
    get callCount() {
      return callCount;
    },
    get skippedCount() {
      return skipped;
    },
  };
}

export function isHardClassification(classified) {
  if (!classified) return true;
  if (classified.classification === "UNKNOWN") return true;
  return Number(classified.confidence || 0) < 0.55;
}
