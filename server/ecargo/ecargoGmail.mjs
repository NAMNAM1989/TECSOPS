import { ECARGO_GMAIL_POLL_MS, ECARGO_GMAIL_USER } from "./ecargoConfig.mjs";
import {
  ECARGO_FROM,
  VERIFY_SUBJECT,
  messageReceivedMs,
  pickFreshVerifyMail,
} from "./ecargoVerifyMail.mjs";

const MAILBOXES = ["INBOX", "[Gmail]/All Mail"];

async function loadVerifyCandidates(client, notBeforeMs) {
  const since = new Date(notBeforeMs - 3 * 60 * 1000);
  /** @type {Array<{ uid: number|string; raw: string; envelope?: object; receivedMs?: number }>} */
  const all = [];

  for (const mailbox of MAILBOXES) {
    try {
      await client.mailboxOpen(mailbox);
    } catch {
      continue;
    }
    const uids = await client.search({
      from: ECARGO_FROM,
      subject: VERIFY_SUBJECT,
      since,
    });
    if (!uids.length) continue;

    for (const uid of uids) {
      const msg = await client.fetchOne(String(uid), { source: true, envelope: true, internalDate: true });
      if (!msg?.source) continue;
      all.push({
        uid,
        raw: msg.source.toString("utf8"),
        envelope: msg.envelope,
        receivedMs: messageReceivedMs(msg),
      });
    }
  }

  all.sort((a, b) => {
    const au = Number(a.uid);
    const bu = Number(b.uid);
    if (Number.isFinite(au) && Number.isFinite(bu) && au !== bu) return au - bu;
    return (a.receivedMs ?? 0) - (b.receivedMs ?? 0);
  });
  return all;
}

/**
 * Đọc mail xác thực qua Gmail IMAP — giữ kết nối, poll nhanh (mặc định 2.5s).
 * @param {{ notBeforeMs?: number; timeoutMs?: number; pollMs?: number; matchHints?: { mawb?: string; vehicleNo?: string } }} opts
 */
export async function waitForEcargoVerifyEmail(opts = {}) {
  const appPassword = process.env.ECARGO_GMAIL_APP_PASSWORD?.trim();
  if (!appPassword) {
    throw new Error(
      "Thiếu ECARGO_GMAIL_APP_PASSWORD trên Railway — tạo App Password Gmail cho hộp nhận mail eCargo."
    );
  }

  const { ImapFlow } = await import("imapflow");
  const notBeforeMs = opts.notBeforeMs ?? Date.now() - 60_000;
  const timeoutMs = opts.timeoutMs ?? 8 * 60 * 1000;
  const pollMs = opts.pollMs ?? ECARGO_GMAIL_POLL_MS;
  const matchHints = opts.matchHints;
  const deadline = Date.now() + timeoutMs;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: ECARGO_GMAIL_USER, pass: appPassword },
    logger: false,
  });

  try {
    await client.connect();

    while (Date.now() < deadline) {
      const candidates = await loadVerifyCandidates(client, notBeforeMs);
      const found = pickFreshVerifyMail(candidates, notBeforeMs, matchHints);
      if (found) {
        console.info(
          `[ecargo-gmail] verify mail uid=${found.uid} code=${found.verifyCode} received=${found.receivedMs ?? "?"}`
        );
        return found;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(pollMs, remaining));
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  throw new Error("Hết thời gian chờ email xác thực từ ecargo@scsc.vn.");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
