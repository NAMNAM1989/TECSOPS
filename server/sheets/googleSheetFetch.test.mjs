import { describe, expect, it } from "vitest";
import {
  sessionYmdToBookSheetTab,
  bookSheetTabCandidates,
  fetchBookHangNgayGridForSession,
  tabTitleMatchesSession,
  isLikelyBookHangNgayGrid,
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
    const c = bookSheetTabCandidates("2026-07-14");
    expect(c[0]).toBe("NGÀY 14 JUL");
    expect(c).toContain("NGÀY 14 JUL");
  });

  it("candidates gồm ngày pad 0 (NGÀY 05 AUG)", () => {
    const c = bookSheetTabCandidates("2026-08-05");
    expect(c).toContain("NGÀY 5 AUG");
    expect(c).toContain("NGÀY 05 AUG");
  });

  it("tabTitleMatchesSession", () => {
    expect(tabTitleMatchesSession("NGÀY 30 JUL", "2026-07-30")).toBe(true);
    expect(tabTitleMatchesSession("NGAY 30 JUL", "2026-07-30")).toBe(true);
    expect(tabTitleMatchesSession("NGÀY 24 JUL", "2026-07-30")).toBe(false);
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

  it("gid lệch ngày phiên → fallback tab đúng ngày Ops", async () => {
    const wrongDayGrid = Array.from({ length: 10 }, (_, i) => ({
      rowIndex: i,
      cells:
        i === 0
          ? ["", "AWB BOOKING", "", "", "", "", "", "", "", "", "", ""]
          : i === 1
            ? ["VLC-TECS", "555-1234 5678", "VN001", "24JUL", "", "SIN", "TCS", "1", "10", "", "", "OLD"]
            : ["", "", "", "", "", "", "", "", "", "", "", ""],
    }));
    const sessionGrid = Array.from({ length: 10 }, (_, i) => ({
      rowIndex: i,
      cells:
        i === 0
          ? ["", "AWB BOOKING", "", "", "", "", "", "", "", "", "", ""]
          : i === 1
            ? ["VLC-TECS", "555-9999 0001", "VN002", "27JUL", "", "SIN", "TCS", "2", "20", "", "", "NEW"]
            : ["", "", "", "", "", "", "", "", "", "", "", ""],
    }));
    const dayTabs = [
      { gid: "1927213684", title: "NGÀY 24 JUL" },
      { gid: "27", title: "NGÀY 27 JUL" },
    ];
    const result = await fetchBookHangNgayGridForSession("spreadsheet-gid-test", "2026-07-27", "", {
      listTabs: async () => dayTabs,
      preferredGid: "1927213684",
      fetchByGid: async (_id, gid) => {
        if (gid === "1927213684") return wrongDayGrid;
        if (gid === "27") return sessionGrid;
        throw new Error(`unexpected gid ${gid}`);
      },
    });
    expect(result.sheetTab).toBe("NGÀY 27 JUL");
    expect(result.gid).toBe("27");
  });

  it("nhận tab không header khi kéo theo gid (layout data từ dòng 1)", async () => {
    const fakeGrid = Array.from({ length: 10 }, (_, i) => ({
      rowIndex: i,
      cells:
        i < 3
          ? [
              "VLC-TECS",
              `555-1234 567${i}`,
              "VJ842",
              "05AUG",
              "SIN",
              "TCS",
              "GARMENTS",
              "10",
              "100",
              "",
              "",
              "KH",
            ]
          : ["", "", "", "", "", "", "", "", "", "", "", ""],
    }));
    expect(isLikelyBookHangNgayGrid(fakeGrid)).toBe(true);
    const result = await fetchBookHangNgayGridForSession(
      "spreadsheet-headerless-gid-test",
      "2026-08-05",
      "",
      {
        listTabs: async () => [{ gid: "928921597", title: "NGÀY 05 AUG" }, ...tabs],
        preferredGid: "928921597",
        fetchByGid: async () => fakeGrid,
      }
    );
    expect(result.gid).toBe("928921597");
    expect(result.sheetTab).toBe("NGÀY 05 AUG");
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
