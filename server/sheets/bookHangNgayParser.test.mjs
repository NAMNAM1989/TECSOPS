import { describe, expect, it } from "vitest";
import {
  parseBookHangNgayGrid,
  mapSheetWarehouse,
  parsePcsKg,
  BOOK_DATA_START_ROW_INDEX,
} from "./bookHangNgayParser.mjs";
import { sessionYmdToBookSheetTab, bookSheetTabCandidates } from "./googleSheetFetch.mjs";

describe("sessionYmdToBookSheetTab", () => {
  it("map ngày sang tên tab «NGÀY D MMM»", () => {
    expect(sessionYmdToBookSheetTab("2026-07-13")).toBe("NGÀY 13 JUL");
    expect(sessionYmdToBookSheetTab("2026-06-11")).toBe("NGÀY 11 JUN");
  });

  it("candidates gồm biến thể tên tab", () => {
    const c = bookSheetTabCandidates("2026-07-13");
    expect(c[0]).toBe("NGÀY 13 JUL");
    expect(c).toContain("13JUL");
    expect(c).toContain("13JULY2026");
  });
});

describe("mapSheetWarehouse", () => {
  it("map mã kho Sheet sang TECSOPS", () => {
    expect(mapSheetWarehouse("TECS-TCS")).toBe("TECS-TCS");
    expect(mapSheetWarehouse("LX-SCSC")).toBe("TECS-SCSC");
    expect(mapSheetWarehouse("TCS")).toBe("TECS-TCS");
    expect(mapSheetWarehouse("KHO-SCSC")).toBe("TECS-SCSC");
    expect(mapSheetWarehouse("KHO-TCS")).toBe("TECS-TCS");
  });
});

describe("parsePcsKg", () => {
  it("xx/yy → pcs/kg", () => {
    expect(parsePcsKg("31 / 363")).toEqual({ pcs: 31, kg: 363, dimWeightKg: null });
  });
  it("xx/yy/zz → pcs/kg/dim", () => {
    expect(parsePcsKg("3 / 65 / 68")).toEqual({ pcs: 3, kg: 65, dimWeightKg: 68 });
  });
});

describe("parseBookHangNgayGrid", () => {
  it("đọc khối VLC-TECS có kiện/kg (dòng >= Excel 20)", () => {
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
        rowIndex: BOOK_DATA_START_ROW_INDEX,
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
    expect(rows[0].dimWeightKg).toBeNull();
    expect(rows[0].customer).toBe("CITYLINK");
  });

  it("bỏ dòng Excel trước khối dữ liệu (index < 18) dù có AWB", () => {
    const grid = [
      {
        rowIndex: 0,
        cells: ["", "AWB/BOOKING", "", "", "", "KHO HÀNG", "KIỆN / KG", "KHÁCH HÀNG", ""],
      },
      {
        rowIndex: 17,
        cells: ["0", "232-1826 9159", "", "", "KUL", "TECS-TCS", "1 / 10", "EARLY", ""],
      },
      {
        rowIndex: 18,
        cells: ["1", "232-1826 9160", "", "", "KUL", "TECS-TCS", "2 / 20", "OK", ""],
      },
    ];
    const rows = parseBookHangNgayGrid(grid, "2026-07-13");
    expect(rows).toHaveLength(1);
    expect(rows[0].customer).toBe("OK");
  });

  it("chỉ lấy MAWB, bỏ HAWB; pcs/kg/dim; ghi chú cột L", () => {
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
          "SHIPPER",
          "CNEE",
          "",
          "GHI CHÚ",
        ],
      },
      {
        rowIndex: 19,
        cells: [
          "7",
          "807-3878 8481\nHAWB: LTC-8481",
          "AK523/14JUL",
          "",
          "CGK",
          "TECS-TCS",
          "3 / 65 / 68",
          "TTP",
          "SHIPPER CO",
          "CNEE CO",
          "",
          "TACT 100",
        ],
      },
    ];

    const rows = parseBookHangNgayGrid(grid, "2026-07-13");
    expect(rows).toHaveLength(1);
    expect(rows[0].awb).toBe("807-3878 8481");
    expect(rows[0].pcs).toBe(3);
    expect(rows[0].kg).toBe(65);
    expect(rows[0].dimWeightKg).toBe(68);
    expect(rows[0].note).toBe("TACT 100");
    expect(rows[0].consigneeNamePrint).toBe("CNEE CO");
    expect(rows[0].flightDate).toBe("14JUL");
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
        rowIndex: 19,
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
        rowIndex: 20,
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
    expect(rows[0].awb).toBe("695-6039 4121");
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
        rowIndex: 19,
        cells: ["1", "232-1826 9160", "", "", "KUL", "TECS-TCS", "", "CITYLINK\nGHI CHÚ", ""],
      },
    ];
    const rows = parseBookHangNgayGrid(grid, "2026-06-11");
    expect(rows[0].customer).toBe("CITYLINK");
  });

  it("giữ colMap khi có dòng tiêu đề giữa khối TCS và SCSC", () => {
    const header = [
      "",
      "AWB/BOOKING",
      "CHUYẾN BAY/NGÀY BAY",
      "CUTOFF / NOTE",
      "DEST",
      "KHO HÀNG",
      "KIỆN / KG",
      "KHÁCH HÀNG",
      "CNNE",
    ];
    const grid = [
      { rowIndex: 0, cells: header },
      {
        rowIndex: BOOK_DATA_START_ROW_INDEX,
        cells: ["1", "738-0725 3886", "VN0306/23JUL", "", "NRT", "TECS-TCS", "6 / 82", "PCS", ""],
      },
      { rowIndex: BOOK_DATA_START_ROW_INDEX + 1, cells: ["VLC-TECS", "", "", "", "", "", "", "", ""] },
      {
        rowIndex: BOOK_DATA_START_ROW_INDEX + 2,
        cells: ["2", "618-5552 6354", "SQ185/22JUL", "", "SIN", "TECS-SCSC", "36 / 680", "VICTORY", ""],
      },
      {
        rowIndex: BOOK_DATA_START_ROW_INDEX + 3,
        cells: ["CẬP NHẬT DANH SÁCH HÀNG LÊN SÂN BAY 22-JUL", "", "", "", "", "", "", "", ""],
      },
      {
        rowIndex: BOOK_DATA_START_ROW_INDEX + 4,
        cells: ["3", "978-2391 3934", "VJ081/23JUL", "", "MEL", "TECS-SCSC", "104 / 1579", "VAU", ""],
      },
    ];
    const rows = parseBookHangNgayGrid(grid, "2026-07-22");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.warehouse)).toEqual(["TECS-TCS", "TECS-SCSC", "TECS-SCSC"]);
    expect(rows[1].awb).toBe("618-5552 6354");
    expect(rows[2].customer).toBe("VAU");
  });
});
