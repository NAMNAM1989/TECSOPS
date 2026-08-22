# BugFixAgent (TECSOPS)

Autonomous debugger for this repo — not a chatbot wrapper. Smallest safe addition: a skill + a TypeScript module that follows existing Vitest / `src/` conventions.

## Run

```bash
npm run bugfix:agent -- --report "add(1,2) returns -1"
npm run bugfix:agent -- --report-file ./tmp/bug.json
npm test -- src/agents/bugFix/bugFixAgent.test.ts
```

Default: **do not** auto-commit, deploy, force-push, or touch production env/auth.

Session files (local only): `.tecsops/bug-fix-agent/` (gitignored).

## Layout

- `src/agents/bugFix/` — state machine, permissions, diagnoser, persistence, Playwright hooks
- `.agents/skills/bug-fix-agent/SKILL.md` — operator / agent skill (mirrored in `.cursor/skills/`)
- `scripts/bug-fix-agent.ts` — Node CLI host (`tsx`, same pattern as `sample:day-report`)

## Workflow

`RECEIVED → COLLECTING_CONTEXT → REPRODUCING → DIAGNOSING → ROOT_CAUSE_IDENTIFIED → IMPACT_ANALYSIS → FIX_PLANNING → IMPLEMENTING → STATIC_CHECK → TESTING → RUNTIME_VERIFYING → REGRESSION_CHECK → RESOLVED`

Also: `BLOCKED | NEEDS_APPROVAL | FAILED | NEEDS_REVIEW`. Unconfirmed repro → `REPRODUCTION_NOT_CONFIRMED` (root cause not proven).

## Permissions

| Class | Allowed |
|---|---|
| READ | source, git status/diff/log, logs, test output, DB schema, DB read-only, browser console/network when a Playwright host is provided |
| WRITE | source, tests, non-sensitive local config — never `.env` / secrets |
| EXECUTE | typecheck, lint, tests, Playwright, build, allowlisted terminal |

Protected ops always stop at **NEEDS_APPROVAL**: production deploy, destructive DB reset/migration, delete production data, production env, expose secrets, force push, history rewrite, weaken auth.

## Verification

Prefer targeted, then `npm run typecheck` / `lint` / `test` / `test:e2e*` / `build` as impact requires. UI bugs must re-run the user workflow (Đăng Nhập TCS, not “ĐN”).

`RESOLVED` only when reproduction or strong evidence, root cause identified, fix applied, targeted + relevant static checks pass, runtime/regression OK, no new security/data-integrity issue.

## ERROR_MONITOR_AGENT (later)

Emit `{ source: "ERROR_MONITOR_AGENT", error_id, message, stack, module, file, timestamp }`.

Call `bugReportFromMonitorEvent(event)` then `runBugFixAgent(report, { host, store })`. Similar historical bugs may inform diagnosis; never auto-apply an old fix.
