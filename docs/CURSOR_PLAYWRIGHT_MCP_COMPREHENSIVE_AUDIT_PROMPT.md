# Prompt Cursor + Playwright MCP audit toàn diện TECSOPS

> Sao chép nguyên khối prompt bên dưới vào Cursor Agent sau khi đã bật Playwright MCP. Prompt này ưu tiên kiểm thử, thu thập bằng chứng và đề xuất nâng cấp; không tự ý sửa production hoặc gửi dữ liệu lên portal thật.

```text
Bạn là Principal QA Engineer, Senior Product Engineer, UI/UX Auditor và Air Cargo Operations Analyst. Hãy dùng Cursor Agent kết hợp Playwright MCP để tự khảo sát và kiểm thử toàn diện dự án TECSOPS tại D:\TECSOPS.

MỤC TIÊU

1. Đọc và lập bản đồ toàn bộ mã nguồn, cấu hình, tài liệu, test và luồng dữ liệu trước khi thao tác trình duyệt.
2. Dùng Playwright MCP để test lại chức năng, logic nghiệp vụ, responsive UI, accessibility, realtime/offline và các trạng thái lỗi.
3. Không chỉ “click thấy chạy”: mỗi case phải có precondition, dữ liệu vào, thao tác, expected result, actual result và bằng chứng.
4. Phát hiện bug/rủi ro/nợ kỹ thuật; sau đó đề xuất nâng cấp có ưu tiên, tác động, độ khó, file liên quan và tiêu chí nghiệm thu.
5. Giai đoạn audit không được sửa code production. Chỉ được tạo artifact kiểm thử/báo cáo trong output/playwright-audit/ và docs/ khi cần. Trước khi sửa bất kỳ code nào ở giai đoạn sau, phải xin xác nhận.

NGUYÊN TẮC AN TOÀN TUYỆT ĐỐI

- Code và dữ liệu hiện hữu là nguồn sự thật. Đọc AGENTS.md và mọi .cursor/rules trước.
- Không đọc hoặc in giá trị bí mật từ .env.local; chỉ ghi nhận tên biến cấu hình. Không đưa credential/token/cookie/PII vào ảnh, trace hoặc báo cáo.
- Không dùng DATABASE_URL production. Không reset, truncate, migrate, restore hoặc ghi đè database. Không sửa snapshot tecsops-postgres-state-*.json.
- Không chạy npm run dev một cách mù quáng: scripts/dev.mjs giải phóng port 3001/5173 và mặc định tự khởi động TCS agent REAL. Chỉ chạy khi đã xác nhận môi trường test và đặt TCS_AGENT_AUTO=0.
- Ưu tiên BASE_URL do người dùng cung cấp hoặc server local đã chạy. Nếu chưa có môi trường test tách biệt, hoàn thành read-only audit trước và ghi BLOCKED cho case cần mutation.
- Mọi dữ liệu E2E được tạo phải có marker duy nhất dạng E2E-<timestamp>, ngày phiên test riêng và danh sách ID để cleanup chính xác. Chỉ xóa đúng record do phiên test tạo. Không dùng script smoke cũ theo cách để lại booking rỗng.
- Không submit khai báo eSID, đăng ký eCargo, OTP, email, in thật, tải hồ sơ thật hoặc mutation lên portal TCS/SCSC production.
- Với www.tcs.com.vn và ecargo.scsc.vn: chỉ được inspect DOM/locator hoặc dry-run trên tài khoản/môi trường test đã được cho phép. Dừng trước nút submit cuối. Không vượt CAPTCHA, OTP hay cơ chế bảo vệ.
- Không thay Chrome Extension bằng Playwright MCP trong luồng production. MCP chỉ dùng để test/debug.
- Không gọi AI/Gemini, Gmail/IMAP, Google Sheet production hoặc dịch vụ ngoài nếu chưa được cho phép. Mock/stub ở lớp network nếu cần chứng minh UI.
- Không thay đổi CSS @page, đơn vị mm, khổ tem, margin, tỷ lệ hoặc nội dung in khi chưa có phép đo và phê duyệt.
- Nếu một thao tác có nguy cơ làm mất dữ liệu hoặc phát sinh tác động ngoài máy, dừng case đó, ghi BLOCKED + lý do + cách test an toàn đề xuất; tiếp tục các case còn lại.

GIAI ĐOẠN 0 — KHẢO SÁT REPOSITORY, CHƯA MỞ TRÌNH DUYỆT

1. Kiểm kê bằng rg --files, loại node_modules, dist, output, backups, file nhị phân và snapshot dữ liệu khỏi phần đọc code.
2. Đọc đầy đủ tối thiểu các vùng:
   - package.json, lockfile, vite/vitest/tsconfig/eslint/tailwind, Docker/Railway, .env.example.
   - src/App.tsx, useHashRoute, AirCargoTracking, DesktopShipmentTable, MobileShipmentCards, MobileShipmentEditSheet, MobileDimKgModal.
   - CustomersPage, CustomerSavedProfilesEditor và toàn bộ customerDirectory/customer Excel utilities.
   - OpsStatsPage, OpsStatsCharts và opsStats utilities.
   - useShipmentSync, shipmentMutations, server/index.mjs, stateStore/postgresStateStore, Socket.IO và mutation contract.
   - AWB, workflow, warehouse registry, DIM/chargeable-weight, print/label/CSD, Sheet import/export.
   - TCS/eSID, eCargo SCSC, Chrome extensions, portal jobs, Python tcs-awb-automation.
   - Toàn bộ *.test.*, pytest, scripts/qa-smoke-e2e.mjs, tài liệu trong docs/.
3. Tạo dependency map: màn hình -> component -> hook/util -> API/socket/storage -> dịch vụ ngoài.
4. Liệt kê route/API/action, localStorage key, channel postMessage, file download và print path.
5. Ghi rõ phần nào đã đọc sâu, phần nào chỉ kiểm kê; không được tuyên bố “đọc toàn bộ” nếu còn vùng chưa xem.

BASELINE BẮT BUỘC

Chạy và lưu toàn bộ kết quả, không sửa lỗi ngay:

- npm run typecheck
- npm run lint
- npm run lint:server
- npm test
- npm run build
- cd tcs-awb-automation && python -m pytest -q

Baseline tham chiếu ngày 2026-08-12 (phải chạy lại, không mặc định là còn đúng):

- Vitest: PASS 83 files / 529 tests.
- Build: PASS; cảnh báo chunk AirCargoTracking khoảng 1.27 MB và vendor-excel khoảng 939 KB.
- Frontend lint: 2 warnings no-explicit-any tại MobileDimKgModal.tsx và customerFullProfileExcel.ts; server lint PASS.
- Pytest: 1 FAIL tại tests/test_combobox_match.py::test_combobox_search_queries_prefer_short_tail; expected PCS nhưng nhận chuỗi đầu tên công ty dài.

Nếu baseline khác, ghi cả expected baseline cũ và actual mới. Phân biệt lỗi có sẵn với lỗi do thao tác audit.

GIAI ĐOẠN 1 — CHUẨN BỊ PLAYWRIGHT MCP

1. Xác nhận BASE_URL, /api/health, /api/state và trạng thái socket trước khi mutation.
2. Lưu phiên test vào output/playwright-audit/<timestamp>/ gồm:
   - inventory.md, test-matrix.md, network.json, console.log;
   - screenshots/ theo case và breakpoint;
   - findings.md, upgrade-proposals.md, executive-summary.md;
   - trace/HAR chỉ khi đã redaction bí mật.
3. Theo dõi pageerror, console error/warning, request failed, response 4xx/5xx, websocket disconnect và long task trong toàn bộ phiên.
4. Dùng locator bền vững theo role/name/label/test-id. Không dùng nth-child hoặc timeout cố định nếu có thể chờ state/response cụ thể.
5. Chạy từng case độc lập, có screenshot trước/sau khi lỗi. Với mutation, kiểm tra cả UI, API response, state sau reload và một browser context thứ hai nếu liên quan sync.
6. Viewport tối thiểu:
   - mobile 320x568, 375x812, 390x844;
   - tablet 768x1024;
   - desktop 1280x720, 1366x768, 1440x900, 1920x1080.
7. Test light mode chính. Đồng thời xác minh không có dark class/toggle nửa vời làm giảm tương phản.

MA TRẬN TEST BẮT BUỘC

A. APP SHELL, ROUTE VÀ TRẠNG THÁI HỆ THỐNG

- #/, #/customers, #/stats; direct load, back/forward, refresh, lazy-loading skeleton và URL hash không hợp lệ.
- Live / đồng bộ hạn chế / offline; loading, empty, error và reconnect.
- Header sticky, logo, ngày phiên, KPI, tool menu, CTA Booking; không trùng CTA và không che nội dung.
- Không có auth app hiện tại là một security finding cần xác minh, không tự thêm auth trong audit.

B. OPS — BOOKING VÀ INLINE EDIT DESKTOP

- Tạo booking đúng kho đang chọn; STT đánh lại theo sessionDate + warehouse.
- Sửa AWB, HAWB, flight, flightDate, cutoff, note, dest, customer, pcs, kg và DIM bằng click, double-click, Enter, Tab, Escape, blur.
- Reload sau save; lỗi mạng giữa lúc save; double-click nhanh; hai context sửa cùng record; không silent data loss.
- Delete phải có xác nhận, focus hợp lý và không đặt cạnh primary CTA.
- Keyboard shortcut N, / hoặc F và các shortcut hiện hữu; không kích hoạt khi đang gõ trong input/modal.

C. QUY TẮC AWB VÀ TRẠNG THÁI

- AWB hợp lệ phải chuẩn hóa thành 11 chữ số (prefix 3 + serial 8); test dấu gạch, khoảng trắng, chữ, thiếu/dư số, null và duplicate.
- Xác minh duplicate gate trên UI lẫn server; không chỉ dựa client.
- Auto status: thiếu AWB/pcs -> PENDING; đủ AWB + pcs -> RECEIVED; có DIM -> VOLUME_DONE, trừ trạng thái manual cần giữ.
- Workflow TCS family: PENDING -> RECEIVED -> VOLUME_DONE -> OLA_PULL -> RECEPTION_COMPLETED -> WEIGH_SLIP.
- Workflow SCSC family: PENDING -> RECEIVED -> VOLUME_DONE -> OLA_PULL -> WEIGH_SLIP; không hiển thị RECEPTION_COMPLETED như bước chọn bình thường.
- CUSTOMS, SECURITY, COMPLETED là lịch sử/ngoài filter hiện tại; dữ liệu cũ không được mất hoặc tự map sai.

D. RANH GIỚI KHO — ASSERTION BẮT BUỘC

- Bốn mã riêng biệt: TECS-TCS, TECS-SCSC, TCS, SCSC.
- OpsTeam TECS chỉ gồm TECS-TCS + TECS-SCSC. Báo cáo TCS chỉ gồm TCS; SCSC chỉ gồm SCSC.
- TCS family cho portal/DIM gồm TECS-TCS + TCS; SCSC family cho DIM gồm TECS-SCSC + SCSC.
- eCargo vehicle registration chỉ xuất hiện cho SCSC trực tiếp, không xuất hiện cho TECS-SCSC.
- Search/filter/charts/report/export không được gộp nhầm TECS-TCS vào TCS hoặc TECS-SCSC vào SCSC.

E. DATE, SEARCH, FILTER VÀ KPI

- Prev/next/today/date input qua cuối tháng, cuối năm, leap day và timezone Asia/Saigon.
- Search AWB/HAWB/customer code/name/shipper/consignee/vehicle/driver/dest; normalization dấu, khoảng trắng, hoa thường.
- Flight-date facet kết hợp AND với text search; clear filter khôi phục đúng state.
- Chọn kết quả phải đổi đúng warehouse, scroll và highlight đúng row/card.
- KPI Lô/Kiện/Kg và warehouse metrics phải tính từ đúng tập sau filter; kg giữ độ chính xác, không format rút gọn gây sai.

F. DIM / VOLUME / CHARGEABLE WEIGHT

- Mở modal từ desktop và mobile; manual kg, đo thật, ước tính, paste một/nhiều dòng, thêm/xóa/khóa dòng, template và custom preset.
- Test divisor 6000 và 5000; L/W/H/pcs rỗng, 0, âm, thập phân, cực lớn, paste bẩn, số dòng lớn.
- Tổng pcs của dimLines, dimWeightKg và status phải nhất quán sau save/reopen/reload.
- SCSC: xác minh rule theo airline, rounding từng dòng/tổng, chargeable = logic đúng giữa kg thực và DIM; cảnh báo max dimensions.
- TCS: attached DIM và PDF biên bản đo; giới hạn/bố cục dòng không làm mất dữ liệu.
- Đối chiếu kết quả UI với volumetricDim/scscChargeableWeight bằng phép tính độc lập trong test; không lấy chính output UI làm expected.

G. CUSTOMER DIRECTORY

- List/detail, search, create, edit, cancel dirty form, save, delete confirm, responsive list-detail.
- Customer Code bắt buộc 2-5 chữ A-Z và là khóa sync; test lowercase, dấu cách, Unicode, duplicate, đổi code.
- Short Code tối đa 10 ký tự; validate tax/email/phone/rate/type và thông báo lỗi gắn đúng field.
- Các tab savedShippers, savedConsignees, savedGoods, savedVehicles, savedDimTemplates; default ID phải luôn trỏ tới item tồn tại.
- Deduplicate hợp lý theo tên + địa chỉ/định danh; không làm mất nhiều chi nhánh hợp lệ.
- Chọn customer trên booking phải resolve đúng default shipper/consignee/goods/vehicle/DIM template.
- eSID quick fill ưu tiên selection trên shipment, sau đó default profile; registrant và agent bắt buộc trước khi fill.

H. EXCEL VÀ GOOGLE SHEET

- Import hồ sơ khách định dạng 9/22 cột và template hiện hành: header biến thể, dòng trống, duplicate code, nhiều profile, số/date bị Excel coercion, file lớn.
- Export rồi import lại phải bảo toàn dữ liệu quan trọng; không mất row 2, Unicode, leading zero hoặc multiline address.
- Google Sheet modal: URL/ID/gid, tab đúng ngày, preview, chọn dòng, chọn kho, reconcile row cũ/mới, partial failure và retry.
- Không gọi Sheet production trong audit. Dùng fixture/mock hoặc bản test được cấp quyền.
- Export báo cáo ngày/khoảng ngày, eSID Excel, SCSC DIM list và TCS attached DIM: kiểm filename, header, số dòng, kho, ngày, công thức/giá trị và dữ liệu tải xuống.
- Đo thời gian và memory với workbook nhỏ/vừa/lớn; UI không được treo main thread kéo dài.

I. PRINT / LABEL / CSD

- Preview và lựa chọn 100x80, 100x50, số bản, flip/rotate và printer profile.
- Intercept window.print; tuyệt đối không gửi lệnh tới máy in thật.
- So sánh DOM/CSS/screenshot và PDF artifact; AWB dài, HAWB, Unicode, address multiline, thiếu logo, nhiều bản.
- Snapshot bất biến @page, kích thước mm, margin và nội dung barcode/text trước khi đề xuất UI mới.
- CSD carrier/profile/transit và các form liên quan; không điền nhầm dữ liệu giữa shipment/customer/airline override.

J. TCS / ESID / CHROME EXTENSION — DRY-RUN

- Trạng thái extension: unavailable, available, login required, ready, busy, timeout, malformed response.
- Channel phải đúng theo warehouse: hub/direct/SCSC; message listener xác minh event.source === window và validate payload/origin/channel phù hợp.
- Login UI không log password; credential không tồn tại trong report/localStorage ngoài thiết kế đã xác minh.
- Scan chỉ chạy đúng TCS warehouse và không ghi RECEPTION_COMPLETED sai lô/ngày/kho.
- Fill payload: AWB 3+8, shipper, consignee, goods, other_request kết hợp DIM + note + yêu cầu khách, registrant và agent.
- Chỉ dừng ở form đã điền trong môi trường test; không submit. PDF chỉ test bằng stub/artifact giả.
- Reproduce pytest combobox short-tail failure và kiểm tra ảnh hưởng thật lên combobox portal/locator.

K. eCARGO SCSC — DRY-RUN

- Chỉ SCSC trực tiếp; single/bulk selection, customer profile, agent, driver ID type, vehicle type, plate normalization và nhiều biển số.
- Missing vehicle type phải chặn CTA kèm lỗi rõ. Test OTP waiting/timeout/wrong code/email parsing bằng mock.
- Không gửi đăng ký thật. Xác minh payload và result-store bằng fixture, rồi reload/sync context thứ hai.

L. STATS / CHARTS / REPORT

- Period day/month/year/custom range, prev/next, warehouse/dest filters và mọi detail tab.
- Đối chiếu lots, pcs, kg, DIM, chargeable, delta và averages với tính tay từ fixture.
- Click chart phải lọc đúng table; empty/zero/null/large dataset; tooltip keyboard và responsive.
- Export stats phải khớp tập filter và số liệu đang hiển thị.

M. REALTIME, OFFLINE VÀ DATA INTEGRITY

- Hai browser context: create/update/delete/customer/profile/status; context kia nhận Socket.IO sync đúng thứ tự.
- Ngắt mạng, edit offline, reload, reconnect; local fallback không được ghi đè state server mới hơn một cách im lặng.
- Mutation batch atomicity/partial failure, optimistic state, retry, duplicate event, stale version và reconnect storm.
- Xác minh server validate lại mọi invariant quan trọng; client validation không đủ.

N. ACCESSIBILITY, RESPONSIVE VÀ VISUAL QA

- Chạy keyboard-only: tab order, Enter/Space/Escape, focus trap/return focus, menu/modal/sheet/combobox.
- Kiểm accessible name, label, role, aria-live, error association, contrast, target mobile >=44x44 và reduced motion.
- Không overflow ngang ngoài vùng table có chủ ý; sticky header/action không che field hoặc bàn phím mobile.
- Screenshot từng màn ở mọi breakpoint, gồm normal/loading/empty/error/offline/modal/menu/long-content.
- Dùng visual diff với tolerance hợp lý; phân loại layout shift, clipping, overlap, density, hierarchy và consistency.

O. SECURITY, PRIVACY VÀ ROBUSTNESS

- Kiểm tra read-only: API state/mutation thiếu auth, CORS/CSRF, input validation, payload limit, rate limit, error leakage và security headers.
- Thử payload vô hại cho XSS ở note/customer/address; xác minh render escaped, không thực thi script.
- Kiểm file upload/import chống file sai loại/quá lớn/zip bomb ở mức an toàn; không dùng payload phá hoại.
- Scan tên file cho secret pattern nhưng không in secret. Kiểm postMessage trust boundary, extension permissions và external URL handling.
- Không thực hiện SQL injection/command injection phá hoại; chỉ review code và dùng input canary vô hại trên test env.

P. PERFORMANCE VÀ STABILITY

- Đo navigation, render, filter/search, mở modal, chart và save với 0/10/100/1.000+ shipment fixture.
- Ghi long task, request dư, rerender rõ ràng, memory tăng sau lặp modal/import/export.
- Phân tích bundle; ưu tiên đề xuất code-split AirCargoTracking, Excel và Stats nếu có bằng chứng, không tối ưu theo cảm tính.
- Test mạng chậm, response trễ/out-of-order và thao tác click nhanh lặp lại.

QUY TẮC ĐÁNH GIÁ CASE

- PASS: actual khớp expected và có bằng chứng.
- FAIL: tái hiện ổn định, có bước tối thiểu và bằng chứng.
- FLAKY: kết quả không ổn định sau ít nhất 3 lần, ghi tỷ lệ.
- BLOCKED: thiếu môi trường/quyền/dữ liệu an toàn; ghi chính xác điều kiện cần.
- NOT APPLICABLE: chỉ dùng khi chứng minh chức năng không tồn tại hoặc đã deprecated.
- Không coi screenshot đẹp là bằng chứng logic đúng. Không coi HTTP 200 là mutation đúng nếu state/reload không khớp.

ĐẦU RA BẮT BUỘC

1. docs/TECSOPS-PLAYWRIGHT-AUDIT-<YYYY-MM-DD>.md theo cấu trúc:
   - Executive Summary.
   - Phạm vi đã đọc/đã test/chưa test.
   - Environment và baseline.
   - Coverage matrix theo A-P: PASS/FAIL/FLAKY/BLOCKED/NA.
   - Findings xếp P0 Critical, P1 High, P2 Medium, P3 Low.
   - Mỗi finding: ID, title, file:line, route/component, precondition, repro, expected, actual, impact nghiệp vụ, evidence path, root-cause hypothesis, confidence.
   - Security/privacy findings tách riêng và redaction đầy đủ.
   - Visual/a11y/performance summary.
   - Danh sách dữ liệu E2E đã tạo và trạng thái cleanup.
2. docs/TECSOPS-UPGRADE-PROPOSALS-<YYYY-MM-DD>.md:
   - Chỉ đề xuất dựa trên finding/bằng chứng.
   - Mỗi đề xuất: vấn đề, giá trị cho Ops, phạm vi/file, giải pháp, lựa chọn thay thế, rủi ro migration/data, effort S/M/L/XL, dependency, acceptance criteria và test hồi quy.
   - Nhóm Quick wins, Reliability/Data integrity, Business logic, UI/UX/A11y, Performance, Security, Test infrastructure.
   - Roadmap theo P0 -> P3 và đợt nhỏ có thể rollback; không đề xuất rewrite toàn bộ.
3. output/playwright-audit/<timestamp>/ chứa test matrix CSV/JSON, screenshot, log đã redaction và artifact tải xuống.
4. Cuối phiên trả lời ngắn:
   - tổng số case và số PASS/FAIL/FLAKY/BLOCKED;
   - 5 rủi ro cao nhất;
   - 10 nâng cấp đáng làm nhất theo value/effort;
   - link/path tới báo cáo và evidence;
   - xác nhận không submit portal thật, không in thật, không đụng production DB và cleanup đã hoàn tất hay chưa.

CÁC ĐIỀU KIỆN DỪNG

- Dừng ngay mutation nếu BASE_URL/DB có khả năng là production.
- Dừng external flow trước submit/OTP/CAPTCHA/payment/email/print thật.
- Dừng và báo nếu phát hiện secret/PII bị lộ; không chép giá trị vào chat.
- Dừng triển khai sửa lỗi sau audit. Chờ người dùng chọn finding/đợt nâng cấp rồi mới sửa code.

BẮT ĐẦU

Hãy bắt đầu bằng Giai đoạn 0. Trước khi dùng Playwright MCP, xuất inventory, dependency map, baseline và kế hoạch test dựa trên code thật. Sau đó chạy read-only browser pass, trình bày rõ môi trường có an toàn cho mutation hay không, rồi mới tiếp tục các case ghi dữ liệu. Cứ tiếp tục tự chủ qua các case an toàn; không dừng chỉ để hỏi những chi tiết có thể xác minh từ repository hoặc UI.
```

## Cách dùng ngắn

1. Mở `D:\TECSOPS` trong Cursor và bật Playwright MCP.
2. Bảo đảm Cursor đang trỏ vào môi trường test, không phải database/portal production.
3. Dán toàn bộ prompt trên vào Agent mode.
4. Chỉ cho phép giai đoạn mutation sau khi Cursor báo rõ `BASE_URL`, database test và phương án cleanup.

