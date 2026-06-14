import { describe, expect, it } from "vitest";
import { parseBookHangNgayGrid, mapSheetWarehouse } from "./bookHangNgayParser.mjs";
import { sessionYmdToBookSheetTab } from "./googleSheetFetch.mjs";

describe("sessionYmdToBookSheetTab", () => {
  it("map ngày sang tên tab Sheet", () => {
    expect(sessionYmdToBookSheetTab("2026-06-13")).toBe("13JUNE2026");
    expect(sessionYmdToBookSheetTab("2026-06-11")).toBe("11JUNE2026");
  });
});

describe("mapSheetWarehouse", () => {
  it("map mã kho Sheet sang TECSOPS", () => {
    expect(mapSheetWarehouse("TECS-TCS")).toBe("TECS-TCS");
    expect(mapSheetWarehouse("LX-SCSC")).toBe("TECS-SCSC");
    expect(mapSheetWarehouse("TCS")).toBe("TECS-TCS");
  });
});

describe("parseBookHangNgayGrid", () => {
  it("đọc khối VLC-TECS có kiện/kg", () => {
    const grid = [
      { rowIndex: 0, cells: ["VLC-TECS", "", "", "", "", "", "", "", ""] },
      {
        rowIndex: 1,
        cells: [
          "CẬP NHẬT DANH SÁCH HÀNG LÊN SÂN BAY 11-JUN",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
      },
      {
        rowIndex: 2,
        cells: [
          "",
          "AWB/BOOKING",
          "CHUYẾN BAY/NGÀY BAY",
          "CUTOFF / NOTE",
          "DEST",
          "KHO HÀNG",
          "KIỆN / KG",
          "KHÁCH HÀNG",
          "CNNE",
        ],
      },
      {
        rowIndex: 3,
        cells: [
          "1",
          "232-1826 9160",
          "MH767/11JUN",
          "17:00 - 11JUN",
          "KUL",
          "TECS-TCS",
          "31 / 363",
          "CITYLINK",
          "CITY LINK EXPRESS",
        ],
      },
    ];

    const rows = parseBookHangNgayGrid(grid, "2026-06-11");
    expect(rows).toHaveLength(1);
    expect(rows[0].awb).toBe("232-1826 9160");
    expect(rows[0].flight).toBe("MH767");
    expect(rows[0].flightDate).toBe("11JUN");
    expect(rows[0].warehouse).toBe("TECS-TCS");
    expect(rows[0].pcs).toBe(31);
    expect(rows[0].kg).toBe(363);
    expect(rows[0].customer).toBe("CITYLINK");
  });

  it("không nhận dòng AWB có HAWB là header", () => {
    const grid = [
      {
        rowIndex: 0,
        cells: [
          "",
          "AWB/BOOKING",
          "CHUYẾN BAY/NGÀY BAY",
          "CUTOFF / NOTE",
          "DEST",
          "KHO HÀNG",
          "KIỆN / KG",
          "KHÁCH HÀNG",
          "CNNE",
        ],
      },
      {
        rowIndex: 1,
        cells: [
          "7",
          "695-6039 4121\nHAWB: LAX394121",
          "BR396/14JUN",
          "",
          "LAX",
          "TECS-TCS",
          "",
          "KANGO",
          "INTERNATIONAL BONDED",
        ],
      },
      {
        rowIndex: 2,
        cells: [
          "1",
          "978-2378 9065",
          "VJ081/14JUN",
          "",
          "MEL",
          "TECS-SCSC",
          "89 / 1474",
          "TÍN PHÁT",
          "Australasian",
        ],
      },
    ];

    const rows = parseBookHangNgayGrid(grid, "2026-06-13");
    expect(rows).toHaveLength(2);
    expect(rows[0].customer).toBe("KANGO");
    expect(rows[0].warehouse).toBe("TECS-TCS");
    expect(rows[1].customer).toBe("TÍN PHÁT");
    expect(rows[1].warehouse).toBe("TECS-SCSC");
  });

  it("khách hàng cột H — chỉ lấy dòng đầu", () => {
    const grid = [
      {
        rowIndex: 0,
        cells: ["", "AWB/BOOKING", "", "", "", "KHO HÀNG", "", "KHÁCH HÀNG", ""],
      },
      {
        rowIndex: 1,
        cells: ["1", "232-1826 9160", "", "", "KUL", "TECS-TCS", "", "CITYLINK\nGHI CHÚ", ""],
      },
    ];
    const rows = parseBookHangNgayGrid(grid, "2026-06-11");
    expect(rows[0].customer).toBe("CITYLINK");
  });
});
