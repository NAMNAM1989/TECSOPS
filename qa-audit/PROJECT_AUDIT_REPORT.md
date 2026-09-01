# PROJECT AUDIT REPORT

**Project:** TECSOPS / AirCargo_OPS  
**Date:** 2026-09-01  
**Method:** Master prompt — discovery → map → inventory → baseline → audit → incremental repair → regression  
**Code baseline HEAD before this audit batch:** `85c4fee` (Escape modal / print ErrorBoundary / DELETE idempotent)

---

## Executive Summary

```text
Overall Health:     SAFE WITH WARNINGS
Architecture:       Stable (React/Vite + Express + Socket.IO + Postgres)
Business Logic:     Core Ops paths consistent; Sheet apply previously under-secured
State Management:   Improved (mutate serialize + stateRef); offline queue UX still soft
Database:           Postgres relational + app_state; schema OK for current model
Security:           P0 sheets/lookup auth fixed this batch; shared-token single-tenant remains
Test Coverage:      Strong unit/contract; E2E smoke not re-run against production in this pass
Maintainability:    Good after portal removal; leftover printerProfiles / local automation dirs
```

---

## Architecture map (runtime)

```text
User (Ops / Customers / Stats)
  → App.tsx + hash route (#/ | #/customers | #/stats)
  → AirCargoTracking / CustomersPage / OpsStatsPage
  → useShipmentSync
      → GET /api/state (scoped)
      → POST /api/mutation(s) (auth + rate limit)
      → Socket.IO sync (scoped per socket)
      → Postgres (postgresStateStore)
  → Sheets modal → /api/sheets/book/* (now requireAuth)
  → Print overlay → PrintShippingLabel + AppErrorBoundary
```

---

## Feature inventory (core)

| ID | Feature | Entry | Risk notes |
|----|---------|-------|------------|
| F001 | Auth gate | AppAuthGate | Shared `TECSOPS_APP_TOKEN` |
| F002 | Ops day board | AirCargoTracking | Session-scoped sync |
| F003 | Warehouse filter | warehouses.ts | Dual normalize server/client |
| F004 | Search | shipmentSearch | — |
| F005 | Inline edit / CRUD | mutate | Race mitigated (batch1) |
| F006 | Booking ADD | AirCargoTracking | Serialized mutate |
| F007 | Delete lot | mutate DELETE | Idempotent |
| F008 | Print label | PrintShippingLabel | ErrorBoundary + in-tree host |
| F009 | CSD PDF | CsdPrintModal | — |
| F010 | DIM modal | MobileDimKgModal | Lazy |
| F011 | Sheet import | GoogleSheetImportModal | Auth + scoped emit fixed |
| F012 | Excel export | DayExcelExportDialog | Escape fixed prior |
| F013 | Day report image | cargoDayReportImage | — |
| F014 | Airline label names | AirlineLabelSettingsModal | Escape fixed prior |
| F015 | Customers directory | CustomersPage | Dual validators |
| F016 | Stats | OpsStatsPage | full scope |
| F017 | Live socket | useShipmentSync | omitCustomers supported |
| F018 | Lookup API | /api/lookup/* | Auth fixed; **no UI caller** |

---

## Baseline (before this batch)

```text
Lint:       PASS (src + server)
Typecheck:  PASS
Unit:       504/504 PASS (81 files)
Build:      (run after fixes)
E2E:        not re-executed this session
```

## After batch 1

```text
Lint:       PASS
Typecheck:  PASS
Unit:       505/505 PASS (82 files) — +sheetsLookupAuth
Build:      PASS
```

---

## Issues

### Critical (P0) — fixed this batch

| ID | Problem | Fix |
|----|---------|-----|
| SEC-01 | `/api/sheets/*` không `requireAuth` — đọc Sheet + mutate state | `requireAuth` trên mọi sheets route |
| SEC-02 | `/api/lookup/*` public PII | `requireAuth` trên mọi lookup route |

### High (P1) — fixed this batch

| ID | Problem | Fix |
|----|---------|-----|
| SEC-03 | Sheet apply `io.emit("sync", full state)` | `attachDbSyncedAt` + `emitScopedSync`; response `projectAppState(sessionDate)` |
| SYNC-01 | Optimistic mutate stale `state` + rapid ADD race | `stateRef` + `mutateChainRef` serialize |

### Medium / Low — remaining

| ID | Sev | Problem | Status |
|----|-----|---------|--------|
| SYNC-02 | P2 | Offline replay fail chỉ `debugWarn` | UNRESOLVED — cần toast/status rõ |
| SYNC-03 | P2 | `pickNewerState` theo version có thể giữ optimistic cũ | UNRESOLVED — monitor |
| SYNC-04 | P3 | `setSyncScope` fail im lặng | UNRESOLVED |
| MUT-01 | P2 | Client thiếu `REORDER_SESSION` type | Server-only via sheets — document OK |
| DUP-01 | P3 | `normalizeWarehouse` ×3 | UNRESOLVED — consolidate later |
| DUP-03 | P3 | Customer validation dual client/server | Contract tests exist; shared module optional |
| DEAD-01 | P3 | `printerProfiles*` dead (strip + test-only UI) | LIKELY_DEAD — SAFE delete pending protocol |
| DEAD-02 | P3 | `tcs-awb-automation/` local leftover | gitignored — DO_NOT_SHIP |
| DEAD-03 | P4 | Copy “eSID” trong CustomerSavedProfilesEditor | Cosmetic |
| SEC-04 | P2 | Single shared token (no RBAC) | By design single-tenant |

### Prior QA (already fixed before this audit)

BUG-001/002/003 Escape modals · BUG-004 print portal · BUG-005 DELETE idempotent + safe toast messages.

---

## Fixed Bugs (this batch)

### SEC-01 / SEC-02
- **Root cause:** Sheets/lookup registered without auth middleware while state/mutation required auth.
- **Fix:** Pass `appAuth.requireAuth` into `registerSheetsRoutes` / `registerLookupRoutes`.
- **Files:** `server/index.mjs`, `server/sheets/sheetsRoutes.mjs`, `server/lookupRoutes.mjs`
- **Tests:** `server/sheetsLookupAuth.test.mjs`

### SEC-03
- **Root cause:** Apply path used raw `io.emit("sync", state)`.
- **Fix:** Same path as `/api/mutation` — scoped emit + projected response state.
- **Files:** `server/sheets/sheetsRoutes.mjs`

### SYNC-01
- **Root cause:** `mutate` closed over React `state`; concurrent calls lost updates.
- **Fix:** Always read/write `stateRef`; chain mutations through `mutateChainRef`.
- **Files:** `src/hooks/useShipmentSync.ts`

### MUT-02 (partial)
- **Root cause:** Client ADD/UPDATE AWB not `formatAwb` like server.
- **Fix:** Align client `applyShipmentMutation` with server formatting + ADD error message.
- **Files:** `src/utils/shipmentMutations.ts`

---

## Removed Code

```text
Files removed:        0 (this batch — security/correctness first)
Functions removed:    0
Dependencies removed: 0
Approximate LOC removed: 0
```

Dead-code candidates documented above; not deleted without SAFE DELETE protocol.

---

## Remaining Risks

1. **Single shared app token** — anyone with cookie/token can mutate all lots.
2. **Offline queue** — local-optimistic may diverge until reconnect succeeds; weak user signal.
3. **`printerProfiles` + `tcs-awb-automation` + chrome-ext zip leftovers** — clutter / confusion, not runtime Ops path.
4. **E2E against production** — not re-run in this pass after auth change (Sheet UI already uses `credFetch` — expected OK).
5. **Warehouse normalize drift** — three copies; low immediate risk.

---

## Test Result

```text
Lint:         PASS
Typecheck:    PASS
Unit:         505/505 PASS
Integration:  HTTP mutation smoke + auth gate PASS
E2E:          NOT RUN this session
Build:        PASS
```

---

## Before vs After

```text
Metric                  BEFORE              AFTER
------------------------------------------------------
Lint errors             0                   0
Type errors             0                   0
Test failures           0                   0
Test count              504                 505
Unauth sheets mutate    YES (P0)            NO
Unauth lookup PII       YES (P0)            NO
Sheet full sync emit    YES (P1)            NO (scoped)
Mutate stale-state race HIGH risk           Serialized + stateRef
Known critical bugs     2 (SEC-01/02)       0 open P0
Build status            PASS                PASS
```

---

## Final Assessment

```text
SAFE WITH WARNINGS
```

Ops core is consistent and baseline green. Critical unauthenticated Sheet/lookup APIs and full-state sheet broadcast are fixed. Remaining items are maintainability, offline UX, and single-tenant auth model — không chặn deploy nếu token/CORS/DB đã đúng production.

**Next recommended batches (optional):**
1. Toast khi offline queue replay fail / setSyncScope fail  
2. SAFE delete `printerProfiles*` + stale `shared/README` ESID line  
3. Shared `normalizeWarehouse`  
4. Production E2E smoke Sheet import + rapid booking
