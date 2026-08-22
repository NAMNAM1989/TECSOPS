# ErrorMonitorAgent (TECSOPS)

Observability agent — không sửa mã nghiệp vụ, không giấu lỗi, không lộ secret.

## Run

```bash
npm run error-monitor
npm run error-monitor -- --demo db-down --no-bugfix
npm test -- src/agents/errorMonitor/errorMonitorAgent.test.ts
```

Session files (local only): `.tecsops/error-monitor-agent/` (gitignored).

## Layout

- `src/agents/errorMonitor/` — pipeline host-inject, không Node API trong core
- `.agents/skills/error-monitor-agent/SKILL.md` — mirrored in `.cursor/skills/`
- `scripts/error-monitor-agent.ts` — Node CLI host (`tsx`)
- `server/errorMonitor/index.mjs` — Express collector fail-isolated (ghi inbox, không sửa business)

## Handshake BUG_FIX_AGENT

Canonical type from `src/agents/bugFix/types.ts`:

```ts
type ErrorMonitorEvent = {
  source: "ERROR_MONITOR_AGENT";
  error_id: string;
  message: string;
  stack?: string;
  module?: string;
  file?: string;
  timestamp: string;
};
```

Dispatcher: `toErrorMonitorEvent` → `bugReportFromMonitorEvent(event)` → `runBugFixAgent(report, { host, store })`.

Internal model (fingerprint, severity, evidence, occurrence_count, classification) stays richer. Dispatch maps down.

`BugFixOutput.status === RESOLVED` → `FIXED_PENDING_OBSERVATION`, rồi `RESOLVED` sau observation window. Fingerprint quay lại → `REGRESSION_DETECTED` + reopen. Lặp fail → `HUMAN_REVIEW_REQUIRED`.
