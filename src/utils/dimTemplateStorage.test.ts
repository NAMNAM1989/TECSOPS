import { describe, expect, it, beforeEach } from "vitest";
import {
  loadDimTemplates,
  saveDimTemplate,
  deleteDimTemplate,
  renameDimTemplate,
} from "./dimTemplateStorage";

describe("dimTemplateStorage", () => {
  beforeEach(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it("trả về mảng rỗng khi chưa lưu mẫu nào", () => {
    expect(loadDimTemplates()).toEqual([]);
  });

  it("lưu và tải mẫu DIM thành công", () => {
    const list = saveDimTemplate({
      name: "Mẫu Thùng Garment 60x40",
      lines: [
        { lCm: 60, wCm: 40, hCm: 40, pcs: 10, estimated: false },
        { lCm: 50, wCm: 30, hCm: 20, pcs: 5, estimated: false },
      ],
      customerCode: "CUST01",
    });

    expect(list.length).toBe(1);
    expect(list[0]).toMatchObject({
      name: "Mẫu Thùng Garment 60x40",
      totalPcs: 15,
      customerCode: "CUST01",
    });
    expect(list[0]!.lines.length).toBe(2);

    const loaded = loadDimTemplates();
    expect(loaded.length).toBe(1);
    expect(loaded[0]!.name).toBe("Mẫu Thùng Garment 60x40");
  });

  it("xóa mẫu DIM theo id", () => {
    const list = saveDimTemplate({
      name: "Mẫu Test 1",
      lines: [{ lCm: 40, wCm: 30, hCm: 20, pcs: 2, estimated: false }],
    });
    const id = list[0]!.id;

    const remaining = deleteDimTemplate(id);
    expect(remaining.length).toBe(0);
    expect(loadDimTemplates()).toEqual([]);
  });

  it("đổi tên mẫu DIM", () => {
    const list = saveDimTemplate({
      name: "Tên Cũ",
      lines: [{ lCm: 40, wCm: 30, hCm: 20, pcs: 2, estimated: false }],
    });
    const id = list[0]!.id;

    const updated = renameDimTemplate(id, "Tên Mới");
    expect(updated[0]!.name).toBe("Tên Mới");
    expect(loadDimTemplates()[0]!.name).toBe("Tên Mới");
  });

  it("báo lỗi nếu tên mẫu rỗng hoặc không có dòng DIM nào", () => {
    expect(() =>
      saveDimTemplate({
        name: "   ",
        lines: [{ lCm: 40, wCm: 30, hCm: 20, pcs: 2, estimated: false }],
      })
    ).toThrow("Tên mẫu không được để trống.");

    expect(() =>
      saveDimTemplate({
        name: "Mẫu Rỗng",
        lines: [],
      })
    ).toThrow("Cần ít nhất 1 dòng DIM để lưu mẫu.");
  });
});
