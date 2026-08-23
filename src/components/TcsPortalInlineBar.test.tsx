import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TcsPortalInlineBar } from "./TcsPortalInlineBar";
import type { TcsPortalActions } from "../hooks/useTcsPortalActions";
import { ToastProvider } from "../ui";

function stubTcs(partial: Partial<TcsPortalActions> = {}): TcsPortalActions {
  return {
    busy: false,
    busyLabel: "",
    message: "",
    error: "",
    extension: { ok: true, workspace: { logged_in: false } },
    sessionLabel: "Ext TCS — cần Đăng Nhập TCS",
    results: [],
    downloadedCount: 0,
    login: vi.fn(),
    loginWithExtension: vi.fn(),
    scanReceptionWithExtension: vi.fn(),
    pendingReceptionCount: 2,
    refreshExtension: vi.fn(),
    downloadEsidFor: vi.fn(),
    fillEsidDeclareFor: vi.fn(),
    submitEsidDeclare: vi.fn(),
    lastDeclarePreview: null,
    clearDeclarePreview: vi.fn(),
    portalWarehouse: "TCS",
    extLabel: "Ext TCS",
    workspace: null,
    ...partial,
  } as TcsPortalActions;
}

function renderBar(
  tcs: TcsPortalActions,
  props: { compact?: boolean; isMobile?: boolean } = {}
) {
  return renderToStaticMarkup(
    <ToastProvider>
      <TcsPortalInlineBar tcs={tcs} compact={props.compact} isMobile={props.isMobile} />
    </ToastProvider>
  );
}

describe("TcsPortalInlineBar A4 Ext-only", () => {
  it("desktop: một chip Ext + CTA Đăng Nhập TCS + overflow Quét — không chồng chip / Trực quan / agent", () => {
    const html = renderBar(stubTcs(), { compact: true, isMobile: false });

    expect(html).toContain("Đăng Nhập TCS");
    expect(html).not.toMatch(/>ĐN</);
    expect(html).toContain("ops-ext-status");
    expect(html).toContain("Ext · sẵn sàng");
    expect(html).toContain("Quét / Điền / PDF");
    expect(html).not.toContain("Trực quan");
    expect(html).not.toContain("Agent cloud");
    expect(html).not.toContain("Kho TCS");
    expect(html).not.toContain("Chờ Đăng Nhập TCS");
    expect(html.match(/data-testid="ops-ext-status"/g)?.length).toBe(1);
  });

  it("mobile: cần Ext trên PC — không CTA login giả", () => {
    const html = renderBar(stubTcs(), { compact: true, isMobile: true });

    expect(html).toContain("Cần Ext trên PC");
    expect(html).toContain("ops-ext-mobile-hint");
    expect(html).toContain("Ext · offline");
    expect(html).not.toMatch(/<button[^>]*>Đăng Nhập TCS<\/button>/);
    expect(html).not.toContain("bg-ui-primary");
    expect(html).not.toContain("Trực quan");
    expect(html).not.toContain("Agent cloud");
  });
});
