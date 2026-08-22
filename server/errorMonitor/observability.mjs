/**
 * Structured observability events — ring buffer, không crash caller.
 */

import { DEFAULTS, OBS_EVENTS } from "./constants.mjs";

export function createObservability({ max = DEFAULTS.maxObservabilityEvents, now = () => Date.now() } = {}) {
  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  const counts = Object.create(null);

  function emit(type, payload = {}) {
    const name = OBS_EVENTS[type] || type;
    const entry = {
      type: name,
      ts: new Date(now()).toISOString(),
      ...payload,
    };
    events.push(entry);
    counts[name] = (counts[name] || 0) + 1;
    if (events.length > max) events.splice(0, events.length - max);
    return entry;
  }

  function list(limit = 100) {
    return events.slice(-limit);
  }

  function count(type) {
    return counts[type] || 0;
  }

  function snapshot() {
    return { total: events.length, counts: { ...counts } };
  }

  function reset() {
    events.length = 0;
    for (const key of Object.keys(counts)) delete counts[key];
  }

  return { emit, list, count, snapshot, reset, events };
}
