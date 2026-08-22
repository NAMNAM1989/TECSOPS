# ERROR_MONITOR_AGENT

Agent quan sát lỗi production-grade của TECSOPS. **Không sửa mã nghiệp vụ.** **Không giấu lỗi.** **Không lộ secret.**

Runtime: `server/errorMonitor/` (cùng convention Express ESM + Vitest với `server/ai/`).

Live ops (tham chiếu): https://ops-production-b405.up.railway.app/#/

## Audit (trước khi implement)

Đã đọc repo NAMNAM1989/TECSOPS tại `main` (`4a6b48f`):

| Hạng mục | Kết quả |
|---|---|
| Stack | React 18 + Vite + TS frontend; Express ESM (`server/*.mjs`) + Socket.IO; Postgres `app_state`; Vitest; Playwright (QA, không phải đường ops ngày); Railway Docker `chic-nurturing` / `ops-production-b405` |
| Health | `GET /api/health` — bắt buộc Postgres `SELECT 1`. HTTP 200 ≠ đủ healthy |
| Auth | `TECSOPS_APP_TOKEN` + cookie session (`server/appAuth.mjs`) |
| AI sẵn có | Gemini `server/ai/` + `ops_ai_events` (sanitize key nhạy cảm, rate-limit) |
| Automation | Ext-first `chrome-extension` / `-tcs` / `-scsc`; portal worker heartbeat 45s; TCS agent proxy |
| Agents | Chỉ có `.agents/skills/tecsops-project-auditor`. **Không có packages/**. **Không có BUG_FIX_AGENT trên main hoặc nhánh** (sibling cloud agent `bc-97b7d282-1cc4-4ac6-83b0-605afc8990ac` vẫn RUNNING, chưa push contract) |
| Logging | `console.error` rải rác; Express error middleware trả 500 an toàn ở production |
| CI | `.github/workflows/ci.yml` → `npm run ci` (lint + build + test + deploy:check) |

Vì BUG_FIX_AGENT chưa land: dispatcher dùng **interface sạch + file queue** (`outbox/`) để Grok Bot / Bug Fix consume.

## Pipeline

```
APPLICATION
  → Detect → Normalize → Sanitize → Fingerprint
  → Deduplicate → Correlate → Classify → Severity
  → Evidence → Bug Report → Dispatch (BUG_FIX_AGENT)
  → acceptFixResult → FIXED_PENDING_OBSERVATION
  → observePostFix → RESOLVED  |  REGRESSION_DETECTED → dispatch lại
  → REPEATED_FIX_FAILURE → HUMAN_REVIEW_REQUIRED
```

Monitor **fail-isolated**: lỗi pipeline không crash Express.

## Phân loại & dispatch

Chỉ bàn giao lớp phù hợp:

- **Có:** `SOFTWARE_ERROR`, `INFRASTRUCTURE_ERROR`, `AUTOMATION_ERROR` (OUR_CODE_BUG), `SECURITY_EVENT`, `UNKNOWN` nghiêm
- **Không:** `BUSINESS_VALIDATION`, `USER_INPUT_ERROR`, `EXTERNAL_SERVICE_ERROR`, `EXTERNAL_UI_CHANGE`

`probable_cause` = giả thuyết. Bug Fix làm RCA.

## File queue contract (BUG_FIX_AGENT)

### Error Monitor → Bug Fix (`outbox/<bug_id>.json`)

```json
{
  "kind": "BUG_REPORT",
  "consumed_by": "BUG_FIX_AGENT",
  "report": {
    "bug_id": "bug_…",
    "created_by": "ERROR_MONITOR_AGENT",
    "severity": "SEV-2",
    "classification": "SOFTWARE_ERROR",
    "status": "OPEN",
    "summary": "…",
    "first_seen": "ISO",
    "last_seen": "ISO",
    "occurrence_count": 1,
    "affected": { "service": "tecsops", "module": "stateStore" },
    "error": { "type": "Error", "message": "…", "stack_trace": "…", "http": {} },
    "reproduction_context": {},
    "evidence": {},
    "suspected_area": "stateStore",
    "monitor_analysis": {
      "probable_cause": "hypothesis only",
      "confidence": 0.4
    },
    "requires_immediate_action": false
  }
}
```

### Bug Fix → Error Monitor (`inbox/<bug_id>.json` hoặc `POST /api/error-monitor/fix-result`)

```json
{
  "bug_id": "bug_…",
  "status": "RESOLVED",
  "root_cause": "…",
  "fix": { "summary": "…", "files": [] },
  "verification": { "tests": [], "passed": true },
  "remaining_risk": "…"
}
```

`status: RESOLVED` từ Bug Fix **không** đóng bug. Monitor chuyển `FIXED_PENDING_OBSERVATION`, rồi `RESOLVED` sau cửa sổ quan sát. Fingerprint quay lại → `REGRESSION_DETECTED` + reopen.

Nếu BUG_FIX_AGENT land contract khác: adapter tại `server/errorMonitor/bugFixDispatcher.mjs` — **không** copy logic sửa code.

## HTTP

| Method | Path | Auth | Việc |
|---|---|---|---|
| GET | `/api/error-monitor/health` | không | Health components (không chỉ HTTP 200) |
| GET | `/api/error-monitor/status` | app token | Incidents, bugs, LLM stats |
| POST | `/api/error-monitor/events` | app token | Ingest error event |
| POST | `/api/error-monitor/automation` | app token | Ingest Playwright/ext run |
| POST | `/api/error-monitor/fix-result` | app token | Nhận kết quả Bug Fix |

Hook sẵn: Express 5xx middleware + `/api/health` 503 (DB down).

## Chạy

```bash
npm run error-monitor
npx vitest run server/errorMonitor/ErrorMonitorAgent.test.mjs
```

## Quyền

- READ: logs, health, deploy metadata
- CREATE: events, incidents, bug reports, notifications
- LIMITED execute: health check, diagnostic, screenshot/trace
- DENY: sửa source, prod deploy, migration, destructive DB, đổi secret

## System prompt

Xem `SYSTEM_PROMPT.md`.
