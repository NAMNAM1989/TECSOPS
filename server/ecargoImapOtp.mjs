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

export function extractOtpFromText(text) {
  const s = String(text || "");
  const labeled = s.match(/OTP[:\s#_-]*([0-9]{4,8})/i);
  if (labeled?.[1]) return labeled[1];
  const six = s.match(/\b([0-9]{6})\b/);
  if (six?.[1]) return six[1];
  const fourToEight = s.match(/\b([0-9]{4,8})\b/);
  return fourToEight?.[1] || null;
}

function mailLooksLikeEcargoOtp(parsed, emailHint) {
  const from = String(parsed.from?.text || "").toLowerCase();
  const subject = String(parsed.subject || "").toLowerCase();
  const to = String(parsed.to?.text || "").toLowerCase();
  const hint = String(emailHint || "")
    .trim()
    .toLowerCase();
  if (hint && to && !to.includes(hint)) return false;
  const fromOk =
    /scsc|ecargo|noreply|no-reply|mailer/.test(from) || from.length > 0;
  const subjectOk =
    /otp|xác thực|xac thuc|verification|verify|mã|code|ecargo|vct/.test(
      subject
    ) || subject.length > 0;
  return fromOk && subjectOk;
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
        const blob = [
          parsed.subject,
          parsed.text,
          typeof parsed.html === "string"
            ? parsed.html.replace(/<[^>]+>/g, " ")
            : "",
        ].join("\n");
        if (awbHint) {
          const awbDigits = String(awbHint).replace(/\D/g, "");
          if (
            awbDigits.length >= 8 &&
            !blob.replace(/\D/g, "").includes(awbDigits.slice(-8))
          ) {
            // không bắt buộc AWB trong mail OTP — bỏ qua filter cứng
          }
        }
        const otp = extractOtpFromText(blob);
        if (otp) {
          return {
            otp,
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
 * Poll IMAP đến khi có OTP hoặc timeout.
 * @returns {{ otp: string, subject?: string, receivedAt?: string|null }}
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
      if (hit?.otp) {
        return {
          otp: hit.otp,
          subject: hit.subject,
          receivedAt: hit.receivedAt,
        };
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw new Error(
      `Không thấy OTP eCargo trong hộp thư sau ${Math.round(timeoutMs / 1000)}s`
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
