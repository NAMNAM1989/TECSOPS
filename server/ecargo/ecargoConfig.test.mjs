import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  isEcargoQrInboxOnly,
  isEcargoQrSingleScan,
  isEcargoWorkerEnabled,
  isRailwayRuntime,
} from "./ecargoConfig.mjs";

describe("ecargo QR config", () => {
  it("mặc định single scan khi bấm Lấy QR", () => {
    expect(isEcargoQrSingleScan()).toBe(true);
  });

  it("mặc định QR chỉ search INBOX", () => {
    expect(isEcargoQrInboxOnly()).toBe(true);
  });
});

describe("isEcargoWorkerEnabled", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("tắt khi ECARGO_WORKER_ENABLED=0", () => {
    process.env.ECARGO_WORKER_ENABLED = "0";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.RAILWAY_ENVIRONMENT = "production";
    expect(isEcargoWorkerEnabled()).toBe(false);
  });

  it("local tắt trừ khi ECARGO_WORKER_ENABLED=1", () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    delete process.env.ECARGO_WORKER_ENABLED;
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.RAILWAY_PROJECT_ID;
    delete process.env.RAILWAY_SERVICE_ID;
    expect(isEcargoWorkerEnabled()).toBe(false);
    process.env.ECARGO_WORKER_ENABLED = "1";
    expect(isEcargoWorkerEnabled()).toBe(true);
  });

  it("Railway bật khi có REDIS_URL", () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.RAILWAY_ENVIRONMENT = "production";
    delete process.env.ECARGO_WORKER_ENABLED;
    expect(isEcargoWorkerEnabled()).toBe(true);
    expect(isRailwayRuntime()).toBe(true);
  });

  it("NODE_ENV=production local không tự bật worker", () => {
    process.env.NODE_ENV = "production";
    process.env.REDIS_URL = "redis://localhost:6379";
    delete process.env.ECARGO_WORKER_ENABLED;
    delete process.env.RAILWAY_ENVIRONMENT;
    expect(isEcargoWorkerEnabled()).toBe(false);
  });
});
