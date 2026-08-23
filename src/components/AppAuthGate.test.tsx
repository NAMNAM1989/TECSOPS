import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppAuthGate, shouldShowAuthGate } from "./AppAuthGate";

describe("shouldShowAuthGate", () => {
  it("không hiện gate khi status chưa load (null/undefined)", () => {
    expect(shouldShowAuthGate(null)).toBe(false);
    expect(shouldShowAuthGate(undefined)).toBe(false);
  });

  it("không hiện gate khi server bypass / allowUnauthenticated", () => {
    expect(
      shouldShowAuthGate({ required: false, authenticated: false, allowUnauthenticated: true }),
    ).toBe(false);
    expect(shouldShowAuthGate({ required: false, authenticated: false })).toBe(false);
    expect(
      shouldShowAuthGate({ required: true, authenticated: false, allowUnauthenticated: true }),
    ).toBe(false);
  });

  it("không hiện gate khi đã xác thực", () => {
    expect(shouldShowAuthGate({ required: true, authenticated: true })).toBe(false);
  });

  it("chỉ hiện gate khi auth bắt buộc và chưa đăng nhập", () => {
    expect(shouldShowAuthGate({ required: true, authenticated: false })).toBe(true);
  });
});

describe("AppAuthGate loading", () => {
  it("status===null không render form mã truy cập", () => {
    const html = renderToStaticMarkup(
      <AppAuthGate>
        <span>OPS_APP</span>
      </AppAuthGate>,
    );
    expect(html).toContain("Đang tải");
    expect(html).not.toContain("Mã truy cập");
    expect(html).not.toContain("Vào TECSOPS");
    expect(html).not.toContain("OPS_APP");
  });
});
