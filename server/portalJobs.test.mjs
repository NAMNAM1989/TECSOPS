import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resetDbPoolForTests } from "./dbPool.mjs";
import {
  claimPortalJob,
  completePortalJob,
  createPortalJob,
  getPortalArtifact,
  isPortalWorkerAuthorized,
  portalWorkerConfigured,
  resetPortalJobsMemoryForTests,
} from "./portalJobs.mjs";

describe("portalJobs memory fallback", () => {
  const prevDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    process.env.PORTAL_WORKER_SECRET = "test-secret";
    // Ép memory fallback — không phụ thuộc Postgres local.
    delete process.env.DATABASE_URL;
    await resetDbPoolForTests();
    resetPortalJobsMemoryForTests();
  });

  afterEach(async () => {
    if (prevDatabaseUrl == null) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDatabaseUrl;
    await resetDbPoolForTests();
    resetPortalJobsMemoryForTests();
  });

  it("create → claim → complete pdf artifact", async () => {
    const created = await createPortalJob({
      warehouse: "TCS",
      type: "pdf",
      payload: { awb: "29739702876" },
    });
    expect(created?.id).toBeTruthy();
    expect(created.status).toBe("queued");

    const claimed = await claimPortalJob({
      warehouse: "TCS",
      workerId: "test-worker",
    });
    expect(claimed?.id).toBe(created.id);
    expect(claimed.status).toBe("claimed");

    const pdf = Buffer.from("%PDF-1.4 test-bytes-more-than-100-" + "x".repeat(80));
    const done = await completePortalJob(created.id, {
      result: { pdf_name: "297-39702876_ESID.pdf" },
      artifactBase64: pdf.toString("base64"),
      artifactName: "297-39702876_ESID.pdf",
      contentType: "application/pdf",
    });
    expect(done.status).toBe("done");
    expect(done.has_artifact).toBe(true);

    const art = await getPortalArtifact(created.id);
    expect(art?.bytes?.length).toBeGreaterThan(100);
  });

  it("worker auth", () => {
    expect(portalWorkerConfigured()).toBe(true);
    expect(
      isPortalWorkerAuthorized({
        get: (k) => (k === "x-portal-worker-secret" ? "test-secret" : ""),
      })
    ).toBe(true);
    expect(
      isPortalWorkerAuthorized({
        get: () => "",
      })
    ).toBe(false);
  });
});
