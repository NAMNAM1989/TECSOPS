import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { InlineCustomerEdit } from "./InlineCustomerEdit";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("InlineCustomerEdit (U-P0-1)", () => {
  it("tab/focus qua ô không đổi giá trị: không gọi onCommit (0 request mutation)", async () => {
    const onCommit = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <InlineCustomerEdit
          value="CÔNG CHÚA EXPRESS"
          customerId={undefined}
          customerDirectory={[]}
          onCommit={onCommit}
        />,
      );
    });

    const button = host.querySelector("button");
    expect(button).toBeTruthy();

    // 1. Focus button (tương tự như Tab qua ô)
    await act(async () => {
      button?.focus();
    });

    // Button vẫn là button, không tự ý nhảy sang input hay gọi onCommit
    expect(onCommit).not.toHaveBeenCalled();

    // 2. Click button để vào edit mode nhưng không sửa gì rồi blur
    await act(async () => {
      button?.click();
    });

    const input = host.querySelector("input");
    expect(input).toBeTruthy();

    // Blur khỏi input khi chưa thay đổi gì
    await act(async () => {
      input?.focus();
      input?.blur();
    });

    // Phải là 0 cuộc gọi commit
    expect(onCommit).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("gõ đổi tên khách rồi blur hoặc Enter mới gọi onCommit", async () => {
    const onCommit = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <InlineCustomerEdit
          value="CÔNG CHÚA EXPRESS"
          customerId="c1"
          customerDirectory={[]}
          onCommit={onCommit}
        />,
      );
    });

    const button = host.querySelector("button");
    await act(async () => {
      button?.click();
    });

    const input = host.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();

    await act(async () => {
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      prototypeValueSetter?.call(input, "CÔNG CHÚA MỚI");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toMatchObject({
      customer: "CÔNG CHÚA MỚI",
    });

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
