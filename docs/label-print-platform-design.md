# Thiết kế nền tảng in tem nâng cao TECSOPS

Ngày thiết kế: 2026-07-23  
Phạm vi: hiệu chuẩn máy in, trình thiết kế kéo-thả và in tem theo từng HAWB.

### Quyết định nghiệp vụ đã khóa

- Chỉ hỗ trợ hai khổ tem: **100×80 mm** và **100×50 mm**. Không cho tạo khổ tùy ý.
- Origin luôn là **SGN** và không hiển thị ô chỉnh sửa khi in.
- Khi lô có HAWB, renderer tự động chuyển sang tem House và làm nổi bật HAWB; người dùng không cần bật/tắt.
- Số tem in luôn do người vận hành nhập tay cho từng lệnh in. Không mặc định, không tự lấy theo master PCS hoặc house PCS và không có nút “Theo kiện”.
- Số kiện vẫn là dữ liệu được in trên tem và dùng để đối soát, nhưng không quyết định số bản in.

## 1. Kết luận kiến trúc

Ba chức năng phải dùng chung một pipeline:

```text
Shipment + House shipments
          │
          ▼
 Label template version (bố cục logic, đơn vị mm)
          │
          ▼
 Template resolver (đổ dữ liệu + điều kiện hiển thị)
          │
          ├── Browser/PDF renderer
          └── TSPL renderer
                    │
                    ▼
          Printer profile (máy + media + hiệu chuẩn)
                    │
                    ▼
          Local print bridge → TCP 9100 / Windows spooler
```

Nguyên tắc tách trách nhiệm:

- **Printer profile** lưu tính chất vật lý của máy và cuộn tem: DPI, gap, tốc độ, độ đậm, offset.
- **Label template** lưu bố cục nghiệp vụ: MAWB nằm đâu, HAWB nằm đâu, font bao nhiêu.
- **Print job** là snapshot bất biến của lần in: dữ liệu, template version, printer profile, số bản.
- Không lưu offset máy in vào template và không sửa tọa độ từng trường để bù sai lệch vật lý.

## 2. Hiện trạng dự án

### Thành phần có thể tái sử dụng

- `ThermalLabelPrinterProfile` đã có `dpi`, `gapMm`, `rotation`, `offsetXmm`, `offsetYmm`, `speed`, `density`, kết nối TCP/USB và khổ tem.
- Catalog máy in đã có mutation `SET_PRINTER_PROFILES` và đồng bộ server.
- `ThermalFieldOverride` đã định hình tọa độ/font cho từng trường.
- Migration `20260521_print_templates.sql` đã có template, profile và tọa độ theo mm.
- Luồng browser print đã xử lý đúng khổ 100×80/100×50, xoay tem và số bản.
- `LabelContent` đã là một renderer tem cụ thể có thể dùng làm template mặc định.

### Khoảng trống

- Chưa có màn hình quản lý printer profile.
- Chưa có TSPL generator và local print bridge dù type/comment đã dự kiến.
- Browser print không thể áp trực tiếp `SPEED`, `DENSITY`, `GAP` lên phần cứng.
- Migration template chưa được nối vào API/state và đang trộn “profile bố cục” với “profile máy”.
- Chưa có scene graph dùng chung cho editor và renderer.
- Shipment chỉ có một chuỗi `hawb`; chưa biểu diễn nhiều HAWB và số kiện riêng.
- Google Sheet parser hiện chủ động bỏ phần HAWB trong ô AWB.

## 3. Chức năng 1 — Trình cân chỉnh máy in

### 3.1. UX đề xuất

Mở từ `Xưởng in nhãn → Máy in → Quản lý & cân chỉnh`.

Wizard năm bước:

1. **Chọn máy**
   - Tên profile, loại kết nối, Windows printer name hoặc host:port.
   - Test kết nối và hiển thị trạng thái bridge.
2. **Khai báo media**
   - Khổ 100×80 hoặc 100×50.
   - Loại media: `gap`, `black-mark`, `continuous`.
   - Gap distance và gap sensor offset.
3. **Căn vị trí**
   - In pattern có khung 1 mm, tâm, thước X/Y và mã profile.
   - Người dùng nhập sai lệch đo được: “lệch phải 1.5 mm”, “lệch xuống 0.8 mm”.
   - Hệ thống tự tính offset hiệu chỉnh; vẫn cho phép nút ±0.1/±0.5 mm.
4. **Chọn chất lượng**
   - In dải thử nhiều mức density ở tốc độ đã chọn.
   - Preset: “Nhanh”, “Cân bằng”, “Đậm”.
   - Cảnh báo density cao + speed thấp có thể tăng nhiệt đầu in.
5. **Xác nhận**
   - In một tem dữ liệu thật.
   - Lưu profile theo đúng máy và loại cuộn.

### 3.2. Lệnh TSPL

Job TSPL nên có phần mở đầu tương đương:

```text
SIZE 100 mm,80 mm
GAP 2 mm,0 mm
SPEED 4
DENSITY 10
DIRECTION 0
REFERENCE 0,0
CLS
... fields ...
PRINT 1,3
```

Lưu ý kỹ thuật:

- `GAP` là khoảng cách giữa hai nhãn và offset cảm biến, không phải offset nội dung.
- `REFERENCE x,y` đặt gốc tọa độ theo dot.
- Với profile cho phép offset âm, renderer nên cộng offset vào từng tọa độ rồi kiểm tra clipping; không phụ thuộc hoàn toàn vào `REFERENCE`.
- Quy đổi tọa độ bằng `dots = round(mm × dpi / 25.4)`, không hardcode 8 dot/mm.
- `SPEED` tính bằng inch/second và tập giá trị hợp lệ phụ thuộc model.
- `DENSITY` của TSPL dùng thang 0–15.
- XP-470B được nhà sản xuất công bố hỗ trợ emulation TSPL và tốc độ tối đa 152 mm/s; UI không nên cho chọn tốc độ vượt capability của model.

### 3.3. Mở rộng kiểu dữ liệu

```ts
type MediaMode = "gap" | "black-mark" | "continuous";

type PrinterCapabilities = {
  supportedDpi: number[];
  speedIps: number[];
  densityMin: number;
  densityMax: number;
  maxWidthMm: number;
};

type PrinterCalibration = {
  mediaMode: MediaMode;
  gapMm: number;
  gapOffsetMm: number;
  offsetXmm: number;
  offsetYmm: number;
  speedIps: number;
  density: number;
  calibratedAt?: string;
  calibrationPatternVersion?: number;
};
```

`activeThermalProfileId` nên tiếp tục lưu local theo từng máy trạm; catalog và calibration được lưu server.

### 3.4. Hai chế độ in

| Chế độ | Offset X/Y | Speed/density/gap | Silent print | Mục đích |
|---|---:|---:|---:|---|
| Browser/PDF | Có, bằng CSS | Không | Không | fallback, kiểm tra, Save PDF |
| TSPL bridge | Có | Có | Có | vận hành chính tại quầy |

Không hiển thị speed/density/gap như thể đã được áp dụng nếu người dùng đang ở browser print.

## 4. Chức năng 2 — Trình thiết kế kéo-thả

### 4.1. Mô hình scene graph

Không lưu HTML/CSS tự do. Lưu template dưới dạng scene graph có kiểm soát:

```ts
type LabelElementType =
  | "data-text"
  | "static-text"
  | "line"
  | "rectangle"
  | "barcode"
  | "qr";

type LabelElement = {
  id: string;
  type: LabelElementType;
  fieldKey?: LabelFieldKey;
  text?: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: 0 | 90 | 180 | 270;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  style: {
    fontFamily?: "sans" | "mono" | "printer-0" | "printer-3";
    fontMm?: number;
    bold?: boolean;
    align?: "left" | "center" | "right";
    lineWidthMm?: number;
  };
  format?: {
    prefix?: string;
    suffix?: string;
    uppercase?: boolean;
    maxChars?: number;
  };
  visibleWhen?: LabelCondition;
};
```

Canvas luôn dùng mm. Zoom chỉ thay đổi hiển thị, không thay đổi tọa độ lưu.

### 4.2. Bộ trường dữ liệu

Nhóm master:

- `shipment.mawb`
- `shipment.airline`
- `shipment.origin`
- `shipment.destination`
- `shipment.pieces`
- `shipment.flight`
- `shipment.flightDate`
- `shipment.customer`
- `shipment.specialHandling`

Nhóm house:

- `house.hawb`
- `house.pieces`
- `house.weightKg`
- `house.destination`
- `house.consignee`
- `house.goodsDescription`
- `house.pieceIndex`
- `house.pieceCount`
- `house.sequence` — ví dụ `2/8`

### 4.3. UX editor

Bố cục ba vùng:

```text
┌──────────────┬──────────────────────────┬──────────────────┐
│ Field palette│ Canvas 100×80 / 100×50  │ Properties       │
│ Text         │ guides + ruler + grid   │ X/Y/W/H (mm)     │
│ MAWB         │                          │ font/alignment    │
│ HAWB         │ selected element         │ condition/format  │
│ Barcode/QR   │                          │                  │
└──────────────┴──────────────────────────┴──────────────────┘
```

Tương tác:

- Pointer Events + `setPointerCapture()` để kéo ổn định bằng chuột, bút và cảm ứng.
- Snap 0.5 mm mặc định; giữ Alt để bỏ snap.
- Arrow: 0.1 mm; Shift+Arrow: 1 mm.
- Guides căn trái/phải/tâm và hiển thị khoảng cách.
- Resize handles, multi-select, lock, duplicate, delete.
- Undo/redo bằng command history, tối thiểu 50 bước.
- Preview bằng dữ liệu mẫu hoặc một shipment thật.
- Kiểm tra overflow/clipping trước khi publish.
- Không cho sửa trực tiếp version đã publish; tạo draft mới.

### 4.4. Hai renderer dùng chung

```text
Template + data + printer profile
              │
              ▼
       resolveLabelScene()
              │
       canonical scene in mm
          ┌───┴────┐
          ▼        ▼
      HTML/CSS    TSPL
```

Mọi điều kiện, format và fallback phải được giải quyết trước renderer để preview và bản in không khác nhau.

Rủi ro font:

- Browser font và font tích hợp của máy TSPL không có metric giống nhau.
- Template phải khai báo font mapping rõ ràng.
- Với trường quan trọng như MAWB, renderer TSPL cần auto-fit riêng theo dot.
- Giai đoạn đầu chỉ cho một tập font đã kiểm thử; chưa cho upload font tự do.

### 4.5. Lưu trữ và versioning

Migration hiện có nên được tách lại:

```sql
label_templates
  id, code, name, kind, format, active_version_id

label_template_versions
  id, template_id, version_no, status,
  canvas_width_mm, canvas_height_mm,
  scene_jsonb, created_at, published_at

printer_profiles
  id, name, connection_jsonb, capabilities_jsonb,
  calibration_jsonb, updated_at

printer_template_bindings
  printer_profile_id, label_template_id, is_default
```

`kind`: `master-cargo` hoặc `house-cargo`.

JSONB version bất biến phù hợp hơn việc update từng dòng field: publish nguyên tử, dễ rollback và giữ đúng lịch sử lần in.

API đề xuất:

- `GET /api/printing/templates`
- `POST /api/printing/templates`
- `POST /api/printing/templates/:id/versions`
- `POST /api/printing/templates/:id/versions/:version/publish`
- `GET/PUT /api/printing/printers`
- `POST /api/printing/printers/:id/test`
- `POST /api/printing/jobs/preview`
- `POST /api/printing/jobs`

Mọi update dùng `revision` hoặc `If-Match` để tránh hai người ghi đè template.

## 5. Chức năng 3 — In theo từng HAWB

### 5.1. Thay đổi model

Một chuỗi `shipment.hawb` không đủ. Cần entity:

```ts
type ShipmentHouse = {
  id: string;
  shipmentId: string;
  hawb: string;
  pcs: number | null;
  kg: number | null;
  dimWeightKg: number | null;
  dimLines: DimPieceLine[] | null;
  dest: string;
  consigneeName: string;
  goodsDescription: string;
  specialHandling: string;
  templateId?: string;
  sortOrder: number;
};
```

Quan hệ:

```text
Shipment (MAWB, tổng PCS)
  ├── House A (HAWB-A, 3 PCS)
  ├── House B (HAWB-B, 5 PCS)
  └── Unassigned: MAWB PCS - Σ House PCS
```

### 5.2. Quy tắc dữ liệu

- HAWB không được trùng trong cùng MAWB.
- `pcs` house phải là số nguyên dương khi in theo kiện.
- Tổng house pcs không được vượt master pcs.
- Có thể cho phép tổng nhỏ hơn master pcs và hiển thị “kiện chưa phân bổ”.
- Trước khi in, người vận hành phải nhập tay số tem cho từng HAWB; house PCS chỉ dùng để đối soát và cảnh báo chênh lệch.
- Sửa master pcs xuống thấp hơn tổng house pcs phải bị chặn.
- Không tự suy house pcs từ master nếu có nhiều house.

Migration dữ liệu cũ:

- Nếu `shipment.hawb` có giá trị, tạo một house với `pcs = null`.
- Đánh dấu `allocationStatus = "needs-confirmation"`.
- Không tự gán toàn bộ master pcs cho HAWB cũ vì có thể sai nghiệp vụ.

### 5.3. UX quản lý HAWB

Thêm tab `HAWB` trong form lô:

- Bảng HAWB, số kiện, kg, DEST, CNEE, tên hàng.
- Thêm/xóa/sắp xếp house.
- Dán nhiều dòng từ Excel.
- Nút “Gán phần kiện còn lại”.
- Tổng phân bổ `8/10 kiện`, cảnh báo 2 kiện chưa phân bổ.
- Chọn template house riêng cho từng house nếu cần.

Trong Xưởng in:

- `Tem Master`
- `Tem House đã chọn`
- `Tất cả House`
- Tùy chọn “In tem master cho phần kiện chưa phân bổ”.
- Mỗi HAWB có ô “Số tem” để trống ban đầu; chỉ cho gửi lệnh khi người vận hành đã nhập số hợp lệ.
- Preview từng HAWB và tổng số tem người dùng đã nhập trước khi gửi.

### 5.4. Kế hoạch sinh tem

```ts
type LabelPrintItem = {
  kind: "master" | "house";
  shipmentId: string;
  houseId?: string;
  copyIndex: number;
  copiesEntered: number;
  templateVersionId: string;
  data: ResolvedLabelData;
};
```

Ví dụ MAWB 10 kiện:

- HAWB A có 3 kiện, nhưng ô số tem để trống; người vận hành nhập `3` sau khi kiểm tra thực tế.
- HAWB B có 5 kiện, nhưng ô số tem vẫn để trống độc lập; người vận hành nhập `5`.
- Nếu số tem nhập khác house PCS, hệ thống cảnh báo rõ nhưng không âm thầm sửa số lượng.

### 5.5. Import Google Sheet

Parser hiện loại bỏ HAWB khỏi ô AWB. Không nên sửa parser khi chưa có mẫu Sheet thật.

Thiết kế import cần hỗ trợ hai nguồn:

1. Cột riêng: `MAWB`, `HAWB`, `HOUSE PCS`.
2. Một ô nhiều dòng: parser theo cấu hình của từng Sheet, không dùng regex chung.

Khi một MAWB xuất hiện nhiều dòng HAWB, importer phải gom thành một shipment với nhiều house thay vì tạo nhiều shipment trùng AWB.

## 6. Print bridge

Service local tối thiểu:

- Chỉ bind `127.0.0.1`.
- Ops gọi qua token ghép cặp ngắn hạn.
- Allowlist printer name/host, cấm tùy ý kết nối địa chỉ khác.
- Endpoint:
  - `GET /health`
  - `GET /printers`
  - `POST /test`
  - `POST /print`
- Payload `/print` nhận print job đã validate, không nhận lệnh shell.
- Gửi raw TSPL qua TCP 9100 hoặc Windows spooler.
- Trả `accepted`, `jobId`, lỗi kết nối; không tuyên bố “đã in vật lý” nếu máy không có status back-channel.

## 7. Print audit

Nên thêm ngay từ đầu:

```text
print_jobs
  id, shipment_id, template_version_id, printer_profile_id,
  delivery_mode, requested_copies, status,
  data_snapshot_jsonb, command_hash, created_at

print_job_items
  print_job_id, house_id, piece_index, piece_count
```

Audit giúp:

- In lại đúng nội dung cũ dù shipment đã thay đổi.
- Biết ai đã in, máy nào, bao nhiêu tem.
- Phân biệt “gửi lệnh thành công” với “xác nhận đã in”.
- Điều tra tem trùng và hạn chế bấm in lặp.

## 8. Lộ trình triển khai

### Giai đoạn 1 — Data foundation

- Tách schema template/printer.
- Thêm `ShipmentHouse`.
- Migration HAWB cũ ở trạng thái cần xác nhận.
- Validation và test model.

### Giai đoạn 2 — Calibration + TSPL bridge

- Printer profile UI.
- TSPL generator cho text/line/rectangle.
- Local bridge TCP/Windows.
- Calibration pattern và wizard.
- Giữ browser print làm fallback.

### Giai đoạn 3 — Template designer MVP

- Scene graph.
- Canvas, drag, resize, grid, property panel.
- Undo/redo, draft/publish.
- HTML renderer và TSPL renderer dùng chung resolved scene.

### Giai đoạn 4 — House label

- UI quản lý nhiều HAWB.
- House template mặc định.
- Print plan theo house và piece sequence.
- Batch preview/in.

### Giai đoạn 5 — Hardening

- Barcode/QR.
- Print audit và reprint.
- Concurrency/version conflict.
- E2E với XP-470B thật.
- Backup/restore template và profile.

## 9. Tiêu chí nghiệm thu

### Calibration

- Pattern 100×80 và 100×50 ra đúng khổ.
- Sau hiệu chỉnh, bốn cạnh lệch không quá ±0.5 mm trên XP-470B thử nghiệm.
- Density, speed và gap xuất hiện đúng trong TSPL job.
- Browser mode không tuyên bố đã áp dụng setting phần cứng.

### Designer

- Tọa độ lưu bằng mm, không đổi khi zoom.
- Kéo, resize, keyboard nudge và undo/redo hoạt động.
- Không publish template có phần tử vượt canvas hoặc thiếu field bắt buộc.
- Preview và TSPL dùng cùng resolved data.
- Có thể rollback về version đã publish trước.

### HAWB

- Một MAWB có nhiều HAWB và số kiện riêng.
- Không cho tổng house pcs vượt master pcs.
- In đúng tổng số tem và đúng sequence từng house.
- Migration HAWB cũ không tự gán sai số kiện.
- Print audit giữ nguyên snapshot của từng tem.

## 10. Rủi ro cần khóa sớm

1. **XP-470B firmware/emulation khác nhau:** phải test command subset trên đúng máy đang vận hành.
2. **Windows USB spooler:** raw TSPL cần bridge; browser không đảm bảo truyền raw command.
3. **Font metric:** HTML và font built-in TSPL khác nhau; giới hạn font ở MVP.
4. **HAWB source format:** cần một file Google Sheet/Excel thật trước khi thiết kế parser.
5. **Migration SQL hiện có chưa tích hợp:** không chạy thêm migration cũ vào production trước khi chốt schema mới.

## 11. Tài liệu tham khảo

- TSC, TSPL/TSPL2 Programming Manual:  
  https://fs.tscprinters.com/system/files/31-0000001-00_tspl_tspl2_programming_3_0.pdf
- Xprinter XP-470B product specification:  
  https://www.xprintertech.com/auto-calibration-mode-direct-thermal-barcode-printer-xp-470b
- MDN, Pointer Events / pointer capture:  
  https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
