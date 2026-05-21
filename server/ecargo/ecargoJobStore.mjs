import { randomUUID } from "node:crypto";
import { ECARGO_JOB_KEY_PREFIX, ECARGO_QUEUE_KEY } from "./ecargoConfig.mjs";

export function newEcargoJobId() {
  return randomUUID();
}

/** @typedef {'queued'|'filling'|'submitted'|'waiting_verify_email'|'verifying'|'verified'|'error'} EcargoJobStatus */

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
 */
export async function enqueueEcargoJob(client, job) {
  const payload = {
    ...job,
    status: /** @type {EcargoJobStatus} */ ("queued"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await patchEcargoJob(client, job.shipmentId, payload);
  await client.lPush(ECARGO_QUEUE_KEY, JSON.stringify({ shipmentId: job.shipmentId, jobId: job.jobId }));
  return payload;
}

const ACTIVE_STATUSES = new Set(["queued", "filling", "submitted", "waiting_verify_email", "verifying"]);

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
