# PERFORMANCE AUDIT REPORT

**Date:** 2026-09-04  
**PRE_OPTIMIZATION_COMMIT:** `13f84062ff1ef4263953a8d716616da792ae49b3`  
**Branch:** `main`

## Executive Summary

Đã audit end-to-end và áp dụng tối ưu **HIGH IMPACT + LOW RISK** cho first paint, code-splitting Stats/Recharts, CSS in tem, và export Excel. Quality gates (lint, typecheck, test, build, deploy:check) **PASS**. Không thay đổi business logic sync/mutation/DIM/H21.

## Architecture

- Frontend: React 18 + Vite 5 + TypeScript + Tailwind (hash routes)
- Backend: Express + Socket.IO + Postgres state store
- Deploy: Railway (Dockerfile), production branch `main`
- Production URL: `https://ops-production-b405.up.railway.app`

## Performance Baseline (local build, before)

| Metric | Value |
|---|---|
| Build time | ~7.92s |
| Entry JS `index-*.js` | 164.0 KB (gzip 53.3) — gồm React |
| CSS `index-*.css` | 89.4 KB (gzip 16.1) — gồm print-label |
| OpsStats page chunk | 442.3 KB (gzip 120) — gồm Recharts |
| Fonts first paint | 12 @fontsource files (Jakarta 400/600/700 + IBM Plex Mono đầy đủ) |

## Bottlenecks Found

### P0
- Font UI + Mono nạp hết trước Ops
- `print-label.css` trong `main.tsx`
- Stats gắn Recharts vào page chunk lớn

### P1
- Excel luôn `GET /api/state?full=1` kể cả cùng ngày phiên
- `manualChunks` gắn src/pages dễ “nhiễm” shared UI vào chunk lazy (đã quan sát khi thử tách recharts)
- Railway thiếu `healthcheckPath`

### P2 (chưa làm — rủi ro / scope lớn)
- Virtualize bảng Ops / catalog
- Slim JSONB blob + batch SQL mutations
- Stamp list bỏ base64 (UI picker cần ảnh)

## Optimizations Applied

1. **Font critical/deferred** — `fonts.css` chỉ Jakarta 400+600; `fonts-deferred.css` (700 + IBM Plex Mono) load sau paint qua `import()`.
2. **Print CSS** — bỏ khỏi `main.tsx`; import trong `PrintShippingLabel` (lazy).
3. **Stats charts** — `OpsStatsChartsPanel` lazy + `vendor-recharts` manualChunk; Excel stats `import()` lúc click.
4. **Vite chunks** — `vendor-react` / `vendor-recharts` / socket / excel / fonts; **không** manualChunk src pages (tránh entry import ngược).
5. **Excel Ops** — cùng ngày phiên đã sync: không `full=1`; DIM SCSC dùng `allRows` local.
6. **Railway** — `healthcheckPath = "/api/health"`, timeout 30s.
7. **Lint server** — `globalThis.crypto` trong stampId (scsc/tcs H21).
8. **Stamp list slim** — bỏ base64 khỏi list; `hasSealImage` + GET theo id; invoice `includeSeal=1`.
9. **sync-meta slim** — aggregates mặc định; detail opt-in.

## Dead Code Removed

- `AirlineLabelSettingsModal` — đã không còn trong tree (trang thật: `AirlinesLabelsPage`).
- Leftover preload `PDFButton` trong vite filter (round trước).

## API Optimization

- Tránh `GET /api/state?full=1` khi xuất Excel/DIM cùng ngày phiên đã sync.
- **Stamp H21 list** mặc định bỏ `seal_image_data` (base64); trả `hasSealImage`. Invoice dùng `?includeSeal=1`; sửa shipper dùng `GET /stamps/:id`.
- **`GET /api/sync-meta`** mặc định chỉ aggregates; `?detail=1` mới kèm mảng lots/customers.

## Bundle Optimization — After (local)

| Metric | Before | After | Notes |
|---|---:|---:|---|
| Entry JS | 164 KB (React gộp) | index 90 + vendor-react 142 + socketio 41 | Graph sạch: entry chỉ import react+socketio |
| Critical CSS | 89.4 KB | 81.2 KB | print-label tách (~6 KB theo modal) |
| OpsStats page | 442 KB | ~22 KB + charts panel 7 KB | Recharts 401 KB chỉ khi mở charts |
| Print CSS on HTML | Có (global) | Không | Chỉ theo PrintShippingLabel |
| Fonts first CSS | 12 faces | 4 faces critical | 700+Mono deferred |
| Build time | ~7.92s | ~8.0s | Tương đương |

## Database Optimization

Không đổi schema/migration (NON-DESTRUCTIVE gate: N/A).

## Tests Performed

| Gate | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run lint:server` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` (573) | PASS |
| `npm run build` | PASS |
| `npm run deploy:check` | PASS |

## Regression Test Results

- Unit/Vitest: 95 files / 573 tests PASS
- Không đổi mutation/sync/DIM business paths
- Chunk graph verified: `dist/index.html` không preload recharts / customers / print JS

## Git Commit

```text
Branch: main
Commit: 5fb5451157674cee35390ab9fe7412e7ed79ec37 (perf)
Follow-up: 466f1de (test e2e Stats aria-label)
Remote: origin https://github.com/NAMNAM1989/TECSOPS.git
```

## Railway Deployment

```text
Project: chic-nurturing (Railway)
Service: ops / production
Environment: production
Deployment: auto từ push main + healthcheck /api/health
Status: SUCCESS — GitHub commit status success
URL: https://ops-production-b405.up.railway.app
```

## Production Verification

```text
Production URL: https://ops-production-b405.up.railway.app
Health: PASS — HTTP 200 { ok:true, postgres:true }
Smoke Test:
  - Homepage 200, vendor-react + index assets mới, không page-print CSS critical
  - Browser: Ops → Khách → Stats (charts Recharts lazy OK) → Ops (A→B→C→A)
  - E2E read-only: R-HEALTH, A-OPS, A-LIVE, A-CUSTOMERS, A-STATS, A-INVALID PASS
  - E2E D-WH-* FAIL: selector cũ "TECS TECS-TCS" không khớp UI hiện tại (pre-existing, không do perf)
Performance: Critical CSS ~79 KB; print CSS tách; fonts 700/Mono deferred; Stats charts tách vendor-recharts
```

## Rollback Point

```text
PRE_OPTIMIZATION_COMMIT: 13f84062ff1ef4263953a8d716616da792ae49b3
```

## Remaining Issues

- Bảng Ops / catalog chưa virtualize
- Full-state RMW + JSONB blob trên mỗi mutation (backend P0)
- Logo TCS PNG ~669 KB; Noto TTF PDF ~1.1 MB (on-demand)

## Recommended Next Steps

1. Incremental customer diff + slim blob write (backend)
2. Virtualize LotsDetailTable / H21 catalog trước Ops grid
3. Nén `public/brand/tcs-logo.png`
