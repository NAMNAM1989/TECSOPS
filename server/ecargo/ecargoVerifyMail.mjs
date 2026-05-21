export const ECARGO_FROM = "ecargo@scsc.vn";
export const VERIFY_SUBJECT = "Mã xác thực phiếu đăng ký hàng vào kho";

export function extractVerifyCode(text) {
  const match = String(text || "").match(/Mã xác thực\s*:\s*([A-Z0-9]+)/i);
  return match ? match[1].trim().toUpperCase() : "";
}

export function extractRegistrationNo(text, subject) {
  const source = `${subject || ""}\n${text || ""}`;
  const match =
    source.match(/(?:số|so)\s+([A-Z0-9]{6,12})/i) ||
    source.match(/Phiếu đăng ký\s*:\s*([A-Z0-9]{6,12})/i);
  return match ? match[1].trim().toUpperCase() : "";
}

export function extractVerifyUrl(text, links, verifyCode) {
  const hrefs = links || [];
  const direct = hrefs.find((href) => /\/Export\/VCTOrder\/Verify\//i.test(href));
  if (direct) return direct;
  const m = String(text || "").match(/https:\/\/ecargo\.scsc\.vn\/Export\/VCTOrder\/Verify\/[^\s"'<>]+/i);
  if (m) return m[0];
  if (verifyCode) {
    return `https://ecargo.scsc.vn/Export/VCTOrder/Verify/${encodeURIComponent(verifyCode)}`;
  }
  return "";
}

/** @param {string} rawMime */
export function parseVerifyMailRaw(rawMime, envelope = {}) {
  const raw = String(rawMime || "");
  const text = raw.replace(/<[^>]+>/g, " ");
  const links = [...raw.matchAll(/https:\/\/ecargo\.scsc\.vn[^\s"'<>]+/gi)].map((m) => m[0]);
  const verifyCode = extractVerifyCode(text);
  const verifyUrl = extractVerifyUrl(text, links, verifyCode);
  if (!verifyCode || !verifyUrl) return null;
  return {
    verifyCode,
    verifyUrl,
    registrationNo: extractRegistrationNo(text, envelope?.subject),
    subject: envelope?.subject || VERIFY_SUBJECT,
  };
}

export function messageReceivedMs(msg) {
  if (msg?.internalDate instanceof Date) return msg.internalDate.getTime();
  if (typeof msg?.internalDate === "string") {
    const t = Date.parse(msg.internalDate);
    if (Number.isFinite(t)) return t;
  }
  const envDate = msg?.envelope?.date;
  if (envDate instanceof Date) return envDate.getTime();
  if (typeof envDate === "string") {
    const t = Date.parse(envDate);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

/**
 * @param {{ mawb?: string; vehicleNo?: string }} [hints]
 */
export function verifyMailMatchesBooking(text, hints) {
  if (!hints?.mawb && !hints?.vehicleNo) return true;
  const hay = String(text || "").toUpperCase();

  if (hints.mawb) {
    const dash = hints.mawb.toUpperCase();
    const compact = dash.replace(/-/g, "");
    if (hay.includes(dash) || (compact.length >= 8 && hay.includes(compact))) return true;
  }
  if (hints.vehicleNo) {
    const v = String(hints.vehicleNo).replace(/;/g, "").toUpperCase();
    if (v.length >= 4 && hay.includes(v)) return true;
  }

  // Mail không nhắc mã lô/xe — chỉ tin lọc thời gian (tránh loại nhầm mẫu mail eCargo ngắn).
  const hayHasMawbLike = /\d{3}[-\s]?\d{8}/.test(hay);
  const hayHasVehicleLike = /\b\d{2}[A-Z]{1,2}\d{4,6}\b/.test(hay);
  if (!hayHasMawbLike && !hayHasVehicleLike) return true;

  return false;
}

/**
 * Chọn mail xác thực mới nhất sau `notBeforeMs`, khớp MAWB/xe nếu có hints.
 * @param {Array<{ uid: number|string; raw: string; envelope?: object; internalDate?: Date|string; receivedMs?: number }>} candidates newest-last order like IMAP UID list
 */
export function pickFreshVerifyMail(candidates, notBeforeMs, hints) {
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    const receivedMs = c.receivedMs ?? messageReceivedMs(c);
    if (receivedMs > 0 && receivedMs < notBeforeMs) continue;
    const parsed = parseVerifyMailRaw(c.raw, c.envelope);
    if (!parsed) continue;
    const plain = String(c.raw || "").replace(/<[^>]+>/g, " ");
    if (!verifyMailMatchesBooking(plain, hints)) continue;
    return { ...parsed, receivedMs: receivedMs || undefined, uid: c.uid };
  }
  return null;
}
