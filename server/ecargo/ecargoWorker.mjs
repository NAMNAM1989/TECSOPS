import { ECARGO_QUEUE_KEY, ECARGO_JOB_TIMEOUT_MS } from "./ecargoConfig.mjs";
import { getEcargoJob, patchEcargoJob } from "./ecargoJobStore.mjs";
import {
  closeEcargoContext,
  runEcargoPlaywrightSession,
  runVerifyInContext,
} from "./ecargoPlaywright.mjs";
import { waitForEcargoVerifyEmail } from "./ecargoGmail.mjs";

/**
 * @param {import('redis').RedisClientType | null | {
 *   queueClient?: import('redis').RedisClientType | null;
 *   storeClient?: import('redis').RedisClientType | null;
 *   io?: import('socket.io').Server;
 *   runMutation?: (m: object) => Promise<object>;
 * }} redisOrDeps
 * @param {{ io?: import('socket.io').Server, runMutation?: (m: object) => Promise<object> }} [legacyDeps]
 */
export function startEcargoWorker(redisOrDeps, legacyDeps) {
  /** @type {import('redis').RedisClientType | null} */
  let queueClient = null;
  /** @type {import('redis').RedisClientType | null} */
  let storeClient = null;
  /** @type {{ io?: import('socket.io').Server, runMutation?: (m: object) => Promise<object> }} */
  let deps = legacyDeps ?? {};

  if (redisOrDeps && typeof redisOrDeps === "object" && "queueClient" in redisOrDeps) {
    queueClient = redisOrDeps.queueClient ?? null;
    storeClient = redisOrDeps.storeClient ?? queueClient;
    deps = {
      io: redisOrDeps.io ?? deps.io,
      runMutation: redisOrDeps.runMutation ?? deps.runMutation,
    };
  } else {
    queueClient = /** @type {import('redis').RedisClientType | null} */ (redisOrDeps);
    storeClient = queueClient;
  }

  if (!queueClient) {
    console.info("[ecargo] Worker tắt — không có Redis.");
    return () => {};
  }
  if (process.env.ECARGO_WORKER_ENABLED === "0") {
    console.info("[ecargo] Worker tắt — ECARGO_WORKER_ENABLED=0");
    return () => {};
  }

  let stopped = false;

  const emitJob = (job) => {
    deps.io?.emit("ecargo-job", job);
  };

  const updateJob = async (shipmentId, patch) => {
    const job = await patchEcargoJob(storeClient, shipmentId, patch);
    emitJob(job);
    return job;
  };

  const processOne = async (shipmentId, jobId) => {
    const existing = await getEcargoJob(storeClient, shipmentId);
    const booking = existing?.booking;
    if (!booking) {
      await updateJob(shipmentId, {
        status: "error",
        message: "Job thiếu dữ liệu booking.",
        jobId,
      });
      return;
    }

    const startedAt = Date.now();
    /** @type {import('playwright').BrowserContext | null} */
    let browserContext = null;
    try {
      const tPlaywright = Date.now();
      const { submittedAt, context } = await runEcargoPlaywrightSession(booking, {
        onStatus: (status) => {
          void updateJob(shipmentId, { status, jobId });
        },
      });
      browserContext = context;
      const playwrightMs = Date.now() - tPlaywright;
      console.info(`[ecargo] ${shipmentId} playwright ${playwrightMs}ms`);

      await updateJob(shipmentId, { status: "waiting_verify_email", submittedAt, jobId });

      const tMail = Date.now();
      const mail = await waitForEcargoVerifyEmail({
        notBeforeMs: submittedAt - 15_000,
        timeoutMs: Math.min(ECARGO_JOB_TIMEOUT_MS, 10 * 60 * 1000),
        matchHints: { mawb: booking.mawb, vehicleNo: booking.vehicleNo },
      });
      const mailMs = Date.now() - tMail;
      console.info(`[ecargo] ${shipmentId} gmail ${mailMs}ms`);

      const tVerify = Date.now();
      const verifyTask = runVerifyInContext(browserContext, mail.verifyUrl);
      void updateJob(shipmentId, {
        status: "verifying",
        verifyUrl: mail.verifyUrl,
        verifyCode: mail.verifyCode,
        jobId,
      });
      await verifyTask;
      await closeEcargoContext(browserContext);
      browserContext = null;
      const verifyMs = Date.now() - tVerify;
      console.info(`[ecargo] ${shipmentId} verify ${verifyMs}ms`);

      const totalMs = Date.now() - startedAt;
      await updateJob(shipmentId, {
        status: "verified",
        message: "Đã tạo phiếu và xác thực thành công.",
        finishedAt: new Date().toISOString(),
        durationMs: totalMs,
        jobId,
      });
      console.info(`[ecargo] ${shipmentId} done ${totalMs}ms (pw=${playwrightMs} mail=${mailMs} verify=${verifyMs})`);

      if (deps.runMutation) {
        const next = await deps.runMutation({
          action: "PATCH_ECARGO_KHO_SCSC",
          shipmentId,
          markedSubmitted: true,
        });
        deps.io?.emit("sync", next);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[ecargo] job failed", shipmentId, message);
      await closeEcargoContext(browserContext);
      await updateJob(shipmentId, {
        status: "error",
        message,
        finishedAt: new Date().toISOString(),
        jobId,
      });
    }
  };

  (async function loop() {
    console.info("[ecargo] Worker started — queue", ECARGO_QUEUE_KEY);
    while (!stopped) {
      try {
        const result = await queueClient.brPop(ECARGO_QUEUE_KEY, 5);
        if (!result) continue;
        const raw = result.element;
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }
        const shipmentId = parsed?.shipmentId;
        const jobId = parsed?.jobId;
        if (!shipmentId) continue;
        await processOne(shipmentId, jobId);
      } catch (e) {
        if (stopped) break;
        console.error("[ecargo] worker loop", e?.message ?? e);
        await sleep(3000);
      }
    }
  })();

  return () => {
    stopped = true;
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
