# Ops Search Upgrade — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trong ngày phiên đang mở, ô tìm Ops/Stats/Khách/H21 khớp thoáng (bỏ dấu) và đủ shipper, CNEE, tên hàng, mã khách, AWB.

**Architecture:** Thêm `searchNormalize` (fold + compact alnum). `shipmentSearch` dùng fold cho haystack/query và nhúng print-fields + snapshot danh bạ (WeakMap). Stats/Khách/picker/H21 gọi cùng quy tắc, không gọi API, không đổi sync scope.

**Tech Stack:** TypeScript, Vitest, React. Không dependency mới.

**Spec:** `docs/superpowers/specs/2026-09-20-ops-search-upgrade-design.md` — chỉ pha 0. Pha 1–2 (`GET /api/search`, palette) là plan riêng sau khi pha 0 xanh.

## Global Constraints

- Không `setSyncScope({ full: true })` khi gõ.
- Không fuzzy/Levenshtein.
- Không Elasticsearch.
- Giữ AND token + chip ngày bay hiện có.
- Haystack cache WeakMap theo identity danh bạ + lô.
- `findCustomerEntry` tối đa một lần / lô / identity (qua cache snippet).
- Test runner: `npx vitest run <file>`.
- Commit message tiếng Việt, conventional (`feat`/`test`/`fix`).

## File map

| File | Việc |
|---|---|
| Create `src/utils/searchNormalize.ts` | `foldSearchText`, `compactSearchAlnum` |
| Create `src/utils/searchNormalize.test.ts` | Dấu, đ, AWB, biển số |
| Modify `src/utils/shipmentSearch.ts` | Haystack fold + print fields + kinds |
| Modify `src/utils/shipmentSearch.test.ts` | Shipper/CNEE/hàng/dấu/mã KH |
| Modify `src/pages/OpsStatsPage.tsx` + `src/App.tsx` | Matcher chung + `customers` |
| Modify `src/pages/CustomersPage.tsx` | Filter fold + hồ sơ lưu sẵn |
| Modify `src/utils/customerShipmentPatch.ts` + test | Picker fold |
| Modify `src/pages/ScscH21CatalogPage.tsx`, `src/pages/TcsH21CatalogPage.tsx` | Fold mô tả/HS |
| Modify `src/components/H21CustomerCatalogPresetSection.tsx` | Fold ô lọc preset |
| Modify `src/components/SmartSearchBar.tsx` | Placeholder |

---

### Task 1: `searchNormalize`

**Files:**
- Create: `src/utils/searchNormalize.ts`
- Test: `src/utils/searchNormalize.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `foldSearchText(raw: string): string`
  - `compactSearchAlnum(raw: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { compactSearchAlnum, foldSearchText } from "./searchNormalize";

describe("searchNormalize", () => {
  it("folds Vietnamese diacritics and đ", () => {
    expect(foldSearchText("Nguyễn Văn A")).toBe("nguyen van a");
    expect(foldSearchText("ĐỒNG NAI")).toBe("dong nai");
  });

  it("compacts AWB and plate punctuation", () => {
    expect(compactSearchAlnum("784-2004 2005")).toBe("78420042005");
    expect(compactSearchAlnum("50H-174.80")).toBe("50h17480");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/searchNormalize.test.ts`
Expected: FAIL — cannot find module `./searchNormalize`

- [ ] **Step 3: Write minimal implementation**

```ts
export function foldSearchText(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function compactSearchAlnum(raw: string): string {
  return foldSearchText(raw).replace(/[^a-z0-9]/g, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/searchNormalize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/searchNormalize.ts src/utils/searchNormalize.test.ts
git commit -m "feat(search): chuẩn hoá bỏ dấu và compact AWB/biển số."
```

---

### Task 2: Haystack lô + match kinds

**Files:**
- Modify: `src/utils/shipmentSearch.ts`
- Test: `src/utils/shipmentSearch.test.ts`

**Interfaces:**
- Consumes: `foldSearchText`, `compactSearchAlnum`; `findCustomerEntry`; print fields trên `Shipment`; `savedShippers` / `savedConsignees` / `savedGoods`
- Produces: `shipmentMatchesSearchQuery` khớp shipper/CNEE/hàng/mã KH/dấu; `ShipmentSearchMatchKind` thêm `shipper | cnee | goods | customer`; `matchKindLabel` tương ứng

- [ ] **Step 1: Extend tests in `shipmentSearch.test.ts`**

Thêm vào `ctx.customers[0]`:

```ts
savedShippers: [{ id: "ss1", label: "HCM", shipperName: "Công ty Nguyễn Phát", shipperAddress: "", shipperPhone: "", shipperEmail: "", taxCode: "" }],
savedConsignees: [{ id: "sc1", label: "SIN", consigneeName: "Tanaka Trading", consigneeAddress: "", consigneePhone: "", consigneeEmail: "", notifyName: "" }],
savedGoods: [{ id: "sg1", label: "Garment", goodsDescription: "Quần áo đông" }],
```

Cases:

```ts
it("matches folded shipper and goods from directory", () => {
  expect(shipmentMatchesSearchQuery(baseRow(), "nguyen phat", ctx)).toBe(true);
  expect(shipmentMatchesSearchQuery(baseRow(), "quan ao", ctx)).toBe(true);
});

it("matches print fields on the lot", () => {
  const row = baseRow({
    shipperNamePrint: "Công ty TNHH Ánh Dương",
    consigneeNamePrint: "Osaka Buyer",
    goodsDescriptionPrint: "Hải sản đông lạnh",
  });
  expect(shipmentMatchesSearchQuery(row, "anh duong", ctx)).toBe(true);
  expect(shipmentMatchesSearchQuery(row, "osaka", ctx)).toBe(true);
  expect(shipmentMatchesSearchQuery(row, "hai san", ctx)).toBe(true);
});

it("matches customer code fragments", () => {
  expect(shipmentMatchesSearchQuery(baseRow(), "abc01", ctx)).toBe(true);
});

it("labels shipper match kind", () => {
  const matches = buildShipmentSearchMatches([baseRow()], "nguyen phat", ctx);
  expect(matches[0]?.kind).toBe("shipper");
});
```

Giữ các test AWB / xe / ngày bay hiện có.

- [ ] **Step 2: Run tests — expect new cases FAIL**

Run: `npx vitest run src/utils/shipmentSearch.test.ts`
Expected: FAIL on folded shipper/goods/print fields

- [ ] **Step 3: Implement**

Trong `shipmentSearch.ts`:

1. Import `foldSearchText`, `compactSearchAlnum`.
2. WeakMap `profileSnippetsByDirectory` giống `vehiclesByDirectory`. Snippet:

```ts
type SearchProfileSnippet = {
  shippers: string[];
  consignees: string[];
  goods: string[];
};
```

`getCustomerSearchSnippet(shipment, customers)` gọi `findCustomerEntry` **một lần**, lấy `savedShippers[].shipperName/label`, `savedConsignees[].consigneeName/label`, `savedGoods[].goodsDescription/label`.

3. `computeShipmentSearchHaystack`: mọi part đi qua `foldSearchText`; join bằng space. Thêm print fields + snippet. Haystack compact (AWB/HAWB/biển) nối thêm, hoặc giữ `vehicleTokens` nhưng token đã compact.

4. `queryTokens`: `foldSearchText(raw).split(/\s+/)` thay vì `toLowerCase`.

5. `shipmentMatchesSearchQuery`: token other khớp `hay.includes(t)` **hoặc** (`compactSearchAlnum(t).length >= 3` và compact-hay chứa nó). Giữ `awbDigitsMatch` / `vehicleMatch` / flight tokens.

6. Mở `ShipmentSearchMatchKind` + `resolveMatchKind` + `matchKindLabel` (`Shipper` / `CNEE` / `Tên hàng` / `Khách`).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/utils/shipmentSearch.test.ts src/utils/searchNormalize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/shipmentSearch.ts src/utils/shipmentSearch.test.ts
git commit -m "feat(search): haystack lô gồm shipper, CNEE, hàng và bỏ dấu."
```

---

### Task 3: Thống kê dùng matcher chung

**Files:**
- Modify: `src/pages/OpsStatsPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `shipmentMatchesSearchQuery`, `ShipmentSearchContext`
- Produces: `OpsStatsPage` nhận `customers: readonly CustomerDirectoryEntry[]`

- [ ] **Step 1: Pass customers from App**

`App.tsx` thêm `customers={sync.state?.customers ?? EMPTY_CUSTOMERS}` vào `OpsStatsPage`.

Props:

```ts
customers?: readonly CustomerDirectoryEntry[];
```

Default `[]`.

- [ ] **Step 2: Replace `filteredLots` haystack**

```ts
const searchContext = useMemo(
  (): ShipmentSearchContext => ({ customers: customers ?? [] }),
  [customers]
);

const filteredLots = useMemo(() => {
  const q = lotSearch.trim();
  if (!q) return stats.lots;
  return stats.lots.filter((lot) =>
    shipmentMatchesSearchQuery(lot.shipment, q, searchContext)
  );
}, [stats.lots, lotSearch, searchContext]);
```

Placeholder: `"Tìm AWB / shipper / hàng / khách…"`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` (hoặc `npm run typecheck`)
Expected: PASS cho file đụng

- [ ] **Step 4: Commit**

```bash
git add src/pages/OpsStatsPage.tsx src/App.tsx
git commit -m "feat(search): trang Thống kê dùng cùng matcher lô."
```

---

### Task 4: List khách + picker fold

**Files:**
- Modify: `src/pages/CustomersPage.tsx`
- Modify: `src/utils/customerShipmentPatch.ts`
- Test: `src/utils/customerShipmentPatch.test.ts`

**Interfaces:**
- Consumes: `foldSearchText`, `compactSearchAlnum`
- Produces: list/picker khớp `"nguyen"` với `"Nguyễn"`; list khớp tên shipper/CNEE/hàng/biển

- [ ] **Step 1: Failing picker test**

Trong `customerShipmentPatch.test.ts` thêm entry `name: "CÔNG TY NGUYỄN PHÁT"` và:

```ts
expect(filterCustomerDirectoryEntries(directory, "nguyen phat").map((e) => e.id)).toEqual(["…"]);
```

- [ ] **Step 2: Run — FAIL** (nếu hiện tại không fold)

- [ ] **Step 3: `filterCustomerDirectoryEntries` so `foldSearchText(code/name/shortCode).includes(foldSearchText(query))`**

- [ ] **Step 4: `CustomersPage` `filtered` haystack gồm** `code`, `name`, `shortCode`, `contact.phone/email/taxCode`, `savedShippers.shipperName`, `savedConsignees.consigneeName`, `savedGoods.goodsDescription`, `savedVehicles.licensePlate` — so khớp bằng `foldSearchText` + compact cho biển/SĐT.

- [ ] **Step 5: Run**

Run: `npx vitest run src/utils/customerShipmentPatch.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/CustomersPage.tsx src/utils/customerShipmentPatch.ts src/utils/customerShipmentPatch.test.ts
git commit -m "feat(search): list khách và picker bỏ dấu, tìm hồ sơ lưu sẵn."
```

---

### Task 5: H21 catalog local fold + placeholder Ops

**Files:**
- Modify: `src/pages/ScscH21CatalogPage.tsx` (block `filtered` ~148–159)
- Modify: `src/pages/TcsH21CatalogPage.tsx` (cùng pattern)
- Modify: `src/components/H21CustomerCatalogPresetSection.tsx` (ô `type="search"`)
- Modify: `src/components/SmartSearchBar.tsx` (placeholder)

**Interfaces:**
- Consumes: `foldSearchText`
- Produces: lọc catalog theo mô tả đã fold; placeholder Ops `"MAWB · shipper · hàng · xe… (/)"`

- [ ] **Step 1: H21 filter**

```ts
const needle = foldSearchText(query);
if (!needle) return true;
return (
  foldSearchText(it.description).includes(needle) ||
  foldSearchText(it.category).includes(needle) ||
  foldSearchText(it.hsCode).includes(needle)
);
```

Cùng logic cho TCS page và preset section.

- [ ] **Step 2: SmartSearchBar placeholders**

Desktop: `"MAWB · shipper · hàng · xe… (/)"`  
Compact: `"MAWB / hàng / xe…"`  
Overlay: `"MAWB · shipper · hàng · xe · DEST…"`

- [ ] **Step 3: Verify**

Run: `npx vitest run src/utils/searchNormalize.test.ts src/utils/shipmentSearch.test.ts src/utils/customerShipmentPatch.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/ScscH21CatalogPage.tsx src/pages/TcsH21CatalogPage.tsx src/components/H21CustomerCatalogPresetSection.tsx src/components/SmartSearchBar.tsx
git commit -m "feat(search): H21 và ô Ops dùng cùng fold, placeholder đủ trường."
```

---

## Spec coverage (pha 0)

| Spec § | Task |
|---|---|
| 4.1–4.3 normalize | Task 1 |
| 5 haystack + kinds | Task 2 |
| 6 Ops (matcher) | Task 2 (logic) + Task 5 (copy) |
| 6 Stats | Task 3 |
| 6 Khách + picker | Task 4 |
| 6 H21 local | Task 5 |
| 7–8 API/palette | Không — plan pha 1/2 |
| 9 no full-sync | Constraint; không đụng `useShipmentSync` |
