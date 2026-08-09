# CSD templates

| File | Hãng | Chuyến | Registry |
|------|------|--------|----------|
| `CSD-FD.pdf` | Thai AirAsia | mã **FD**… | `CSD_CARRIER_PROFILES.FD` |
| `CSD-TH.pdf` | Thai Airways | mã **TH**… | `CSD_CARRIER_PROFILES.TH` |

Logic điền + tải PDF: `src/utils/csdForms.ts`  
Popup nhập Transfer/Transit: `src/components/CsdPrintModal.tsx`

Tên file tải về: `CSD-{TECS|TCS|SCSC}-{FD|TH}-{AWB}.pdf`.

## Mã RA theo kho (overlay §1)

| Kho hoạt động | Mã lô Ops | Mã RA |
|---------------|-----------|-------|
| TECS | `TECS-TCS`, `TECS-SCSC` | `VN/RA3/00013-01` |
| SCSC | `SCSC` | `VN/RA3/00009-01` |
| TCS | `TCS` | `VN/RA3/00010-01` |

FD: tick Regulated Agent + ghi mã RA.  
TH: chỉ phủ/ghi lại dòng mã RA (giữ nguyên tên entity trên mẫu; cập nhật cả footer).

## Thêm hãng mới

1. Thêm PDF vào thư mục này (`CSD-XX.pdf`).
2. Mở rộng `CsdCarrier` + thêm entry trong `CSD_CARRIER_PROFILES` (prefix chuyến, URL mẫu, preset Transit, `showOrigin` / `showTransfer`).
3. Đo tọa độ ô trên PDF → thêm `LAYOUT_XX` trong `fillCsdPdfBytes`.
4. Test 1 AWB thật + cập nhật `csdForms.test.ts`.
