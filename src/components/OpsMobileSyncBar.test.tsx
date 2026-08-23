import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsMobileSyncBar } from "./OpsMobileSyncBar";

describe("OpsMobileSyncBar", () => {
  it("ẩn timestamp khi lotSyncedAt null — không hiện epoch / Invalid Date", () => {
    const html = renderToStaticMarkup(
      <OpsMobileSyncBar status="live" socketConnected lotSyncedAt={null} />
    );
    expect(html).toContain("Live");
    expect(html).not.toContain("đã sync lúc");
    expect(html).not.toContain("Invalid Date");
    expect(html).not.toContain("1970");
    expect(html).not.toContain("chưa đồng bộ");
  });

  it("hiện đã sync lúc HH:mm:ss (Asia/Saigon) khi có lots.synced_at", () => {
    const html = renderToStaticMarkup(
      <OpsMobileSyncBar
        status="live"
        socketConnected
        lotSyncedAt={Date.parse("2026-08-21T00:05:46.007Z")}
      />
    );
    expect(html).toContain("đã sync lúc 07:05:46");
  });
});
