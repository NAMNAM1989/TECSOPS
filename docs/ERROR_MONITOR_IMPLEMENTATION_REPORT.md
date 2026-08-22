# ERROR MONITOR AGENT — IMPLEMENTATION REPORT (post Bug Fix handshake)

## Architecture

Canonical module: `src/agents/errorMonitor/` — cùng pattern `src/agents/bugFix/`:

- TypeScript, **không Node API trong core**
- Host-inject (`ErrorMonitorHost`: `now`, `randomId`, `persist`)
- CLI Node: `scripts/error-monitor-agent.ts` (`tsx`)
- Skill: `.agents/skills/error-monitor-agent/` + `.cursor/skills/`
- Session: `.tecsops/error-monitor-agent/` (gitignored)
- Express: `server/errorMonitor/index.mjs` chỉ **collector** fail-isolated (ghi inbox)

Merge `cursor/bug-fix-agent-90ac` để dùng type/contract thật.

## Monitoring Sources

Inbox Express 5xx + `/api/health` 503 + `POST /api/error-monitor/events` + CLI demo. Full pipeline (classify/dedupe/dispatch) chạy trong TS agent.

## Error Pipeline

`Detect → Normalize → Sanitize → Fingerprint → Dedupe → Correlate → Classify → Severity → Evidence → toErrorMonitorEvent → bugReportFromMonitorEvent → runBugFixAgent`

Internal model giữ fingerprint, severity, occurrence_count, classification, evidence.

## Severity / Dedup / Security

SEV-0…4 như trước. 100 / 10_000 event giống nhau = 1 incident. Redact Bearer/JWT/cookie/.env. DENY source/deploy/migrate.

## BUG_FIX_AGENT Integration

Import thật:

```ts
import { bugReportFromMonitorEvent, runBugFixAgent } from "../bugFix";
```

`ErrorMonitorEvent.source` bắt buộc `"ERROR_MONITOR_AGENT"`.

`BugFixOutput.status === RESOLVED` → `FIXED_PENDING_OBSERVATION` → `RESOLVED` sau observation. Regression reopen + re-dispatch. `maxFixAttempts` → `HUMAN_REVIEW_REQUIRED`.

## Files

**Tạo:** `src/agents/errorMonitor/*`, `scripts/error-monitor-agent.ts`, skills, `docs/error-monitor-agent.md`

**Sửa:** `server/errorMonitor/index.mjs` (thin collector), `package.json`, `server/index.mjs` hooks giữ nguyên API

**Xóa:** pipeline `.mjs` cũ dưới `server/errorMonitor/` (trừ adapter)

## Tests

`src/agents/errorMonitor/errorMonitorAgent.test.ts` — A–H + handshake `bugReportFromMonitorEvent`.

## Limitations

Express collector không chạy `tsc` pipeline in-process (server là `.mjs`). CLI / Vitest là runtime đầy đủ. Khi PR #43 merge vào main, import path đã sẵn.
