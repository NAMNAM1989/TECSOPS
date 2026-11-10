/**
 * Webhook push v1: POST JSON tới các URL cấu hình mỗi khi có shipments.changed.
 *
 * ENV:
 *   TECSOPS_WEBHOOK_URLS    — danh sách URL, phân tách dấu phẩy
 *   TECSOPS_WEBHOOK_SECRET  — khóa HMAC-SHA256 (bắt buộc nếu có URL)
 *   TECSOPS_WEBHOOK_VIEW    — core (mặc định) | full
 *
 * Chữ ký: X-TECSOPS-Signature: sha256=hex(HMAC(secret, `${timestamp}.${body}`))
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { projectEventForSubscriber } from "./pushEvents.mjs";

const DEFAULT_RETRY_DELAYS_MS = [1000, 4000, 15000];
const DEFAULT_TIMEOUT_MS = 5000;

export function signWebhookPayload(secret, timestamp, body) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyWebhookSignature(secret, timestamp, body, signature) {
  const expected = Buffer.from(signWebhookPayload(secret, timestamp, body));
  const got = Buffer.from(String(signature || ""));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function parseWebhookConfig(env = process.env) {
  const urls = String(env.TECSOPS_WEBHOOK_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
  const secret = String(env.TECSOPS_WEBHOOK_SECRET || "").trim();
  const view = String(env.TECSOPS_WEBHOOK_VIEW || "").trim().toLowerCase() === "full" ? "full" : "core";
  return { urls, secret, view };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{ urls: string[], secret: string, view?: 'core'|'full',
 *           retryDelaysMs?: number[], timeoutMs?: number, fetchImpl?: typeof fetch }} options
 */
export function createWebhookDispatcher(options) {
  const {
    urls,
    secret,
    view = "core",
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  /** Hàng đợi tuần tự theo URL để app nhận đúng thứ tự stateVersion. */
  const queues = new Map(urls.map((u) => [u, Promise.resolve()]));

  async function deliverOnce(url, event, body) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TECSOPS-Webhook/1",
        "X-TECSOPS-Event": event.type,
        "X-TECSOPS-Event-Id": event.eventId,
        "X-TECSOPS-Timestamp": timestamp,
        "X-TECSOPS-Signature": signWebhookPayload(secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async function deliver(url, event) {
    const body = JSON.stringify(event);
    for (let attempt = 0; ; attempt++) {
      try {
        await deliverOnce(url, event, body);
        return true;
      } catch (err) {
        if (attempt >= retryDelaysMs.length) {
          console.error(
            `[webhook] bỏ event ${event.eventId} → ${new URL(url).origin}: ${err?.message || err}`,
          );
          return false;
        }
        await sleep(retryDelaysMs[attempt]);
      }
    }
  }

  return {
    /** Không chặn caller; trả Promise hoàn tất khi mọi URL đã xử lý (dùng cho test). */
    dispatch(event) {
      const payload = projectEventForSubscriber(event, { view });
      if (!payload) return Promise.resolve();
      const jobs = [];
      for (const url of urls) {
        const job = queues.get(url).then(() => deliver(url, payload));
        queues.set(url, job.catch(() => {}));
        jobs.push(job);
      }
      return Promise.allSettled(jobs);
    },
  };
}
