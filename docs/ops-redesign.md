# Ops redesign — đề xuất (chờ duyệt)

**Ý tưởng:** màn Ops đọc như một tờ manifest in trên giấy: mực đen, nền giấy, chữ số mono. Chỉ có **một điểm nhấn** là vạch bút dạ quang vàng (hi-vis của sân đỗ). Nó đánh dấu kho đang chọn, lô đang chọn và việc GẤP. Nút bấm là mực đặc, không dùng teal nữa. Màu kho giữ họ màu cũ (TCS xanh dương, SCSC tím), vì ops đã quen nhận kho theo màu; chỉ đổi sắc độ.

## 1. Token (light)

| Token | Hex | Dùng cho | Tương phản |
|---|---|---|---|
| `--background` canvas | `#EDF0F2` | nền trang | — |
| `--surface` paper | `#FFFFFF` | bảng, thẻ, sheet | — |
| `--foreground` ink | `#121821` | chữ chính, **nút chính (nền)** | 17.8 trên paper · 15.6 trên canvas |
| `--muted-foreground` | `#4B5563` | chữ phụ, nhãn | 7.6 / 6.6 |
| `--border-strong` | `#8A94A0` | viền control | 3.1 (≥3 cho UI) |
| `--primary` | = ink `#121821` | nút đặc, chữ trắng | 17.8 |
| `--marker` (mới) | `#FFD23F` | nền vạch dạ quang, chữ ink lên trên | ink trên marker 12.3 |
| `--marker-soft` / `--marker-ink` (mới) | `#FFF6CC` / `#5C4300` | hàng đang chọn, chip GẤP | 8.6 |
| `--ring` focus | `#1F5FD1` | viền focus 2px | 5.8 |
| danger / success | `#B42318` / `#16794A` | trạng thái | 6.6 / 5.4 |

Vàng trên nền trắng chỉ đạt 1.44, nên **vàng không bao giờ đứng một mình**: lúc nào cũng có chữ ink đè lên, hoặc đi kèm vạch ink 3px.

**Kho** (hub = nền đặc chữ trắng, kho trực tiếp = nền nhạt + viền):

| Kho | Đặc / chữ | Nhạt / viền | Tương phản |
|---|---|---|---|
| TECS-TCS | `#17457E` / trắng | — | 9.6 |
| TCS | `#EAF2FC` / `#17457E` | viền `#2F6FC0` | 8.5 · viền 5.1 |
| TECS-SCSC | `#4A2384` / trắng | — | 11.3 |
| SCSC | `#F2EDFB` / `#4A2384` | viền `#7A4CC4` | 9.8 · viền 5.7 |

TECS-TCS và TECS-SCSC có độ sáng gần nhau (1.17) nhưng khác hẳn về hue, và luôn có nhãn chữ đi kèm, nên không phân biệt chỉ bằng màu. Token trạng thái lô (`--st-*`) giữ nguyên.

## 2. Chữ và khoảng cách

- **Font:** đề xuất **IBM Plex Sans Condensed** cho nhãn, header bảng và thẻ (đặt được nhiều cột hơn ở 820px), cùng họ với **IBM Plex Mono** đang dùng cho số. ⚠ Đây là font mới (`@fontsource/ibm-plex-sans-condensed`), **cần anh duyệt**. Nếu không duyệt thì giữ Plus Jakarta Sans.
- **Thang chữ:** 12 · 14 · 16 · 20 · 24px. Thân bảng 14, số liệu mono 14 tabular. **AWB** là phần tử lớn duy nhất: 16 trên desktop, 20 trên mobile, `whitespace-nowrap`, 3 số prefix hãng in đậm. Mọi input mobile 16px.
- **Nhãn:** viết hoa đầu câu, không UPPERCASE + tracking nữa (bỏ "KIỆN", "THAO TÁC" in hoa).
- **Khoảng cách:** bước 4px: 4 · 8 · 12 · 16 · 24 · 32. Hàng bảng 44px desktop, chạm 44px trên mobile. Bo góc: 6 cho control, 10 cho thẻ/sheet, không còn bo tròn 2xl ở mọi chỗ. Bóng chỉ dùng cho lớp nổi (sheet, menu, popover).

## 3. Bố cục

**375px (mobile)**
```
┌───────────────────────────────────────┐
│ [‹] 31 Oct 2026 [›]        ● Live [⌕] │ 56px, mọi nút 44×44
├─────────┬─────────┬─────────┬─────────┤
│ T·TCS   │ T·SCSC  │ TCS     │ SCSC    │ 52px, 2 dòng: mã ngắn
│ 4       │ 4       │ 13      │ 15      │ số lô mono 16 · đang chọn = vạch vàng
├─────────┴─────────┴─────────┴─────────┤
│▌Đang xem 31/10 · 36 lô · 27,903 kg  [Về hôm nay] │ banner = tổng ngày
├───────────────────────────────────────┤
│ 232-1957 9965                    [⋮]  │ AWB 20px
│ MH751 · 01NOV · KUL                   │
│ CITYLINK                  18 k · 188 kg│
└───────────────────────────────────────┘
```

**820px (tablet, rail 72)**
```
│ [‹] 31 Oct [›] [Hôm nay]  [Sync] [Excel]          [⌕ Tìm…] │ dòng 1
│ [Vantage][Tecs][TCS][SCSC]   AirCargo_OPS  ● Live          │ dòng 2 (wrap)
│ T·TCS 4 │ T·SCSC 4 │ TCS 13 │ SCSC 15                       │
│ TECS-TCS · 4 lô  [+ Booking]   Kiện 143 Kg 2,023 CW 2,549   │ marquee GẤP ẩn <1024
├──────────────┬───────┬────┬────┬──────┬────┬────────┬───────┤
│ AWB (sticky) │Chuyến │DST │Kiện│  Kg  │DIM │ Khách  │ ✎ 🖨 ⋮│ ← sticky phải
```
INFO KH ẩn dưới 1024px; vẫn xem được qua nút "!" ở cột Khách (popover có sẵn).

**1440px (desktop)**
```
│ AWB │ Chuyến │ DST │ Kiện │ Kg │ DIM │ Khách │ INFO KH (giãn hết phần còn lại) │ ✎ 🖨 CSD ⋮ │
```
Cột THAO TÁC có độ rộng cố định và nút CSD giữ chỗ trống khi không có, nên icon In thẳng hàng giữa các dòng.

## 4. Lỗi 1–6 được xử lý thế nào

| # | Lỗi | Cách bố cục mới loại bỏ |
|---|---|---|
| 1 | Đè chữ Lô/Kg, tab kho mất số | Tổng ngày chuyển xuống banner (dòng riêng). Tab kho thành ô 2 dòng (mã ngắn + số), `nowrap`, không dùng `h-7` cố định |
| 2 | iOS zoom | `MOBILE.input`, `inputHero` = 16px |
| 3 | Nút <44px | Header 56px, mọi nút 44×44; nút "Nay" chuyển vào banner "Về hôm nay" |
| 4 | Tablet cắt thanh lệnh, khuất THAO TÁC, CW đè nút | Thanh lệnh `flex-wrap` 2 dòng; ẩn marquee <1024; ẩn INFO KH <1024; cột THAO TÁC `sticky right-0` |
| 5 | INFO KH bị khóa 12.5rem | Bỏ `max-w`, cột này lấy phần rộng còn lại (`min-w-[16rem]`) |
| 6 | BottomNav mở sau khi Back | Đóng menu khi `active` đổi (1 `useEffect`) |

## 5. Phạm vi bước 2

Phần lớn file Ops đã dùng token, nên đổi `tokens.css` là đổi được gần hết. Chỗ còn màu cứng (slate/sky/teal) phải sửa tay: BottomNav (10), OpsLeftRail (10), MobileShipmentEditSheet (9), AirCargoTracking (6), OpsMobileStickyHeader (4), mobileOpsStyles (4), MobileShipmentCards (1). Thêm token mới `--marker*` vào `tailwind.config.js`. Không có file nào bị xóa, không đổi props.

**Cần anh quyết:** (a) duyệt hướng mực + dạ quang, (b) thêm font Plex Sans Condensed hay giữ Jakarta, (c) ẩn INFO KH ở tablet được không.
