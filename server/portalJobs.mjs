/**
 * Hàng đợi portal TCS cho phone độc lập (Railway).
 * Phone tạo job → worker máy kho claim → login/scan/pdf → upload kết quả.
 */
import crypto from "node:crypto";
import { getDbPool } from "./dbPool.mjs";

const JOB_TTL_MS = 30 * 60 * 1000;
const ARTIFACT_TTL_MS = 60 * 60 * 1000;
const WORKER_STALE_MS = 45_000;

/** @type {Map<string, any>} */
const memoryJobs = new Map();
/** @type {Map<string, any>} */
const memoryHeartbeat = new Map();

function workerSecret() {
  return String(process.env.PORTAL_WORKER_SECRET || "").trim();
}

export function isPortalWorkerAuthorized(req) {
  const secret = workerSecret();
  if (!secret) return false;
  const header = String(req.get("x-portal-worker-secret") || "").trim();
  const bearer = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return header === secret || bearer === secret;
}

export function portalWorkerConfigured() {
  return Boolean(workerSecret());
}

function newId() {
  return crypto.randomUUID();
}

async function ensurePortalSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portal_jobs (
      id text PRIMARY KEY,
      warehouse text NOT NULL,
      type text NOT NULL,
      status text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      result jsonb,
      error text,
      artifact bytea,
      artifact_name text,
      artifact_content_type text,
      claimed_by text,
      claimed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS portal_jobs_claim_idx
      ON portal_jobs (warehouse, status, created_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portal_worker_heartbeat (
      warehouse text PRIMARY KEY,
      worker_id text,
      logged_in boolean NOT NULL DEFAULT false,
      message text,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

let schemaReady = false;
async function withPool() {
  const pool = getDbPool();
  if (!pool) return null;
  if (!schemaReady) {
    try {
      await ensurePortalSchema(pool);
      schemaReady = true;
    } catch (err) {
      // DB cấu hình nhưng không nối được → fallback memory (local test / Postgres tắt).
      console.warn(
        "[portalJobs] Postgres unavailable — dùng memory fallback:",
        err?.message || err
      );
      return null;
    }
  }
  return pool;
}

/** Vitest: xóa job memory + buộc ensure schema lại. */
export function resetPortalJobsMemoryForTests() {
  memoryJobs.clear();
  memoryHeartbeat.clear();
  schemaReady = false;
}

function rowToJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    warehouse: row.warehouse,
    type: row.type,
    status: row.status,
    payload: row.payload || {},
    result: row.result || null,
    error: row.error || null,
    artifact_name: row.artifact_name || null,
    artifact_content_type: row.artifact_content_type || null,
    has_artifact: Boolean(row.has_artifact ?? row.artifact),
    claimed_by: row.claimed_by || null,
    claimed_at: row.claimed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
  };
}

export async function createPortalJob({ warehouse, type, payload }) {
  const wh = String(warehouse || "TCS").toUpperCase();
  const t = String(type || "").toLowerCase();
  if (!["login", "scan", "pdf"].includes(t)) {
    const err = new Error("type phải là login|scan|pdf");
    err.statusCode = 400;
    throw err;
  }
  if (wh !== "TCS" && wh !== "TECS-TCS") {
    const err = new Error("warehouse không hỗ trợ portal job");
    err.statusCode = 400;
    throw err;
  }
  const id = newId();
  const now = new Date();
  const expires = new Date(now.getTime() + JOB_TTL_MS);
  const body = payload && typeof payload === "object" ? payload : {};

  const pool = await withPool();
  if (pool) {
    await pool.query(
      `INSERT INTO portal_jobs
        (id, warehouse, type, status, payload, expires_at)
       VALUES ($1,$2,$3,'queued',$4::jsonb,$5)`,
      [id, wh, t, JSON.stringify(body), expires.toISOString()]
    );
    return getPortalJob(id);
  }

  const job = {
    id,
    warehouse: wh,
    type: t,
    status: "queued",
    payload: body,
    result: null,
    error: null,
    artifact: null,
    artifact_name: null,
    artifact_content_type: null,
    claimed_by: null,
    claimed_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
  memoryJobs.set(id, job);
  return rowToJob({ ...job, has_artifact: false });
}

export async function getPortalJob(id) {
  const pool = await withPool();
  if (pool) {
    const { rows } = await pool.query(
      `SELECT id, warehouse, type, status, payload, result, error,
              artifact_name, artifact_content_type,
              (artifact IS NOT NULL) AS has_artifact,
              claimed_by, claimed_at, created_at, updated_at, expires_at
         FROM portal_jobs WHERE id = $1`,
      [id]
    );
    return rowToJob(rows[0] || null);
  }
  const job = memoryJobs.get(id);
  if (!job) return null;
  return rowToJob({ ...job, has_artifact: Boolean(job.artifact) });
}

export async function getPortalArtifact(id) {
  const pool = await withPool();
  if (pool) {
    const { rows } = await pool.query(
      `SELECT artifact, artifact_name, artifact_content_type, status, expires_at
         FROM portal_jobs WHERE id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row?.artifact) return null;
    return {
      bytes: row.artifact,
      name: row.artifact_name || "ESID.pdf",
      contentType: row.artifact_content_type || "application/pdf",
    };
  }
  const job = memoryJobs.get(id);
  if (!job?.artifact) return null;
  return {
    bytes: job.artifact,
    name: job.artifact_name || "ESID.pdf",
    contentType: job.artifact_content_type || "application/pdf",
  };
}

export async function claimPortalJob({ warehouse, workerId }) {
  const wh = String(warehouse || "TCS").toUpperCase();
  const wid = String(workerId || "worker").slice(0, 80);
  const pool = await withPool();
  if (pool) {
    const { rows } = await pool.query(
      `UPDATE portal_jobs
          SET status = 'claimed',
              claimed_by = $2,
              claimed_at = now(),
              updated_at = now()
        WHERE id = (
          SELECT id FROM portal_jobs
           WHERE warehouse = $1
             AND status = 'queued'
             AND expires_at > now()
           ORDER BY created_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, warehouse, type, status, payload, result, error,
                  artifact_name, artifact_content_type,
                  false AS has_artifact,
                  claimed_by, claimed_at, created_at, updated_at, expires_at`,
      [wh, wid]
    );
    return rowToJob(rows[0] || null);
  }

  for (const job of memoryJobs.values()) {
    if (
      job.warehouse === wh &&
      job.status === "queued" &&
      new Date(job.expires_at).getTime() > Date.now()
    ) {
      job.status = "claimed";
      job.claimed_by = wid;
      job.claimed_at = new Date().toISOString();
      job.updated_at = job.claimed_at;
      return rowToJob({ ...job, has_artifact: false });
    }
  }
  return null;
}

export async function completePortalJob(id, { result, artifactBase64, artifactName, contentType }) {
  const pool = await withPool();
  let artifact = null;
  if (artifactBase64) {
    artifact = Buffer.from(String(artifactBase64), "base64");
    if (artifact.length < 100) {
      const err = new Error("artifact PDF quá nhỏ");
      err.statusCode = 400;
      throw err;
    }
  }
  const expires = new Date(Date.now() + ARTIFACT_TTL_MS);
  if (pool) {
    await pool.query(
      `UPDATE portal_jobs
          SET status = 'done',
              result = $2::jsonb,
              error = NULL,
              artifact = $3,
              artifact_name = $4,
              artifact_content_type = $5,
              updated_at = now(),
              expires_at = $6
        WHERE id = $1`,
      [
        id,
        JSON.stringify(result || {}),
        artifact,
        artifactName || null,
        contentType || (artifact ? "application/pdf" : null),
        expires.toISOString(),
      ]
    );
    return getPortalJob(id);
  }
  const job = memoryJobs.get(id);
  if (!job) return null;
  job.status = "done";
  job.result = result || {};
  job.error = null;
  job.artifact = artifact;
  job.artifact_name = artifactName || null;
  job.artifact_content_type = contentType || (artifact ? "application/pdf" : null);
  job.updated_at = new Date().toISOString();
  job.expires_at = expires.toISOString();
  return rowToJob({ ...job, has_artifact: Boolean(artifact) });
}

export async function failPortalJob(id, errorMessage) {
  const msg = String(errorMessage || "Job thất bại").slice(0, 800);
  const pool = await withPool();
  if (pool) {
    await pool.query(
      `UPDATE portal_jobs
          SET status = 'error', error = $2, updated_at = now()
        WHERE id = $1`,
      [id, msg]
    );
    return getPortalJob(id);
  }
  const job = memoryJobs.get(id);
  if (!job) return null;
  job.status = "error";
  job.error = msg;
  job.updated_at = new Date().toISOString();
  return rowToJob({ ...job, has_artifact: Boolean(job.artifact) });
}

export async function touchPortalWorkerHeartbeat({
  warehouse,
  workerId,
  loggedIn,
  message,
  meta,
}) {
  const wh = String(warehouse || "TCS").toUpperCase();
  const pool = await withPool();
  const payload = {
    warehouse: wh,
    worker_id: String(workerId || "worker").slice(0, 80),
    logged_in: Boolean(loggedIn),
    message: String(message || "").slice(0, 400),
    meta: meta && typeof meta === "object" ? meta : {},
    updated_at: new Date().toISOString(),
  };
  if (pool) {
    await pool.query(
      `INSERT INTO portal_worker_heartbeat
         (warehouse, worker_id, logged_in, message, meta, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb, now())
       ON CONFLICT (warehouse) DO UPDATE SET
         worker_id = EXCLUDED.worker_id,
         logged_in = EXCLUDED.logged_in,
         message = EXCLUDED.message,
         meta = EXCLUDED.meta,
         updated_at = now()`,
      [
        payload.warehouse,
        payload.worker_id,
        payload.logged_in,
        payload.message,
        JSON.stringify(payload.meta),
      ]
    );
    return getPortalWorkerStatus(wh);
  }
  memoryHeartbeat.set(wh, payload);
  return getPortalWorkerStatus(wh);
}

export async function getPortalWorkerStatus(warehouse = "TCS") {
  const wh = String(warehouse || "TCS").toUpperCase();
  const pool = await withPool();
  let row = null;
  if (pool) {
    const { rows } = await pool.query(
      `SELECT warehouse, worker_id, logged_in, message, meta, updated_at
         FROM portal_worker_heartbeat WHERE warehouse = $1`,
      [wh]
    );
    row = rows[0] || null;
  } else {
    row = memoryHeartbeat.get(wh) || null;
  }
  if (!row) {
    return {
      ok: true,
      warehouse: wh,
      online: false,
      logged_in: false,
      message: portalWorkerConfigured()
        ? "Chưa có worker máy kho — chạy npm run portal:worker"
        : "Chưa cấu hình PORTAL_WORKER_SECRET trên server",
      updated_at: null,
      worker_configured: portalWorkerConfigured(),
    };
  }
  const updatedMs = new Date(row.updated_at).getTime();
  const online = Number.isFinite(updatedMs) && Date.now() - updatedMs < WORKER_STALE_MS;
  return {
    ok: true,
    warehouse: wh,
    online,
    logged_in: Boolean(row.logged_in) && online,
    message: online
      ? row.message || (row.logged_in ? "Máy kho online · đã ĐN" : "Máy kho online · chưa ĐN")
      : "Máy kho offline (mất heartbeat)",
    worker_id: row.worker_id,
    updated_at: row.updated_at,
    meta: row.meta || {},
    worker_configured: portalWorkerConfigured(),
  };
}

export function registerPortalJobRoutes(app) {
  app.get("/api/portal-worker/status", async (req, res) => {
    try {
      const status = await getPortalWorkerStatus(req.query.warehouse || "TCS");
      res.json(status);
    } catch (e) {
      console.error("[portal-worker/status]", e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/portal-jobs", async (req, res) => {
    try {
      if (!portalWorkerConfigured()) {
        res.status(503).json({
          ok: false,
          error: "WORKER_SECRET_MISSING",
          message: "Server chưa có PORTAL_WORKER_SECRET — không nhận job từ xa.",
        });
        return;
      }
      const job = await createPortalJob({
        warehouse: req.body?.warehouse,
        type: req.body?.type,
        payload: req.body?.payload,
      });
      res.status(201).json({ ok: true, job });
    } catch (e) {
      const status = Number(e?.statusCode) || 500;
      res.status(status).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/portal-jobs/:id", async (req, res) => {
    try {
      const job = await getPortalJob(req.params.id);
      if (!job) {
        res.status(404).json({ ok: false, error: "NOT_FOUND" });
        return;
      }
      res.json({ ok: true, job });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/portal-jobs/:id/artifact", async (req, res) => {
    try {
      const art = await getPortalArtifact(req.params.id);
      if (!art) {
        res.status(404).json({ ok: false, error: "NO_ARTIFACT" });
        return;
      }
      res.setHeader("Content-Type", art.contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${String(art.name).replace(/"/g, "")}"`
      );
      res.send(Buffer.from(art.bytes));
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/portal-worker/heartbeat", async (req, res) => {
    if (!isPortalWorkerAuthorized(req)) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }
    try {
      const status = await touchPortalWorkerHeartbeat({
        warehouse: req.body?.warehouse || "TCS",
        workerId: req.body?.worker_id,
        loggedIn: req.body?.logged_in,
        message: req.body?.message,
        meta: req.body?.meta,
      });
      res.json(status);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/portal-worker/claim", async (req, res) => {
    if (!isPortalWorkerAuthorized(req)) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }
    try {
      const job = await claimPortalJob({
        warehouse: req.query.warehouse || "TCS",
        workerId: req.query.worker_id || req.get("x-worker-id"),
      });
      res.json({ ok: true, job });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/portal-worker/jobs/:id/complete", async (req, res) => {
    if (!isPortalWorkerAuthorized(req)) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }
    try {
      const job = await completePortalJob(req.params.id, {
        result: req.body?.result,
        artifactBase64: req.body?.artifact_base64,
        artifactName: req.body?.artifact_name,
        contentType: req.body?.content_type,
      });
      if (!job) {
        res.status(404).json({ ok: false, error: "NOT_FOUND" });
        return;
      }
      res.json({ ok: true, job });
    } catch (e) {
      const status = Number(e?.statusCode) || 500;
      res.status(status).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/portal-worker/jobs/:id/fail", async (req, res) => {
    if (!isPortalWorkerAuthorized(req)) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }
    try {
      const job = await failPortalJob(req.params.id, req.body?.error || req.body?.message);
      if (!job) {
        res.status(404).json({ ok: false, error: "NOT_FOUND" });
        return;
      }
      res.json({ ok: true, job });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
