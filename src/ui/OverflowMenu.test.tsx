import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OverflowMenu, overflowMenuPanelPositionClass } from "./OverflowMenu";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("OverflowMenu placement", () => {
  it("up mở lên trên; down mở xuống — không clip footer sheet", () => {
    expect(overflowMenuPanelPositionClass("up")).toBe("bottom-[calc(100%+4px)]");
    expect(overflowMenuPanelPositionClass("down")).toBe("top-[calc(100%+4px)]");
    expect(overflowMenuPanelPositionClass()).toBe("top-[calc(100%+4px)]");
  });

  it("placement=up ghi data-placement trên root (menu đóng vẫn thấy)", () => {
    const html = renderToStaticMarkup(
      <OverflowMenu
        placement="up"
        label="Thêm"
        items={[{ id: "reset", label: "Làm lại", onSelect: () => undefined }]}
      />,
    );
    expect(html).toContain('data-placement="up"');
    expect(html).not.toContain("top-[calc(100%+4px)]");
  });

  it("click mở menu lên trên — item Làm lại hiện, không dùng top-100%", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <OverflowMenu
          placement="up"
          label="Thêm"
          items={[
            { id: "reset", label: "Làm lại", onSelect: () => undefined },
            { id: "clear", label: "Xóa DIM", onSelect: () => undefined },
          ]}
        />,
      );
    });
    await act(async () => {
      host.querySelector("button")?.click();
    });
    expect(host.textContent).toContain("Làm lại");
    expect(host.textContent).toContain("Xóa DIM");
    expect(host.innerHTML).toContain("bottom-[calc(100%+4px)]");
    expect(host.innerHTML).not.toContain("top-[calc(100%+4px)]");
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
