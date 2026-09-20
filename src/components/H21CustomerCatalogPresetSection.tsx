import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { ScscH21CatalogItem } from "../types/scscH21Catalog";
import { OPS } from "../styles/opsModalStyles";
import { Button, Input, useToast } from "../ui";
import {
  buildCustomerH21GoodsFromCatalogRows,
  buildCustomerH21GoodsFromQueries,
  getCustomerH21Preset,
  hydrateCustomerH21PresetItemsFromCatalog,
  removeCustomerH21GoodsItem,
  upsertCustomerH21GoodsItems,
  upsertCustomerH21Preset,
  type H21PresetWarehouseScope,
} from "../utils/customerH21InvoicePreset";
import {
  extractGoodsQueriesFromText,
  parseH21GoodsListFile,
} from "../utils/scscH21GoodsListImport";
import { parseScscH21CatalogExcel } from "../utils/scscH21Api";
import { CUSTOMER_PROFILE_LIMITS } from "../../shared/customerProfileLimits.mjs";
import { foldSearchText } from "../utils/searchNormalize";

type CatalogItem = Pick<
  ScscH21CatalogItem,
  | "id"
  | "description"
  | "category"
  | "hsCode"
  | "origin"
  | "uom1"
  | "unitPrice"
  | "active"
  | "unitFactor"
>;

type Props = {
  warehouseScope: H21PresetWarehouseScope;
  customerDirectory: readonly CustomerDirectoryEntry[];
  catalog: readonly CatalogItem[];
  onSaveCustomers: (customers: CustomerDirectoryEntry[]) => Promise<boolean | void>;
};

/**
 * Data riêng từng KH trên Danh mục H21.
 * Upload list → lưu snapshot vào hồ sơ KH → H21 lô KH chỉ hiện snapshot đó.
 */
export function H21CustomerCatalogPresetSection({
  warehouseScope,
  customerDirectory,
  catalog,
  onSaveCustomers,
}: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadModeRef = useRef<"merge" | "replace">("merge");
  const [customerId, setCustomerId] = useState("");
  const [catalogQ, setCatalogQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lineCountDraft, setLineCountDraft] = useState("");

  const entry = useMemo(() => {
    if (!customerId) return null;
    return customerDirectory.find((c) => c.id === customerId) ?? null;
  }, [customerId, customerDirectory]);

  const preset = useMemo(
    () => getCustomerH21Preset(entry, warehouseScope),
    [entry, warehouseScope]
  );

  const privateItems = useMemo(() => {
    if (!preset) return [];
    if (preset.items?.length) return preset.items;
    return hydrateCustomerH21PresetItemsFromCatalog(preset, catalog);
  }, [preset, catalog]);

  useEffect(() => {
    setLineCountDraft(
      preset?.preferredLineCount != null ? String(preset.preferredLineCount) : ""
    );
  }, [entry?.id, preset?.preferredLineCount]);

  const customersWithData = useMemo(() => {
    return customerDirectory.filter((c) => {
      const p = getCustomerH21Preset(c, warehouseScope);
      return (p?.items?.length ?? 0) > 0 || (p?.catalogItemIds?.length ?? 0) > 0;
    }).length;
  }, [customerDirectory, warehouseScope]);

  const catalogPickList = useMemo(() => {
    const inPrivate = new Set(
      privateItems.map((x) => x.sourceCatalogItemId).filter(Boolean) as string[]
    );
    const descKeys = new Set(
      privateItems.map((x) => x.description.trim().toLowerCase())
    );
    const needle = foldSearchText(catalogQ);
    return catalog
      .filter((c) => c.active !== false)
      .filter((c) => !inPrivate.has(c.id))
      .filter((c) => !descKeys.has(c.description.trim().toLowerCase()))
      .filter((c) => {
        if (!needle) return true;
        return (
          foldSearchText(c.description).includes(needle) ||
          foldSearchText(c.category).includes(needle) ||
          foldSearchText(c.hsCode).includes(needle)
        );
      })
      .slice(0, 60);
  }, [catalog, catalogQ, privateItems]);

  const persistItems = async (
    nextItems: typeof privateItems,
    mode: "merge" | "replace",
    opts?: { preferredLineCount?: number | null; silentToast?: boolean }
  ) => {
    if (!entry) {
      toast.error("Chọn khách hàng trước");
      return false;
    }
    setSaving(true);
    try {
      let preferredLineCount = preset?.preferredLineCount;
      if (opts && "preferredLineCount" in opts && opts.preferredLineCount !== undefined) {
        preferredLineCount =
          opts.preferredLineCount == null
            ? undefined
            : Math.min(50, Math.max(1, Math.round(opts.preferredLineCount)));
      }
      const nextPreset = upsertCustomerH21GoodsItems(
        {
          ...(preset ?? { warehouseScope, catalogItemIds: [] }),
          preferredLineCount,
          defaultStampId: preset?.defaultStampId,
        },
        warehouseScope,
        nextItems,
        mode
      );
      const updated = upsertCustomerH21Preset(entry, nextPreset);
      const nextDir = customerDirectory.map((c) =>
        c.id === entry.id ? updated : c
      );
      const ok = await onSaveCustomers(nextDir);
      if (ok === false) {
        toast.error("Không lưu được data KH");
        return false;
      }
      if (!opts?.silentToast) {
        const n = nextPreset.items?.length ?? 0;
        toast.success(
          `Đã lưu ${n} mặt hàng riêng · ${entry.code} · ${warehouseScope} — H21 lô KH này chỉ hiện list này`
        );
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu data KH thất bại");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const pushFromCatalog = async (cat: CatalogItem) => {
    await persistItems(
      [
        {
          id: `kh-${cat.id}`,
          description: cat.description,
          hsCode: cat.hsCode,
          category: cat.category,
          origin: cat.origin,
          uom1: cat.uom1,
          unitPrice: cat.unitPrice,
          unitFactor: Number(cat.unitFactor) > 0 ? Number(cat.unitFactor) : 1,
          sourceCatalogItemId: cat.id,
        },
      ],
      "merge"
    );
  };

  const removeItem = async (id: string) => {
    if (!entry || !preset) return;
    const next = removeCustomerH21GoodsItem(
      {
        ...preset,
        items: privateItems,
      },
      id
    );
    await persistItems(next.items ?? [], "replace");
  };

  const clearAll = async () => {
    if (!entry) return;
    await persistItems([], "replace");
  };

  const saveLineCount = async () => {
    if (!entry) return;
    const raw = lineCountDraft.trim();
    if (!raw) {
      await persistItems(privateItems, "replace", { preferredLineCount: null });
      return;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Số dòng mặc định phải ≥ 1");
      return;
    }
    await persistItems(privateItems, "replace", { preferredLineCount: n });
  };

  const handleUpload = async (file: File | null) => {
    const mode = uploadModeRef.current;
    if (!file || !entry) {
      if (!entry) toast.error("Chọn khách hàng trước");
      return;
    }
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      // 1) Ưu tiên format danh mục H21 đầy đủ (LOẠI HÀNG / Tên hàng / HS / QUY CÁCH…)
      //    — đúng file kiểu «minh khang.xlsx». Không được chỉ lấy cột tên.
      let items = buildCustomerH21GoodsFromCatalogRows([]);
      let parseMode: "catalog-excel" | "goods-list" = "goods-list";
      try {
        const catalogRows = await parseScscH21CatalogExcel(buf);
        const fromCatalog = buildCustomerH21GoodsFromCatalogRows(catalogRows);
        if (fromCatalog.length > 0) {
          items = fromCatalog;
          parseMode = "catalog-excel";
        }
      } catch {
        // fallback bên dưới
      }

      if (!items.length) {
        let queries: string[] = [];
        try {
          queries = await parseH21GoodsListFile(buf, file.name);
        } catch {
          const text = new TextDecoder("utf-8").decode(buf);
          queries = extractGoodsQueriesFromText(text);
        }
        if (!queries.length) {
          toast.error("File không có dòng hàng hợp lệ");
          return;
        }
        const built = buildCustomerH21GoodsFromQueries(queries, catalog);
        items = built.items;
        parseMode = "goods-list";
      }

      if (!items.length) {
        toast.error("Không tạo được mặt hàng từ file");
        return;
      }
      const ok = await persistItems(items, mode, { silentToast: true });
      if (ok !== false) {
        const withHs = items.filter((x) => x.hsCode).length;
        const withFactor = items.filter((x) => x.unitFactor > 0).length;
        toast.success(
          parseMode === "catalog-excel"
            ? `Đã lưu ${items.length} SP riêng · ${entry.code} (Excel đủ cột) · HS ${withHs} · QC ${withFactor} — H21 chỉ hiện list này`
            : `Đã lưu ${items.length} SP riêng · ${entry.code} (list mô tả) — H21 chỉ hiện list này`
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload lỗi");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const startUpload = (mode: "merge" | "replace") => {
    if (!entry) {
      toast.error("Chọn khách hàng trước");
      return;
    }
    uploadModeRef.current = mode;
    fileRef.current?.click();
  };

  return (
    <section
      className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-3 shadow-ui-sm sm:p-3.5"
      data-testid="h21-customer-catalog-preset"
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold tracking-tight text-emerald-950">
            Data riêng KH · {warehouseScope}
          </h2>
          <p className="mt-0.5 text-[11px] text-ui-text-muted">
            Up list → lưu riêng từng khách (vd. MINH KHANG). Lô đúng KH + kho này
            mở H21 chỉ hiện list đã lưu — không lẫn catalog chung.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/90">
          {customersWithData} KH có data
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-md">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-ui-text-muted">
            KH
          </span>
          <select
            className={`${OPS.input} h-9 min-w-0 flex-1 text-[12px]`}
            value={entry?.id ?? ""}
            onChange={(e) => setCustomerId(e.target.value)}
            aria-label={`Chọn khách hàng data H21 ${warehouseScope}`}
          >
            <option value="">— Chọn khách hàng —</option>
            {customerDirectory.map((c) => {
              const p = getCustomerH21Preset(c, warehouseScope);
              const n = p?.items?.length ?? p?.catalogItemIds?.length ?? 0;
              return (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                  {c.shortCode ? ` (${c.shortCode})` : ""}
                  {n > 0 ? ` · ${n} SP` : ""}
                </option>
              );
            })}
          </select>
        </label>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!entry || importing || saving}
          onClick={() => startUpload("merge")}
        >
          {importing ? "…" : "↑ Gộp list vào KH"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!entry || importing || saving}
          onClick={() => startUpload("replace")}
        >
          {importing ? "…" : "↑ Thay list của KH"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
        />
        {entry && privateItems.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => void clearAll()}
          >
            Xóa data KH
          </Button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="inline-flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-ui-text-muted">
            Số dòng mặc định
          </span>
          <Input
            type="number"
            min={1}
            max={50}
            className="h-8 w-20 text-[12px]"
            value={lineCountDraft}
            disabled={!entry || saving}
            placeholder="15"
            onChange={(e) => setLineCountDraft(e.target.value)}
            onBlur={() => void saveLineCount()}
          />
        </label>
        <span className="text-[10px] text-ui-text-muted">
          / tối đa {CUSTOMER_PROFILE_LIMITS.h21PresetCatalogIds} SP
        </span>
      </div>

      {entry && privateItems.length > 0 ? (
        <p className="mt-2 text-[11px] font-semibold text-emerald-900">
          Đã lưu {privateItems.length} mặt hàng riêng cho {entry.code} — H21 chỉ
          hiện list này
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-ui-border/70 bg-white p-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px]">
            <span className="font-semibold text-ui-text">
              List đã lưu của KH · {privateItems.length}
            </span>
            {entry ? (
              <span className="text-ui-text-muted">{entry.code}</span>
            ) : null}
          </div>
          {!entry ? (
            <p className="text-[11px] text-ui-text-muted">
              Chọn KH (vd. MINH KHANG) rồi up list.
            </p>
          ) : privateItems.length === 0 ? (
            <p className="text-[11px] text-ui-text-muted">
              Chưa có data — «Thay list của KH» hoặc «+» từ catalog.
            </p>
          ) : (
            <ul className="max-h-52 space-y-1 overflow-y-auto text-[11px]">
              {privateItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-black/[0.04]"
                >
                  <span className="min-w-0 flex-1 leading-snug">
                    {item.category ? (
                      <span className="font-semibold text-slate-600">
                        {item.category} ·{" "}
                      </span>
                    ) : null}
                    <span className="text-ui-text">{item.description}</span>
                    {item.hsCode ? (
                      <span className="ml-1 text-ui-text-muted">
                        HS {item.hsCode}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 font-bold text-red-600"
                    disabled={saving}
                    onClick={() => void removeItem(item.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-ui-border/70 bg-white p-2.5">
          <div className="mb-1.5 text-[11px] font-semibold text-ui-text">
            Thêm từ catalog {warehouseScope} (tuỳ chọn)
          </div>
          <Input
            type="search"
            className="mb-2 h-8 text-[12px]"
            placeholder="Lọc loại / mô tả / HS…"
            value={catalogQ}
            onChange={(e) => setCatalogQ(e.target.value)}
            disabled={!entry}
          />
          <div className="max-h-52 overflow-y-auto rounded-lg border border-ui-border/60">
            {!entry ? (
              <p className={`${OPS.empty} m-0 rounded-none border-0 text-[11px]`}>
                Chọn KH trước.
              </p>
            ) : catalogPickList.length === 0 ? (
              <p className={`${OPS.empty} m-0 rounded-none border-0 text-[11px]`}>
                Không còn SP phù hợp.
              </p>
            ) : (
              <ul className="divide-y divide-black/[0.04] text-[11px]">
                {catalogPickList.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-slate-500">
                        {item.category}
                      </span>
                      {" · "}
                      {item.description}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-40"
                      disabled={saving}
                      onClick={() => void pushFromCatalog(item)}
                    >
                      +
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
