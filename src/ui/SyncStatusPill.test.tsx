import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SyncStatusPill } from "./SyncStatusPill";

describe("SyncStatusPill", () => {
  it("renders live status without role=status and with green dot", () => {
    const html = renderToStaticMarkup(
      <SyncStatusPill status="live" socketConnected={true} lastSyncedAt={new Date("2026-09-27T10:30:00Z")} />
    );
    expect(html).toContain("Live");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("aria-live");
    expect(html).toContain("bg-green-600");
  });

  it("renders degraded status as button when interactive and onRefresh provided", () => {
    const html = renderToStaticMarkup(
      <SyncStatusPill status="degraded" socketConnected={false} interactive onRefresh={() => {}} />
    );
    expect(html).toContain("<button");
    expect(html).toContain("Hạn chế");
    expect(html).toContain('aria-label="Đồng bộ hạn chế, bấm để làm mới"');
    expect(html).toContain("bg-orange-600");
  });

  it("renders degraded status as span when interactive is false (nested interactive prevention)", () => {
    const html = renderToStaticMarkup(
      <SyncStatusPill status="degraded" socketConnected={false} interactive={false} onRefresh={() => {}} />
    );
    expect(html).not.toContain("<button");
    expect(html).toContain("<span");
    expect(html).toContain("Hạn chế");
  });

  it("renders offline status with count", () => {
    const html = renderToStaticMarkup(
      <SyncStatusPill status="offline" socketConnected={false} pendingOfflineCount={5} />
    );
    expect(html).toContain("Offline");
    expect(html).toContain("5");
    expect(html).toContain("bg-red-600");
  });

  it("renders warning state when pending count >= 400", () => {
    const html = renderToStaticMarkup(
      <SyncStatusPill status="offline" socketConnected={false} pendingOfflineCount={420} />
    );
    expect(html).toContain("Sắp đầy hàng đợi offline");
    expect(html).toContain("bg-amber-600");
    expect(html).not.toContain("animate-ping");
  });

  it("renders loading status", () => {
    const html = renderToStaticMarkup(
      <SyncStatusPill status="loading" socketConnected={false} />
    );
    expect(html).toContain("Đang tải…");
    expect(html).toContain("bg-slate-400");
  });
});
