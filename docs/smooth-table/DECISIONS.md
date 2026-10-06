# QUYẾT ĐỊNH THỰC HIỆN (DECISIONS)

Tài liệu ghi lại các quyết định kỹ thuật và giải pháp khi gặp điểm mơ hồ.
Các hằng số đã duyệt tại `src/config/tableUx.ts`:
- `OUTBOX_DEBOUNCE_MS = 150`
- `OUTBOX_FLUSH_SIZE = 10`
- `DEFAULT_SCROLL_MODE = 'normal'`
- `ENABLE_SPACE_PAGE_FLIP = false`
- `PAGE_FLIP_DURATION_MS = 220`, easing `cubic-bezier(.2,.8,.2,1)`
- `MOBILE_SNAP = 'proximity'`
- `VIRTUALIZE_THRESHOLD = 100` dòng
- `PASTE_CREATES_ROWS = false`
- `UNDO_LIMIT = 20`
- Thứ tự cột: `awb → hawb → flight → flightDate → dest → pcs → kg → dimKg → customer → note`
