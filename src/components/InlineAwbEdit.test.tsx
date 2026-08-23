import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InlineAwbEdit } from "./InlineAwbEdit";
import { ToastProvider } from "../ui";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";

const row = {
  ...blankShipmentDraft("2026-08-23", "TCS"),
  id: "s1",
  awb: "17612345675",
} as Shipment;

describe("InlineAwbEdit hover", () => {
  it("dùng ops-inline-edit, không thêm hover:bg riêng đè row hover", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <InlineAwbEdit
          rowId={row.id}
          value={row.awb}
          allRows={[row]}
          onCommit={() => undefined}
        />
      </ToastProvider>,
    );
    expect(html).toContain("ops-inline-edit");
    expect(html).not.toContain("hover:bg-ui-surface-muted");
  });
});
