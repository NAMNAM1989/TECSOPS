/**
 * Đọc OTP eCargo từ mailbox chung qua IMAP (Gmail App Password).
 * Chỉ trả mã OTP — không trả body mail đầy đủ.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const DEFAULT_HOST = "imap.gmail.com";
const DEFAULT_PORT = 993;
const DEFAULT_MAILBOX = "INBOX";
const POLL_MS = 2500;
const DEFAULT_TIMEOUT_MS = 90_000;

/** Một job OTP / mailbox — tránh lấy nhầm OTP chồng. */
let otpLock = Promise.resolve();

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

export function ecargoImapConfigured() {
  return Boolean(env("ECARGO_IMAP_USER") && env("ECARGO_IMAP_PASS"));
}

/** Che email: ops***@gmail.com — không lộ full mailbox ra UI. */
export function maskEcargoImapUser(raw) {
  const email = String(raw || "").trim().toLowerCase();
  const at = email.indexOf("@");
  if (at <= 0) return email ? "***" : "";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keep = Math.min(3, local.length);
  return `${local.slice(0, keep)}***@${domain}`;
}

export function getEcargoImapStatus() {
  const user = env("ECARGO_IMAP_USER");
  return {
    imapConfigured: Boolean(user && env("ECARGO_IMAP_PASS")),
    host: env("ECARGO_IMAP_HOST", DEFAULT_HOST) || DEFAULT_HOST,
    mailbox: env("ECARGO_IMAP_MAILBOX", DEFAULT_MAILBOX) || DEFAULT_MAILBOX,
    userHint: user ? maskEcargoImapUser(user) : "",
  };
}

/**
 * Chỉ kiểm tra đăng nhập IMAP + mở mailbox — không đọc body mail.
 * @returns {Promise<{ ok: true, host: string, mailbox: string, userHint: string }>}
 */
export async function testEcargoImapConnection() {
  const host = env("ECARGO_IMAP_HOST", DEFAULT_HOST) || DEFAULT_HOST;
  const port = Number(env("ECARGO_IMAP_PORT", String(DEFAULT_PORT))) || DEFAULT_PORT;
  const user = env("ECARGO_IMAP_USER");
  const pass = env("ECARGO_IMAP_PASS");
  const mailbox = env("ECARGO_IMAP_MAILBOX", DEFAULT_MAILBOX) || DEFAULT_MAILBOX;
  if (!user || !pass) {
    const err = new Error(
      "Chưa cấu hình ECARGO_IMAP_USER / ECARGO_IMAP_PASS (Gmail App Password)"
    );
    err.code = "IMAP_NOT_CONFIGURED";
    throw err;
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      // list / status nhẹ — xác nhận quyền đọc hộp thư
      await client.status(mailbox, { messages: true });
    } finally {
      lock.release();
    }
    return {
      ok: true,
      host,
      mailbox,
      userHint: maskEcargoImapUser(user),
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e || "IMAP failed");
    const err = new Error(
      /auth|invalid credentials|login/i.test(raw)
        ? "IMAP đăng nhập thất bại — kiểm tra ECARGO_IMAP_USER / App Password"
        : /mailbox|not found|nonexistent/i.test(raw)
          ? `Không mở được mailbox «${mailbox}» — kiểm tra ECARGO_IMAP_MAILBOX`
          : `Không kết nối IMAP (${host}:${port}): ${raw.slice(0, 160)}`
    );
    err.code = /auth|invalid credentials|login/i.test(raw)
      ? "IMAP_AUTH"
      : "IMAP_CONNECT";
    throw err;
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

export function extractOtpFromText(text) {
  const s = String(text || "");
  const labeled = s.match(/OTP[:\s#_-]*([0-9]{4,8})/i);
  if (labeled?.[1]) return labeled[1];
  const six = s.match(/\b([0-9]{6})\b/);
  if (six?.[1]) return six[1];
  const fourToEight = s.match(/\b([0-9]{4,8})\b/);
  return fourToEight?.[1] || null;
}

/**
 * Mail eCargo thật: mã alphanumeric + link «Bấm vào đây để tiến hành xác thực».
 * VD: Mã xác thực : QSSMB88636480ZWUGWM — subject … số 80ZWUGWM
 */
export function extractEcargoVerifyFromMail({ subject, text, html } = {}) {
  const subjectStr = String(subject || "");
  const textStr = String(text || "");
  const htmlStr = typeof html === "string" ? html : "";
  const plainHtml = htmlStr.replace(/<[^>]+>/g, " ");
  const blob = `${subjectStr}\n${textStr}\n${plainHtml}`;

  const code =
    blob.match(/Mã\s*xác\s*thực\s*[:：]\s*([A-Z0-9]{10,48})/i)?.[1] ||
    blob.match(/Ma\s*xac\s*thuc\s*[:：]\s*([A-Z0-9]{10,48})/i)?.[1] ||
    blob.match(
      /xác\s*thực[^A-Z0-9]{0,40}([A-Z]{2,}[A-Z0-9]{8,40})/i
    )?.[1] ||
    null;

  const vctCode =
    subjectStr.match(/số\s+([A-Z0-9]{6,20})\s*$/i)?.[1] ||
    subjectStr.match(/kho\s+số\s+([A-Z0-9]{6,20})/i)?.[1] ||
    (code && code.length >= 8 ? code.slice(-8) : "") ||
    "";

  let verifyUrl = "";
  const hrefs = [...htmlStr.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map(
    (m) => String(m[1] || "").trim()
  );
  const scoreHref = (href) => {
    const h = href.toLowerCase();
    if (!h || /unsubscribe|mailto:|javascript:/i.test(h)) return -1;
    let score = 0;
    if (/ecargo\.scsc\.vn/i.test(h)) score += 50;
    if (/verif|xac.?thuc|confirm|authenticate|token|code=/i.test(h)) score += 40;
    if (/export|vct/i.test(h)) score += 10;
    return score;
  };
  let bestScore = 0;
  for (const href of hrefs) {
    const sc = scoreHref(href);
    if (sc > bestScore) {
      bestScore = sc;
      verifyUrl = href;
    }
  }
  if (!verifyUrl) {
    const urlMatch = blob.match(
      /https?:\/\/(?:www\.)?ecargo\.scsc\.vn[^\s"'<>)]+/i
    );
    if (urlMatch?.[0]) verifyUrl = urlMatch[0].replace(/[.,;]+$/, "");
  }
  // HTML entity / relative
  if (verifyUrl && verifyUrl.startsWith("/")) {
    verifyUrl = `https://ecargo.scsc.vn${verifyUrl}`;
  }
  verifyUrl = verifyUrl.replace(/&amp;/g, "&");

  const numericFallback = code ? null : extractOtpFromText(blob);
  const otp = code || numericFallback || "";

  return {
    code: otp,
    otp,
    verifyUrl,
    vctCode: vctCode || "",
  };
}

function mailLooksLikeEcargoOtp(parsed, emailHint) {
  const from = String(parsed.from?.text || "").toLowerCase();
  const subject = String(parsed.subject || "").toLowerCase();
  const to = String(parsed.to?.text || "").toLowerCase();
  const hint = String(emailHint || "")
    .trim()
    .toLowerCase();
  if (hint && to && !to.includes(hint)) return false;
  const fromOk = /scsc|ecargo|noreply|no-reply|mailer/.test(from);
  const subjectOk =
    /mã xác thực|ma xac thuc|xác thực phiếu|xac thuc phieu|otp|verification|ecargo|vct|hàng vào kho|hang vao kho/.test(
      subject
    );
  // Ưu tiên mail eCargo thật; vẫn nhận nếu subject rõ ràng dù from lạ
  return (fromOk && subjectOk) || (subjectOk && /ecargo|scsc/.test(subject));
}

async function searchOtpOnce({ email, sinceMs, awbHint }) {
  const host = env("ECARGO_IMAP_HOST", DEFAULT_HOST);
  const port = Number(env("ECARGO_IMAP_PORT", String(DEFAULT_PORT))) || DEFAULT_PORT;
  const user = env("ECARGO_IMAP_USER");
  const pass = env("ECARGO_IMAP_PASS");
  const mailbox = env("ECARGO_IMAP_MAILBOX", DEFAULT_MAILBOX);
  if (!user || !pass) {
    throw new Error(
      "Chưa cấu hình ECARGO_IMAP_USER / ECARGO_IMAP_PASS (Gmail App Password)"
    );
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      const sinceDate = new Date(Math.max(0, sinceMs - 15_000));
      // imapflow: since = ngày; lọc chặt hơn bằng internalDate
      for await (const msg of client.fetch(
        { since: sinceDate },
        { uid: true, internalDate: true, source: true, envelope: true }
      )) {
        const internal = msg.internalDate
          ? new Date(msg.internalDate).getTime()
          : 0;
        if (internal && internal + 2000 < sinceMs) continue;
        let parsed;
        try {
          parsed = await simpleParser(msg.source);
        } catch {
          continue;
        }
        if (!mailLooksLikeEcargoOtp(parsed, email)) continue;
        void awbHint;
        const extracted = extractEcargoVerifyFromMail({
          subject: parsed.subject,
          text: parsed.text,
          html: typeof parsed.html === "string" ? parsed.html : "",
        });
        if (extracted.otp || extracted.verifyUrl) {
          return {
            otp: extracted.otp,
            code: extracted.code,
            verifyUrl: extracted.verifyUrl,
            vctCode: extracted.vctCode,
            uid: msg.uid,
            subject: String(parsed.subject || "").slice(0, 120),
            receivedAt: internal ? new Date(internal).toISOString() : null,
          };
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Poll IMAP đến khi có mail xác thực (mã + link) hoặc timeout.
 * @returns {{ otp: string, code?: string, verifyUrl?: string, vctCode?: string, subject?: string, receivedAt?: string|null }}
 */
export async function waitForEcargoOtp(opts = {}) {
  const email = String(opts.email || "").trim();
  const sinceIso = String(opts.sinceIso || "").trim();
  const sinceMs = sinceIso ? Date.parse(sinceIso) : Date.now();
  if (!Number.isFinite(sinceMs)) {
    throw new Error("sinceIso không hợp lệ");
  }
  const timeoutMs = Math.min(
    Math.max(Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS, 10_000),
    180_000
  );
  const awbHint = opts.awbHint ? String(opts.awbHint) : "";

  const run = async () => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hit = await searchOtpOnce({
        email,
        sinceMs,
        awbHint,
      });
      if (hit?.otp || hit?.verifyUrl) {
        return {
          otp: hit.otp || "",
          code: hit.code || hit.otp || "",
          verifyUrl: hit.verifyUrl || "",
          vctCode: hit.vctCode || "",
          subject: hit.subject,
          receivedAt: hit.receivedAt,
        };
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw new Error(
      `Không thấy mail xác thực eCargo trong hộp thư sau ${Math.round(timeoutMs / 1000)}s`
    );
  };

  const prev = otpLock;
  let release;
  otpLock = new Promise((r) => {
    release = r;
  });
  await prev.catch(() => {});
  try {
    return await run();
  } finally {
    release();
  }
}

/** Fallback: tìm QR/link trong mail xác nhận sau OTP. */
export async function findEcargoResultMail(opts = {}) {
  const email = String(opts.email || "").trim();
  const sinceMs = Date.parse(String(opts.sinceIso || "")) || Date.now() - 120_000;
  const host = env("ECARGO_IMAP_HOST", DEFAULT_HOST);
  const port = Number(env("ECARGO_IMAP_PORT", String(DEFAULT_PORT))) || DEFAULT_PORT;
  const user = env("ECARGO_IMAP_USER");
  const pass = env("ECARGO_IMAP_PASS");
  const mailbox = env("ECARGO_IMAP_MAILBOX", DEFAULT_MAILBOX);
  if (!user || !pass) throw new Error("Chưa cấu hình IMAP eCargo");

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      const sinceDate = new Date(Math.max(0, sinceMs - 15_000));
      let best = null;
      for await (const msg of client.fetch(
        { since: sinceDate },
        { uid: true, internalDate: true, source: true }
      )) {
        const internal = msg.internalDate
          ? new Date(msg.internalDate).getTime()
          : 0;
        if (internal && internal + 2000 < sinceMs) continue;
        let parsed;
        try {
          parsed = await simpleParser(msg.source);
        } catch {
          continue;
        }
        const to = String(parsed.to?.text || "").toLowerCase();
        if (email && to && !to.includes(email.toLowerCase())) continue;
        const subject = String(parsed.subject || "");
        const html = typeof parsed.html === "string" ? parsed.html : "";
        const text = String(parsed.text || "");
        const blob = `${subject}\n${text}\n${html}`;
        if (!/vct|phiếu|phieu|qr|đăng ký|dang ky|ecargo/i.test(blob)) continue;
        const vct =
          blob.match(/VCT[-\s]?([A-Z0-9]{4,})/i)?.[0]?.replace(/\s+/g, "") ||
          "";
        let qrUrl = "";
        const img = html.match(
          /<img[^>]+src=["']([^"']*(?:qr|barcode)[^"']*)["']/i
        );
        if (img?.[1]) qrUrl = img[1];
        const href = html.match(/href=["'](https?:\/\/[^"']+\.(?:png|jpg|pdf)[^"']*)["']/i);
        if (!qrUrl && href?.[1]) qrUrl = href[1];
        best = {
          vctCode: vct,
          qrUrl,
          subject: subject.slice(0, 120),
          receivedAt: internal ? new Date(internal).toISOString() : null,
        };
      }
      return best;
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}
