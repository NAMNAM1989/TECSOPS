import { describe, expect, it } from "vitest";
import {
  sessionYmdToBookSheetTab,
  bookSheetTabCandidates,
  fetchBookHangNgayGridForSession,
} from "./googleSheetFetch.mjs";

describe("book sheet tab names", () => {
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
    const fakeGrid = [{ rowIndex: 0, cells: ["x"] }];
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
});
