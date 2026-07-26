/**
 * Tạo PDF checklist thiết kế lại / gỡ UI TECSOPS.
 * Chạy: node scripts/generate-ui-redesign-checklist-pdf.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs");
const htmlPath = path.join(outDir, "tecsops-ui-redesign-checklist.html");
const pdfPath = path.join(outDir, "tecsops-ui-redesign-checklist.pdf");

const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>TECSOPS — Checklist thiết kế lại &amp; gỡ UI</title>
  <style>
    @page { size: A4; margin: 14mm 12mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      font-size: 10.5pt;
      line-height: 1.45;
      margin: 0;
    }
    h1 { font-size: 18pt; margin: 0 0 4px; letter-spacing: -0.02em; }
    h2 {
      font-size: 12.5pt;
      margin: 18px 0 8px;
      padding-bottom: 3px;
      border-bottom: 1.5px solid #0d9488;
      color: #0f766e;
      page-break-after: avoid;
    }
    h3 {
      font-size: 10.5pt;
      margin: 12px 0 6px;
      color: #134e4a;
      page-break-after: avoid;
    }
    .meta { color: #64748b; font-size: 9pt; margin-bottom: 10px; }
    .lead {
      background: #f0fdfa;
      border: 1px solid #99f6e4;
      border-radius: 6px;
      padding: 8px 10px;
      margin: 8px 0 12px;
      font-size: 9.5pt;
    }
    .legend {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 14px;
      margin: 8px 0 12px;
      font-size: 9.5pt;
    }
    .legend div { display: flex; gap: 6px; align-items: flex-start; }
    .tag {
      display: inline-block;
      font-size: 8pt;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      white-space: nowrap;
    }
    .tag.keep { background: #ecfdf5; border-color: #6ee7b7; color: #065f46; }
    .tag.redesign { background: #eff6ff; border-color: #93c5fd; color: #1e40af; }
    .tag.remove { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
    .tag.defer { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin: 6px 0 10px;
      page-break-inside: auto;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 5px 6px;
      vertical-align: top;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 700;
      font-size: 8.5pt;
      color: #334155;
    }
    tr { page-break-inside: avoid; }
    .cb {
      font-family: "Segoe UI Symbol", "DejaVu Sans", sans-serif;
      font-size: 11pt;
      line-height: 1;
      color: #334155;
    }
    .choice { white-space: nowrap; font-size: 8.5pt; }
    .choice .cb { margin-right: 1px; }
    .hint {
      color: #475569;
      font-size: 8.5pt;
      margin-top: 2px;
    }
    .risk {
      color: #9a3412;
      font-size: 8.5pt;
    }
    ul.check {
      list-style: none;
      padding: 0;
      margin: 4px 0 10px;
    }
    ul.check li {
      padding: 3px 0 3px 0;
      page-break-inside: avoid;
    }
    .col2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 16px;
    }
    .box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
      margin: 6px 0;
      page-break-inside: avoid;
    }
    .box strong { display: block; margin-bottom: 4px; }
    .footer {
      margin-top: 16px;
      font-size: 8pt;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
    }
    .phase { font-weight: 700; color: #0f172a; }
    .note-lines {
      margin-top: 8px;
      border-top: 1px dashed #cbd5e1;
      padding-top: 6px;
      min-height: 48px;
      color: #94a3b8;
      font-size: 8.5pt;
    }
  </style>
</head>
<body>
  <h1>TECSOPS — Checklist thiết kế lại &amp; gỡ UI</h1>
  <p class="meta">Dùng để chọn từng phần: giữ · thiết kế lại · gỡ bỏ · hoãn. Bản quyết định Jul 2026 · App ops air cargo (2 màn: Ops + Khách).</p>

  <div class="lead">
    <strong>Cách dùng:</strong> Với mỗi hạng mục, đánh dấu đúng một lựa chọn.
    Ưu tiên gỡ/gọn trước phần ít dùng; redesign trước phần dùng hàng ngày (Ops board).
    Cột “Rủi ro” nhắc phần đụng nghiệp vụ — đừng gỡ nếu chưa có thay thế.
  </div>

  <div class="legend">
    <div><span class="tag keep">GIỮ</span> Đang ổn / cần cho vận hành — không đụng (hoặc chỉ polish nhẹ).</div>
    <div><span class="tag redesign">REDESIGN</span> Giữ chức năng, đổi layout / visual / UX.</div>
    <div><span class="tag remove">GỠ</span> Bỏ hẳn khỏi UI (và code nếu không còn dùng).</div>
    <div><span class="tag defer">HOÃN</span> Quyết sau — ghi chú lý do ở cuối trang.</div>
  </div>

  <h2>0. Nguyên tắc đề xuất (tham khảo)</h2>
  <ul class="check">
    <li><span class="cb">☐</span> Làm từng PR nhỏ theo module — không rewrite cả app một lần.</li>
    <li><span class="cb">☐</span> Giữ riêng print tem nhiệt (layout mm) khỏi visual dashboard.</li>
    <li><span class="cb">☐</span> Giữ affordance sync Live / hạn chế / offline.</li>
    <li><span class="cb">☐</span> Desktop bảng + mobile card/sheet: có thể đổi skin, nên giữ mô hình tương tác.</li>
    <li><span class="cb">☐</span> 9 trạng thái + 2 kho (TCS/SCSC) là ngôn ngữ vận hành — đổi màu/nhãn thì đồng bộ hai bên.</li>
  </ul>

  <h2>1. Shell &amp; điều hướng</h2>
  <table>
    <thead>
      <tr>
        <th style="width:28%">Hạng mục</th>
        <th style="width:32%">Chọn</th>
        <th>Gợi ý / rủi ro</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Hash route 2 màn (#/ · #/customers)<br><span class="hint">useHashRoute · App.tsx</span></td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ. Đủ cho 2 màn. Chỉ đổi nếu thêm nhiều trang (khi đó cân React Router).</span></td>
      </tr>
      <tr>
        <td>Không sidebar / app shell chung<br><span class="hint">Mỗi page tự sticky header</span></td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN nhẹ — thêm thanh app chung (logo + nav Ops/Khách) nếu muốn brand rõ hơn. Đừng thêm sidebar dày trên mobile kho.</span></td>
      </tr>
      <tr>
        <td>Lazy load pages + Suspense “Đang tải…”</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ logic; REDESIGN skeleton cho đẹp hơn.</span></td>
      </tr>
      <tr>
        <td>Màn đăng nhập / auth UI</td>
        <td class="choice"><span class="cb">☐</span> Giữ (không có) &nbsp; <span class="cb">☐</span> Thêm mới &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="risk">Hiện không có login app. Chỉ thêm nếu siết bảo mật mạng kho — ngoài phạm vi skin UI.</span></td>
      </tr>
    </tbody>
  </table>

  <h2>2. Design system &amp; brand</h2>
  <table>
    <thead>
      <tr><th style="width:28%">Hạng mục</th><th style="width:32%">Chọn</th><th>Gợi ý / rủi ro</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Token Tailwind dashboard / apple / ops<br><span class="hint">tailwind.config.js · index.css</span></td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN — gom 1 bộ token mới, deprecate “apple” nếu gây nhầm. Đừng xóa token trước khi thay class.</span></td>
      </tr>
      <tr>
        <td>Class string OPS / MOBILE<br><span class="hint">opsModalStyles · mobileOpsStyles</span></td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN → component Button/Input/Modal/Sheet dùng chung.</span></td>
      </tr>
      <tr>
        <td>Font Plus Jakarta Sans + Mono data</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN nếu đổi nhận diện; giữ mono cho AWB/số.</span></td>
      </tr>
      <tr>
        <td>Accent teal #0D9488 · canvas #E8EEF4</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN cùng brand kit (logo/favicon).</span></td>
      </tr>
      <tr>
        <td>Wordmark text TECS+OPS · favicon Vite</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN (P1) — logo SVG + favicon riêng.</span></td>
      </tr>
      <tr>
        <td>Glass panel / blur sticky header</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: có thể GỠ blur nếu muốn UI phẳng, hiệu năng mobile tốt hơn.</span></td>
      </tr>
      <tr>
        <td>Dark mode (class sẵn, chưa toggle)</td>
        <td class="choice"><span class="cb">☐</span> Bật toggle &nbsp; <span class="cb">☐</span> Gỡ hết dark: &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GỠ dark: nếu redesign light-only — giảm nửa class. Hoặc BẬT toggle rõ ràng.</span></td>
      </tr>
      <tr>
        <td>window.alert sau import Sheet</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign (toast) &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN → toast/banner (P2).</span></td>
      </tr>
    </tbody>
  </table>

  <h2>3. Màn Ops — khung tổng</h2>
  <table>
    <thead>
      <tr><th style="width:28%">Hạng mục</th><th style="width:32%">Chọn</th><th>Gợi ý / rủi ro</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Ops day board (AirCargoTracking)<br><span class="hint">Màn chính hàng ngày</span></td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN trước (P0). <span class="risk">Không gỡ.</span></span></td>
      </tr>
      <tr>
        <td>Sticky header desktop (glass + toolbar)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN — gom nút Sheet/Excel/Tên hãng vào menu “⋯” nếu quá đông.</span></td>
      </tr>
      <tr>
        <td>OpsMobileStickyHeader (header mobile gọn)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN (P0 mobile). Giữ mật độ cao cho kho.</span></td>
      </tr>
      <tr>
        <td>StatInline tổng Lô / Kiện / Kg</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ số liệu; REDESIGN visual. Đã format kg exact (formatKgTotal).</span></td>
      </tr>
      <tr>
        <td>OpsDatePicker + prev/next/today</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="risk">Cốt lõi phiên ngày — không gỡ.</span></td>
      </tr>
      <tr>
        <td>SmartSearchBar (jump warehouse + highlight)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ / polish. Rất hữu ích khi nhiều lô.</span></td>
      </tr>
      <tr>
        <td>WarehouseGridPicker (desktop) / Chips (mobile)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN thống nhất 1 pattern. <span class="risk">Không gỡ 2 kho.</span></span></td>
      </tr>
      <tr>
        <td>Badge sync Live / hạn chế / offline</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="risk">Nên GIỮ — ops cần biết máy có realtime hay không.</span></td>
      </tr>
      <tr>
        <td>NewBookingButton</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ; có thể làm CTA nổi hơn.</span></td>
      </tr>
    </tbody>
  </table>

  <h2>4. Lưới lô &amp; chỉnh sửa</h2>
  <table>
    <thead>
      <tr><th style="width:28%">Hạng mục</th><th style="width:32%">Chọn</th><th>Gợi ý / rủi ro</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>DesktopShipmentTable (inline edit)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN visual/cột; <span class="risk">giữ inline edit kiểu Excel.</span></span></td>
      </tr>
      <tr>
        <td>MobileShipmentCards</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN (P0). Có thể rút field hiển thị mặc định.</span></td>
      </tr>
      <tr>
        <td>MobileShipmentEditSheet (bottom sheet)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN tabs Booking / Thông báo / DIM. Đừng thay bằng trang full nếu chậm thao tác kho.</span></td>
      </tr>
      <tr>
        <td>StickyMobileActions</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ — thao tác một tay.</span></td>
      </tr>
      <tr>
        <td>Inline* edit (AWB, số, text, khách, CNEE)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ hành vi; REDESIGN focus ring / typography.</span></td>
      </tr>
      <tr>
        <td>HoverMagnifyText / CNEE magnify</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Ứng viên GỠ nếu ít dùng trên máy kho; hoặc chỉ giữ mobile long-press.</span></td>
      </tr>
      <tr>
        <td>SelectableTextWithCopyPopover</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ — copy AWB/CNEE nhanh.</span></td>
      </tr>
      <tr>
        <td>ShipmentRowActionsMenu (print, TCS…)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN nhóm action; cắt item ít dùng.</span></td>
      </tr>
      <tr>
        <td>CustomerPicker / SuggestDropdown</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="risk">Cần cho booking — không gỡ.</span></td>
      </tr>
    </tbody>
  </table>

  <h2>5. Trạng thái workflow (9 bước)</h2>
  <p class="hint">BOOKING → ĐÃ NHẬN → ĐO VOLUME → HẢI QUAN → AN NINH → KÉO OLA → HT TIẾP NHẬN → NỘP TỜ CÂN → HOÀN THÀNH</p>
  <table>
    <thead>
      <tr><th style="width:28%">Hạng mục</th><th style="width:32%">Chọn</th><th>Gợi ý / rủi ro</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Bộ 9 trạng thái + màu accent</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign màu &nbsp; <span class="cb">☐</span> Rút gọn bước &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="risk">Rút gọn bước = đổi nghiệp vụ + data migrate — chỉ làm khi ops thống nhất.</span></td>
      </tr>
      <tr>
        <td>StatusFilterBar</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ; mobile đã có thu gọn “Lọc ST”.</span></td>
      </tr>
      <tr>
        <td>StatusBadge / StatusSelect</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN chip cho dễ đọc từ xa.</span></td>
      </tr>
    </tbody>
  </table>

  <h2>6. DIM / đo volume</h2>
  <table>
    <thead>
      <tr><th style="width:28%">Hạng mục</th><th style="width:32%">Chọn</th><th>Gợi ý / rủi ro</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>MobileDimKgModal (desktop + mobile)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN dần (đã nhiều lần iterate). <span class="risk">Không gỡ.</span></span></td>
      </tr>
      <tr>
        <td>Template lưu/tải DIM · preset · paste Excel</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ bớt &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Ứng viên GỠ BỚT tính năng phụ nếu UI quá phức tạp — giữ paste + lưu chính.</span></td>
      </tr>
      <tr>
        <td>Speech / numpad / voice bar animations</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Ứng viên GỠ nếu kho không dùng mic — giảm noise UI.</span></td>
      </tr>
      <tr>
        <td>Xuất LIST DIM SCSC / Excel DIM</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ nếu SCSC còn dùng báo cáo.</span></td>
      </tr>
    </tbody>
  </table>

  <h2>7. Import / xuất / in tem</h2>
  <table>
    <thead>
      <tr><th style="width:28%">Hạng mục</th><th style="width:32%">Chọn</th><th>Gợi ý / rủi ro</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>GoogleSheetImportModal</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ; REDESIGN copy + toast. Chỉ GỠ nếu bỏ hẳn Sheet book.</span></td>
      </tr>
      <tr>
        <td>Xuất Excel ngày (day report)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ.</span></td>
      </tr>
      <tr>
        <td>PrintShippingLabel overlay + thermal CSS</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign UI preview &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="risk">Tách khỏi dashboard. Đừng đổi layout mm khi “làm đẹp” web.</span></td>
      </tr>
      <tr>
        <td>AirlineLabelSettingsModal (tên hãng trên tem)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Ứng viên đưa vào Settings chung nếu gom menu.</span></td>
      </tr>
    </tbody>
  </table>

  <h2>8. TCS / ESID / extension</h2>
  <table>
    <thead>
      <tr><th style="width:28%">Hạng mục</th><th style="width:32%">Chọn</th><th>Gợi ý / rủi ro</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>TcsPortalInlineBar</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN gọn; <span class="risk">không gỡ nếu còn cổng TCS.</span></span></td>
      </tr>
      <tr>
        <td>Nút ESID profile / agent / registrant settings</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ bớt &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Ứng viên GOM vào một “Cài đặt ESID” thay 3 nút rời.</span></td>
      </tr>
      <tr>
        <td>CustomerEsidQuickFillModal</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Mới / đang làm — quyết sau khi dùng thử.</span></td>
      </tr>
      <tr>
        <td>Chrome extension bridge UI affordances</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ trạng thái kết nối; ẩn chi tiết kỹ thuật.</span></td>
      </tr>
    </tbody>
  </table>

  <h2>9. Màn Danh bạ khách</h2>
  <table>
    <thead>
      <tr><th style="width:28%">Hạng mục</th><th style="width:32%">Chọn</th><th>Gợi ý / rủi ro</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>CustomersPage (list + detail)</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: REDESIGN (P1) sau Ops. <span class="risk">Không gỡ.</span></span></td>
      </tr>
      <tr>
        <td>Dirty save Hủy/Lưu + validation fields</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ mô hình; polish UX lỗi.</span></td>
      </tr>
      <tr>
        <td>Import/export Excel khách (nhiều mẫu)</td>
        <td class="choice"><span class="cb">☐</span> Giữ hết &nbsp; <span class="cb">☐</span> Giữ 1 mẫu &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Ứng viên GIỮ 1 mẫu chính — giảm nút trùng.</span></td>
      </tr>
      <tr>
        <td>CustomerSavedProfilesEditor</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Gỡ &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ nếu in tem dùng hồ sơ.</span></td>
      </tr>
      <tr>
        <td>CustomerDeleteConfirmModal</td>
        <td class="choice"><span class="cb">☐</span> Giữ &nbsp; <span class="cb">☐</span> Redesign &nbsp; <span class="cb">☐</span> Hoãn</td>
        <td><span class="hint">Gợi ý: GIỮ confirm xóa.</span></td>
      </tr>
    </tbody>
  </table>

  <h2>10. Ứng viên gỡ sớm (để UI nhẹ)</h2>
  <p class="hint">Đánh dấu những gì bạn muốn bỏ trong đợt 1. Chỉ gỡ khi đã xác nhận không còn ai dùng.</p>
  <div class="col2">
    <div class="box">
      <strong>Visual / noise</strong>
      <ul class="check">
        <li><span class="cb">☐</span> Glass blur header</li>
        <li><span class="cb">☐</span> Toàn bộ class <code>dark:</code> (nếu light-only)</li>
        <li><span class="cb">☐</span> Hover magnify CNEE (desktop)</li>
        <li><span class="cb">☐</span> Animation voice bar / strip thừa</li>
        <li><span class="cb">☐</span> Text “Air cargo handling” phụ đề</li>
      </ul>
    </div>
    <div class="box">
      <strong>Tính năng phụ (cân nhắc)</strong>
      <ul class="check">
        <li><span class="cb">☐</span> Speech-to-DIM</li>
        <li><span class="cb">☐</span> Một phần preset DIM ít dùng</li>
        <li><span class="cb">☐</span> Nút Excel/DIM trùng (gom menu)</li>
        <li><span class="cb">☐</span> Nhiều nút ESID settings rời → 1 chỗ</li>
        <li><span class="cb">☐</span> Mẫu Excel khách thừa</li>
      </ul>
    </div>
  </div>

  <h2>11. Lộ trình gợi ý (đánh dấu đợt)</h2>
  <table>
    <thead>
      <tr>
        <th style="width:12%">Đợt</th>
        <th style="width:38%">Nội dung gợi ý</th>
        <th>Chọn đợt của bạn / ghi chú</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="phase">A</td>
        <td>Chuẩn hóa token + Button/Input/Modal; brand logo/favicon; quyết dark keep/gỡ</td>
        <td><span class="cb">☐</span> Làm &nbsp; <span class="cb">☐</span> Bỏ qua<br><span class="note-lines">Ghi chú: _______________________________</span></td>
      </tr>
      <tr>
        <td class="phase">B</td>
        <td>Redesign Ops header + Stat + warehouse chips/picker (desktop + mobile)</td>
        <td><span class="cb">☐</span> Làm &nbsp; <span class="cb">☐</span> Bỏ qua<br><span class="note-lines">Ghi chú: _______________________________</span></td>
      </tr>
      <tr>
        <td class="phase">C</td>
        <td>Redesign bảng desktop + card/sheet mobile (cùng thông tin, skin mới)</td>
        <td><span class="cb">☐</span> Làm &nbsp; <span class="cb">☐</span> Bỏ qua<br><span class="note-lines">Ghi chú: _______________________________</span></td>
      </tr>
      <tr>
        <td class="phase">D</td>
        <td>Gỡ noise đợt 1 (blur/dark/magnify/speech…) theo checklist §10</td>
        <td><span class="cb">☐</span> Làm &nbsp; <span class="cb">☐</span> Bỏ qua<br><span class="note-lines">Ghi chú: _______________________________</span></td>
      </tr>
      <tr>
        <td class="phase">E</td>
        <td>Redesign CustomersPage + gom Excel/ESID settings</td>
        <td><span class="cb">☐</span> Làm &nbsp; <span class="cb">☐</span> Bỏ qua<br><span class="note-lines">Ghi chú: _______________________________</span></td>
      </tr>
      <tr>
        <td class="phase">F</td>
        <td>DIM modal / TCS bar — chỉ sau khi Ops ổn định</td>
        <td><span class="cb">☐</span> Làm &nbsp; <span class="cb">☐</span> Bỏ qua<br><span class="note-lines">Ghi chú: _______________________________</span></td>
      </tr>
    </tbody>
  </table>

  <h2>12. Quyết định tổng (điền tay)</h2>
  <div class="box">
    <strong>Mục tiêu redesign (1 câu):</strong>
    <div class="note-lines" style="min-height:28px;border:none;margin:0;padding:0">________________________________________________________________</div>
  </div>
  <div class="box">
    <strong>Phần nhất định GIỮ (không đụng logic):</strong>
    <div class="note-lines" style="min-height:36px;border:none;margin:0;padding:0">________________________________________________________________</div>
  </div>
  <div class="box">
    <strong>Phần GỠ trong tuần này:</strong>
    <div class="note-lines" style="min-height:36px;border:none;margin:0;padding:0">________________________________________________________________</div>
  </div>
  <div class="box">
    <strong>Phần REDESIGN đầu tiên (file neo):</strong>
    <div class="note-lines" style="min-height:36px;border:none;margin:0;padding:0">________________________________________________________________</div>
  </div>

  <p class="footer">
    TECSOPS UI redesign checklist · File neo: App.tsx, AirCargoTracking.tsx, CustomersPage.tsx, tailwind.config.js, statusStyles.ts, opsModalStyles.ts, mobileOpsStyles.ts, print-label.css ·
    Tạo từ khảo sát codebase — không phải mockup thiết kế.
  </p>
</body>
</html>
`;

await mkdir(outDir, { recursive: true });
await writeFile(htmlPath, html, "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`file://${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "load" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
});
await browser.close();

console.log(`Wrote:\n  ${htmlPath}\n  ${pdfPath}`);
