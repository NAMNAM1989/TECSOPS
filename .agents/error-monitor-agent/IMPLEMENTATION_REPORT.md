# ERROR MONITOR AGENT — IMPLEMENTATION REPORT

## Architecture

ERROR_MONITOR_AGENT là module **cộng thêm, fail-isolated** dưới `server/errorMonitor/`, bám convention `server/ai/` (ESM `.mjs`, Vitest `*.test.mjs`, đăng ký Express). Không tạo monorepo `packages/` vì repo không dùng cấu trúc đó.

Orchestrator: `createErrorMonitorAgent()` — Detect → Normalize → Sanitize → Fingerprint → Dedupe → Correlate → Classify → Severity → Evidence → BugReport → Dispatch.

Hook Express trong `server/index.mjs` bọc try/catch. Monitor hỏng không chặn `/api`, Socket.IO, hay Postgres state.

## Monitoring Sources

- Backend HTTP 5xx (Express error middleware)
- `GET /api/health` 503 (Postgres)
- Ingest API frontend/worker: `POST /api/error-monitor/events`
- Automation Playwright / ext_tcs / ext_scsc: `POST /api/error-monitor/automation`
- Worker heartbeat (HealthMonitor, stale 45s — khớp `portalJobs`)
- CLI demo: `npm run error-monitor`

Không đọc `.env` thật để “monitor”. Không scrape secret.

## Error Pipeline

1. `sanitizeSecrets` — redaction đệ quy
2. `normalizeErrorEvent` — schema Error Event
3. `fingerprintEvent` — ổn định (bỏ UUID/AWB/số động)
4. `DeduplicationEngine` — 1 fingerprint = 1 incident
5. `CorrelationEngine` — request_id / trace_id / job_id / run_id
6. Rule classify + optional LLM (hard + không storm)
7. Severity SEV-0…SEV-4
8. Evidence + BugReport
9. Dispatch 1 lần / incident (trừ regression)

## Severity Model

| Sev | Khi |
|---|---|
| SEV-0 | SECURITY_EVENT |
| SEV-1 | INFRASTRUCTURE_ERROR (DB/pool) |
| SEV-2 | SOFTWARE_ERROR 5xx, automation OUR_CODE_BUG |
| SEV-3 | EXTERNAL, automation UI ngoài |
| SEV-4 | BUSINESS_VALIDATION, USER_INPUT_ERROR |

SEV-0/1 → `requires_immediate_action` + notification escalate (cooldown).

## Deduplication

Map fingerprint → incident. 100 hoặc 10_000 event giống nhau tăng `occurrence_count`, **một** dispatch. Storm window phát `STORM_AGGREGATED`. LLM rate-limit + skip khi storm.

## Evidence Collection

HTTP, url, flow, request/trace/job ids, stack preview, automation steps/selector/page_url/screenshot/console/network, health snapshot. Đã sanitize.

Selector miss trên portal TCS/SCSC → `EXTERNAL_UI_CHANGE` (không dispatch). Hint stack `server/`/`src/` → `OUR_CODE_BUG`.

## Security

- Redact: Authorization, Bearer, JWT, cookie, password, DATABASE_URL, GEMINI/TCS/IMAP secrets, `.env` assignments
- Quyền DENY source/deploy/migrate/destructive DB/secret
- Không persist queue JSON vào git

## BUG_FIX_AGENT Integration

Sibling `bc-97b7d282-1cc4-4ac6-83b0-605afc8990ac` **chưa** có code trên main lúc audit. Dispatcher:

- `dispatch(report)` → memory + `outbox/<bug_id>.json`
- `acceptResult({ bug_id, status, root_cause, fix, verification, remaining_risk })`
- `RESOLVED` từ Bug Fix → `FIXED_PENDING_OBSERVATION` (không auto-close)
- `observePostFix()` → `RESOLVED` nếu không tái phát
- Fingerprint lại → `REGRESSION_DETECTED` + reopen
- `maxFixAttempts` (3) → `REPEATED_FIX_FAILURE` → `HUMAN_REVIEW_REQUIRED`

## Files Created / Modified

**Tạo:** `server/errorMonitor/*`, `.agents/error-monitor-agent/*`, `server/data/error-monitor/**/.gitkeep`

**Sửa:** `server/index.mjs` (hook fail-isolated), `package.json` (`error-monitor`), `.gitignore`, `.env.example`

Không đụng logic vận đơn, eSID, mutation, Postgres schema nghiệp vụ.

## Tests

Vitest `server/errorMonitor/ErrorMonitorAgent.test.mjs`:

- A Backend 500 → Bug Report + file queue
- B 100 identical → 1 incident / 1 dispatch
- C validation → no dispatch
- D Playwright selector → AUTOMATION_ERROR + EXTERNAL_UI_CHANGE
- E token redacted
- F DB down → SEV-1 + escalate
- G resolved fingerprint → REGRESSION + reopen
- H 10_000 identical → aggregate, LLM ≪ 10k

## Runtime Verification

`node server/errorMonitor/cli.mjs --demo backend-500` ghi Bug Report thật vào outbox.

## Limitations

- Store mặc định in-memory (mất khi restart process). Queue file là durable handoff.
- Chưa tail log Railway/Supabase realtime.
- LLM Gemini chưa bật mặc định (tránh storm + key).
- Frontend chưa tự `POST /api/error-monitor/events` (window.onerror) — hook sẵn API.
- Không phân biệt multi-replica (Railway single replica hiện tại).

## Recommended Next Steps

1. Khi BUG_FIX_AGENT land: map adapter đúng schema của họ, giữ file queue làm fallback.
2. Optional Postgres ring-buffer cho incidents (tách `app_state`).
3. Frontend reporter (sanitize trước khi gửi).
4. Dashboard nhẹ trên Ops (SEV, open incidents) — chỉ đọc.
5. Wire portal worker heartbeat thật vào `health.beatWorker`.
