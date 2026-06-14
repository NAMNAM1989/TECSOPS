import {
  ECARGO_QUEUE_KEY,
  ECARGO_JOB_TIMEOUT_MS,
  ECARGO_JOB_KEY_PREFIX,
  ECARGO_QR_TIMEOUT_MS,
  isEcargoWorkerEnabled,
} from "./ecargoConfig.mjs";
import {
  getEcargoJob,
  patchEcargoJob,
  isEcargoJobStaleActive,
  isEcargoJobCurrent,
} from "./ecargoJobStore.mjs";
import {
  closeEcargoBrowser,
  closeEcargoContext,
  runEcargoPlaywrightSession,
  runVerifyInContext,
  warmEcargoPlaywright,
} from "./ecargoPlaywright.mjs";
import {
  shutdownEcargoGmail,
  warmEcargoGmail,
  assertEcargoGmailReady,
  markEcargoMailSeen,
  waitForEcargoQrEmail,
  waitForEcargoVerifyEmail,
} from "./ecargoGmail.mjs";

/**
 * Luồng eCargo (tuần tự — bước sau phụ thuộc bước trước):
 * 1. queued → filling → submitted     Playwright điền form + tạo phiếu
 * 2. waiting_verify_email             Chờ mail «Mã xác thực…» (sau submittedAt)
 * 3. mail_received                    Parse link + mã từ Gmail
 * 4. verifying                        Mở link Verify + bấm nút Xác Thực
 * 5. verified (mặc định) — QR chỉ khi user bấm «Lấy mã QR» (resumeQrOnly)
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
  if (!isEcargoWorkerEnabled()) {
    if (process.env.ECARGO_WORKER_ENABLED === "0") {
      console.info("[ecargo] Worker tắt — ECARGO_WORKER_ENABLED=0");
    } else {
      console.info(
        "[ecargo] Worker tắt — local cần ECARGO_WORKER_ENABLED=1; Railway tự bật khi có REDIS_URL"
      );
    }
    return () => {};
  }

  let stopped = false;

  const emitJob = (job) => {
    deps.io?.emit("ecargo-job", job);
  };

  const updateJob = async (shipmentId, patch) => {
    if (!(await isEcargoJobCurrent(storeClient, shipmentId, patch.jobId ?? jobIdRef.current))) {
      const err = new Error("ECARGO_JOB_SUPERSEDED");
      err.code = "ECARGO_JOB_SUPERSEDED";
      throw err;
    }
    const job = await patchEcargoJob(storeClient, shipmentId, patch);
    emitJob(job);
    return job;
  };

  /** @type {{ current: string|undefined }} */
  const jobIdRef = { current: undefined };

  const assertJobCurrent = async (shipmentId, jobId) => {
    if (!(await isEcargoJobCurrent(storeClient, shipmentId, jobId))) {
      const err = new Error("ECARGO_JOB_SUPERSEDED");
      err.code = "ECARGO_JOB_SUPERSEDED";
      throw err;
    }
  };

  const shouldAbortJob = (shipmentId, jobId) => async () =>
    !(await isEcargoJobCurrent(storeClient, shipmentId, jobId));

  const finishVerifiedSuccess = async (
    shipmentId,
    jobId,
    startedAt,
    mail,
    regNo,
    stageMs = {},
    verifyClickedAt
  ) => {
    const verifyDoneBits = [
      regNo ? `Phiếu ${regNo}` : "",
      mail?.verifyCode ? `Mã ${mail.verifyCode}` : "",
    ].filter(Boolean);
    await updateJob(shipmentId, {
      status: "verified",
      verifyCode: mail?.verifyCode,
      registrationNo: regNo || undefined,
      verifyClickedAt,
      message:
        verifyDoneBits.length > 0
          ? `Đã xác thực — ${verifyDoneBits.join(" · ")}. Bấm «Lấy mã QR» khi cần vào kho.`
          : "Đã xác thực thành công. Bấm «Lấy mã QR» khi cần vào kho.",
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      jobId,
      stageMs,
    });
    if (deps.runMutation) {
      await deps.runMutation({
        action: "PATCH_ECARGO_KHO_SCSC",
        shipmentId,
        markedSubmitted: true,
      });
    }
  };

  const finishVerifiedWithoutQr = async (
    shipmentId,
    jobId,
    startedAt,
    mail,
    regNo,
    stageMs = {},
    verifyClickedAt
  ) => {
    await finishVerifiedSuccess(
      shipmentId,
      jobId,
      startedAt,
      mail,
      regNo,
      stageMs,
      verifyClickedAt
    );
  };

  const runQrWaitPhase = async ({
    shipmentId,
    jobId,
    startedAt,
    booking,
    mail,
    regNo,
    verifyClickedAt,
    stageMs = {},
    browserContext = null,
  }) => {
    const skipQr = process.env.ECARGO_SKIP_QR_WAIT === "1";
    if (skipQr) {
      await updateJob(shipmentId, {
        status: "verified",
        verifyCode: mail?.verifyCode,
        registrationNo: regNo || undefined,
        message: "Đã tạo phiếu và xác thực (bỏ qua chờ QR).",
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        jobId,
        stageMs,
      });
      if (deps.runMutation) {
        await deps.runMutation({
          action: "PATCH_ECARGO_KHO_SCSC",
          shipmentId,
          markedSubmitted: true,
        });
      }
      return;
    }

    const tQr = Date.now();
    const anchorMs = Date.parse(String(verifyClickedAt ?? ""));
    const qrNotBefore = Number.isFinite(anchorMs)
      ? anchorMs - 2_000
      : Date.now() - 30 * 60 * 1000;
    await updateJob(shipmentId, {
      status: "verified_waiting_qr",
      verifyClickedAt,
      registrationNo: regNo,
      message: `Đang quét mail QR phiếu ${regNo || "?"} (theo yêu cầu)…`,
      jobId,
    });
    console.info(`[ecargo] ${shipmentId} step4 gmail qr (user requested)`);
    let qrMail;
    try {
      qrMail = await waitForEcargoQrEmail({
        notBeforeMs: Number.isFinite(qrNotBefore) ? qrNotBefore : Date.now() - 60_000,
        timeoutMs: Math.min(ECARGO_JOB_TIMEOUT_MS, ECARGO_QR_TIMEOUT_MS),
        matchHints: {
          registrationNo: regNo || undefined,
          mawb: booking.mawb,
          vehicleNo: booking.vehicleNo,
        },
        shouldAbort: shouldAbortJob(shipmentId, jobId),
      });
    } catch (qrErr) {
      if (qrErr?.code === "ECARGO_JOB_SUPERSEDED") throw qrErr;
      const qrMsg = qrErr instanceof Error ? qrErr.message : String(qrErr);
      console.warn(`[ecargo] ${shipmentId} qr wait:`, qrMsg);
      if (browserContext) {
        await closeEcargoContext(browserContext, { destroy: false });
      }
      await finishVerifiedWithoutQr(
        shipmentId,
        jobId,
        startedAt,
        mail,
        regNo,
        {
          ...stageMs,
          qrWait: Date.now() - tQr,
        },
        verifyClickedAt
      );
      return;
    }

    const qrWaitMs = Date.now() - tQr;
    console.info(`[ecargo] ${shipmentId} step4 done ${qrWaitMs}ms reg=${qrMail.registrationNo}`);
    const finalReg = qrMail?.registrationNo || regNo;
    const doneBits = [
      finalReg ? `Phiếu ${finalReg}` : "",
      mail?.verifyCode ? `Mã ${mail.verifyCode}` : "",
    ].filter(Boolean);
    await updateJob(shipmentId, {
      status: "qr_ready",
      verifyCode: mail?.verifyCode,
      registrationNo: finalReg,
      qrSubject: qrMail.qrSubject,
      hasQrImage: Boolean(qrMail.qrImageDataUrl || qrMail.hasQrImage),
      ...(qrMail.qrImageDataUrl ? { qrImageDataUrl: qrMail.qrImageDataUrl } : {}),
      qrReceivedAt: new Date().toISOString(),
      message:
        doneBits.length > 0
          ? `Đã có mail QR — ${doneBits.join(" · ")}${qrMail.hasQrImage ? " · có ảnh QR" : ""}`
          : `Đã nhận email QR từ SCSC${qrMail.hasQrImage ? " (có ảnh)" : ""}.`,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      stageMs: { ...stageMs, qrWait: qrWaitMs },
      jobId,
      resumeQrOnly: false,
    });
    if (deps.runMutation) {
      await deps.runMutation({
        action: "PATCH_ECARGO_KHO_SCSC",
        shipmentId,
        markedSubmitted: true,
      });
    }
    if (browserContext) {
      await closeEcargoContext(browserContext, { destroy: false });
    }
  };

  const processOne = async (shipmentId, jobId) => {
    jobIdRef.current = jobId;
    const existing = await getEcargoJob(storeClient, shipmentId);
    if (jobId && existing?.jobId && existing.jobId !== jobId) {
      console.info(`[ecargo] skip superseded job ${shipmentId} (queued=${jobId} current=${existing.jobId})`);
      return;
    }
    if (existing?.status === "superseded") {
      console.info(`[ecargo] skip superseded status ${shipmentId}`);
      return;
    }
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

    if (
      existing?.resumeQrOnly &&
      (existing?.verifyClickedAt || existing?.registrationNo || existing?.verifyCode)
    ) {
      console.info(`[ecargo] ${shipmentId} resume qr-only reg=${existing.registrationNo}`);
      try {
        await runQrWaitPhase({
          shipmentId,
          jobId,
          startedAt,
          booking,
          mail: {
            verifyCode: existing.verifyCode,
          },
          regNo: existing.registrationNo,
          verifyClickedAt:
            existing.verifyClickedAt ||
            existing.mailReceivedAt ||
            new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        });
      } catch (e) {
        if (e?.code === "ECARGO_JOB_SUPERSEDED") {
          console.info(`[ecargo] aborted superseded (qr-only) ${shipmentId} job=${jobId}`);
          return;
        }
        throw e;
      }
      return;
    }

    const mailHints = { mawb: booking.mawb, vehicleNo: booking.vehicleNo };
    /** @type {import('playwright').BrowserContext | null} */
    let browserContext = null;
    try {
      await warmEcargoPlaywright().catch((e) =>
        console.warn(`[ecargo] ${shipmentId} playwright warm:`, e?.message ?? e)
      );

      const gmailReady = warmEcargoGmail().catch((e) => {
        console.warn(`[ecargo] ${shipmentId} gmail warm:`, e?.message ?? e);
      });

      // —— Bước 1: Tạo phiếu trên eCargo (Playwright) ——
      console.info(`[ecargo] ${shipmentId} step1 playwright`);
      const tPlaywright = Date.now();
      const { submittedAt, context } = await runEcargoPlaywrightSession(booking, {
        onStatus: (status) => {
          void updateJob(shipmentId, {
            status,
            jobId,
            ...(status === "filling" ? { message: "Đang điền form eCargo…" } : {}),
            ...(status === "submitted"
              ? { message: "Đã tạo phiếu — sắp chờ email xác thực…" }
              : {}),
          });
        },
      });
      browserContext = context;
      const playwrightMs = Date.now() - tPlaywright;
      console.info(`[ecargo] ${shipmentId} step1 done ${playwrightMs}ms submittedAt=${submittedAt}`);

      await updateJob(shipmentId, {
        status: "waiting_verify_email",
        submittedAt,
        message: "Đã tạo phiếu — đang chờ email «Mã xác thực…» từ SCSC.",
        stageMs: { playwright: playwrightMs },
        jobId,
      });

      await assertJobCurrent(shipmentId, jobId);

      await gmailReady;
      await assertEcargoGmailReady();

      // —— Bước 2: Đọc mail xác thực (chỉ mail sau lúc gửi phiếu) ——
      const mailNotBefore = submittedAt - 5_000;
      console.info(`[ecargo] ${shipmentId} step2 gmail verify notBefore=${mailNotBefore}`);
      const tMail = Date.now();
      const mail = await waitForEcargoVerifyEmail({
        notBeforeMs: mailNotBefore,
        timeoutMs: Math.min(ECARGO_JOB_TIMEOUT_MS, 10 * 60 * 1000),
        matchHints: mailHints,
        shouldAbort: shouldAbortJob(shipmentId, jobId),
      });
      const mailMs = Date.now() - tMail;
      const mailBits = [
        mail.verifyCode ? `Mã xác thực ${mail.verifyCode}` : "",
        mail.registrationNo ? `Phiếu ${mail.registrationNo}` : "",
      ].filter(Boolean);
      console.info(
        `[ecargo] ${shipmentId} step2 done ${mailMs}ms code=${mail.verifyCode ?? "?"} reg=${mail.registrationNo ?? "-"}`
      );

      await updateJob(shipmentId, {
        status: "mail_received",
        verifyUrl: mail.verifyUrl,
        verifyCode: mail.verifyCode,
        registrationNo: mail.registrationNo,
        mailReceivedAt: new Date().toISOString(),
        message: mailBits.length ? mailBits.join(" · ") : "Đã nhận email từ ecargo@scsc.vn",
        stageMs: { playwright: playwrightMs, verifyMail: mailMs },
        jobId,
      });

      // —— Bước 3: Mở link Verify + bấm Xác Thực ——
      if (!mail.verifyUrl) {
        throw new Error("Email xác thực thiếu link Verify — không thể bấm Xác Thực tự động.");
      }
      console.info(`[ecargo] ${shipmentId} step3 verify click url=${mail.verifyUrl.slice(0, 72)}…`);
      const tVerify = Date.now();
      await updateJob(shipmentId, {
        status: "verifying",
        verifyUrl: mail.verifyUrl,
        verifyCode: mail.verifyCode,
        registrationNo: mail.registrationNo,
        message: `Đang mở link và bấm Xác Thực… (mã ${mail.verifyCode ?? "?"})`,
        jobId,
      });

      const verifyOutcome = await runVerifyInContext(browserContext, mail.verifyUrl);
      if (!verifyOutcome.verifyClicked) {
        throw new Error("Không bấm được nút Xác Thực trên eCargo.");
      }
      if (mail.uid != null && mail.mailbox) {
        await markEcargoMailSeen(mail.uid, mail.mailbox);
      }
      const verifyMs = Date.now() - tVerify;
      console.info(
        `[ecargo] ${shipmentId} step3 done ${verifyMs}ms method=${verifyOutcome.verifyClickMethod ?? "?"} reg=${verifyOutcome.registrationNo ?? "-"}`
      );

      const verifyClickedAt = new Date().toISOString();
      const regNo = verifyOutcome.registrationNo || mail.registrationNo || "";
      const stageMs = { playwright: playwrightMs, verifyMail: mailMs, verify: verifyMs };

      if (browserContext) {
        await closeEcargoContext(browserContext, { destroy: false });
        browserContext = null;
      }
      await finishVerifiedSuccess(
        shipmentId,
        jobId,
        startedAt,
        mail,
        regNo,
        stageMs,
        verifyClickedAt
      );
      console.info(`[ecargo] ${shipmentId} done ${Date.now() - startedAt}ms`);
    } catch (e) {
      if (e?.code === "ECARGO_JOB_SUPERSEDED") {
        console.info(`[ecargo] aborted superseded ${shipmentId} job=${jobId}`);
        await closeEcargoContext(browserContext, { destroy: true });
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      console.error("[ecargo] job failed", shipmentId, message);
      await closeEcargoContext(browserContext, { destroy: true });
      try {
        await updateJob(shipmentId, {
          status: "error",
          message,
          finishedAt: new Date().toISOString(),
          jobId,
        });
      } catch (patchErr) {
        if (patchErr?.code !== "ECARGO_JOB_SUPERSEDED") throw patchErr;
      }
    }
  };

  void recoverOrphanedEcargoJobs(storeClient, emitJob).catch((e) =>
    console.warn("[ecargo] recover stale jobs:", e?.message ?? e)
  );

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
    void shutdownEcargoGmail();
    void closeEcargoBrowser().catch((e) =>
      console.warn("[ecargo] close browser:", e?.message ?? e)
    );
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Job kẹt sau restart deploy — dọn trạng thái để UI không treo «đang đọc mail» vô hạn. */
async function recoverOrphanedEcargoJobs(storeClient, emitJob) {
  if (!storeClient) return;
  const keys = await storeClient.keys(`${ECARGO_JOB_KEY_PREFIX}*`);
  for (const key of keys) {
    const raw = await storeClient.get(key);
    if (!raw) continue;
    let job;
    try {
      job = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isEcargoJobStaleActive(job)) continue;

    if (job.verifyClickedAt || job.status === "verified_waiting_qr") {
      const reg = job.registrationNo || "?";
      const next = await patchEcargoJob(storeClient, job.shipmentId, {
        status: "verified",
        message: `Đã xác thực phiếu ${reg} — worker khởi động lại (bỏ qua chờ mail QR).`,
        finishedAt: new Date().toISOString(),
      });
      emitJob?.(next);
      console.info(`[ecargo] recovered stale verified job ${job.shipmentId} → verified`);
      continue;
    }

    const next = await patchEcargoJob(storeClient, job.shipmentId, {
      status: "error",
      message:
        job.status === "waiting_verify_email"
          ? "Job eCargo bị gián đoạn khi chờ mail xác thực — bấm «Đăng ký lại eCargo»."
          : "Job eCargo bị gián đoạn — bấm «Đăng ký lại eCargo».",
      finishedAt: new Date().toISOString(),
    });
    emitJob?.(next);
    console.info(`[ecargo] recovered stale job ${job.shipmentId} (${job.status}) → error`);
  }
}
