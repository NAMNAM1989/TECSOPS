# CSD templates

| File | Hãng | Chuyến | Registry |
|------|------|--------|----------|
| `CSD-FD.pdf` | Thai AirAsia | mã **FD**… | `CSD_CARRIER_PROFILES.FD` |
| `CSD-TG.pdf` | Thai Airways | mã **TG**… | `CSD_CARRIER_PROFILES.TG` |

Logic điền + tải PDF: `src/utils/csdForms.ts`  
Popup nhập Origin / Transfer: `src/components/CsdPrintModal.tsx`

Tên file tải về: `CSD-{TECS|TCS|SCSC}-{FD|TG}-{AWB}.pdf`.

## Ô điền theo mẫu

### FD (Letter)
- §1 tick Regulated Agent + mã RA
- AWB, Contents (3 dòng), Origin, DEST, Transfer

### TG (A4 — TG Cargo/AVSEC F008)
- §1 `RA {mã}` · §2 AWB · §3 Contents (2 dòng)
- §4 Origin (mặc định SGN) · §5 DEST · §6 Transfer
- §14 `RA {mã}` (footer)

## Mã RA theo kho (overlay §1 / §14)

| Kho hoạt động | Mã lô Ops | Mã RA |
|---------------|-----------|-------|
| TECS | `TECS-TCS`, `TECS-SCSC` | `VN/RA3/00013-01` |
| SCSC | `SCSC` | `VN/RA3/00009-01` |
| TCS | `TCS` | `VN/RA3/00010-01` |

## Thêm hãng mới

1. Thêm PDF vào thư mục này (`CSD-XX.pdf`).
2. Mở rộng `CsdCarrier` + thêm entry trong `CSD_CARRIER_PROFILES` (prefix chuyến, URL mẫu, preset Transit, `showOrigin` / `showTransfer`).
3. Đo tọa độ ô trên PDF → thêm `LAYOUT_XX` trong `fillCsdPdfBytes`.
4. Test 1 AWB thật + cập nhật `csdForms.test.ts`.
