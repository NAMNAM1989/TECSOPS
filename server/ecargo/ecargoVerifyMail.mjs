export const ECARGO_FROM = "ecargo@scsc.vn";
export const VERIFY_SUBJECT = "Mã xác thực phiếu đăng ký hàng vào kho";
/** Mail QR sau khi xác thực — khớp extension Chrome. */
export const QR_SUBJECT = "Phiếu đăng ký hàng vào kho";

/** Mail xác thực (subject có «Mã xác thực») — không dùng cho bước chờ QR. */
export function isVerifyEcargoMailSubject(subject) {
  return /mã\s*xác\s*thực/i.test(String(subject ?? ""));
}

/** Giải mã quoted-printable trong MIME. */
export function decodeQuotedPrintable(input) {
  return String(input || "")
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * eCargo gửi HTML base64 — cần decode trước khi parse mã/link.
 * @param {string} rawMime
 */
export function decodeMimeBody(rawMime) {
  const raw = String(rawMime || "");
  if (/Mã xác thực/i.test(raw) && /VCTOrder\/Verify/i.test(raw)) {
    return raw;
  }

  /** @type {string[]} */
  const chunks = [];

  function decodePart(headersAndBody) {
    const enc = (headersAndBody.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1] || "").toLowerCase();
    const bodyMatch = headersAndBody.match(/\r?\n\r?\n([\s\S]+)$/);
    if (!bodyMatch) return;
    let body = bodyMatch[1].replace(/\r?\n--[\s\S]*$/, "").trim();
    if (enc.includes("base64")) {
      try {
        chunks.push(Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8"));
      } catch {
        /* ignore */
      }
    } else if (enc.includes("quoted-printable")) {
      chunks.push(decodeQuotedPrintable(body));
    } else {
      chunks.push(body);
    }
  }

  const boundary = raw.match(/boundary="?([^"\s;]+)"?/i)?.[1];
  if (boundary) {
    const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const seg of raw.split(new RegExp(`--${esc}`))) {
      if (!/Content-Type:\s*text\/(html|plain)/i.test(seg)) continue;
      decodePart(seg);
    }
  } else {
    // Mail đơn phần (eCargo): HTML base64 nằm sau Content-Type text/html — không phải sau header SMTP đầu file.
    const htmlIdx = raw.search(/Content-Type:\s*text\/html[^\r\n]*\r?\n/i);
    if (htmlIdx >= 0) {
      decodePart(raw.slice(htmlIdx));
    } else {
      const plainIdx = raw.search(/Content-Type:\s*text\/plain[^\r\n]*\r?\n/i);
      if (plainIdx >= 0) decodePart(raw.slice(plainIdx));
    }
  }

  return chunks.join("\n");
}

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

/** Link xanh "đây" trong mail HTML — ưu tiên hơn URL ghép tay. */
export function extractVerifyUrlFromRaw(raw, links, verifyCode) {
  const html = String(raw || "");
  const hrefs = links ?? [
    ...html.matchAll(/href=["'](https:\/\/ecargo\.scsc\.vn\/Export\/VCTOrder\/Verify\/[^"']+)["']/gi),
  ].map((m) => m[1]);

  const dayHere =
    html.match(
      /href=["'](https:\/\/ecargo\.scsc\.vn\/Export\/VCTOrder\/Verify\/[^"']+)["'][^>]*>[\s\S]{0,80}?đây/i
    ) ||
    html.match(
      /đây[\s\S]{0,120}?href=["'](https:\/\/ecargo\.scsc\.vn\/Export\/VCTOrder\/Verify\/[^"']+)["']/i
    );
  if (dayHere?.[1]) return dayHere[1];

  if (verifyCode) {
    const code = verifyCode.trim().toUpperCase();
    const byCode = hrefs.find((h) => h.toUpperCase().includes(code));
    if (byCode) return byCode;
  }

  const direct = hrefs.find((href) => /\/Export\/VCTOrder\/Verify\//i.test(href));
  if (direct) return direct;

  const m = html.match(/https:\/\/ecargo\.scsc\.vn\/Export\/VCTOrder\/Verify\/[^\s"'<>]+/i);
  if (m) return m[0];

  if (verifyCode) {
    return `https://ecargo.scsc.vn/Export/VCTOrder/Verify/${encodeURIComponent(verifyCode)}`;
  }
  return "";
}

export function extractVerifyUrl(text, links, verifyCode) {
  return extractVerifyUrlFromRaw(text, links, verifyCode);
}

/** @param {string} rawMime */
export function parseVerifyMailRaw(rawMime, envelope = {}) {
  const raw = String(rawMime || "");
  const decoded = decodeMimeBody(raw);
  const html = decoded || raw;
  const text = html.replace(/<[^>]+>/g, " ");
  const links = [
    ...html.matchAll(/href=["'](https:\/\/ecargo\.scsc\.vn\/Export\/VCTOrder\/Verify\/[^"']+)["']/gi),
  ]
    .map((m) => m[1])
    .concat([...html.matchAll(/https:\/\/ecargo\.scsc\.vn[^\s"'<>]+/gi)].map((m) => m[0]));
  const verifyCode = extractVerifyCode(text);
  const verifyUrl = extractVerifyUrlFromRaw(html, links, verifyCode);
  if (!verifyCode || !verifyUrl) return null;
  return {
    verifyCode,
    verifyUrl,
    registrationNo: extractRegistrationNo(text, envelope?.subject),
    subject: envelope?.subject || VERIFY_SUBJECT,
  };
}

/** Plain text từ nội dung mail — không dùng header SMTP (tránh false negative khi so MAWB). */
export function mailBodyPlainText(rawMime) {
  const decoded = decodeMimeBody(rawMime) || String(rawMime || "");
  return decoded.replace(/<[^>]+>/g, " ");
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

/** Các dạng MAWB có thể xuất hiện trong mail (618-28847663 vs 618-2884 7663). */
export function mawbMatchVariants(mawb) {
  const compact = String(mawb || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  if (!compact) return [];
  const out = new Set([compact]);
  const m11 = /^(\d{3})(\d{8})$/.exec(compact);
  if (m11) {
    out.add(`${m11[1]}-${m11[2]}`);
    out.add(`${m11[1]}-${m11[2].slice(0, 4)} ${m11[2].slice(4)}`);
  }
  return [...out];
}

/**
 * @param {{ mawb?: string; vehicleNo?: string }} [hints]
 */
export function verifyMailMatchesBooking(text, hints) {
  if (!hints?.mawb && !hints?.vehicleNo) return true;
  const hay = String(text || "").toUpperCase();

  if (hints.mawb) {
    for (const variant of mawbMatchVariants(hints.mawb)) {
      if (variant.length >= 8 && hay.includes(variant)) return true;
    }
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
 * @param {Array<{ uid: number|string; mailbox?: string; raw: string; envelope?: object; internalDate?: Date|string; receivedMs?: number }>} candidates newest-last order like IMAP UID list
 */
export function pickFreshVerifyMail(candidates, notBeforeMs, hints) {
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    const receivedMs = c.receivedMs ?? messageReceivedMs(c);
    if (receivedMs > 0 && receivedMs < notBeforeMs) continue;
    const parsed = parseVerifyMailRaw(c.raw, c.envelope);
    if (!parsed) continue;
    const plain = mailBodyPlainText(c.raw);
    if (!verifyMailMatchesBooking(plain, hints)) continue;
    return {
      ...parsed,
      receivedMs: receivedMs || undefined,
      uid: c.uid,
      mailbox: c.mailbox,
    };
  }
  return null;
}

export const MAX_QR_IMAGE_BYTES = 200 * 1024;

/**
 * Trích ảnh QR từ MIME mail SCSC (attachment PNG/JPEG hoặc data URI trong HTML).
 * @param {string} rawMime
 * @returns {string} data URL hoặc rỗng nếu không có / quá lớn
 */
export function extractQrImageDataUrl(rawMime) {
  const raw = String(rawMime || "");
  const html = decodeMimeBody(raw) || raw;

  const dataUriMatch = html.match(
    /src=["'](data:image\/(?:png|jpeg|jpg|gif);base64,[A-Za-z0-9+/=\s]+)["']/i
  );
  if (dataUriMatch?.[1]) {
    const uri = dataUriMatch[1].replace(/\s+/g, "");
    const base64Part = uri.split(",")[1] ?? "";
    if (base64Part.length > 0 && base64Part.length <= MAX_QR_IMAGE_BYTES * 1.4) {
      return uri;
    }
  }

  const boundary = raw.match(/boundary="?([^"\s;]+)"?/i)?.[1];
  if (!boundary) return "";

  const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const seg of raw.split(new RegExp(`--${esc}`))) {
    const typeMatch = seg.match(/Content-Type:\s*image\/(png|jpeg|jpg|gif)/i);
    if (!typeMatch) continue;
    const enc = (seg.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1] || "").toLowerCase();
    const bodyMatch = seg.match(/\r?\n\r?\n([\s\S]+?)(?:\r?\n--|$)/);
    if (!bodyMatch) continue;
    let body = bodyMatch[1].replace(/\r?\n--[\s\S]*$/, "").trim();
    /** @type {Buffer} */
    let buf;
    if (enc.includes("base64")) {
      try {
        buf = Buffer.from(body.replace(/\s+/g, ""), "base64");
      } catch {
        continue;
      }
    } else if (enc.includes("quoted-printable")) {
      buf = Buffer.from(decodeQuotedPrintable(body), "binary");
    } else {
      buf = Buffer.from(body, "binary");
    }
    if (!buf.length || buf.length > MAX_QR_IMAGE_BYTES) continue;
    const mime = typeMatch[1].toLowerCase().replace("jpg", "jpeg");
    return `data:image/${mime};base64,${buf.toString("base64")}`;
  }
  return "";
}

/** @param {string} rawMime */
export function parseQrMailRaw(rawMime, envelope = {}) {
  const raw = String(rawMime || "");
  const html = decodeMimeBody(raw) || raw;
  const text = html.replace(/<[^>]+>/g, " ");
  const subject = String(envelope?.subject || "");
  const registrationNo = extractRegistrationNo(text, subject);
  if (!registrationNo) return null;
  const qrImageDataUrl = extractQrImageDataUrl(raw);
  const hasQrImage =
    Boolean(qrImageDataUrl) ||
    /Content-Type:\s*image\/(?:png|jpeg|jpg|gif)/i.test(raw) ||
    (/cid:|base64/i.test(raw) && /qr|mã\s*qr/i.test(`${subject}\n${text}`));
  return {
    registrationNo,
    qrSubject: subject || QR_SUBJECT,
    subject: subject || QR_SUBJECT,
    hasQrImage,
    ...(qrImageDataUrl ? { qrImageDataUrl } : {}),
  };
}

/**
 * @param {{ registrationNo?: string; vehicleNo?: string; mawb?: string }} [hints]
 */
export function qrMailMatchesHints(text, hints) {
  const hay = String(text || "").toUpperCase();
  if (hints?.registrationNo) {
    const reg = String(hints.registrationNo).trim().toUpperCase();
    if (reg.length >= 6 && !hay.includes(reg)) return false;
  }
  if (hints?.vehicleNo) {
    const v = String(hints.vehicleNo).replace(/;/g, "").toUpperCase();
    if (v.length >= 4 && !hay.includes(v)) return false;
  }
  if (hints?.mawb) {
    const dash = hints.mawb.toUpperCase();
    const compact = dash.replace(/-/g, "");
    if (!hay.includes(dash) && !(compact.length >= 8 && hay.includes(compact))) return false;
  }
  return true;
}

/**
 * @param {Array<{ uid: number|string; mailbox?: string; raw: string; envelope?: object; internalDate?: Date|string; receivedMs?: number }>} candidates
 */
export function pickFreshQrMail(candidates, notBeforeMs, hints) {
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    if (isVerifyEcargoMailSubject(c.envelope?.subject)) continue;
    const receivedMs = c.receivedMs ?? messageReceivedMs(c);
    if (receivedMs > 0 && receivedMs < notBeforeMs) continue;
    const parsed = parseQrMailRaw(c.raw, c.envelope);
    if (!parsed) continue;
    const plain = mailBodyPlainText(c.raw);
    if (!qrMailMatchesHints(plain, hints)) continue;
    return {
      ...parsed,
      receivedMs: receivedMs || undefined,
      uid: c.uid,
      mailbox: c.mailbox,
    };
  }
  return null;
}
