import { rawAwbDigits } from "../shared/awbFormat.mjs";
import { compactSearchAlnum, foldSearchText } from "../shared/searchNormalize.mjs";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const WAREHOUSE_SET = new Set(["TECS-TCS", "TECS-SCSC", "TCS", "SCSC"]);
const SEARCH_WINDOW_DAYS = 30;
const LIMIT_MAX = 40;
const LIMIT_DEFAULT = 20;

export function todayYmdAsiaSaigon(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Saigon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function addYmdDays(ymd, delta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!m) return "";
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(delta) || 0);
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function clampYmd(raw, fallback) {
  const s = String(raw ?? "").trim();
  return YMD_RE.test(s) ? s : fallback;
}

function likeSafe(s) {
  return String(s ?? "").replace(/[%_]/g, "");
}

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(n), 1), LIMIT_MAX);
}

const MONTHS3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function normalizeFlightDateToken(raw) {
  const s0 = String(raw ?? "").trim();
  if (!s0) return "";
  const slash = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s0);
  if (slash) {
    const day = parseInt(slash[1], 10);
    const mon = parseInt(slash[2], 10);
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      return `${String(day).padStart(2, "0")}${MONTHS3[mon - 1]}`;
    }
  }
  const compact = s0.replace(/\s+/g, "").toUpperCase();
  const m = /^(\d{1,2})([A-Z]{3})(?:\d{2,4})?$/.exec(compact);
  if (!m) return "";
  const day = parseInt(m[1], 10);
  const mon = m[2];
  if (!MONTHS3.includes(mon) || day < 1 || day > 31) return "";
  return `${String(day).padStart(2, "0")}${mon}`;
}

export function parseGlobalSearchParams(query = {}, now = new Date()) {
  const toDefault = todayYmdAsiaSaigon(now);
  const fromDefault = addYmdDays(toDefault, -SEARCH_WINDOW_DAYS);
  const q = String(query.q ?? "").trim();
  const fold = foldSearchText(q);
  const digits = rawAwbDigits(q);
  const tokens = fold ? fold.split(/\s+/).filter(Boolean) : [];
  const flightTokens = tokens.map((t) => normalizeFlightDateToken(t)).filter(Boolean);
  const flightOnly = tokens.length > 0 && flightTokens.length === tokens.length;
  const from = clampYmd(query.from, fromDefault);
  const to = clampYmd(query.to, toDefault);
  if (from && to && from > to) {
    return parseGlobalSearchParams({ ...query, from: to, to: from }, now);
  }
  return {
    q,
    fold,
    digits,
    tokens,
    flightDate: flightOnly ? flightTokens[0] : "",
    from,
    to,
    excludeSession: clampYmd(query.excludeSession, ""),
    limit: clampLimit(query.limit),
  };
}

export function isSearchQueryTooShort(parsed) {
  if (parsed.flightDate) return false;
  if (parsed.digits.length >= 3) return false;
  return parsed.fold.length < 3;
}

function normalizeWarehouse(raw) {
  const u = String(raw ?? "").trim().toUpperCase();
  return WAREHOUSE_SET.has(u) ? u : "TECS-TCS";
}

export function resolveLotSearchKind(row, parsed) {
  const digits = parsed.digits;
  if (digits.length >= 3) {
    const hawb = rawAwbDigits(row.hawb);
    if (hawb && hawb.includes(digits)) return "hawb";
    const awb = String(row.awb_digits || rawAwbDigits(row.awb) || "");
    if (awb.includes(digits)) return "mawb";
  }
  if (parsed.flightDate && normalizeFlightDateToken(row.flight_date) === parsed.flightDate) {
    return "flightDate";
  }
  const q = parsed.fold;
  if (q && foldSearchText(row.shipper_name_print).includes(q)) return "shipper";
  if (q && foldSearchText(row.consignee_name_print).includes(q)) return "cnee";
  if (q && foldSearchText(row.goods_description_print).includes(q)) return "goods";
  if (q && (foldSearchText(row.customer).includes(q) || foldSearchText(row.customer_code).includes(q))) {
    return "customer";
  }
  return "other";
}

function lotHitFromRow(row, parsed) {
  const awb = String(row.awb ?? "").trim() || "—";
  const hawb = String(row.hawb ?? "").trim();
  const kind = resolveLotSearchKind(row, parsed);
  const dest = String(row.dest ?? "").trim();
  const sessionDate = String(row.session_date ?? "").trim();
  const bits = [sessionDate, dest].filter(Boolean);
  return {
    type: "lot",
    id: String(row.id ?? "").trim(),
    sessionDate,
    awb,
    dest,
    warehouse: normalizeWarehouse(row.warehouse),
    kind,
    label: hawb ? `${awb} / ${hawb}` : awb,
    sublabel: bits.join(" · ") || undefined,
  };
}

export async function searchLots(client, parsed) {
  const params = [parsed.from, parsed.to];
  const where = [`session_date >= $1`, `session_date <= $2`];
  if (parsed.excludeSession) {
    params.push(parsed.excludeSession);
    where.push(`session_date <> $${params.length}`);
  }

  if (parsed.flightDate && parsed.tokens.every((t) => normalizeFlightDateToken(t))) {
    params.push(parsed.flightDate);
    where.push(`upper(regexp_replace(coalesce(flight_date, ''), '\\s+', '', 'g')) LIKE '%' || $${params.length} || '%'`);
  } else {
    const tokenClauses = [];
    for (const token of parsed.tokens.length ? parsed.tokens : parsed.fold ? [parsed.fold] : []) {
      const compact = compactSearchAlnum(token);
      const digitTok = rawAwbDigits(token);
      const ors = [];
      params.push(`%${likeSafe(token)}%`);
      ors.push(`search_norm LIKE $${params.length}`);
      if (digitTok.length >= 3) {
        params.push(`%${likeSafe(digitTok)}%`);
        ors.push(`awb_digits LIKE $${params.length}`);
        ors.push(`regexp_replace(coalesce(hawb, ''), '[^0-9]', '', 'g') LIKE $${params.length}`);
      } else if (compact.length >= 3) {
        params.push(`%${likeSafe(compact)}%`);
        ors.push(`search_norm LIKE $${params.length}`);
      }
      tokenClauses.push(`(${ors.join(" OR ")})`);
    }
    if (tokenClauses.length) where.push(tokenClauses.join(" AND "));
    else return [];
  }

  params.push(parsed.limit);
  const res = await client.query(
    `
    SELECT id, session_date, awb, hawb, dest, warehouse, flight_date,
           customer, customer_code, shipper_name_print, consignee_name_print,
           goods_description_print, awb_digits
    FROM shipments
    WHERE ${where.join(" AND ")}
    ORDER BY session_date DESC, warehouse ASC, stt ASC
    LIMIT $${params.length}
    `,
    params
  );
  return res.rows.map((row) => lotHitFromRow(row, parsed)).filter((h) => h.id);
}

export async function searchCustomers(client, parsed, limit) {
  if (parsed.fold.length < 2) return [];
  const like = `%${likeSafe(parsed.fold)}%`;
  const res = await client.query(
    `
    SELECT id, code, name
    FROM customers
    WHERE lower(code) LIKE $1 OR lower(name) LIKE $1
    ORDER BY code ASC
    LIMIT $2
    `,
    [like, limit]
  );
  return res.rows.map((r) => ({
    type: "customer",
    id: String(r.id ?? "").trim(),
    code: String(r.code ?? "").trim(),
    name: String(r.name ?? "").trim(),
  })).filter((h) => h.id);
}

export async function searchH21Goods(client, parsed, limit) {
  if (parsed.fold.length < 2) return [];
  const like = `%${likeSafe(parsed.fold)}%`;
  const res = await client.query(
    `
    SELECT id, description, hs_code, warehouse_scope
    FROM (
      SELECT id, description, hs_code, warehouse_scope, category FROM scsc_h21_goods WHERE active = true
      UNION ALL
      SELECT id, description, hs_code, warehouse_scope, category FROM tcs_h21_goods WHERE active = true
    ) g
    WHERE lower(coalesce(description, '')) LIKE $1
       OR lower(coalesce(hs_code, '')) LIKE $1
       OR lower(coalesce(category, '')) LIKE $1
    ORDER BY description ASC
    LIMIT $2
    `,
    [like, limit]
  );
  return res.rows
    .map((r) => ({
      type: "h21",
      id: String(r.id ?? "").trim(),
      description: String(r.description ?? "").trim(),
      hsCode: String(r.hs_code ?? "").trim(),
      warehouseScope: r.warehouse_scope === "TCS" ? "TCS" : "SCSC",
    }))
    .filter((h) => h.id);
}

export async function runGlobalSearch(client, query, now = new Date()) {
  const parsed = parseGlobalSearchParams(query, now);
  if (isSearchQueryTooShort(parsed)) {
    return { hits: [], from: parsed.from, to: parsed.to };
  }
  const lotLimit = parsed.limit;
  const extraLimit = Math.min(8, parsed.limit);
  const [lots, customers, h21] = await Promise.all([
    searchLots(client, parsed),
    searchCustomers(client, parsed, extraLimit).catch(() => []),
    searchH21Goods(client, parsed, extraLimit).catch(() => []),
  ]);
  const hits = [...lots.slice(0, lotLimit), ...customers, ...h21];
  return { hits, from: parsed.from, to: parsed.to };
}
