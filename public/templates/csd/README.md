# CSD templates

| File | Hãng | Chuyến | Registry |
|------|------|--------|----------|
| `CSD-FD.pdf` | Thai AirAsia | mã **FD**… | `CSD_CARRIER_PROFILES.FD` |
| `CSD-TG.pdf` | Thai Airways | mã **TG**… | `CSD_CARRIER_PROFILES.TG` |
| `CSD-MH.pdf` | Malaysia Airlines (maskargo) | mã **MH**… | `CSD_CARRIER_PROFILES.MH` |
| `CSD-QR.pdf` | Qatar Airways | mã **QR**… | `CSD_CARRIER_PROFILES.QR` |

Logic điền + tải PDF: `src/utils/csdForms.ts`  
Popup nhập Origin / Transfer: `src/components/CsdPrintModal.tsx`

Tên file tải về: `{kho}_{hãng}_{awb}_{khách}.pdf`  
Ví dụ: `SCSC_QR_157-66802024_PCS.pdf` (ưu tiên `customerCode`, không có thì tên khách).

## Ô điền theo mẫu

### FD (Letter)
- §1 tick Regulated Agent + mã RA
- AWB, Contents (3 dòng), Origin, DEST, Transfer

### TG (A4 — TG Cargo/AVSEC F008)
- §1 `RA {mã}` · §2 AWB · §3 Contents (2 dòng)
- §4 Origin (mặc định SGN) · §5 DEST · §6 Transfer
- §14 `RA {mã}` (footer)

### MH (A4 — maskargo)
- Mẫu đã in sẵn ACV + Origin SGN + ACC3 footer (`GB/ACC3/MYKUL-MH`, `NL/ACC3/MYKUL-MH`)
- Ghi mã RA theo kho (`VN/RA3-xxxxx-xx`) — căn dưới nhãn §1
- Unique Consignment Identifier = AWB
- Contents — dưới nhãn, trên checkbox Consolidation/Loose
- DEST + Transfer — cùng hàng với Origin SGN (ô trống trên mẫu)
- URL mẫu có `?v=` để tránh cache PDF cũ

### QR (A4 — QTR-CGO-CSM-001-CSD)
- Header: TAN SON NHAT SECURITY CENTER
- Origin SGN đã in sẵn; SPX / XRY mẫu giữ nguyên
- Wipe **chỉ bbox chữ mẫu** (không phủ nhãn / Consolidation) rồi ghi: RA, AWB, Contents, DEST, Transfer
- Hub Transfer gợi ý: **DOH**
- Quy tắc: vùng wipe phải hẹp hơn khoảng trống dưới nhãn — tránh rectangle trắng che tiêu đề

## Mã RA theo kho (overlay §1 / §14)

| Kho hoạt động | Mã lô Ops | Mã RA (FD/TG/QR) | Mã RA trên mẫu MH |
|---------------|-----------|------------------|-------------------|
| TECS | `TECS-TCS`, `TECS-SCSC` | `VN/RA3/00013-01` | `VN/RA3-00013-01` |
| SCSC | `SCSC` | `VN/RA3/00009-01` | `VN/RA3-00009-01` |
| TCS | `TCS` | `VN/RA3/00010-01` | `VN/RA3-00010-01` |

## Thêm hãng mới

1. Thêm PDF vào thư mục này (`CSD-XX.pdf`).
2. Mở rộng `CsdCarrier` + thêm entry trong `CSD_CARRIER_PROFILES` (prefix chuyến, URL mẫu, preset Transit, `showOrigin` / `showTransfer`).
3. Đo tọa độ ô trên PDF → thêm `LAYOUT_XX` trong `fillCsdPdfBytes`.
4. Test 1 AWB thật + cập nhật `csdForms.test.ts`.
