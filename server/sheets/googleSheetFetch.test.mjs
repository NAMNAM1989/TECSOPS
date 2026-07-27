import { describe, expect, it } from "vitest";
import {
  sessionYmdToBookSheetTab,
  bookSheetTabCandidates,
  fetchBookHangNgayGridForSession,
  BOOK_SHEET_GVIZ_RANGE,
} from "./googleSheetFetch.mjs";

describe("book sheet tab names", () => {
  it("không cắt dữ liệu ở một số dòng cố định", () => {
    expect(BOOK_SHEET_GVIZ_RANGE).toBe("A:L");
  });

  it("NGÀY D MMM", () => {
    expect(sessionYmdToBookSheetTab("2026-07-13")).toBe("NGÀY 13 JUL");
  });

  it("candidates", () => {
    expect(bookSheetTabCandidates("2026-07-14")[0]).toBe("NGÀY 14 JUL");
  });
});

describe("fetchBookHangNgayGridForSession", () => {
  const tabs = [
    { gid: "1", title: "NGÀY 11 JUL" },
    { gid: "2", title: "NGÀY 13 JUL" },
  ];

  it("ném lỗi khi không có tab đúng ngày (không fallback gviz)", async () => {
    await expect(
      fetchBookHangNgayGridForSession("spreadsheet-id", "2026-07-14", "", {
        listTabs: async () => tabs,
      })
    ).rejects.toThrow(/Không có tab Sheet cho ngày 2026-07-14/);
  });

  it("bỏ preferredTab lệch ngày phiên", async () => {
    await expect(
      fetchBookHangNgayGridForSession("spreadsheet-id", "2026-07-14", "NGÀY 13 JUL", {
        listTabs: async () => tabs,
      })
    ).rejects.toThrow(/Không có tab Sheet cho ngày 2026-07-14/);
  });

  it("resolve đúng tab 13", async () => {
    const fakeGrid = [
      { rowIndex: 0, cells: ["", "AWB BOOKING", "", "", "", "", "", "", "", "", "", ""] },
      { rowIndex: 1, cells: ["VLC-TECS", "555-1234 5678", "VN001", "13JUL", "", "SIN", "", "1", "10", "", "", "TEST"] },
    ];
    const result = await fetchBookHangNgayGridForSession("spreadsheet-id", "2026-07-13", "", {
      listTabs: async () => tabs,
      fetchByGid: async (_id, gid) => {
        expect(gid).toBe("2");
        return fakeGrid;
      },
    });
    expect(result.sheetTab).toBe("NGÀY 13 JUL");
    expect(result.gid).toBe("2");
    expect(result.grid).toBe(fakeGrid);
  });

  it("ưu tiên gid từ link — tab không cần trùng ngày phiên Ops", async () => {
    const fakeGrid = Array.from({ length: 10 }, (_, i) => ({
      rowIndex: i,
      cells:
        i === 0
          ? ["", "AWB BOOKING", "", "", "", "", "", "", "", "", "", ""]
          : i === 1
            ? ["VLC-TECS", "555-1234 5678", "VN001", "24JUL", "", "SIN", "", "1", "10", "", "", "TEST"]
            : ["", "", "", "", "", "", "", "", "", "", "", ""],
    }));
    const result = await fetchBookHangNgayGridForSession("spreadsheet-gid-test", "2026-07-27", "", {
      listTabs: async () => [{ gid: "1927213684", title: "NGÀY 24 JUL" }, ...tabs],
      preferredGid: "1927213684",
      fetchByGid: async (_id, gid) => {
        expect(gid).toBe("1927213684");
        return fakeGrid;
      },
    });
    expect(result.sheetTab).toBe("NGÀY 24 JUL");
    expect(result.gid).toBe("1927213684");
  });

  it("parse spreadsheetId từ URL trong fetch", async () => {
    const fakeGrid = [
      {
        rowIndex: 0,
        cells: ["", "AWB BOOKING", "", "", "", "", "", "", "", "", "", ""],
      },
      {
        rowIndex: 1,
        cells: ["VLC-TECS", "555-1234 5678", "VN001", "25JUL", "", "SIN", "", "1", "10", "", "", "TEST"],
      },
    ];
    await expect(
      fetchBookHangNgayGridForSession(
        "https://docs.google.com/spreadsheets/d/spreadsheet-id/edit",
        "2026-07-13",
        "",
        {
          listTabs: async () => tabs,
          fetchByGid: async () => fakeGrid,
        }
      )
    ).resolves.toMatchObject({ sheetTab: "NGÀY 13 JUL" });
  });
});
