import { describe, expect, it } from "vitest";
import { normalizeReport } from "./improvementReport.mjs";
import {
  buildFallbackCursorPrompt,
  formatUiCatalogForPrompt,
} from "./tecsopsUiCatalog.mjs";

describe("tecsopsUiCatalog", () => {
  it("deep catalog có routes + constraints", () => {
    const deep = formatUiCatalogForPrompt("deep");
    expect(deep.routes?.length).toBeGreaterThan(0);
    expect(deep.constraints?.length).toBeGreaterThan(0);
  });

  it("standard catalog rút gọn hơn deep", () => {
    const std = formatUiCatalogForPrompt("standard");
    expect(std.routes?.[0]?.entry).toBeTruthy();
    expect(std.opsBoard).toBeUndefined();
  });

  it("fallback cursor prompt có tiêu đề + DoD", () => {
    const p = buildFallbackCursorPrompt({
      title: "Validate biển số",
      proposal: "Disable nút đăng ký khi thiếu biển",
      priority: "P0",
      files: ["src/components/EcargoVctRegisterModal.tsx"],
    });
    expect(p).toMatch(/PROMPT TRIỂN KHAI TECSOPS/);
    expect(p).toMatch(/Definition of Done/);
    expect(p).toMatch(/EcargoVctRegisterModal/);
  });
});

describe("normalizeReport", () => {
  it("bổ sung cursorPrompt khi Gemini thiếu", () => {
    const out = normalizeReport({
      summary: "Tóm tắt test",
      priorities: [
        {
          id: "p0-1",
          priority: "P0",
          title: "Tối ưu Sheet",
          evidence: "sheet.modal.open x3",
          proposal: "Lưu mapping gần nhất",
          estimatedImpact: "Giảm 2 click",
        },
      ],
      doNotAutomate: ["Không auto submit eCargo"],
    });
    expect(out.priorities).toHaveLength(1);
    expect(out.priorities[0].cursorPrompt).toMatch(/PROMPT TRIỂN KHAI/);
    expect(out.priorities[0].targetFiles?.length).toBeGreaterThan(0);
    expect(out.cursorBundlePrompt).toMatch(/PROMPT TRIỂN KHAI/);
  });

  it("giữ cursorPrompt từ Gemini + uiFindings", () => {
    const out = normalizeReport({
      summary: "OK",
      uiFindings: [
        {
          id: "ui-1",
          area: "eCargo",
          observation: "Thiếu highlight biển số",
          painPoint: "Đăng ký fail",
          relatedComponents: ["EcargoVctRegisterModal"],
        },
      ],
      priorities: [
        {
          title: "X",
          priority: "P1",
          proposal: "Y",
          cursorPrompt: "# PROMPT custom\n\nLàm X",
          targetFiles: ["src/a.tsx"],
        },
      ],
    });
    expect(out.uiFindings).toHaveLength(1);
    expect(out.priorities[0].cursorPrompt).toContain("PROMPT custom");
    expect(out.priorities[0].targetFiles).toEqual(["src/a.tsx"]);
  });
});
