/**
 * Xây prompt + gọi Gemini → báo cáo đề xuất nâng cấp Ops
 * kèm nghiên cứu UI sâu và prompt dán vào Cursor.
 */

import { generateGeminiJson, getGeminiModel, isGeminiConfigured } from "./geminiClient.mjs";
import { loadEventsAggregate } from "./opsAiEventsStore.mjs";
import {
  buildFallbackCursorPrompt,
  formatUiCatalogForPrompt,
  TECSOPS_UI_CATALOG,
} from "./tecsopsUiCatalog.mjs";

const REPORT_SCHEMA = `{
  "summary": "string — tóm tắt 2-4 câu tiếng Việt (gồm nhận xét UI nếu deep)",
  "uiFindings": [
    {
      "id": "ui-1",
      "area": "Ops Board | eCargo | Sheet | Mobile | Customers | Filters",
      "observation": "quan sát UI/UX cụ thể",
      "painPoint": "điểm ma sát thao tác",
      "relatedComponents": ["ComponentName hoặc path file"]
    }
  ],
  "priorities": [
    {
      "id": "p0-1",
      "priority": "P0" | "P1" | "P2",
      "title": "string ngắn",
      "evidence": "bằng chứng từ số liệu / UI catalog",
      "proposal": "hướng nâng cấp cụ thể trên TECSOPS",
      "estimatedImpact": "ước lượng giảm thao tác",
      "targetFiles": ["src/... hoặc server/..."],
      "cursorPrompt": "PROMPT markdown đầy đủ để dán vào Cursor Agent — tiếng Việt, có vai trò, yêu cầu, file, ràng buộc, DoD"
    }
  ],
  "cursorBundlePrompt": "một prompt tổng hợp ưu tiên P0 (và P1 quan trọng) để dán Cursor một lần",
  "doNotAutomate": ["việc không nên để AI/automation tự làm"]
}`;

const SYSTEM = `Bạn là chuyên gia UX + Senior Full-stack cho TECSOPS — web vận hành kho hàng không (Ops board, Google Sheet import, eCargo SCSC, TCS ESID, DIM, danh bạ khách, Chrome Extension).

Nhiệm vụ kép:
1) Nghiên cứu sâu giao diện dựa trên UI catalog + telemetry + snapshot (không bịa component/file ngoài catalog trừ khi ghi rõ «cần xác minh»).
2) Đề xuất cải tiến giảm thao tác lặp, và với MỖI đề xuất viết sẵn cursorPrompt — prompt markdown hoàn chỉnh để người dùng copy/dán vào Cursor Agent.

Yêu cầu cursorPrompt:
- Bắt đầu bằng tiêu đề # PROMPT TRIỂN KHAI TECSOPS — ...
- Có: Vai trò, Bối cảnh UI (route/component), Yêu cầu, File gợi ý, Ràng buộc, Definition of Done
- Tiếng Việt, actionable, không mơ hồ
- Nhắc không commit/push trừ khi user yêu cầu; không tự submit eCargo/ESID

Không đề xuất tự submit ESID/eCargo hay tự đổi trạng thái hải quan.
Trả lời tiếng Việt trong mọi field (trừ path file/code identifier).`;

function buildStateSnapshot(state) {
  if (!state || typeof state !== "object") {
    return { rows: 0, customers: 0 };
  }
  const rows = Array.isArray(state.rows) ? state.rows : [];
  const customers = Array.isArray(state.customers) ? state.customers : [];
  const byWh = {};
  const byStatus = {};
  for (const r of rows) {
    const wh = String(r.warehouse || "?");
    byWh[wh] = (byWh[wh] || 0) + 1;
    const st = String(r.status || "?");
    byStatus[st] = (byStatus[st] || 0) + 1;
  }
  let vehiclesMissingType = 0;
  for (const c of customers) {
    for (const v of c.savedVehicles || []) {
      if (!v?.vehicleType) vehiclesMissingType += 1;
    }
  }
  return {
    rows: rows.length,
    customers: customers.length,
    warehouses: byWh,
    statuses: byStatus,
    vehiclesMissingType,
  };
}

function guessFilesForTitle(title, proposal) {
  const t = `${title} ${proposal}`.toLowerCase();
  const map = TECSOPS_UI_CATALOG.suggestedFileMap;
  /** @type {string[]} */
  const out = [];
  const push = (key) => {
    for (const f of map[key] || []) {
      if (!out.includes(f)) out.push(f);
    }
  };
  if (/ecargo|biển|xe|vehicle|vct/.test(t)) push("ecargo");
  if (/sheet|import|google|csv|mapping/.test(t)) push("sheet");
  if (/inline|cnee|pcs|kg|dim|sửa trực tiếp/.test(t)) push("inline-edit");
  if (/lọc|filter|kho|trạng thái|status/.test(t)) push("filters");
  if (/khách|danh bạ|customer|shipper/.test(t)) push("customers");
  if (out.length === 0) push("ops-board");
  return out.slice(0, 6);
}

function normalizeUiFindings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .slice(0, 10)
    .map((x, i) => ({
      id: String(x.id || `ui-${i + 1}`).slice(0, 32),
      area: String(x.area || "Ops Board").slice(0, 80),
      observation: String(x.observation || "").slice(0, 500),
      painPoint: String(x.painPoint || "").slice(0, 400),
      relatedComponents: Array.isArray(x.relatedComponents)
        ? x.relatedComponents.map((c) => String(c).slice(0, 120)).filter(Boolean).slice(0, 8)
        : [],
    }))
    .filter((x) => x.observation || x.painPoint);
}

function normalizeReport(raw) {
  const summary = String(raw?.summary || "").trim() || "Không có tóm tắt.";
  const uiFindings = normalizeUiFindings(raw?.uiFindings);
  const priorities = Array.isArray(raw?.priorities)
    ? raw.priorities
        .filter((p) => p && typeof p === "object")
        .slice(0, 12)
        .map((p, i) => {
          const title = String(p.title || "").slice(0, 200);
          const evidence = String(p.evidence || "").slice(0, 500);
          const proposal = String(p.proposal || "").slice(0, 800);
          const priority = ["P0", "P1", "P2"].includes(String(p.priority))
            ? String(p.priority)
            : "P1";
          const targetFiles = Array.isArray(p.targetFiles)
            ? p.targetFiles.map((f) => String(f).slice(0, 160)).filter(Boolean).slice(0, 8)
            : guessFilesForTitle(title, proposal);
          let cursorPrompt = String(p.cursorPrompt || "").trim();
          if (!cursorPrompt && title) {
            cursorPrompt = buildFallbackCursorPrompt({
              title,
              proposal,
              evidence,
              priority,
              files: targetFiles,
            });
          }
          if (cursorPrompt.length > 6000) {
            cursorPrompt = cursorPrompt.slice(0, 6000);
          }
          return {
            id: String(p.id || `p-${i + 1}`).slice(0, 32),
            priority,
            title,
            evidence,
            proposal,
            estimatedImpact: String(p.estimatedImpact || "").slice(0, 200),
            targetFiles,
            cursorPrompt,
          };
        })
        .filter((p) => p.title)
    : [];

  let cursorBundlePrompt = String(raw?.cursorBundlePrompt || "").trim();
  if (!cursorBundlePrompt && priorities.length) {
    const top = priorities.filter((p) => p.priority === "P0").slice(0, 4);
    const list = (top.length ? top : priorities.slice(0, 3))
      .map(
        (p, idx) =>
          `### ${idx + 1}. [${p.priority}] ${p.title}\n${p.proposal}\nFiles: ${(p.targetFiles || []).join(", ")}`
      )
      .join("\n\n");
    cursorBundlePrompt = buildFallbackCursorPrompt({
      title: "Gói cải tiến Ops theo báo cáo AI",
      priority: "P0",
      evidence: "Gói từ báo cáo AI Ops (bundle)",
      proposal: `Triển khai lần lượt các mục sau trên repo TECSOPS:\n\n${list}`,
      files: [...new Set(priorities.flatMap((p) => p.targetFiles || []))].slice(0, 10),
    });
  }
  if (cursorBundlePrompt.length > 12000) {
    cursorBundlePrompt = cursorBundlePrompt.slice(0, 12000);
  }

  const doNotAutomate = Array.isArray(raw?.doNotAutomate)
    ? raw.doNotAutomate.map((x) => String(x).slice(0, 300)).filter(Boolean).slice(0, 10)
    : [];
  return { summary, uiFindings, priorities, cursorBundlePrompt, doNotAutomate };
}

/**
 * @param {{ loadState: () => Promise<object>, days?: number, depth?: "standard"|"deep" }} opts
 */
export async function buildImprovementReport(opts) {
  if (!isGeminiConfigured()) {
    const err = new Error("Thiếu GEMINI_API_KEY");
    err.code = "GEMINI_NOT_CONFIGURED";
    throw err;
  }
  const days = Math.max(1, Math.min(30, Number(opts.days) || 7));
  const depth = opts.depth === "standard" ? "standard" : "deep";
  const aggregate = await loadEventsAggregate(days);
  const state = await opts.loadState();
  const snapshot = buildStateSnapshot(state);
  const uiCatalog = formatUiCatalogForPrompt(depth);

  const user = [
    `Chế độ phân tích: ${depth === "deep" ? "DEEP — nghiên cứu UI sâu + sinh prompt Cursor" : "STANDARD — đề xuất nhanh"}.`,
    `Khoảng thời gian: ${days} ngày gần nhất.`,
    `Tổng event: ${aggregate.total}`,
    `Top actions:\n${JSON.stringify(aggregate.topActions, null, 2)}`,
    `Fields hay bị UPDATE (patch):\n${JSON.stringify(aggregate.updateFields, null, 2)}`,
    `Lỗi gần đây:\n${JSON.stringify(aggregate.recentErrors, null, 2)}`,
    `Snapshot Ops hiện tại:\n${JSON.stringify(snapshot, null, 2)}`,
    `UI catalog TECSOPS (nguồn sự thật giao diện):\n${JSON.stringify(uiCatalog, null, 2)}`,
    depth === "deep"
      ? `Hãy:
1) Viết 4–8 uiFindings (khu vực UI, pain point, component/file liên quan).
2) Đề xuất 5–10 priorities (P0 trước) gắn evidence telemetry/UI.
3) Mỗi priority PHẢI có targetFiles + cursorPrompt đầy đủ để dán Cursor.
4) Viết cursorBundlePrompt gộp các P0 chính.
Nếu ít event, vẫn phân tích UI catalog + best practice Ops.`
      : `Đề xuất 5–8 priorities; mỗi mục có cursorPrompt ngắn gọn + targetFiles.`,
  ].join("\n\n");

  const raw = await generateGeminiJson({
    system: SYSTEM,
    user,
    schemaHint: REPORT_SCHEMA,
    timeoutMs: depth === "deep" ? 90_000 : 45_000,
  });
  const report = normalizeReport(raw);
  return {
    ok: true,
    model: getGeminiModel(),
    days,
    depth,
    generatedAt: new Date().toISOString(),
    aggregate,
    snapshot,
    report,
  };
}

export { normalizeReport, buildFallbackCursorPrompt };
