/**
 * ErrorMonitorAgent — Detect → Normalize → Sanitize → Fingerprint →
 * Dedupe → Correlate → Classify → Severity → Evidence → Bug Report → Dispatch.
 *
 * Fail-isolated: ingest không throw ra app chính.
 * Không sửa source. Không giấu lỗi. Không gửi secret.
 */

import { AGENT_NAME, DEFAULTS, ERROR_CLASSES, INCIDENT_STATUS, OBS_EVENTS, SEVERITY } from "./constants.mjs";
import { permissionModel } from "./permissions.mjs";
import { sanitizeSecrets } from "./secretSanitizer.mjs";
import { normalizeErrorEvent } from "./errorNormalizer.mjs";
import { fingerprintEvent } from "./errorFingerprinter.mjs";
import { classifyEvent, classifySeverity, shouldDispatchToBugFix } from "./classification.mjs";
import { createObservability } from "./observability.mjs";
import { createLlmGuard, isHardClassification } from "./llmGuard.mjs";
import { createMemoryStore } from "./store.mjs";
import { createDeduplicationEngine } from "./deduplicationEngine.mjs";
import { createCorrelationEngine } from "./correlationEngine.mjs";
import { collectEvidence } from "./evidenceCollector.mjs";
import { buildBugReport } from "./bugReportBuilder.mjs";
import { createBugFixDispatcher } from "./bugFixDispatcher.mjs";
import { createNotificationPolicy } from "./notificationPolicy.mjs";
import { createHealthMonitor } from "./healthMonitor.mjs";
import { automationEventFromRun, classifyAutomationFailure, trackAutomationRun } from "./automationMonitor.mjs";
import { createRegressionMonitor } from "./regressionMonitor.mjs";

export function createErrorMonitorAgent(options = {}) {
  const now = options.now || (() => Date.now());
  const store = options.store || createMemoryStore();
  const observability = options.observability || createObservability({ now });
  const llm = options.llm || createLlmGuard({
    now,
    classifyFn: options.llmClassifyFn || null,
    observability,
    maxCallsPerWindow: options.llmMaxCallsPerWindow ?? DEFAULTS.llmMaxCallsPerWindow,
    stormThreshold: options.stormThreshold ?? DEFAULTS.stormThreshold,
  });
  const dedupe = createDeduplicationEngine({ store, now, observability });
  const correlation = createCorrelationEngine({ store, now });
  const dispatcher = options.dispatcher || createBugFixDispatcher({
    store,
    queueDir: options.queueDir || null,
    sink: options.dispatchSink || null,
    observability,
    now,
  });
  const notifications = createNotificationPolicy({ store, observability, now });
  const health = options.health || createHealthMonitor({
    now,
    restartFn: options.workerRestartFn || null,
    observability,
    maxRestarts: options.maxWorkerRestarts ?? DEFAULTS.maxWorkerRestarts,
  });
  const regression = createRegressionMonitor({
    store,
    observability,
    now,
    observationWindowMs: options.observationWindowMs ?? DEFAULTS.observationWindowMs,
    maxFixAttempts: options.maxFixAttempts ?? DEFAULTS.maxFixAttempts,
  });

  const windowHits = [];
  const stormThreshold = options.stormThreshold ?? DEFAULTS.stormThreshold;
  const stormWindowMs = options.stormWindowMs ?? DEFAULTS.stormWindowMs;

  function stormState() {
    const ts = now();
    while (windowHits.length && ts - windowHits[0] > stormWindowMs) windowHits.shift();
    return {
      eventsInWindow: windowHits.length,
      storm: windowHits.length >= stormThreshold,
    };
  }

  async function classifyWithOptionalLlm(event, rule) {
    if (!isHardClassification(rule)) return rule;
    const storm = stormState();
    const llmResult = await llm.maybeCall({
      hard: true,
      storm: storm.storm,
      eventsInWindow: storm.eventsInWindow,
      purpose: "classify",
      event,
    });
    if (llmResult && llmResult.classification) {
      return {
        classification: llmResult.classification,
        subtype: llmResult.subtype || rule.subtype,
        confidence: llmResult.confidence ?? 0.6,
        reason: llmResult.reason || "llm",
        via: "llm",
      };
    }
    return rule;
  }

  function shouldCreateDispatch(incident, classified, regressionHit) {
    if (!shouldDispatchToBugFix(classified)) return false;
    if (incident.status === INCIDENT_STATUS.HUMAN_REVIEW_REQUIRED) return false;
    if (incident.status === INCIDENT_STATUS.SUPPRESSED_VALIDATION) return false;
    if (regressionHit) return true;
    if (incident.dispatch_count > 0) return false;
    return incident.status === INCIDENT_STATUS.OPEN;
  }

  async function ingest(raw) {
    try {
      windowHits.push(now());
      const storm = stormState();
      const { sanitized, redacted_count } = sanitizeSecrets(raw || {});
      if (redacted_count > 0) {
        observability.emit(OBS_EVENTS.SECRET_REDACTED, { count: redacted_count });
      }
      const event = normalizeErrorEvent(sanitized, {
        now,
        environment: options.environment,
        release: options.release,
        git_commit: options.git_commit,
      });
      observability.emit(OBS_EVENTS.ERROR_DETECTED, {
        event_id: event.event_id,
        source: event.source,
        module: event.module,
      });

      const { fingerprint } = fingerprintEvent(event);
      observability.emit(OBS_EVENTS.FINGERPRINT_CREATED, {
        event_id: event.event_id,
        fingerprint,
      });

      let classified = classifyEvent(event);
      classified = await classifyWithOptionalLlm(event, classified);
      const sev = classifySeverity(event, classified);
      const { incident, isNew } = dedupe.upsert(event, fingerprint, classified, sev.severity);
      correlation.correlate(incident, event);

      let regressionHit = false;
      if (!isNew) {
        const reg = regression.onNewOccurrence(incident);
        regressionHit = Boolean(reg.regression);
      }

      if (storm.storm) {
        observability.emit(OBS_EVENTS.STORM_AGGREGATED, {
          fingerprint,
          eventsInWindow: storm.eventsInWindow,
          occurrence_count: incident.occurrence_count,
        });
      }

      const evidence = collectEvidence(event, { health: health.snapshot() });
      const immediate = sev.severity === SEVERITY.SEV_0 || sev.severity === SEVERITY.SEV_1;

      if (!shouldDispatchToBugFix(classified) && isNew) {
        incident.status = INCIDENT_STATUS.SUPPRESSED_VALIDATION;
        store.putIncident(incident);
        observability.emit(OBS_EVENTS.BUG_DISPATCH_SKIPPED, {
          classification: classified.classification,
          reason: "non_dispatchable",
        });
      }

      let report = incident.bug_id ? store.getBug(incident.bug_id) : null;
      let dispatched = false;
      if (shouldCreateDispatch(incident, classified, regressionHit)) {
        report = buildBugReport({
          incident,
          event,
          classified,
          severity: sev.severity,
          evidence,
          requiresImmediate: immediate,
        });
        incident.bug_id = report.bug_id;
        incident.dispatch_count += 1;
        if (incident.status !== INCIDENT_STATUS.HUMAN_REVIEW_REQUIRED) {
          incident.status = INCIDENT_STATUS.DISPATCHED;
        }
        store.putIncident(incident);
        dispatcher.dispatch(report);
        dispatched = true;
      } else if (report) {
        report.occurrence_count = incident.occurrence_count;
        report.last_seen = incident.last_seen;
        store.putBug(report);
      }

      if (immediate) {
        notifications.notify({ incident, event, kind: "ESCALATED", force: isNew || regressionHit });
      } else if (dispatched) {
        notifications.notify({ incident, event, kind: "BUG_DISPATCHED" });
      }

      if (classified.classification === ERROR_CLASSES.INFRASTRUCTURE_ERROR) {
        health.recordDb({ ok: false, queryOk: false, detail: event.message });
      }

      return {
        ok: true,
        event,
        fingerprint,
        classification: classified.classification,
        subtype: classified.subtype,
        severity: sev.severity,
        incident,
        bug_report: report,
        dispatched,
        storm: storm.storm,
        redacted_count,
      };
    } catch (err) {
      console.warn("[errorMonitor] ingest isolated:", err?.message || err);
      return { ok: false, isolated: true, error: String(err?.message || err) };
    }
  }

  async function ingestAutomation(rawRun) {
    try {
      const run = trackAutomationRun(rawRun || {});
      const event = automationEventFromRun(run, rawRun || {});
      return ingest(event);
    } catch (err) {
      console.warn("[errorMonitor] automation ingest isolated:", err?.message || err);
      return { ok: false, isolated: true, error: String(err?.message || err) };
    }
  }

  function acceptFixResult(result) {
    try {
      return dispatcher.acceptResult(result);
    } catch (err) {
      return { ok: false, isolated: true, error: String(err?.message || err) };
    }
  }

  function observePostFix() {
    try {
      return regression.observePending();
    } catch (err) {
      console.warn("[errorMonitor] observe isolated:", err?.message || err);
      return [];
    }
  }

  function drainBugFixInbox() {
    try {
      return dispatcher.drainInbox();
    } catch (err) {
      return [{ ok: false, isolated: true, error: String(err?.message || err) }];
    }
  }

  function snapshot() {
    return {
      agent: AGENT_NAME,
      permissions: permissionModel(),
      health: health.snapshot(),
      incidents: store.listIncidents().map(publicIncident),
      bugs: store.listBugs(),
      dispatched_count: store.dispatched.length,
      notifications: store.notifications.slice(-20),
      observability: observability.snapshot(),
      llm: { calls: llm.callCount, skipped: llm.skippedCount },
    };
  }

  return {
    name: AGENT_NAME,
    ingest,
    ingestAutomation,
    acceptFixResult,
    observePostFix,
    drainBugFixInbox,
    snapshot,
    store,
    health,
    observability,
    llm,
    dispatcher,
    permissions: permissionModel(),
  };
}

function publicIncident(incident) {
  return {
    incident_id: incident.incident_id,
    fingerprint: incident.fingerprint,
    status: incident.status,
    classification: incident.classification,
    subtype: incident.subtype,
    severity: incident.severity,
    first_seen: incident.first_seen,
    last_seen: incident.last_seen,
    occurrence_count: incident.occurrence_count,
    dispatch_count: incident.dispatch_count,
    bug_id: incident.bug_id,
    correlated_ids: incident.correlated_ids,
  };
}
