# Mockup — Bảng danh sách lô hàng (chỉ đề xuất giao diện)

Đã nối phương án 1 vào app thật (`DesktopShipmentTable` + `LotProfilePanel` + card/sheet mobile). File tĩnh dưới đây vẫn dùng để so sánh.

**Phương án 1 (đang chọn):** bảng desktop quét nhanh + card mobile. **Không** hiện trạng thái lô.

**Hồ sơ khách:** gộp cột KHÁCH + INFO KH. Hàng danh sách chỉ quét **mã KH → CNEE → hàng**. Shipper, địa chỉ, tên in nằm panel/sheet (desktop phải, mobile bottom sheet `?sheet=1`). Chip `Tên in ≠` khi tên in khác hồ sơ CNEE.

**Mật độ hàng:** mỗi lô đúng **3 dòng** (KH → CNEE → hàng). AWB / chuyến / cut-off nằm 1 dòng. Nút thao tác **không** nhét vào hàng — để trên panel/sheet, khỏi đội chiều cao.

**Thao tác nhanh:** panel/sheet là bàn lệnh — `In tem` + `Đo DIM` nổi, rồi `Copy AWB` / `Copy hồ sơ` / `Ghi chú` / `H21`. Cảnh báo tên in có nút `In tem với tên này`.

| File | Vai trò |
| --- | --- |
| [new-m.html](./new-m.html) | **M** — bảng vận hành + drawer (`?detail=1`) |
| [new-n.html](./new-n.html) | **N** — nhóm theo chuyến + trang hồ sơ (`?page=1`) |
| [new-j.html](./new-j.html) | **J** — master-detail / Excel outline trong lưới |
| [new-k.html](./new-k.html) | **K** — reading pane dưới + tab ngang |
| [new-l.html](./new-l.html) | **L** — phiếu lô giấy (AWB / SLI / QF/ED/49) |
| [new-i.html](./new-i.html) | **I** — lưới Excel + inspector phải (owner đã loại) |
| [new-f.html](./new-f.html) | **F** — ULD / build-up (Cargospot + iCargo CTO) |
| [new-g.html](./new-g.html) | **G** — cửa dock / VCT (SCSC lounge + Manhattan yard) |
| [new-h.html](./new-h.html) | **H** — quét trước / hàng tem (Zebra + dán talon TCS) |
| [new-c.html](./new-c.html) | **C** — bảng chuyến / cut-off (Morgen timeline) |
| [new-d.html](./new-d.html) | **D** — inbox split (Superhuman / hộp thư) |
| [new-e.html](./new-e.html) | **E** — brand ticket (Pitch + Ujjo) |
| [pro.html](./pro.html) | Pro A/B — polish cùng layout bảng+panel: `?dir=a` light, `?dir=b` dark |
| [index.html](./index.html) | Phương án 1 — đề xuất trước (desktop bảng + mobile card) |
| [current.html](./current.html) | Tái tạo tĩnh màn hình Ops hiện tại để so sánh |

## Pro A / B (nghiên cứu)

Cùng IA đã chốt (hàng 3 dòng, AWB+chuyến+cut-off 1 dòng, không status, thao tác panel). Token vẫn `ui.*`.

Tham chiếu thật (OpenDesign computed styles): **Vercel** (hairline, 4px grid, radius 6–8), **Linear** (dense dark, contrast, mono ID), **Mercury** (caption 11–12, restraint). Không có Flexport/airline catalog — không bịa token.

- **A calm light:** canvas `#EEF2F6`, rail 56px, command bar 1 hàng (⌘K), bảng flush không card-per-row, selected = teal rail 2px, skeleton “đang kéo Sheet”, kho 0 = chip nét đứt.
- **B ops dark:** token `.dark` official (`#020617` / `#2DD4BF`), hairline `white/8`, không đổ bóng.
- **Motion (ghi chú triển khai):** hover 150ms color-only; selected fade 900ms; skeleton 1.2s pulse; không bounce.

**Khuyến nghị A/B:** A cho ca ngày kho (in tem/giấy, light-first hiện tại). B giữ làm ca đêm / `class="dark"`. Owner đã xem A/B — không refine thêm cùng layout.

## C / D / E (hướng mới — không phải A/B)

Cùng IA đã chốt. Khác **cấu trúc**, không chỉ theme.

Tham chiếu OpenDesign (token thật): **Morgen** `#191A23` / `#F3C26A` (planner/timeline), **Superhuman** `#f2f0eb` / `#734cb6` (inbox premium), **Pitch** `#0c021c` / `#d4fb6b` / `#c6a5ff` + **Ujjo** cạnh sắc / neon. Mobbin không auth được trong session này. Skill GitHub: `nextlevelbuilder/ui-ux-pro-max` (nhóm + progressive disclosure), `kcd-dev/google-stitch-hallmark-ui-design-skill` (personality, không generic SaaS). Catalog OpenDesign không có Flexport/airline — không bịa token cargo.

- **C flight board:** lô nhóm theo chuyến, sắp cut-off, countdown `00:47` trên CX 766. Không còn hàng bảng. Ca kho thấy “chuyến nào sắp đóng”.
- **D inbox split:** list trái ~420px (KH = sender, AWB = subject, CNEE/hàng = preview, cut-off = time). Phải là **workspace đầy** — không còn panel 340px.
- **E brand ticket:** Syne + lime/tím, DST khổ lớn, AWB lime, vé máy bay. Vẫn 3 dòng KH/CNEE/hàng, thao tác panel.

**Khuyến nghị C/D/E: C** cho ca kho — cut-off là nhịp thật của xe/chuyến. D nếu owner muốn hồ sơ là màn chính (ít lô, nhiều sửa). E nếu cần nhận diện mạnh; kém “ops” hơn C.

Dữ liệu trên mọi file là **mẫu giả** (AWB `618-1234 5675` / `160-9876 5432`, chuyến `SQ 183` / `CX 766` / `VN 30x`). App thật cần Postgres + auth nên screenshot “hiện tại” được render từ `current.html`, bám layout `DesktopShipmentTable` / `OpsDesktopCommandBar`.

Mở file bằng trình duyệt, hoặc `npx serve docs/mockups/lots-list`.

Chụp PNG (Playwright, không chạy trong CI):

```bash
npx playwright install chromium
ARTIFACT_DIR=/opt/cursor/artifacts node docs/mockups/lots-list/screenshot.mjs
```

Ra thêm các PNG C–L và `new-M-desktop.png`, `new-M-mobile.png`, `new-M-detail.png`, `new-N-desktop.png`, `new-N-mobile.png`.

## M / N — bảng vận hành (không giả Excel)

Owner: cần **bảng quản lý**, không UI bắt chước Excel (không kẻ ô, không A/B/C, không thanh fx, không gutter). Token `ui.*` + Plus Jakarta / IBM Plex Mono.

- **M:** bảng sạch (Linear / Stripe / Shopify orders) + view lưu + search + bulk In tem/Xuất + drawer hồ sơ. Highlight **cut-off** và chip *Chưa đo* / *Tên in ≠* — không badge workflow PENDING.
- **N:** cùng bảng nhưng **nhóm theo chuyến**, hàng tổng (pcs/kg/số lô/cut-off). Click mở **trang hồ sơ** (`?page=1`), không drawer.

**Khuyến nghị:** **M** nếu NV nhảy lô liên tục trên một ngày. **N** nếu ca bám cut-off/chuyến (xe đóng CX 766).

## J / K / L — chi tiết lô, không inspector phải

Owner loại I (panel phải). List vẫn bảng Excel. Ba pattern khác nhau:

- **J master-detail:** gutter outline 1–2–3, `+`/`−` như [Excel Group](https://support.microsoft.com/en-us/excel/outline-group-data-in-a-worksheet) / [AG Grid Master Detail](https://www.ag-grid.com/javascript-data-grid/master-detail/). Con = `dimLines`, `invoiceDeclarations`, `label_print_jobs` — vẫn là hàng ô, không card.
- **K pane dưới:** lưới trên, splitter, reading pane đáy như [Outlook Reading Pane Bottom](https://support.microsoft.com/en-us/outlook/use-and-configure-the-reading-pane-to-preview-messages-in-outlook). Tab ngang: Hàng & DIM | Shipper/CNEE | Chứng từ & In | Ghi chú & Lịch sử. Smartsheet details panel là bên phải — không dùng.
- **L phiếu lô:** modal/tab form giấy — mặt AWB IATA (shipper/CNEE/pcs/gross/CW), SLI VNA, form DIM TCS `QF/ED/49` (`src/utils/tcsDimRecordForm.ts`). Ô vàng = sửa tại chỗ.

**Khuyến nghị:** **K** cho ca kho (lưới không bị đẩy, DIM rộng ngang). **J** nếu NV sống trong ô và hay đối chiếu nhiều dòng DIM. **L** khi in/ký tờ cân là việc chính.

## I — lưới Excel + hồ sơ lô (owner đã loại inspector phải)

List **phải** là bảng ô (cột, sticky header, AWB đóng băng, sort/filter, F2/Enter, copy/paste). Chi tiết lô mới là chỗ làm việc.

**Pattern chọn: inspector phải** mặc định (Airtable sidesheet / Google Sheets sidebar / `LotProfilePanel`). Không expandable row — DIM + H21 + lịch in không vừa một hàng ([UX Patterns](https://uxpatternsguide.com/compare/expandable-row-vs-table-vs-details-panel-vs-accordion/)). Không full object page làm màn chính — owner vừa khóa spreadsheet. `?focus=1` = lưới AWB hẹp + facet kiểu Fiori Object Page khi đào sâu. Mobile: lưới 5 cột + bottom sheet.

Nguồn lưới: [AG Grid clipboard / pin / keyboard](https://www.ag-grid.com/javascript-data-grid/clipboard/), [Glide Data Grid freeze + paste](https://docs.grid.glideapps.com/extended-quickstart-guide/copy-and-paste-support), [Airtable record detail](https://support.airtable.com/docs/airtable-interface-layout-record-detail), [Notion database page peek](https://www.notion.com/help/guides/using-peek-view-for-database-pages), [Google Sheets side panel](https://support.google.com/docs/answer/1047393), [Retool table expandable rows](https://docs.retool.com/apps/guides/data/tables), [Fiori List Report + Object Page](https://help.sap.com/docs/abap-cloud/abap-rap/creating-list-report-and-object-page).

Trường **đã có** trên `Shipment` / DB: AWB, HAWB, chuyến, `cutoff`, dest, `warehouse`, pcs/kg, `dimLines`/`dimWeightKg`/`dimDivisor`, CW = `max(kg,DIM)` (`computeShipmentWeightMetrics`), khách/shipper/CNEE + `*Print` (kể cả `consigneeNamePrint`), `note`, H21 `invoiceDeclarations`, `label_print_jobs`, `syncedAt`. Status enum tồn tại nhưng **không** hiện badge trên list. **Đề xuất mới:** AWB tách check-digit (IATA Res 600a, app đang `formatAwb` 3-8), countdown cut-off, entity tờ cân (chỉ có status `WEIGH_SLIP`, chưa có bảng), activity timeline đầy đủ (chưa có audit log).

## F / G / H (logistics — không generic SaaS)

Nghiên cứu SGN + phần mềm cargo/WMS/scanner (nguồn ghi trên PR #80). Cùng IA đã chốt; **không** badge trạng thái lô trên list.

- **F ULD build-up:** chuyến = pallet/AKE/BULK, thanh chỗ kg/pcs, AWB tách check-digit, lệch cân Δ. Khác C (C = đồng hồ cut-off; F = chỗ trên ULD).
- **G cửa dock / VCT:** lưới cửa D01–D08 + VCT như màn lounge SCSC / Manhattan dock door. Lệch tờ cân trên cửa đang gọi.
- **H scan-first + hàng tem:** giếng quét DataWedge, AWB 3-7-CD, hàng in Zebra, mốc lô chỉ ở panel.

**Khuyến nghị A–H:** **G** nếu ca nhận xe/cửa; **F** nếu ca build-up chuyến; **C** nếu chỉ cần cut-off. H cho máy cầm tay. A ổn nếu giữ bảng. B/D/E không phải nhịp kho SGN.
