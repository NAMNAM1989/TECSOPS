# Airline Supabase Catalog Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Client lấy `public.airlines` từ Supabase làm SoT tên hãng in tem; bỏ nav/trang Hãng; nút đồng bộ thủ công.

**Architecture:** REST fetch + localStorage cache + hook; wire print/lookup; remove airlines route/nav.

**Tech Stack:** Vite env, `fetch`, React hooks, Vitest

## Global Constraints

- Chỉ đọc ACTIVE via anon RLS
- Dùng `name` đầy đủ
- Sync ghi đè cache
- Không commit secret keys
- Chỉ đụng file liên quan airlines (tránh WIP khác trên main)

---

### Task 1: Normalize + fetch + cache module

**Files:**
- Create: `src/utils/airlineCatalogFromSupabase.ts`
- Create: `src/utils/airlineCatalogFromSupabase.test.ts`
- Modify: `.env.example`

**Produces:**
- `SupabaseAirlineRow`, `AirlineCatalogCache`
- `normalizeAirlinesToLabelMaps(rows)`
- `loadAirlineCatalogCache()`, `saveAirlineCatalogCache()`, `clearAirlineCatalogCache()`
- `fetchAirlinesFromSupabase()`, `dataSupabaseConfig()`

- [ ] Tests for normalize (IATA, AWB null, trim)
- [ ] Implement module
- [ ] Document env in `.env.example`

### Task 2: Hook `useAirlineCatalog`

**Files:**
- Create: `src/hooks/useAirlineCatalog.ts`

**Produces:** `{ maps, status, syncedAt, error, refresh, ensureLoaded }`

- [ ] Auto-load when cache empty
- [ ] `refresh()` clears + fetches

### Task 3: Wire App print + remove airlines UI

**Files:**
- Modify: `src/App.tsx`, `src/hooks/useHashRoute.ts`
- Modify: `src/ui/OpsLeftRail.tsx`, `src/ui/BottomNav.tsx`, `src/ui/OpsLeftRail.test.tsx`
- Modify: `src/components/AirCargoTracking.tsx` (+ command bars / toolbar as needed)
- Delete or stop routing: `src/pages/AirlinesLabelsPage.tsx`

- [ ] Remove `airlines` route/nav
- [ ] Print uses catalog maps
- [ ] Sync button in Ops secondary UI

### Task 4: Lookup merge prefers catalog

**Files:**
- Modify: `src/utils/airlineLabelOverridesCore.ts` (or callers)

- [ ] When catalog maps present, use as base (not hardcoded defaults)
- [ ] Tests updated

### Task 5: Verify

- [ ] `npx vitest run` on touched tests
- [ ] `npm run typecheck` if feasible
