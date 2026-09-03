# PERFORMANCE PLAN — TECSOPS

**PRE_OPTIMIZATION_COMMIT:** `13f84062ff1ef4263953a8d716616da792ae49b3`  
**Branch:** `main`  
**Baseline build:** ~7.92s · First JS entry `index-*.js` ~160 KB (~53 KB gzip) · CSS ~89 KB · OpsStats ~442 KB · PDF chunk ~1 MB · Excel ~939 KB

## Priority

### P0 CRITICAL (HIGH IMPACT + LOW RISK) — làm ngay
1. **Font subset** — Ops chỉ nạp Plus Jakarta 400+600 (latin+vi); bỏ IBM Plex Mono khỏi first paint (lazy/`font-display` hoặc chỉ weight cần cho mono AWB).
2. **Đưa `print-label.css` khỏi `main.tsx`** — iframe in đã inject CSS raw.
3. **Tách Recharts** — `manualChunks` vendor-recharts + lazy `OpsStatsCharts`; tránh preload.

### P1 HIGH
4. **Export Excel** — không `GET /api/state?full=1` khi cùng ngày phiên đã sync.
5. **`railway.toml` healthcheckPath** `/api/health`.
6. **Stamp H21 list** — không trả `seal_image_data` trong list (lấy theo id khi cần).
7. **Dead code** — filter `PDFButton` leftover trong vite; artifact tmp nếu có; không xóa modal chưa chắc.

### P2 MEDIUM (không làm trong vòng này nếu rủi ro)
- Virtualize Ops table / LotsDetailTable
- Slim JSONB blob write / batch SQL mutations
- Shared pg.Pool
- Bỏ socket trên catalog-only routes

### P3 LOW / KEEP
- Không đụng `useShipmentSync` merge/optimistic, DIM bulk, Sheet apply, invoice H21 business logic

## Execution order
Fonts → print CSS → vite chunks/stats → excel fetch → railway health → stamp list → dead leftover → build/test → commit/push/deploy
