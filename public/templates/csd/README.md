# CSD templates

| File | Hãng | Chuyến | Registry |
|------|------|--------|----------|
| `CSD-FD.pdf` | Thai AirAsia | mã **FD**… | `CSD_CARRIER_PROFILES.FD` |
| `CSD-TH.pdf` | Thai Airways | mã **TH**… | `CSD_CARRIER_PROFILES.TH` |

Logic điền + tải PDF: `src/utils/csdForms.ts`  
Popup nhập Transfer/Transit: `src/components/CsdPrintModal.tsx`

Tên file tải về: `CSD-{FD|TH}-{AWB}.pdf` (vd. `CSD-TH-217-12345675.pdf`).

## Thêm hãng mới

1. Thêm PDF vào thư mục này (`CSD-XX.pdf`).
2. Mở rộng `CsdCarrier` + thêm entry trong `CSD_CARRIER_PROFILES` (prefix chuyến, URL mẫu, preset Transit, `showOrigin` / `showTransfer`).
3. Đo tọa độ ô trên PDF → thêm `LAYOUT_XX` trong `fillCsdPdfBytes`.
4. Test 1 AWB thật + cập nhật `csdForms.test.ts`.
