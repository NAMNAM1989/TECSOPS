import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PortalExtStatusChip } from "./PortalExtStatusChip";
import { PORTAL_EXT_CHIP_LABEL } from "./portalBarUi";

describe("PortalExtStatusChip", () => {
  it("nhãn offline / sẵn sàng / đã login — không viết tắt off/OK", () => {
    expect(PORTAL_EXT_CHIP_LABEL.offline).toBe("offline");
    expect(PORTAL_EXT_CHIP_LABEL.ready).toBe("sẵn sàng");
    expect(PORTAL_EXT_CHIP_LABEL.logged_in).toBe("đã login");

    const offline = renderToStaticMarkup(
      <PortalExtStatusChip presence="offline" title="off" testId="ops-ext-status" />
    );
    const ready = renderToStaticMarkup(
      <PortalExtStatusChip presence="ready" title="ok" testId="ops-ext-status" />
    );
    const logged = renderToStaticMarkup(
      <PortalExtStatusChip
        presence="logged_in"
        title="in"
        testId="ops-ext-status"
      />
    );

    expect(offline).toContain("Ext · offline");
    expect(ready).toContain("Ext · sẵn sàng");
    expect(logged).toContain("Ext · đã login");
    expect(offline).not.toContain("Ext · off");
    expect(ready).not.toContain("Ext · OK");
    expect(offline).toContain('data-ext-presence="offline"');
    expect(logged).toContain('data-ext-presence="logged_in"');
  });
});
