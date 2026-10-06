/**
 * Cấu hình UX cho bảng nhập liệu mượt (Smooth Table)
 * Các hằng số được duyệt dùng chung giữa desktop table, navigation hook, outbox, và mobile cards.
 */

export const OUTBOX_DEBOUNCE_MS = 150;
export const OUTBOX_FLUSH_SIZE = 10;

export type ScrollMode = 'normal' | 'page-flip';
export const DEFAULT_SCROLL_MODE: ScrollMode = 'normal';

export const ENABLE_SPACE_PAGE_FLIP = false;
export const PAGE_FLIP_DURATION_MS = 220;
export const PAGE_FLIP_EASING = 'cubic-bezier(.2,.8,.2,1)';

export type MobileSnap = 'proximity' | 'mandatory';
export const MOBILE_SNAP: MobileSnap = 'proximity';

export const VIRTUALIZE_THRESHOLD = 100;
export const PASTE_CREATES_ROWS = false;
export const UNDO_LIMIT = 20;

export const TABLE_COLUMN_ORDER = [
  'awb',
  'hawb',
  'flight',
  'flightDate',
  'dest',
  'pcs',
  'kg',
  'dimKg',
  'customer',
  'note',
] as const;

export type TableGridField = (typeof TABLE_COLUMN_ORDER)[number];
