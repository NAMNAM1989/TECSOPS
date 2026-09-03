/**
 * Nhóm hàng H21 SCSC — gom catalog theo loại lô (đông lạnh, trái cây, TP, quần áo).
 * Dùng khi sinh dòng invoice ngẫu nhiên: ưu tiên mặt hàng cùng nhóm / cùng category.
 */

/** @typedef {'frozen' | 'fruit' | 'food' | 'garment' | 'general'} H21CargoFamilyId */

/** @type {Record<H21CargoFamilyId, { id: H21CargoFamilyId, label: string, categories: string[], keywords: RegExp[] }>} */
export const H21_CARGO_FAMILIES = {
  frozen: {
    id: "frozen",
    label: "Đông lạnh",
    categories: ["ĐÔNG LẠNH", "TRÁI CÂY ĐL"],
    keywords: [
      /đông\s*lạnh/i,
      /frozen/i,
      /\biqf\b/i,
      /-18\s*°?\s*c/i,
      /thủy\s*sản\s*đông/i,
      /cá\s*đông/i,
      /tôm\s*đông/i,
    ],
  },
  fruit: {
    id: "fruit",
    label: "Trái cây",
    categories: ["TRÁI CÂY SẤY", "TRÁI CÂY ĐL", "CÀ NA"],
    keywords: [
      /trái\s*cây/i,
      /sầu\s*riêng/i,
      /xoài/i,
      /chuối/i,
      /fruit/i,
      /durian/i,
      /mango/i,
      /long\s*nhãn/i,
      /vải\s*thiều/i,
    ],
  },
  garment: {
    id: "garment",
    label: "Quần áo / dệt",
    categories: [
      "ÁO",
      "QUẦN",
      "QUẦN ÁO",
      "VÁY",
      "VẢI",
      "DÉP",
      "GIÀY",
      "GĂNG TAY",
      "VỚ",
      "MŨ",
      "MŨ BẢO HIỂM",
      "KHĂN",
      "CHĂN",
      "THÚ BÔNG",
      "TÚI VẢI",
      "KẸP TÓC",
    ],
    keywords: [
      /quần\s*áo/i,
      /garment/i,
      /textile/i,
      /vải\s/i,
      /áo\s*(thun|khoác|sơ\s*mi)?/i,
      /quần\s*(jean|short|dài)?/i,
      /dệt\s*may/i,
    ],
  },
  food: {
    id: "food",
    label: "Thực phẩm",
    categories: [
      "BÁNH",
      "BÁNH MÌ",
      "BÁNH PÍA",
      "BÁNH TRÁNG",
      "BÁNH TRUNG THU",
      "BÚN",
      "BƠ",
      "BỘT BÁNH",
      "BỘT SẮN",
      "CHÀ BÔNG",
      "CHÈ",
      "CÀ PHÊ",
      "CÁ KHÔ",
      "CƠM CHÁY",
      "ĐẬU PHỘNG",
      "GIA VỊ",
      "HÀNH PHI",
      "HẠT ĐIỀU",
      "KHÔ BÒ",
      "KHÔ GÀ",
      "KẸO",
      "MIẾN",
      "MÌ",
      "MĂNG",
      "MẬT ONG",
      "MẮM TÔM",
      "MỨT",
      "MỰC",
      "NƯỚC MẮM",
      "NƯỚC TƯƠNG",
      "NƯỚC ÉP",
      "TP CHAY",
      "TRÀ",
      "TRÁI CÂY SẤY",
      "TÔM KHÔ",
      "TƯƠNG ỚT",
      "THẠCH",
      "HEO",
      "ỐC VÍT",
    ],
    keywords: [
      /thực\s*phẩm/i,
      /\bfood\b/i,
      /bánh\s/i,
      /mì\s/i,
      /nước\s*mắm/i,
      /gia\s*vị/i,
      /khô\s*(bò|gà)/i,
      /cà\s*phê/i,
    ],
  },
  general: {
    id: "general",
    label: "Tổng hợp",
    categories: [],
    keywords: [],
  },
};

/** @returns {{ id: H21CargoFamilyId, label: string }[]} */
export function listH21CargoFamilyOptions() {
  return [
    { id: "frozen", label: H21_CARGO_FAMILIES.frozen.label },
    { id: "fruit", label: H21_CARGO_FAMILIES.fruit.label },
    { id: "food", label: H21_CARGO_FAMILIES.food.label },
    { id: "garment", label: H21_CARGO_FAMILIES.garment.label },
    { id: "general", label: H21_CARGO_FAMILIES.general.label },
  ];
}

function normCategory(cat) {
  return String(cat ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/**
 * Nhận diện nhóm hàng từ tên hàng lô (goodsDescriptionPrint / saved goods).
 * @param {string} [goodsText]
 * @returns {H21CargoFamilyId}
 */
export function detectH21CargoFamily(goodsText) {
  const t = String(goodsText ?? "").trim();
  if (!t) return "general";
  // Đông lạnh trước trái cây (vd. sầu riêng đông lạnh)
  const order = /** @type {const} */ (["frozen", "fruit", "garment", "food"]);
  for (const id of order) {
    const fam = H21_CARGO_FAMILIES[id];
    if (fam.keywords.some((re) => re.test(t))) return id;
  }
  return "general";
}

/**
 * @param {H21CargoFamilyId} familyId
 * @returns {Set<string> | null} null = không lọc (tất cả catalog)
 */
export function categorySetForH21Family(familyId) {
  if (!familyId || familyId === "general") return null;
  const fam = H21_CARGO_FAMILIES[familyId];
  if (!fam?.categories?.length) return null;
  return new Set(fam.categories.map(normCategory));
}

/**
 * Lọc catalog theo nhóm; fallback mềm nếu pool quá nhỏ.
 * @param {unknown[]} catalog
 * @param {H21CargoFamilyId} familyId
 * @param {number} minItems
 */
export function filterCatalogByH21Family(catalog, familyId, minItems = 3) {
  const cats = categorySetForH21Family(familyId);
  if (!cats) return catalog;
  const filtered = catalog.filter((c) => {
    const cat = normCategory(/** @type {{ category?: string }} */ (c).category);
    return cats.has(cat);
  });
  if (filtered.length >= minItems) return filtered;
  if (filtered.length > 0) return filtered;
  return catalog;
}

/**
 * Đếm SKU catalog đúng nhóm (không fallback sang toàn catalog).
 * @param {unknown[]} catalog
 * @param {H21CargoFamilyId} familyId
 */
export function countCatalogInH21Family(catalog, familyId) {
  if (!Array.isArray(catalog) || !catalog.length) return 0;
  const cats = categorySetForH21Family(familyId);
  if (!cats) return catalog.length;
  let n = 0;
  for (const c of catalog) {
    const cat = normCategory(/** @type {{ category?: string }} */ (c).category);
    if (cats.has(cat)) n += 1;
  }
  return n;
}

/**
 * Chọn N mặt hàng — xoay vòng theo category trong nhóm (gom tương tự).
 * @param {unknown[]} catalog đã lọc
 * @param {number} count
 * @param {() => number} rng
 */
export function pickCatalogItemsGrouped(catalog, count, rng) {
  const pool = catalog.filter(Boolean);
  if (!pool.length) return [];
  const n = Math.min(Math.max(1, Math.trunc(count)), pool.length);

  /** @type {Map<string, unknown[]>} */
  const byCat = new Map();
  for (const item of pool) {
    const cat = normCategory(/** @type {{ category?: string }} */ (item).category) || "KHÁC";
    const list = byCat.get(cat) ?? [];
    list.push(item);
    byCat.set(cat, list);
  }

  const cats = [...byCat.keys()];
  for (let i = cats.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cats[i], cats[j]] = [cats[j], cats[i]];
  }

  const usedIds = new Set();
  /** @type {unknown[]} */
  const selected = [];

  let guard = 0;
  while (selected.length < n && guard < n * byCat.size * 2) {
    for (const cat of cats) {
      if (selected.length >= n) break;
      const items = (byCat.get(cat) ?? []).filter(
        (it) => !usedIds.has(String(/** @type {{ id?: string }} */ (it).id ?? ""))
      );
      if (!items.length) continue;
      const pick = items[Math.floor(rng() * items.length)];
      const id = String(/** @type {{ id?: string }} */ (pick).id ?? "");
      if (id) usedIds.add(id);
      selected.push(pick);
    }
    guard += 1;
  }

  if (selected.length < n) {
    const rest = pool.filter((it) => !usedIds.has(String(/** @type {{ id?: string }} */ (it).id ?? "")));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    for (const item of rest) {
      if (selected.length >= n) break;
      selected.push(item);
    }
  }

  return selected.slice(0, n);
}
