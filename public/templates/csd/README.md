# CSD templates

| File | Hãng | Chuyến | Registry |
|------|------|--------|----------|
| `CSD-FD.pdf` | Thai AirAsia | mã **FD**… | `CSD_CARRIER_PROFILES.FD` |
| `CSD-TG.pdf` | Thai Airways | mã **TG**… | `CSD_CARRIER_PROFILES.TG` |
| `CSD-MH.pdf` | Malaysia Airlines (maskargo) | mã **MH**… | `CSD_CARRIER_PROFILES.MH` |
| `CSD-QR.pdf` | Qatar Airways | mã **QR**… | `CSD_CARRIER_PROFILES.QR` |
| `CSD-AK.pdf` | AirAsia | mã **AK**… | `CSD_CARRIER_PROFILES.AK` |
| `CSD-VU.pdf` | Vietravel Airlines | mã **VU**… | `CSD_CARRIER_PROFILES.VU` |
| `CSD-IATA.pdf` | VietJet / Singapore Airlines / Scoot | mã **VJ** / **SQ** / **TR**… | `CSD_CARRIER_PROFILES.VJ` / `.SQ` / `.TR` |
| `CSD-BI.pdf` | Royal Brunei Airlines | mã **BI**… | `CSD_CARRIER_PROFILES.BI` |
| `CSD-EK.pdf` | Emirates SkyCargo | mã **EK**… | `CSD_CARRIER_PROFILES.EK` |

Logic điền + tải PDF: `src/utils/csdForms.ts`  
Popup nhập Origin / Transfer (hoặc Issued by cho EK): `src/components/CsdPrintModal.tsx`

Tên file tải về: `{kho}_{hãng}_{awb}_{tên khách}.pdf`  
Ví dụ: `scsc_vj_97812345675_tín phát.pdf`  
— `kho` = ops team (`tecs`/`tcs`/`scsc`); `awb` = 11 số; **khách = tên khách hàng** (không dùng mã).

## Ô điền theo mẫu

### FD (Letter)
- §1 tick Regulated Agent + mã RA
- AWB, Contents (3 dòng), Origin, DEST, Transfer

### TG (A4 — TG Cargo/AVSEC F008)
- §1 `RA {mã}` · §2 AWB · §3 Contents (2 dòng)
- §4 Origin (mặc định SGN) · §5 DEST · §6 Transfer
- §14 `RA {mã}` (footer)

### MH (A4 — maskargo)
- Mẫu đã in sẵn ACV + Origin SGN + ACC3 footer
- Ghi mã RA theo kho (`VN/RA3-xxxxx-xx`) — dưới nhãn §1
- Unique Consignment Identifier = AWB · Contents · DEST · Transfer
- URL mẫu có `?v=` để tránh cache PDF cũ

### QR (A4 — QTR-CGO-CSM-001-CSD)
- Origin SGN đã in sẵn; SPX / XRY mẫu giữ nguyên
- Wipe **chỉ bbox chữ mẫu** rồi ghi: RA, AWB, Contents, DEST, Transfer
- Hub Transfer gợi ý: **DOH**

### AK (Letter — AirAsia)
- Giữ chữ **RA** + Origin **SGN** + SPX / X-RAY in sẵn
- Ghi mã RA identifier **bên cạnh** chữ RA (không wipe)
- AWB · Contents · DEST · Transfer — Hub Transfer gợi ý: **KUL**

### VU (A4 — mẫu SCSC Vietravel)
- Origin **SGN** + **SPX** + **X-RAY** đã tick sẵn
- Ghi `RA {mã}` (§1 + footer), AWB, Contents, DEST, Transfer

### IATA (A4 — dùng chung VJ / SQ / TR)
- Origin **SGN** đã in sẵn
- Ghi: `RA {mã}` (§1 + footer), AWB, Contents (bên phải Consolidation), DEST, Transfer
- Ghi **SPX** (Security Status) + **XRY** (Screening Method)
- Hub Transfer: SQ/TR → **SIN**; VJ → không gợi ý mặc định
- URL: `CSD-IATA.pdf?v=20260907`

### BI (A4 — Royal Brunei)
- Origin **SGN** + **SPX** + **XRAY** + Received from **R.A** đã in sẵn
- Ghi: `RA {mã}` (§1 + footer), AWB, Contents, DEST, Transfer
- Hub Transfer gợi ý: **BWN**
- URL: `CSD-BI.pdf?v=20260907`

### EK (Letter + CSD — Emirates SkyCargo)
- File: `CSD-EK.pdf` (nền trắng, không sample; hairline đen; SPX + REGULATED AGENT mặc định; không viền ô Pcs/Weight/SPX/Received from) — URL `?v=20260908fill`
- Mockup review: `CSD-EK-MOCKUP.pdf` · scripts `make-csd-ek-blank.py` / `make-csd-ek-mockup.py`
- **Luôn in 2 trang** (Consignee Certification Letter + CSD)
- Auto: AWB, DEST, RA, Origin **SGN**, Transfer **DXB**, SPX, XRY tick, Received from REGULATED AGENT, Routing `SGN-DXB-{DEST}`, Pcs/Kg/Contents từ lô, Company Name/Address Letter = **CNEE**, Company ký = **shipper**, Additional `NO HAWB`
- Popup: Issued by / Name (**không bắt buộc**), Title, Company (mặc định shipper), Date-Time — chữ ký **ký tay** trên bản in (không seal ảnh)

## Mã RA theo kho (overlay §1 / §14)

| Kho hoạt động | Mã lô Ops | Mã RA (FD/TG/QR/AK/VU/VJ/SQ/TR/BI/EK) | Mã RA trên mẫu MH |
|---------------|-----------|--------------------------------------|-------------------|
| TECS | `TECS-TCS`, `TECS-SCSC` | `VN/RA3/00013-01` | `VN/RA3-00013-01` |
| SCSC | `SCSC` | `VN/RA3/00009-01` | `VN/RA3-00009-01` |
| TCS | `TCS` | `VN/RA3/00010-01` | `VN/RA3-00010-01` |

## Thêm hãng mới

1. Thêm PDF vào thư mục này (`CSD-XX.pdf`).
2. Mở rộng `CsdCarrier` + thêm entry trong `CSD_CARRIER_PROFILES`.
3. Đo tọa độ ô trên PDF → thêm `LAYOUT_XX` trong `fillCsdPdfBytes`.
4. Test 1 AWB thật + cập nhật `csdForms.test.ts`.
