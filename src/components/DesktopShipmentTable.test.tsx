import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DesktopShipmentTable,
  ShipmentTableRow,
  shipmentRowRenderEqual,
} from "./DesktopShipmentTable";
import { ToastProvider } from "../ui";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

const row = {
  ...blankShipmentDraft("2026-08-23", "TCS"),
  id: "s1",
  stt: 1,
  awb: "17612345675",
  customer: "NAMNAM",
  flight: "VN623",
  flightDate: "23AUG",
  dest: "SGN",
  pcs: 2,
  kg: 12.5,
} as Shipment;

function renderTable(rows: Shipment[] = [row]) {
  return renderToStaticMarkup(
    <ToastProvider>
      <DesktopShipmentTable
        rows={rows}
        allRows={rows}
        activeWarehouse="TCS"
        onUpdate={() => undefined}
        onDelete={() => undefined}
        onPrint={() => undefined}
        onAddBlankRow={() => undefined}
        viewSessionYmd="2026-08-23"
      />
    </ToastProvider>,
  );
}

describe("DesktopShipmentTable density", () => {
  it("giữ cột ops + AWB mono 14px sticky; mỗi lô là card màu riêng", () => {
    const html = renderTable();
    expect(html).toContain("ops-desktop-shipment-table");
    expect(html).toContain("space-y-1");
    expect(html).toContain("ops-table-head");
    expect(html).toContain("border-spacing-y-1.5");
    expect(html).toContain('data-testid="ops-lot-card"');
    expect(html).toContain("ops-lot-surface-0");
    expect(html).toContain("px-1 py-1");
    expect(html).toContain("ops-awb");
    expect(html).toContain("text-[14px]");
    expect(html).toContain("sticky left-0");
    expect(html).toContain("AWB / HAWB");
    expect(html).toContain("CHUYẾN");
    expect(html).toContain("INFO KH");
    expect(html).not.toContain("STATUS");
    expect(html).toContain("THAO TÁC");
    expect(html).toContain("176");
    expect(html).toContain('data-testid="ops-warehouse-totals"');
    expect(html).toContain("Kiện");
    expect(html).toContain("12.5");
    expect(html).toContain('data-testid="ops-urgent-marquee"');
    expect(html).toContain("Chưa có ghi chú gấp");
  });

  it("nhiều lô xoay tint bề mặt khác nhau", () => {
    const rows = [1, 2, 3].map(
      (n) =>
        ({
          ...row,
          id: `s${n}`,
          stt: n,
          awb: `1761234567${n}`,
        }) as Shipment,
    );
    const html = renderTable(rows);
    expect(html).toContain("ops-lot-surface-0");
    expect(html).toContain("ops-lot-surface-1");
    expect(html).toContain("ops-lot-surface-2");
    expect(html).toContain('data-lot-tone="0"');
    expect(html).toContain('data-lot-tone="1"');
  });

  it("bảng desktop không còn cột STATUS; menu thao tác vẫn overflow-visible", () => {
    const html = renderTable();
    expect(html).not.toContain("Trạng thái lô");
    expect(html).not.toContain("h-7 w-full min-w-0 truncate px-1.5 text-2xs");
    expect(html).toContain("overflow-visible py-0.5");
    expect(html).toContain("row-actions-menu-s1");
  });

  it("INFO KH giữ 3 dòng một hàng; địa chỉ chỉ nằm trong tooltip", () => {
    const rich = {
      ...row,
      consigneeNamePrint: "Australasian Mail Services",
      consigneeAddressPrint: "75 Harrick Road\nKeilor Park VIC 3043",
      consigneePhonePrint: "+61 3 9338 6622",
    } as Shipment;
    const html = renderTable([rich]);
    expect(html).toContain("max-w-[12.5rem]");
    expect(html).toContain("h-3.5 w-full truncate");
    expect(html).toContain("Australasian Mail Services");
    expect(html).toContain("75 Harrick Road");
    expect(html).not.toContain("line-clamp-4");
    expect(html).not.toContain("w-[22rem]");
  });

  it("empty state vẫn + Booking primary ≥44px", () => {
    const html = renderTable([]);
    expect(html).toContain("+ Booking");
    expect(html).toContain("min-h-11");
  });

  it("header kho không còn nút xuất DIM SCSC theo ngày phiên", () => {
    const tcsHtml = renderTable();
    expect(tcsHtml).not.toContain("warehouse-dim-scsc");
    expect(tcsHtml).not.toContain("DIM SCSC");
    expect(tcsHtml).toContain('aria-label="+ Booking TCS"');

    const scscRow = {
      ...blankShipmentDraft("2026-08-23", "SCSC"),
      id: "s2",
      stt: 1,
    } as Shipment;
    const scscHtml = renderToStaticMarkup(
      <ToastProvider>
        <DesktopShipmentTable
          rows={[scscRow]}
          allRows={[scscRow]}
          activeWarehouse="SCSC"
          onUpdate={() => undefined}
          onDelete={() => undefined}
          onPrint={() => undefined}
          onAddBlankRow={() => undefined}
          viewSessionYmd="2026-08-23"
        />
      </ToastProvider>,
    );
    expect(scscHtml).not.toContain("warehouse-dim-scsc");
    expect(scscHtml).not.toContain("DIM SCSC");
    expect(scscHtml).toContain('aria-label="+ Booking SCSC"');
  });

  it("comparator của ShipmentTableRow bỏ qua re-render khi row không đổi dữ liệu kể cả khi tạo object mới", () => {
    const rowA = { ...row, id: "s1", kg: 10 };
    const rowB = { ...row, id: "s1", kg: 10 }; // same data, new ref
    const rowC = { ...row, id: "s1", kg: 12 }; // changed data

    expect(shipmentRowRenderEqual(rowA, rowB)).toBe(true);
    expect(shipmentRowRenderEqual(rowA, rowC)).toBe(false);

    const getNeighborRowId = () => null;
    const baseProps = {
      row: rowA,
      rowIdx: 0,
      getNeighborRowId,
      viewSessionYmd: "2026-08-23",
      highlighted: false,
      selected: false,
      customerDirectory: [],
      findAwbConflict: () => null,
      onUpdate: () => undefined,
      onDelete: () => undefined,
      onPrint: () => undefined,
      onOpenDimModal: () => undefined,
    };

    const comparator = (ShipmentTableRow as unknown as { compare: (p: typeof baseProps, n: typeof baseProps) => boolean }).compare;
    expect(comparator).toBeDefined();

    // Khi sync về tạo new object cùng data: compare trả về true => React memo skip re-render
    expect(comparator(baseProps, { ...baseProps, row: rowB })).toBe(true);

    // Khi sync đổi kg: compare trả về false => re-render
    expect(comparator(baseProps, { ...baseProps, row: rowC })).toBe(false);
  });

  it("đổi 1 lô qua sync: chỉ row bị đổi re-render", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const row1: Shipment = { ...row, id: "s1", stt: 1, awb: "17611111111", kg: 10 };
    const row2: Shipment = { ...row, id: "s2", stt: 2, awb: "17622222222", kg: 20 };

    await act(async () => {
      root.render(
        <ToastProvider>
          <DesktopShipmentTable
            rows={[row1, row2]}
            allRows={[row1, row2]}
            activeWarehouse="TCS"
            onUpdate={() => undefined}
            onDelete={() => undefined}
            onPrint={() => undefined}
            onAddBlankRow={() => undefined}
            viewSessionYmd="2026-08-23"
          />
        </ToastProvider>,
      );
    });

    const row1ElBefore = container.querySelector("#shipment-row-s1");
    const row2ElBefore = container.querySelector("#shipment-row-s2");
    expect(row1ElBefore).not.toBeNull();
    expect(row2ElBefore).not.toBeNull();

    // Sync arrives: row1 data updated, row2 same data (new reference to simulate state sync)
    const row1Updated: Shipment = { ...row1, kg: 15 };
    const row2Clone: Shipment = { ...row2 };

    await act(async () => {
      root.render(
        <ToastProvider>
          <DesktopShipmentTable
            rows={[row1Updated, row2Clone]}
            allRows={[row1Updated, row2Clone]}
            activeWarehouse="TCS"
            onUpdate={() => undefined}
            onDelete={() => undefined}
            onPrint={() => undefined}
            onAddBlankRow={() => undefined}
            viewSessionYmd="2026-08-23"
          />
        </ToastProvider>,
      );
    });

    const row1ElAfter = container.querySelector("#shipment-row-s1");
    const row2ElAfter = container.querySelector("#shipment-row-s2");
    expect(row1ElAfter).not.toBeNull();
    expect(row2ElAfter).not.toBeNull();

    // DOM node of row2 is preserved because memo skipped re-rendering it
    expect(row2ElAfter).toBe(row2ElBefore);

    root.unmount();
    container.remove();
  });
});
