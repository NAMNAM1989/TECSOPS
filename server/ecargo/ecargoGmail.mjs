import { ECARGO_GMAIL_POLL_MS, ECARGO_GMAIL_USER, ECARGO_QR_GMAIL_POLL_MS, ECARGO_QR_TIMEOUT_MS, isEcargoQrInboxOnly, isEcargoQrSingleScan } from "./ecargoConfig.mjs";
import {
  ECARGO_FROM,
  messageReceivedMs,
  mailBodyPlainText,
  parseVerifyMailRaw,
  pickFreshQrMail,
  pickFreshVerifyMail,
  isVerifyEcargoMailSubject,
  verifyMailMatchesBooking,
} from "./ecargoVerifyMail.mjs";

const MAILBOXES = ["INBOX", "[Gmail]/All Mail"];

/** @type {import('imapflow').ImapFlow | null} */
let poolClient = null;
/** @type {Promise<import('imapflow').ImapFlow> | null} */
let poolConnectPromise = null;
let poolOpenMailbox = "";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function resetPool() {
  poolClient = null;
  poolConnectPromise = null;
  poolOpenMailbox = "";
}

/** @param {unknown} e */
function formatImapConnectError(e) {
  const msg = String(e?.message ?? e ?? "").trim();
  const response = String(e?.response ?? "").trim();
  const authFailed =
    e?.authenticationFailed === true ||
    /AUTHENTICATIONFAILED|Invalid credentials/i.test(`${msg} ${response}`);

  if (authFailed) {
    return new Error(
      `Gmail từ chối đăng nhập IMAP (${ECARGO_GMAIL_USER}). Tạo lại App Password 16 ký tự, cập nhật ECARGO_GMAIL_APP_PASSWORD trên Railway hoặc .env.local (không dấu cách), rồi khởi động lại server.`
    );
  }
  if (msg === "Command failed" && response) {
    return new Error(`Gmail IMAP: ${response}`);
  }
  if (msg === "Command failed") {
    return new Error(
      "Không kết nối được Gmail IMAP — kiểm tra ECARGO_GMAIL_USER và ECARGO_GMAIL_APP_PASSWORD."
    );
  }
  return e instanceof Error ? e : new Error(msg || "Lỗi Gmail IMAP.");
}

async function createImapClient() {
  const appPassword = process.env.ECARGO_GMAIL_APP_PASSWORD?.trim();
  if (!appPassword) {
    throw new Error(
      "Thiếu ECARGO_GMAIL_APP_PASSWORD trên Railway — tạo App Password Gmail cho hộp nhận mail eCargo."
    );
  }
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: ECARGO_GMAIL_USER, pass: appPassword },
    logger: false,
    // Tự ngắt IDLE sau 25s để vòng poll re-search mail mới (Gmail IDLE mặc định ~29 phút quá lâu).
    maxIdleTime: 25_000,
  });
  client.on("close", () => {
    if (poolClient === client) resetPool();
  });
  client.on("error", () => {
    if (poolClient === client) resetPool();
  });
  try {
    await client.connect();
  } catch (e) {
    throw formatImapConnectError(e);
  }
  return client;
}

/** Kiểm tra Gmail sẵn sàng — fail sớm nếu thiếu/sai App Password. */
export async function assertEcargoGmailReady() {
  if (!process.env.ECARGO_GMAIL_APP_PASSWORD?.trim()) {
    throw new Error(
      "Thiếu ECARGO_GMAIL_APP_PASSWORD trên server — tạo App Password Gmail và cấu hình trên Railway hoặc .env.local."
    );
  }
  return getPooledImapClient();
}

/** Giữ IMAP sẵn sàng — gọi khi worker start / trước Playwright. */
export async function warmEcargoGmail() {
  return assertEcargoGmailReady();
}

/** @returns {Promise<import('imapflow').ImapFlow>} */
async function getPooledImapClient() {
  if (poolClient) return poolClient;
  if (!poolConnectPromise) {
    poolConnectPromise = createImapClient()
      .then((client) => {
        poolClient = client;
        poolConnectPromise = null;
        return client;
      })
      .catch((e) => {
        poolConnectPromise = null;
        throw e;
      });
  }
  return poolConnectPromise;
}

export async function shutdownEcargoGmail() {
  const client = poolClient;
  resetPool();
  if (!client) return;
  try {
    await client.logout();
  } catch {
    /* ignore */
  }
}

async function openMailbox(client, mailbox) {
  if (poolOpenMailbox === mailbox) return;
  await client.mailboxOpen(mailbox);
  poolOpenMailbox = mailbox;
}

/**
 * Đánh dấu mail đã đọc (set IMAP flag \\Seen).
 * Mặc định bật; có thể tắt bằng `ECARGO_GMAIL_MARK_SEEN=0`.
 * Lỗi không làm fail job — chỉ log warning để dễ debug.
 * @param {import('imapflow').ImapFlow} client
 * @param {number|string} uid
 * @param {string} mailbox
 */
export async function markEcargoMailSeen(uid, mailbox) {
  if (uid == null || !mailbox) return;
  try {
    const client = await getPooledImapClient();
    await markMailSeen(client, uid, mailbox);
  } catch (e) {
    console.warn(`[ecargo-gmail] markEcargoMailSeen failed uid=${uid}:`, e?.message ?? e);
  }
}

async function markMailSeen(client, uid, mailbox) {
  if (process.env.ECARGO_GMAIL_MARK_SEEN === "0") return;
  if (!client || uid == null || !mailbox) return;
  try {
    if (poolOpenMailbox !== mailbox) {
      await client.mailboxOpen(mailbox);
      poolOpenMailbox = mailbox;
    }
    await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    console.info(`[ecargo-gmail] markSeen uid=${uid} mailbox=${mailbox}`);
  } catch (e) {
    console.warn(`[ecargo-gmail] markSeen failed uid=${uid}:`, e?.message ?? e);
  }
}

async function loadScscMailCandidates(client, notBeforeMs, subjectFilter, { includeAllMail = true } = {}) {
  const since = new Date(notBeforeMs - 3 * 60 * 1000);
  /** @type {Array<{ uid: number|string; mailbox: string; raw: string; envelope?: object; receivedMs?: number }>} */
  const all = [];
  const mailboxes = includeAllMail ? MAILBOXES : ["INBOX"];

  for (const mailbox of mailboxes) {
    try {
      await openMailbox(client, mailbox);
    } catch {
      continue;
    }
    // Gmail IMAP `subject:` hay lệch với tiền tố [eCargo] — lọc subject trong code.
    const uids = await client.search({ from: ECARGO_FROM, since });
    if (!uids.length) continue;

    const uidList = uids.map(String);
    for await (const msg of client.fetch(uidList, {
      source: true,
      envelope: true,
      internalDate: true,
    })) {
      if (!msg?.source) continue;
      const subject = msg.envelope?.subject || "";
      if (subjectFilter && !subjectFilter(subject)) continue;
      all.push({
        uid: msg.uid,
        mailbox,
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

function loadVerifyCandidates(client, notBeforeMs, opts) {
  return loadScscMailCandidates(client, notBeforeMs, isVerifyEcargoMailSubject, opts);
}

async function loadQrCandidates(client, notBeforeMs, opts) {
  return loadScscMailCandidates(
    client,
    notBeforeMs,
    (subject) => /Phiếu đăng ký hàng vào kho/i.test(String(subject ?? "")) && !isVerifyEcargoMailSubject(subject),
    opts
  );
}

async function pollScscMail(client, opts, pickFn, logLabel) {
  const notBeforeMs = opts.notBeforeMs ?? Date.now() - 60_000;
  const timeoutMs = opts.timeoutMs ?? 8 * 60 * 1000;
  const pollMs = opts.pollMs ?? ECARGO_GMAIL_POLL_MS;
  const matchHints = opts.matchHints;
  const markSeenOnPick = opts.markSeenOnPick !== false;
  const shouldAbort = opts.shouldAbort;
  const inboxFirstPolls = Math.max(0, Number(opts.inboxFirstPolls) || 0);
  const deadline = Date.now() + timeoutMs;
  const loadCandidates = opts.loadCandidates ?? loadVerifyCandidates;

  let pollCount = 0;
  while (Date.now() < deadline) {
    if (shouldAbort && (await shouldAbort())) {
      const err = new Error("ECARGO_JOB_SUPERSEDED");
      err.code = "ECARGO_JOB_SUPERSEDED";
      throw err;
    }
    try {
      const includeAllMail = inboxFirstPolls <= 0 || pollCount >= inboxFirstPolls;
      const candidates = await loadCandidates(client, notBeforeMs, { includeAllMail });
      const found = pickFn(candidates, notBeforeMs, matchHints);
      pollCount += 1;
      if (found) {
        console.info(`[ecargo-gmail] ${logLabel} uid=${found.uid} polls=${pollCount}`);
        if (markSeenOnPick && found.mailbox) {
          await markMailSeen(client, found.uid, found.mailbox);
        }
        return found;
      }
    } catch {
      resetPool();
      client = await getPooledImapClient();
      pollCount += 1;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    if (shouldAbort && (await shouldAbort())) {
      const err = new Error("ECARGO_JOB_SUPERSEDED");
      err.code = "ECARGO_JOB_SUPERSEDED";
      throw err;
    }

    // ImapFlow `client.idle()` không nhận tham số — nếu gọi IDLE thủ công sẽ block tới ~29 phút.
    // Dùng sleep thuần và để ImapFlow tự autoidle ở nền (maxIdleTime đã set 25s khi tạo client).
    const waitMs = Math.min(pollMs, remaining);
    await sleep(waitMs);
  }

  return null;
}

/** Một lần search IMAP — không poll lặp (dùng khi user bấm «Lấy mã QR»). */
async function fetchScscMailOnce(client, opts, pickFn, logLabel) {
  const notBeforeMs = opts.notBeforeMs ?? Date.now() - 60_000;
  const loadCandidates = opts.loadCandidates ?? loadVerifyCandidates;
  const includeAllMail = opts.includeAllMail === true;

  const loadOnce = async (imapClient) => {
    const candidates = await loadCandidates(imapClient, notBeforeMs, { includeAllMail });
    return pickFn(candidates, notBeforeMs, opts.matchHints);
  };

  try {
    const found = await loadOnce(client);
    if (found) {
      console.info(`[ecargo-gmail] ${logLabel} once uid=${found.uid}`);
      if (opts.markSeenOnPick !== false && found.mailbox) {
        await markMailSeen(client, found.uid, found.mailbox);
      }
      return found;
    }
  } catch {
    resetPool();
    client = await getPooledImapClient();
    const found = await loadOnce(client);
    if (found) {
      console.info(`[ecargo-gmail] ${logLabel} once(retry) uid=${found.uid}`);
      if (opts.markSeenOnPick !== false && found.mailbox) {
        await markMailSeen(client, found.uid, found.mailbox);
      }
      return found;
    }
  }
  return null;
}

/** Đếm mail parse được nhưng không khớp hints (debug timeout). */
async function countVerifyParseRejections(client, notBeforeMs, matchHints, opts = {}) {
  try {
    const candidates = await loadVerifyCandidates(client, notBeforeMs, opts);
    let parsed = 0;
    let unmatched = 0;
    for (const c of candidates) {
      const receivedMs = c.receivedMs ?? messageReceivedMs(c);
      if (receivedMs > 0 && receivedMs < notBeforeMs) continue;
      if (!parseVerifyMailRaw(c.raw, c.envelope)) continue;
      parsed += 1;
      if (!verifyMailMatchesBooking(mailBodyPlainText(c.raw), matchHints)) unmatched += 1;
    }
    return { parsed, unmatched, total: candidates.length };
  } catch {
    return { parsed: 0, unmatched: 0, total: 0 };
  }
}

/**
 * Đọc mail xác thực — dùng pool IMAP (không connect/logout mỗi job).
 * @param {{ notBeforeMs?: number; timeoutMs?: number; pollMs?: number; matchHints?: { mawb?: string; vehicleNo?: string } }} opts
 */
export async function waitForEcargoVerifyEmail(opts = {}) {
  let client;
  try {
    client = await getPooledImapClient();
  } catch (e) {
    resetPool();
    throw e;
  }

  const found = await pollScscMail(
    client,
    { ...opts, loadCandidates: loadVerifyCandidates, markSeenOnPick: false },
    pickFreshVerifyMail,
    "verify"
  );
  if (found) {
    console.info(
      `[ecargo-gmail] verify code=${found.verifyCode} reg=${found.registrationNo ?? "-"} received=${found.receivedMs ?? "?"}`
    );
    return found;
  }

  const diag = await countVerifyParseRejections(client, opts.notBeforeMs ?? Date.now() - 60_000, opts.matchHints, {
    includeAllMail: true,
  });
  if (diag.parsed > 0) {
    console.warn(
      `[ecargo-gmail] verify timeout: ${diag.parsed} mail parse OK nhưng không khớp lô (gợi ý MAWB/xe); inbox ${diag.total} mail`
    );
    throw new Error(
      "Có email xác thực trên Gmail nhưng không khớp lô này (MAWB/xe) — thử đăng ký lại hoặc mở link trong mail thủ công."
    );
  }

  throw new Error("Hết thời gian chờ email xác thực từ ecargo@scsc.vn.");
}

/**
 * Đọc mail QR sau khi đã bấm Xác Thực (subject Phiếu đăng ký hàng vào kho).
 * Không đánh dấu đã đọc — người dùng tự mở mail để lấy QR.
 * @param {{ notBeforeMs?: number; timeoutMs?: number; pollMs?: number; matchHints?: { registrationNo?: string; vehicleNo?: string; mawb?: string } }} opts
 */
export async function waitForEcargoQrEmail(opts = {}) {
  let client;
  try {
    client = await getPooledImapClient();
  } catch (e) {
    resetPool();
    throw e;
  }

  const qrOpts = {
    ...opts,
    loadCandidates: loadQrCandidates,
    markSeenOnPick: false,
    includeAllMail: !isEcargoQrInboxOnly(),
  };

  if (isEcargoQrSingleScan()) {
    const found = await fetchScscMailOnce(client, qrOpts, pickFreshQrMail, "qr");
    if (found) {
      console.info(
        `[ecargo-gmail] qr reg=${found.registrationNo} subject=${found.qrSubject ?? "?"} received=${found.receivedMs ?? "?"} (single scan)`
      );
      return found;
    }
    throw new Error(
      "Chưa thấy mail QR trên Gmail (một lần quét). Bấm «Lấy mã QR» lại khi SCSC đã gửi «Phiếu đăng ký hàng vào kho»."
    );
  }

  const found = await pollScscMail(
    client,
    {
      pollMs: ECARGO_QR_GMAIL_POLL_MS,
      inboxFirstPolls: isEcargoQrInboxOnly() ? 999 : 10,
      timeoutMs: opts.timeoutMs ?? ECARGO_QR_TIMEOUT_MS,
      ...qrOpts,
    },
    pickFreshQrMail,
    "qr"
  );
  if (found) {
    console.info(
      `[ecargo-gmail] qr reg=${found.registrationNo} subject=${found.qrSubject ?? "?"} received=${found.receivedMs ?? "?"}`
    );
    return found;
  }

  throw new Error("Hết thời gian chờ email QR (Phiếu đăng ký hàng vào kho) từ ecargo@scsc.vn.");
}
