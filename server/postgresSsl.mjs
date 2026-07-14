/**
 * SSL cho `pg` Pool:
 * - local / railway.internal / sslmode=disable → tắt SSL
 * - Railway public / cloud khác → SSL (rejectUnauthorized: false)
 */
export function postgresSslOption(databaseUrl) {
  const url = String(databaseUrl ?? "");
  if (!url) return false;
  if (/sslmode=disable/i.test(url)) return false;
  if (process.env.PGSSLMODE?.trim().toLowerCase() === "disable") return false;
  if (/localhost|127\.0\.0\.1/i.test(url)) return false;
  if (url.includes("railway.internal")) return false;
  return { rejectUnauthorized: false };
}
