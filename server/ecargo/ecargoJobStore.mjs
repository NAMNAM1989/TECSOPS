import { randomUUID } from "node:crypto";
import { ECARGO_JOB_KEY_PREFIX, ECARGO_QUEUE_KEY } from "./ecargoConfig.mjs";

export function newEcargoJobId() {
  return randomUUID();
}

/** @typedef {'queued'|'filling'|'submitted'|'waiting_verify_email'|'mail_received'|'verifying'|'verified_waiting_qr'|'qr_ready'|'verified'|'error'|'superseded'} EcargoJobStatus */

/**
 * @param {import('redis').RedisClientType} client
 * @param {string} shipmentId
 * @returns {Promise<object|null>}
 */
export async function getEcargoJob(client, shipmentId) {
  if (!client) return null;
  const raw = await client.get(`${ECARGO_JOB_KEY_PREFIX}${shipmentId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {import('redis').RedisClientType} client
 * @param {string} shipmentId
 * @param {object} patch
 */
export async function patchEcargoJob(client, shipmentId, patch) {
  const key = `${ECARGO_JOB_KEY_PREFIX}${shipmentId}`;
  const prev = (await getEcargoJob(client, shipmentId)) || {};
  const next = {
    ...prev,
    ...patch,
    shipmentId,
    updatedAt: new Date().toISOString(),
  };
  await client.set(key, JSON.stringify(next), { EX: 60 * 60 * 48 });
  return next;
}

/**
 * @param {import('redis').RedisClientType} client
 * @param {object} job
 * @param {{ prevJob?: object|null, resumeQrOnly?: boolean }} [opts]
 */
export async function enqueueEcargoJob(client, job, opts = {}) {
  const prevJob = opts.prevJob ?? null;
  const resumeQrOnly = opts.resumeQrOnly === true;
  const payload = {
    jobId: job.jobId,
    shipmentId: job.shipmentId,
    vehicleNo: job.vehicleNo,
    viewSessionYmd: job.viewSessionYmd,
    booking: job.booking,
    awb: job.awb,
    attempt: job.attempt,
    resumeQrOnly,
    qrFetchRequestedAt: resumeQrOnly ? new Date().toISOString() : undefined,
    status: /** @type {EcargoJobStatus} */ ("queued"),
    message: resumeQrOnly
      ? `Quét mail QR phiếu ${prevJob?.registrationNo ?? "?"} — một lần theo yêu cầu.`
      : job.message,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(resumeQrOnly && prevJob
      ? {
          verifyClickedAt: prevJob.verifyClickedAt,
          verifyCode: prevJob.verifyCode,
          verifyUrl: prevJob.verifyUrl,
          registrationNo: prevJob.registrationNo,
        }
      : {}),
  };
  const key = `${ECARGO_JOB_KEY_PREFIX}${job.shipmentId}`;
  await client.set(key, JSON.stringify(payload), { EX: 60 * 60 * 48 });
  await client.lPush(ECARGO_QUEUE_KEY, JSON.stringify({ shipmentId: job.shipmentId, jobId: job.jobId }));
  return payload;
}

const ACTIVE_STATUSES = new Set([
  "queued",
  "filling",
  "submitted",
  "waiting_verify_email",
  "mail_received",
  "verifying",
  "verified_waiting_qr",
]);

/**
 * @param {import('redis').RedisClientType} client
 * @param {string[]} shipmentIds
 */
export async function getEcargoJobsBatch(client, shipmentIds) {
  if (!client || !Array.isArray(shipmentIds) || shipmentIds.length === 0) {
    return {};
  }
  const ids = [...new Set(shipmentIds.map((id) => String(id).trim()).filter(Boolean))].slice(0, 200);
  const keys = ids.map((id) => `${ECARGO_JOB_KEY_PREFIX}${id}`);
  const values = await client.mGet(keys);
  /** @type {Record<string, object>} */
  const out = {};
  for (let i = 0; i < ids.length; i++) {
    const raw = values[i];
    if (!raw) continue;
    try {
      out[ids[i]] = JSON.parse(raw);
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * @param {object|null} job
 * @param {number} [windowMs=120000]
 */
export function isEcargoJobActive(job, windowMs = 120000) {
  if (!job?.status || !ACTIVE_STATUSES.has(job.status)) return false;
  const t = Date.parse(job.updatedAt || job.createdAt || "");
  if (!Number.isFinite(t)) return true;
  return Date.now() - t < windowMs;
}

const STALE_ACTIVE_MS = Number(process.env.ECARGO_STALE_JOB_MS) || 3 * 60 * 1000;

/**
 * Job active nhưng không cập nhật lâu — coi như kẹt, cho đăng ký lại.
 * @param {object|null} job
 */
export function isEcargoJobStaleActive(job) {
  if (!job?.status || !ACTIVE_STATUSES.has(job.status)) return false;
  const t = Date.parse(job.updatedAt || job.createdAt || "");
  if (!Number.isFinite(t)) return false;
  return Date.now() - t >= STALE_ACTIVE_MS;
}

/**
 * Có nên chặn tạo job mới không.
 * @param {object|null} existing
 * @param {{ forceRetry?: boolean }} [opts]
 */
export function shouldBlockEcargoEnqueue(existing, opts = {}) {
  if (!existing?.status || existing.status === "superseded") return false;
  if (opts.fetchQrOnly) {
    if (existing.status === "qr_ready") return true;
    if (existing.status === "verified_waiting_qr") {
      if (isEcargoJobStaleActive(existing)) return false;
      return isEcargoJobActive(existing, 90_000);
    }
    return false;
  }
  if (opts.forceRetry) {
    if (existing.status === "error") return false;
    if (existing.status === "verified" || existing.status === "qr_ready") return false;
    if (isEcargoJobStaleActive(existing)) return false;
    return isEcargoJobActive(existing, 90_000);
  }
  return isEcargoJobActive(existing);
}

/** Chỉ chờ mail QR — không tạo phiếu / bấm Xác Thực lại (tránh SCSC gửi trùng mail QR). */
export function shouldResumeEcargoQrOnly(prev) {
  if (prev.qrReceivedAt || prev.status === "qr_ready") return false;
  if (prev.status === "verified_waiting_qr") return true;
  const hasAnchor = prev?.verifyClickedAt || prev?.registrationNo || prev?.verifyCode;
  if (!hasAnchor) return false;
  return prev.status === "error" || prev.status === "verified";
}

/**
 * Worker còn đúng jobId trong Redis — job supersede / đăng ký mới thì dừng sớm.
 * @param {import('redis').RedisClientType} client
 */
export async function isEcargoJobCurrent(client, shipmentId, jobId) {
  if (!client || !shipmentId || !jobId) return true;
  const job = await getEcargoJob(client, shipmentId);
  if (!job?.jobId) return true;
  if (job.status === "superseded") return false;
  return job.jobId === jobId;
}

/**
 * Đánh dấu job cũ trước khi xếp hàng lần mới.
 * @param {import('redis').RedisClientType} client
 * @param {string} shipmentId
 * @param {string} nextJobId
 */
export async function supersedeEcargoJob(client, shipmentId, nextJobId) {
  const prev = await getEcargoJob(client, shipmentId);
  if (!prev?.status || prev.status === "superseded") return prev;
  return patchEcargoJob(client, shipmentId, {
    status: "superseded",
    supersededBy: nextJobId,
    message: "Đã hủy — có lệnh đăng ký mới.",
    finishedAt: new Date().toISOString(),
  });
}
