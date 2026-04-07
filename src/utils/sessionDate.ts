/** Ngày phiên làm việc theo lịch máy (bảng theo ngày), định dạng YYYY-MM-DD */

export function formatLocalSessionDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseSessionDateYmd(ymd: string): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  if (!y || !mo || !d) return new Date();
  return new Date(y, mo - 1, d);
}

/** Đầu ngày local (00:00) */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addLocalDays(d: Date, delta: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
  return x;
}
