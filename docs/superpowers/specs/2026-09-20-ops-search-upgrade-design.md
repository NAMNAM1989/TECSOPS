# Thiết kế nâng cấp tìm kiếm Ops (phương án B)

## 1. Mục tiêu

Một lần gõ trên Ops (và sau đó trên toàn site) phải:

1. khớp **thoáng**: bỏ dấu tiếng Việt, AWB/biển số có hoặc không có gạch;
2. khớp **đủ trường lô**: MAWB, HAWB, mã khách, shipper, CNEE, tên hàng — ngoài DEST, xe, tài xế, ngày bay đã có;
3. khớp **xuyên ngày phiên** mà không tải full state;
4. mở rộng được sang **khách** và **SKU H21** từ cùng một hợp đồng kết quả.

Không dùng Elasticsearch / Meilisearch. Không gọi `setSyncScope({ full: true })` khi gõ.

## 2. Hiện trạng (ràng buộc)

- Ops tải lô theo `GET /api/state?sessionDate=YYYY-MM-DD`. Ô `SmartSearchBar` lọc client qua `shipmentMatchesSearchQuery` (`src/utils/shipmentSearch.ts`).
- Haystack hiện có: AWB/HAWB digits, flight, flightDate, customer, customerCode, dest, note, cutoff, status, warehouse, pcs/kg, biển số và tài xế từ danh bạ. **Không** có `shipperNamePrint`, `consigneeNamePrint`, `goodsDescriptionPrint`, snapshot shipper/CNEE/hàng lưu sẵn.
- So khớp `toLowerCase` + `includes`. `compactCustomerMatchKey` đã bỏ dấu nhưng chỉ dùng cho mã khách, không dùng cho ô tìm.
- Postgres `shipments` chỉ index `session_date` và `customer_id`.
- Trang Thống kê xuyên ngày bằng cách kéo toàn bộ lô vào RAM. Trang Khách / H21 tự viết `includes()` riêng.

## 3. Kiến trúc

Hai tầng, cùng một hàm chuẩn hoá:

| Tầng | Phạm vi | Khi nào |
|---|---|---|
| Client matcher | Lô ngày đang xem, danh sách khách đã load, catalog H21 đã load | Mọi ký tự gõ |
| `GET /api/search` | Lô cửa sổ ngày + khách + SKU H21 | Query đã trim ≥ 3 ký tự, debounce 200ms |

Ô Ops giữ chip ngày bay và gợi ý local. Nhóm “Ngày khác / Khách / Hàng H21” chỉ hiện từ API. Chọn lô ngày khác **đổi `sessionDate` rồi highlight** — không trộn nhiều ngày trên bảng Ops.

Phím `/` hoặc `F` vẫn focus ô Ops. Palette Ctrl+K (pha 2) gọi cùng API trên mọi hash route.

## 4. Chuẩn hoá (`searchNormalize`)

Module mới `src/utils/searchNormalize.ts`, dùng chung client. Server pha 1 copy cùng quy tắc (shared hoặc port `.mjs`).

### 4.1 `foldSearchText(raw)`

- `NFD` → bỏ `\u0300-\u036f` → `đ/Đ` → `d` → lowercase.
- Giữ khoảng trắng giữa từ (gộp `\s+`).
- Ví dụ: `"Nguyễn Văn A"` → `"nguyen van a"`.

Không dùng `compactCustomerMatchKey` cho haystack chữ (nó nuốt khoảng trắng thành `NGUYENVANA` và phá token AND).

### 4.2 `compactSearchAlnum(raw)`

- `foldSearchText` rồi bỏ mọi ký tự không `[a-z0-9]`.
- Dùng cho AWB, HAWB, biển số. `"50H-174.80"` → `"50h17480"`; `"784-2004 2005"` → `"78420042005"`.

### 4.3 Token query

- Cắt `foldSearchText(query)` theo khoảng trắng.
- Token nào `normalizeFlightDateToken` ra DDMMM thì lọc ngày bay (AND), như hiện tại.
- Token còn lại: khớp nếu nằm trong haystack đã fold **hoặc** (khi token compact ≥ 3) nằm trong haystack compact.

Không fuzzy/Levenshtein. Không đổi nghĩa AND giữa các token.

## 5. Haystack lô (client)

`computeShipmentSearchHaystack` thêm, đã fold:

- `shipperNamePrint`, `consigneeNamePrint`, `goodsDescriptionPrint`, `notifyNamePrint`;
- `customerCode`, `customer`;
- từ khách đã resolve (một lần / lô, WeakMap như xe): tên `savedShippers`, `savedConsignees`, `savedGoods` (name + label + mô tả).

Haystack compact: AWB digits, HAWB digits, biển số (đã có `vehicleTokens`).

`findCustomerEntry` không được gọi lặp 9 lần mỗi ký tự: cache profile snippet cạnh cache xe hiện có.

### 5.1 `ShipmentSearchMatchKind` mở rộng

`mawb | hawb | vehicle | driver | flightDate | shipper | cnee | goods | customer | other`

Thứ tự `resolveMatchKind`: flightDate → AWB/HAWB → xe → tài xế → shipper → CNEE → hàng → khách → other.

Nhãn UI: Shipper, CNEE, Tên hàng, Khách.

## 6. Thống nhất ô local (pha 0)

- **Ops:** dùng matcher mới; placeholder gợi shipper / hàng / mã KH.
- **Thống kê:** `filteredLots` gọi `shipmentMatchesSearchQuery` với `searchContext.customers` (truyền từ `App`). Bỏ haystack 7 trường tự viết.
- **Khách hàng:** list filter fold + mã/tên/SĐT/email/MST + tên shipper/CNEE/hàng/biển số lưu sẵn.
- **Picker khách** (`filterCustomerDirectoryEntries`): fold mã/tên/shortCode.
- **H21 catalog pages + preset filter:** fold mô tả / loại / HS (client). Server ILIKE pha 1.

Pha 0 không gọi mạng thêm, không đổi sync scope.

## 7. API search (pha 1)

```
GET /api/search?q=&limit=20&from=&to=
```

- Auth: `requireAuth` giống `/api/state`.
- `q` trim, tối thiểu 3 ký tự sau fold (trừ query thuần ngày bay DDMMM).
- `from`/`to` mặc định: hôm nay − 30 ngày → hôm nay (YYYY-MM-DD, Asia/Saigon). Trần `limit` 40.
- Không trả full shipment. Hit:

```ts
type GlobalSearchHit =
  | { type: "lot"; id: string; sessionDate: string; awb: string; dest: string; warehouse: Warehouse; kind: ShipmentSearchMatchKind; label: string; sublabel?: string }
  | { type: "customer"; id: string; code: string; name: string }
  | { type: "h21"; id: string; description: string; hsCode: string; warehouseScope: "SCSC" | "TCS" };
```

Thứ tự nhóm: lô ngày hiện tại (client đã có, API có thể bỏ qua `sessionDate` đang xem nếu client gửi `excludeSession=`) → lô ngày khác (mới hơn trước) → khách → H21.

Truy vấn lô: so khớp cột đã fold/`awb` digits, không `SELECT *` rồi filter JS. Index tối thiểu:

- `(session_date DESC)`;
- biểu thức digits AWB (hoặc cột generated `awb_digits` text);
- `dest`, `customer_code`;
- `shipper_name_print`, `consignee_name_print`, `goods_description_print` — btree đủ nếu luôn prefix sau compact; nếu vẫn ILIKE `%q%` thì `pg_trgm` GIN khi đo được chậm.

Không tải 1268 lô vào state Ops.

### 7.1 Hành vi chọn hit

- Lô cùng ngày: như hiện tại (đổi kho, scroll, highlight 2.4s).
- Lô khác ngày: `setOpsSessionYmd` + đợi state ngày mới + highlight theo `id`.
- Khách: `navigate("customers")` (pha 2 có thể deep-link `selectedId`).
- H21: `#/scsc-h21` hoặc `#/tcs-h21`.

## 8. Palette toàn site (pha 2)

- Ctrl+K / Cmd+K mở combobox dùng `GET /api/search`.
- Overlay mobile Ops debounce 200ms như desktop.
- Không thay BottomNav. Palette là lớp phủ, đóng bằng Escape.

## 9. Hiệu năng

- Client: haystack WeakMap theo identity danh bạ + lô (giữ). Debounce filter 200ms mọi overlay.
- Không build haystack lại khi chỉ đổi `flightDateFilter`.
- API: timeout 8s; rỗng → `hits: []`; lỗi mạng → giữ gợi ý local, không toast đỏ trừ 401.
- Cấm dùng full state snapshot làm search index.

## 10. Kiểm thử

- `searchNormalize`: dấu, đ, AWB, biển số.
- `shipmentSearch`: shipper/CNEE/hàng/mã KH; `Nguyễn` vs `nguyen`; không hồi quy AWB/xe/ngày bay.
- Stats: cùng query ra cùng lô như Ops khi cùng rows+customers.
- Pha 1: route 401 khi chưa auth; limit; cửa sổ ngày; không trả field thừa.

## 11. Ngoài phạm vi

- Fuzzy typo (1 ký tự lệch) — không trong ba pha này.
- Tìm nội dung PDF CSD / tem / Excel.
- Trộn nhiều ngày trên lưới Ops.
- Search engine ngoài Postgres.

## 12. Lộ trình phát hành

| Pha | Giao | Xong khi |
|---|---|---|
| 0 | Normalize + haystack + unify Stats/Khách/H21 local | Gõ `nguyen`, đoạn AWB, tên shipper/hàng, mã KH ra đúng lô **trong ngày** |
| 1 | Index + `GET /api/search` lô | AWB hôm qua hiện nhóm “Ngày khác”; chọn thì nhảy phiên |
| 2 | Palette + hit khách/H21 | Từ Ops gõ mã KH hoặc HS nhảy đúng trang |

Pha 0 độc lập, không chờ migration. Pha 1 không phụ thuộc Ctrl+K.
