import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TcsH21CatalogItem } from "../types/tcsH21Catalog";
import {
  createTcsH21Goods,
  deleteTcsH21Goods,
  fetchTcsH21Goods,
  importTcsH21Goods,
  parseTcsH21CatalogExcel,
  replaceTcsH21Goods,
  updateTcsH21Goods,
} from "../utils/tcsH21Api";
import {
  findDuplicateTcsH21Descriptions,
  findTcsH21DescriptionConflict,
} from "../../shared/tcsH21CatalogNormalize.mjs";
import { OPS } from "../styles/opsModalStyles";
import { Button, ConfirmDialog, IconButton, Input, TextArea, Wordmark, useToast } from "../ui";
import { TcsH21ShipperSection } from "../components/TcsH21ShipperSection";

type Draft = TcsH21CatalogItem & { _isNew?: boolean };

function emptyDraft(): Draft {
  return {
    id: `new-${Date.now()}`,
    category: "",
    description: "",
    hsCode: "",
    origin: "VIETNAM",
    qty1: 0,
    uom1: "PCE",
    qty2: 0,
    uom2: "KGM",
    unitPrice: 0,
    amount: 0,
    unitFactor: 0,
    sortOrder: 0,
    warehouseScope: "TCS",
    active: true,
    _isNew: true,
  };
}

function fmtNum(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("vi-VN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12.8 12.8 16.5 16.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M12.4 3.6 16.4 7.6M3.5 16.5l1.1-4.2L13.8 3.1a1.5 1.5 0 0 1 2.1 0l1 1a1.5 1.5 0 0 1 0 2.1L7.7 15.4l-4.2 1.1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4.5 6h11M8 6V4.5h4V6M6.5 6l.6 9.5h5.8L13.5 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M16 10a6 6 0 1 1-1.4-3.9M16 4v4h-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  onBack: () => void;
};

/** Quản lý danh mục H21 — chỉ kho TCS (CRUD như database). */
export function TcsH21CatalogPage({ onBack }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const [pendingImport, setPendingImport] = useState<
    Partial<TcsH21CatalogItem>[] | null
  >(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchTcsH21Goods({ activeOnly: false });
      setItems(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải catalog");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((it) => {
      if (!showInactive && !it.active) return false;
      if (categoryFilter && it.category !== categoryFilter) return false;
      if (!needle) return true;
      return (
        it.description.toLowerCase().includes(needle) ||
        it.category.toLowerCase().includes(needle) ||
        it.hsCode.includes(needle)
      );
    });
  }, [items, query, showInactive, categoryFilter]);

  const categories = useMemo(() => {
    const s = new Set(items.map((i) => i.category).filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, "vi"));
  }, [items]);

  const activeCount = useMemo(() => items.filter((i) => i.active).length, [items]);

  const patchLocal = (id: string, patch: Partial<Draft>) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSave = async (row: Draft) => {
    if (!row.description.trim()) {
      toast.error("Nhập mô tả hàng");
      return;
    }
    const conflict = findTcsH21DescriptionConflict(items, row.description, {
      exceptId: row.id,
    });
    if (conflict) {
      toast.error(`Mô tả trùng — không cho lưu: «${conflict.description}»`);
      return;
    }
    setSavingId(row.id);
    try {
      if (row._isNew) {
        const { _isNew: _, id: _id, ...payload } = row;
        const created = await createTcsH21Goods(payload);
        setItems((prev) => prev.map((r) => (r.id === row.id ? created : r)));
        toast.success("Đã thêm mặt hàng");
      } else {
        const saved = await updateTcsH21Goods(row.id, row);
        setItems((prev) => prev.map((r) => (r.id === row.id ? saved : r)));
        toast.success("Đã lưu");
      }
      setEditingId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const row = items.find((x) => x.id === deleteId);
    setDeleteId(null);
    if (!row) return;
    if (row._isNew) {
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      return;
    }
    try {
      await deleteTcsH21Goods(row.id);
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      toast.success("Đã xóa");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xóa thất bại");
    }
  };

  const onImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseTcsH21CatalogExcel(buf);
      if (!parsed.length) {
        toast.error("File không có dòng hàng hợp lệ");
        return;
      }
      const fileDups = findDuplicateTcsH21Descriptions(parsed);
      if (fileDups.length) {
        const sample = fileDups
          .slice(0, 3)
          .map((d) => `«${d.description}»`)
          .join("; ");
        toast.error(
          `File có mô tả trùng — không cho nhập: ${sample}${
            fileDups.length > 3 ? ` …(+${fileDups.length - 3})` : ""
          }`
        );
        return;
      }
      const existingCount = items.filter((x) => !x._isNew).length;
      if (existingCount > 0) {
        setPendingImport(parsed);
        return;
      }
      const result = await importTcsH21Goods(parsed);
      toast.success(`Import: tạo ${result.created}, cập nhật ${result.updated}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import lỗi");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runPendingImport = async (mode: "merge" | "replace") => {
    const parsed = pendingImport;
    if (!parsed?.length) return;
    setPendingImport(null);
    setImporting(true);
    try {
      if (mode === "replace") {
        const result = await replaceTcsH21Goods(parsed);
        toast.success(`Đã xóa catalog cũ · nhập mới ${result.count} mặt hàng`);
      } else {
        const result = await importTcsH21Goods(parsed);
        toast.success(`Import: tạo ${result.created}, cập nhật ${result.updated}`);
      }
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import lỗi");
    } finally {
      setImporting(false);
    }
  };

  const addRow = () => {
    const d = emptyDraft();
    setItems((prev) => [d, ...prev]);
    setEditingId(d.id);
    setQuery("");
    setCategoryFilter(null);
  };

  const cancelEdit = (row: Draft) => {
    setEditingId(null);
    if (row._isNew) {
      setItems((prev) => prev.filter((x) => x.id !== row.id));
    } else {
      void reload();
    }
  };

  const cellInput =
    "w-full min-h-9 rounded-lg border border-ui-border/80 bg-ui-surface px-2 py-1.5 text-sm text-ui-text shadow-ui-sm outline-none transition focus:border-ui-primary/55 focus:ring-2 focus:ring-ui-focus";

  return (
    <div className="min-h-screen bg-ui-background" data-testid="tcs-h21-catalog-page">
      <header className="sticky top-0 z-20 border-b border-ui-border/90 bg-ui-surface/95 shadow-ui-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={onBack} className="shrink-0">
            ← Ops
          </Button>
          <Wordmark />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-extrabold tracking-tight text-ui-navy sm:text-lg">
              Danh mục H21 · TCS
            </h1>
            <p className="text-[11px] text-ui-text-muted">
              Chỉ kho TCS — nhập / sửa / xóa mặt hàng dùng lập invoice phi mậu dịch
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              {activeCount} active
            </span>
            <span className="rounded-full bg-ui-surface-muted px-2.5 py-1 text-[11px] font-semibold text-ui-text-muted ring-1 ring-ui-border/70">
              {items.length} tổng
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-3 px-4 py-4">
        <TcsH21ShipperSection />
        {/* Toolbar */}
        <section className="rounded-2xl border border-ui-border/80 bg-ui-surface p-3 shadow-ui-sm sm:p-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-text-muted" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Lọc loại / mô tả / HS…"
                aria-label="Lọc danh mục H21"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={showInactive}
                onClick={() => setShowInactive((v) => !v)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition ring-1 ${
                  showInactive
                    ? "bg-ui-primary/10 text-ui-primary ring-ui-primary/30"
                    : "bg-ui-surface-muted text-ui-text-muted ring-ui-border/80 hover:bg-ui-surface"
                }`}
              >
                <span
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                    showInactive ? "bg-ui-primary" : "bg-slate-300"
                  }`}
                  aria-hidden
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                      showInactive ? "left-4" : "left-0.5"
                    }`}
                  />
                </span>
                Hiện inactive
              </button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void reload()}
                disabled={loading}
                className="gap-1.5"
              >
                <IconRefresh className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Tải lại
              </Button>
              <Button type="button" size="sm" onClick={addRow}>
                + Thêm
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                ↑ Nhập Excel
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {categories.length > 0 ? (
            <div className="mt-3 border-t border-ui-border/60 pt-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-ui-text-muted">
                  {categories.length} loại hàng
                  {categoryFilter ? (
                    <span className="ml-1.5 text-ui-primary">· đang lọc «{categoryFilter}»</span>
                  ) : null}
                </p>
                {categoryFilter || query ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-ui-primary hover:underline"
                    onClick={() => {
                      setCategoryFilter(null);
                      setQuery("");
                    }}
                  >
                    Xóa lọc
                  </button>
                ) : null}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                    !categoryFilter
                      ? "bg-ui-navy text-white shadow-ui-sm"
                      : "bg-ui-surface-muted text-ui-text-muted ring-1 ring-ui-border/70 hover:bg-ui-surface"
                  }`}
                >
                  Tất cả
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter((prev) => (prev === cat ? null : cat))}
                    className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                      categoryFilter === cat
                        ? "bg-ui-primary text-white shadow-ui-sm"
                        : "bg-ui-surface-muted text-ui-text ring-1 ring-ui-border/70 hover:bg-sky-50 hover:text-sky-900"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* Meta strip */}
        {!loading && filtered.length > 0 ? (
          <p className="px-0.5 text-[11px] text-ui-text-muted">
            Hiển thị <span className="font-semibold text-ui-text">{filtered.length}</span>
            {filtered.length !== items.length ? (
              <>
                {" "}
                / {items.length}
              </>
            ) : null}{" "}
            mặt hàng
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-2 rounded-2xl border border-ui-border/80 bg-ui-surface p-4 shadow-ui-sm">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-xl bg-ui-surface-muted"
                style={{ opacity: 1 - i * 0.12 }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${OPS.empty} rounded-2xl py-10 text-sm`}>
            {items.length === 0
              ? "Chưa có mặt hàng. Bấm «+ Thêm» hoặc nhập Excel DATA TCS."
              : "Không có dòng khớp bộ lọc. Thử xóa lọc hoặc đổi từ khóa."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-ui-border/80 bg-slate-50/95 text-[10px] font-bold uppercase tracking-wide text-ui-text-muted backdrop-blur">
                    <th className="whitespace-nowrap px-3 py-2.5">Loại</th>
                    <th className="min-w-[240px] px-3 py-2.5">Mô tả</th>
                    <th className="whitespace-nowrap px-3 py-2.5">HS</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">SL</th>
                    <th className="whitespace-nowrap px-3 py-2.5">ĐVT</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Kg</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Đ.giá</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Trị giá</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">QC</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center">Trạng thái</th>
                    <th className="sticky right-0 whitespace-nowrap bg-slate-50/95 px-3 py-2.5 text-right backdrop-blur">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const editing = editingId === row.id;
                    const descConflict = editing
                      ? findTcsH21DescriptionConflict(items, row.description, {
                          exceptId: row.id,
                        })
                      : null;
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-ui-border/50 transition-colors ${
                          editing
                            ? "bg-sky-50/70 ring-1 ring-inset ring-sky-200/80"
                            : row.active
                              ? "hover:bg-slate-50/80"
                              : "bg-slate-50/40 opacity-60 hover:opacity-80"
                        }`}
                      >
                        <td className="px-3 py-2.5 align-top">
                          {editing ? (
                            <input
                              className={`${cellInput} w-28`}
                              value={row.category}
                              onChange={(e) => patchLocal(row.id, { category: e.target.value })}
                              placeholder="Loại"
                            />
                          ) : (
                            <span className="inline-flex max-w-[9rem] truncate rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-slate-800 ring-1 ring-slate-200/80">
                              {row.category || "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          {editing ? (
                            <div className="space-y-1">
                              <TextArea
                                className={`min-h-[4.5rem] text-sm ${
                                  descConflict ? "border-red-400 ring-1 ring-red-300" : ""
                                }`}
                                value={row.description}
                                onChange={(e) =>
                                  patchLocal(row.id, { description: e.target.value })
                                }
                                placeholder="Mô tả hàng hóa…"
                                aria-invalid={Boolean(descConflict)}
                              />
                              {descConflict ? (
                                <p className="text-[11px] font-semibold text-red-700">
                                  Mô tả trùng với bản ghi khác — không cho lưu.
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="line-clamp-3 text-[13px] leading-snug text-ui-text">
                              {row.description}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          {editing ? (
                            <input
                              className={`${cellInput} w-[5.5rem] font-mono text-xs`}
                              value={row.hsCode}
                              onChange={(e) => patchLocal(row.id, { hsCode: e.target.value })}
                            />
                          ) : (
                            <span className="font-mono text-[12px] font-semibold tabular-nums text-slate-700">
                              {row.hsCode || "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top text-right tabular-nums">
                          {editing ? (
                            <input
                              type="number"
                              className={`${cellInput} w-16 text-right`}
                              value={row.qty1}
                              onChange={(e) =>
                                patchLocal(row.id, { qty1: Number(e.target.value) || 0 })
                              }
                            />
                          ) : (
                            <span className="font-medium">{fmtNum(row.qty1)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          {editing ? (
                            <input
                              className={`${cellInput} w-14`}
                              value={row.uom1}
                              onChange={(e) => patchLocal(row.id, { uom1: e.target.value })}
                            />
                          ) : (
                            <span className="text-[12px] font-semibold text-ui-text-muted">
                              {row.uom1}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top text-right tabular-nums">
                          {editing ? (
                            <input
                              type="number"
                              className={`${cellInput} w-16 text-right`}
                              value={row.qty2}
                              onChange={(e) =>
                                patchLocal(row.id, { qty2: Number(e.target.value) || 0 })
                              }
                            />
                          ) : (
                            <span className="font-medium">{fmtNum(row.qty2)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top text-right tabular-nums">
                          {editing ? (
                            <input
                              type="number"
                              step="0.01"
                              className={`${cellInput} w-[4.5rem] text-right`}
                              value={row.unitPrice}
                              onChange={(e) =>
                                patchLocal(row.id, { unitPrice: Number(e.target.value) || 0 })
                              }
                            />
                          ) : (
                            fmtNum(row.unitPrice, 2)
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top text-right tabular-nums font-semibold text-ui-navy">
                          {editing ? (
                            <input
                              type="number"
                              step="0.01"
                              className={`${cellInput} w-[4.5rem] text-right`}
                              value={row.amount}
                              onChange={(e) =>
                                patchLocal(row.id, { amount: Number(e.target.value) || 0 })
                              }
                            />
                          ) : (
                            fmtNum(row.amount, 2)
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top text-right tabular-nums">
                          {editing ? (
                            <input
                              type="number"
                              step="0.01"
                              className={`${cellInput} w-14 text-right`}
                              value={row.unitFactor}
                              onChange={(e) =>
                                patchLocal(row.id, { unitFactor: Number(e.target.value) || 0 })
                              }
                            />
                          ) : (
                            fmtNum(row.unitFactor, 2)
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top text-center">
                          {editing ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={row.active}
                              aria-label={row.active ? "Đang bật" : "Đang tắt"}
                              onClick={() => patchLocal(row.id, { active: !row.active })}
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                                row.active
                                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                                  : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  row.active ? "bg-emerald-500" : "bg-slate-400"
                                }`}
                              />
                              {row.active ? "ON" : "OFF"}
                            </button>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                row.active
                                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80"
                                  : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  row.active ? "bg-emerald-500" : "bg-slate-400"
                                }`}
                              />
                              {row.active ? "ON" : "OFF"}
                            </span>
                          )}
                        </td>
                        <td
                          className={`sticky right-0 px-2 py-2 align-top ${
                            editing ? "bg-sky-50/90" : "bg-ui-surface/95"
                          } backdrop-blur`}
                        >
                          <div className="flex items-center justify-end gap-0.5">
                            {editing ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={savingId === row.id || Boolean(descConflict)}
                                  onClick={() => void handleSave(row)}
                                  className="min-h-9 px-2.5"
                                >
                                  {savingId === row.id ? "…" : "Lưu"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => cancelEdit(row)}
                                  className="min-h-9 px-2"
                                >
                                  Hủy
                                </Button>
                              </>
                            ) : (
                              <IconButton
                                label="Sửa"
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingId(row.id)}
                                className="text-sky-700 hover:bg-sky-50"
                              >
                                <IconPencil className="h-4 w-4" />
                              </IconButton>
                            )}
                            <IconButton
                              label="Xóa"
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteId(row.id)}
                              className="text-red-600 hover:bg-red-50"
                            >
                              <IconTrash className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Xóa mặt hàng?"
        message="Xóa khỏi danh mục H21 TCS. Các dòng invoice đã gắn lô vẫn giữ snapshot."
        confirmLabel="Xóa"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        open={Boolean(pendingImport?.length)}
        title="Cách nhập Excel?"
        message={`File có ${pendingImport?.length ?? 0} dòng. Catalog hiện có ${
          items.filter((x) => !x._isNew).length
        } mặt hàng.\n\n• Gộp: giữ bản cũ, cập nhật dòng trùng mô tả, thêm dòng mới.\n• Xóa hết & nhập: xóa toàn bộ catalog rồi ghi lại từ file.`}
        cancelLabel="Hủy"
        altLabel="Gộp vào cũ"
        confirmLabel="Xóa hết & nhập"
        danger
        onCancel={() => setPendingImport(null)}
        onAlt={() => void runPendingImport("merge")}
        onConfirm={() => void runPendingImport("replace")}
      />
    </div>
  );
}
