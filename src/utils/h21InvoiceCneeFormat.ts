/** CNEE trên invoice H21 — tách tên / địa chỉ / liên hệ, không lặp địa chỉ. */

export type H21CneeDisplay = {
  nameLine: string;
  addressLines: string[];
  phoneLine: string;
  emailLine: string;
};

const COMPANY_SUFFIX =
  /\b(?:LIMITED|LTD\.?|LLC|INC\.?|PTE\.?\s*LTD\.?|CO\.?\s*LTD\.?|COMPANY|CORP\.?|GMBH|S\.A\.?|B\.V\.?)\b/i;

const PHONE_CHUNK =
  /\+?\d[\d\s()./-]{5,}\d(?:\s*\/\s*\+?\d[\d\s()./-]{5,}\d)*/g;
const EMAIL_CHUNK = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function compact(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function compactKey(s: string): string {
  return normKey(s).replace(/\s+/g, "");
}

function normKey(s: string): string {
  return compact(s)
    .toUpperCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCompanyFromBlob(raw: string): { company: string; rest: string } {
  const text = compact(raw);
  if (!text) return { company: "", rest: "" };
  const m = text.match(new RegExp(`^(.+?${COMPANY_SUFFIX.source})\\s+(.+)$`, "i"));
  if (m && m[2]!.trim().length >= 8) {
    return { company: compact(m[1]!), rest: compact(m[2]!) };
  }
  return { company: text, rest: "" };
}

function peelContacts(raw: string): { text: string; phones: string[]; emails: string[] } {
  const phones: string[] = [];
  const emails: string[] = [];
  let text = raw;
  for (const m of raw.matchAll(EMAIL_CHUNK)) {
    if (m[0]) emails.push(compact(m[0]));
  }
  for (const m of raw.matchAll(PHONE_CHUNK)) {
    if (m[0]) phones.push(compact(m[0]));
  }
  text = text.replace(EMAIL_CHUNK, " ").replace(PHONE_CHUNK, " ");
  text = compact(text.replace(/\s*\/\s*/g, " "));
  return { text, phones: [...new Set(phones)], emails: [...new Set(emails)] };
}

function isDuplicateAddress(a: string, b: string): boolean {
  const na = normKey(a);
  const nb = normKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = compactKey(a);
  const cb = compactKey(b);
  if (ca && cb && (ca.includes(cb) || cb.includes(ca))) return true;
  if (na.length >= 12 && nb.length >= 12) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  const wa = new Set(na.split(" ").filter((w) => w.length > 2));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wa.size < 3 || wb.size < 3) return false;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap += 1;
  const ratio = overlap / Math.min(wa.size, wb.size);
  return ratio >= 0.75;
}

/** Dòng địa chỉ ngắn (vd. HUNG HOM, HONGKONG) đã nằm trong dòng dài hơn. */
function isAddressSubset(short: string, long: string): boolean {
  if (!short || !long || short.length >= long.length) return false;
  if (isDuplicateAddress(short, long)) return true;
  const cs = compactKey(short);
  const cl = compactKey(long);
  if (cs.length >= 6 && cl.includes(cs)) return true;
  const words = normKey(short)
    .split(" ")
    .filter((w) => w.length > 2);
  if (!words.length) return false;
  const nl = normKey(long);
  return words.every((w) => nl.includes(w));
}

function dedupeAddressLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines.map(compact).filter(Boolean)) {
    if (out.some((prev) => isDuplicateAddress(prev, line))) continue;
    out.push(line);
  }
  return out.filter(
    (line, i, arr) =>
      !arr.some((other, j) => j !== i && isAddressSubset(line, other))
  );
}

function mergePhones(explicit: string, extracted: string[]): string {
  const parts = [explicit, ...extracted].map(compact).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.some((x) => normKey(x) === normKey(p) || compactKey(x) === compactKey(p))) continue;
    out.push(p);
  }
  return out.join(" / ");
}

function mergeEmails(explicit: string, extracted: string[]): string {
  const parts = [explicit, ...extracted].map(compact).filter(Boolean);
  const out: string[] = [];
  for (const e of parts) {
    const key = e.toLowerCase();
    if (out.some((x) => x.toLowerCase() === key)) continue;
    out.push(e);
  }
  return out[0] ?? "";
}

export function formatH21InvoiceCneeDisplay(cnee: {
  name?: string;
  addressLines?: string[];
  phone?: string;
  email?: string;
}): H21CneeDisplay {
  const rawName = compact(cnee.name ?? "");
  const explicitPhone = compact(cnee.phone ?? "");
  const explicitEmail = compact(cnee.email ?? "");

  const peeledName = peelContacts(rawName);
  const split = splitCompanyFromBlob(peeledName.text);
  const peeledRest = peelContacts(split.rest);

  const peeledAddressLines = (cnee.addressLines ?? []).flatMap((line) => {
    const peeled = peelContacts(compact(String(line)));
    return peeled.text ? [peeled.text] : [];
  });

  const phones: string[] = [...peeledName.phones, ...peeledRest.phones];
  const emails: string[] = [...peeledName.emails, ...peeledRest.emails];
  for (const line of cnee.addressLines ?? []) {
    const peeled = peelContacts(compact(String(line)));
    phones.push(...peeled.phones);
    emails.push(...peeled.emails);
  }

  const addressLines = dedupeAddressLines([
    ...(peeledRest.text ? [peeledRest.text] : []),
    ...peeledAddressLines,
  ]);

  return {
    nameLine: split.company || peeledName.text || rawName,
    addressLines,
    phoneLine: mergePhones(explicitPhone, phones),
    emailLine: mergeEmails(explicitEmail, emails),
  };
}

/** @deprecated Dùng addressLines — giữ cho tương thích ngắn hạn. */
export function h21CneeAddressSingleLine(display: H21CneeDisplay): string {
  return display.addressLines.join(", ");
}
