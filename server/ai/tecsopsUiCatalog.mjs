/**
 * Bản đồ giao diện TECSOPS — ngữ cảnh cho Gemini nghiên cứu UX sâu
 * và sinh prompt dán vào Cursor.
 */

export const TECSOPS_UI_CATALOG = {
  product: "TECSOPS — OPS Handling AirCargo",
  stack: "React 18 + Vite + Express + Postgres + Socket.IO + Chrome Extension",
  routes: [
    {
      hash: "#/",
      name: "Ops Board",
      entry: "src/components/AirCargoTracking.tsx",
      purpose: "Vận hành lô hàng theo ngày: lọc kho/trạng thái, sửa inline, Sheet, eCargo, TCS ESID",
    },
    {
      hash: "#/customers",
      name: "Danh bạ khách",
      entry: "src/pages/CustomersPage.tsx",
      purpose: "Hồ sơ KH, Shipper/CNEE/xe/tài xế, Excel import/export",
    },
    {
      hash: "#/stats",
      name: "Thống kê",
      entry: "src/pages/OpsStatsPage.tsx",
      purpose: "Biểu đồ / báo cáo ngày",
    },
  ],
  opsBoard: {
    shell: "AirCargoTracking",
    desktopTable: "DesktopShipmentTable",
    mobileCards: "MobileShipmentCards",
    filters: [
      { id: "warehouse", ui: "WarehouseGridPicker", values: ["TECS-TCS", "TECS-SCSC", "TCS", "SCSC"] },
      {
        id: "status",
        ui: "StatusFilterBar",
        highlights: ["RECEIVED=Hàng mới tiếp nhận", "RECEPTION_COMPLETED=Đã hoàn thành tiếp nhận"],
      },
      { id: "search", ui: "SmartSearchBar", fields: ["MAWB", "xe", "tài xế", "DEST", "khách"] },
      { id: "date", ui: "OpsDatePicker", note: "Phiên theo ngày local" },
    ],
    inlineEditFields: [
      "awb",
      "hawb",
      "flight",
      "flightDate",
      "dest",
      "pcs",
      "kg",
      "dimWeightKg",
      "customer",
      "consigneeNamePrint",
      "note",
      "status",
    ],
    keyModals: [
      {
        id: "sheet-import",
        component: "GoogleSheetImportModal",
        file: "src/components/GoogleSheetImportModal.tsx",
        triggers: ["Nhập Sheet", "sheet.modal.open"],
        notes: "URL Google Sheet + kéo thả CSV/TSV; preview trước apply",
      },
      {
        id: "ecargo",
        component: "EcargoVctRegisterModal",
        file: "src/components/EcargoVctRegisterModal.tsx",
        triggers: ["Đăng ký eCargo", "ecargo.modal.open"],
        notes: "Chỉ kho SCSC; validate biển số; Chrome Ext fill/register + OTP",
      },
      {
        id: "dim",
        component: "MobileDimKgModal",
        file: "src/components/MobileDimKgModal.tsx",
        notes: "DIM D×R×C → dimWeightKg / dimLines",
      },
      {
        id: "ai-report",
        component: "AiImprovementReportModal",
        file: "src/components/AiImprovementReportModal.tsx",
        notes: "Gemini đề xuất + prompt Cursor",
      },
      {
        id: "mobile-edit",
        component: "MobileShipmentEditSheet",
        file: "src/components/MobileShipmentEditSheet.tsx",
      },
    ],
    toolbars: ["OpsToolsMenu", "OpsSheetImportButton", "EcargoScscInlineBar", "TcsPortalInlineBar"],
  },
  dataModelHints: {
    shipmentKeyFields: [
      "awb",
      "pcs",
      "kg",
      "dimWeightKg",
      "consigneeNamePrint",
      "warehouse",
      "status",
      "customer",
      "flight",
      "dest",
    ],
    mutation: "POST /api/mutation { action: UPDATE, id, patch }",
    sync: "useShipmentSync + Socket.IO sync",
    note: "Không có vehicleNo trên Shipment — xe nằm ở CustomerSavedVehicle",
  },
  constraints: [
    "Không tự submit eCargo SCSC / TCS ESID khi chưa có xác nhận người dùng",
    "Không tự đổi trạng thái CUSTOMS / xóa dữ liệu hàng loạt",
    "Tái sử dụng component/validation hiện có — không duplicate schema",
    "Giữ multi-warehouse TECS-TCS / TECS-SCSC / TCS / SCSC",
    "Chrome Extension là cổng fill/register eCargo (VEHICLE_NO_MISSING)",
    "Không commit/push/deploy trừ khi user yêu cầu rõ",
  ],
  suggestedFileMap: {
    "ops-board": ["src/components/AirCargoTracking.tsx", "src/components/DesktopShipmentTable.tsx"],
    "inline-edit": [
      "src/components/InlineNumberEdit.tsx",
      "src/components/InlineTextEdit.tsx",
      "src/utils/inlineShipmentFieldValidation.ts",
    ],
    ecargo: [
      "src/components/EcargoVctRegisterModal.tsx",
      "src/utils/buildEcargoVctFillPayload.ts",
      "src/utils/ecargoVehicleValidation.ts",
      "chrome-extension/content-ecargo.js",
    ],
    sheet: [
      "src/components/GoogleSheetImportModal.tsx",
      "server/sheets/sheetsRoutes.mjs",
      "server/sheets/bookHangNgayParser.mjs",
    ],
    customers: ["src/pages/CustomersPage.tsx", "src/types/customerDirectory.ts"],
    filters: ["src/components/StatusFilterBar.tsx", "src/components/WarehouseGridPicker.tsx"],
  },
};

/** Bản rút gọn đưa vào prompt (tránh vượt token). */
export function formatUiCatalogForPrompt(depth = "deep") {
  const c = TECSOPS_UI_CATALOG;
  if (depth === "standard") {
    return {
      routes: c.routes.map((r) => ({ hash: r.hash, name: r.name, entry: r.entry })),
      inlineEditFields: c.opsBoard.inlineEditFields,
      keyModals: c.opsBoard.keyModals.map((m) => ({
        id: m.id,
        component: m.component,
        file: m.file,
      })),
      constraints: c.constraints,
    };
  }
  return c;
}

/**
 * Prompt Cursor dự phòng nếu Gemini thiếu cursorPrompt.
 * @param {{ title: string, proposal: string, evidence?: string, priority?: string, files?: string[] }} item
 */
export function buildFallbackCursorPrompt(item) {
  const title = String(item.title || "Cải tiến Ops").trim();
  const proposal = String(item.proposal || "").trim();
  const evidence = String(item.evidence || "").trim();
  const priority = String(item.priority || "P1");
  const files = Array.isArray(item.files) ? item.files.filter(Boolean) : [];
  const fileBlock =
    files.length > 0
      ? files.map((f) => `- \`${f}\``).join("\n")
      : "- Tự tìm module liên quan trong `src/components/` và `server/`";

  return `# PROMPT TRIỂN KHAI TECSOPS — ${title}

## Vai trò
Bạn là Senior Full-stack Engineer trên repo TECSOPS (React + Express + Postgres). Làm việc trực tiếp trên codebase — chỉnh code thật, chạy test, không chỉ hướng dẫn.

## Ưu tiên
${priority}

## Bằng chứng / ngữ cảnh
${evidence || "(từ báo cáo AI Ops)"}

## Yêu cầu triển khai
${proposal || title}

## File gợi ý
${fileBlock}

## Ràng buộc
- Không phá vỡ Ops Board, eCargo, Sheet import, TCS ESID đang chạy.
- Không tự submit eCargo/ESID; không tự đổi CUSTOMS; không xóa dữ liệu hàng loạt.
- Tái sử dụng validation/component hiện có; không hard-code sai master data.
- Không commit/push/deploy trừ khi được yêu cầu rõ.
- Sau khi xong: chạy typecheck/lint/test liên quan và báo cáo ngắn P0/P1 đã làm.

## Definition of Done
- [ ] Đã sửa đúng hành vi mô tả
- [ ] Có validation + thông báo lỗi rõ
- [ ] Test liên quan pass (hoặc đã bổ sung test tối thiểu)
- [ ] Không còn lỗi TypeScript/lint mới trên file đụng tới
`;
}
