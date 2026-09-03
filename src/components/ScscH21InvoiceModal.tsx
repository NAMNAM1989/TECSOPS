import { useEffect, useMemo, useState } from "react";
import type { Shipment } from "../types/shipment";
import type { ScscH21CatalogItem, ScscH21InvoiceLine } from "../types/scscH21Catalog";
import { isScscH21Warehouse } from "../types/scscH21Catalog";
import {
  clampInvoiceItemsForShipment,
  fetchScscH21Goods,
  pickInvoiceLinesFromCatalog,
} from "../utils/scscH21Api";
import {
  clampScscH21InvoiceLines,
  invoiceLineFromCatalogItem,
} from "../../shared/scscH21CatalogNormalize.mjs";
import { OPS } from "../styles/opsModalStyles";
import { Button, useToast } from "../ui";

type Props = {
  shipment: Shipment;
  onSave: (invoiceItems: ScscH21InvoiceLine[]) => void | Promise<void>;
  onClose: () => void;
};

/** Modal lập dòng hàng invoice từ catalog H21 — chỉ lô SCSC. */
export function ScscH21InvoiceModal({ shipment, onSave, onClose }: Props) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<ScscH21CatalogItem[]>([]);
  const [lines, setLines] = useState<ScscH21InvoiceLine[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => {
    if (!isScscH21Warehouse(shipment.warehouse)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const items = await fetchScscH21Goods({ activeOnly: true });
        if (cancelled) return;
        setCatalog(items);
        const existing = clampInvoiceItemsForShipment(
          shipment.warehouse,
          shipment.invoiceItems
        );
        setLines(existing ?? []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không tải catalog");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shipment.id, shipment.warehouse, shipment.invoiceItems, toast]);

  const categories = useMemo(() => {
    const s = new Set(catalog.map((c) => c.category).filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, "vi"));
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalog.filter((c) => {
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (!needle) return true;
      return (
        c.description.toLowerCase().includes(needle) ||
        c.category.toLowerCase().includes(needle) ||
        c.hsCode.includes(needle)
      );
    });
  }, [catalog, q, categoryFilter]);

  const totals = useMemo(() => {
    let amount = 0;
    let weight = 0;
    for (const l of lines) {
      amount += l.amount || 0;
      weight += l.weightKg || 0;
    }
    return { amount: Math.round(amount * 100) / 100, weight: Math.round(weight * 1000) / 1000 };
  }, [lines]);

  if (!isScscH21Warehouse(shipment.warehouse)) {
    return (
      <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/40 p-4">
        <div className={`${OPS.modal} max-w-md rounded-2xl p-5 shadow-lg`}>
          <h2 className="text-base font-bold">Invoice H21 chỉ cho kho SCSC</h2>
          <p className="mt-2 text-sm text-ui-text-muted">
            Lô này đang ở kho {shipment.warehouse}. Đổi kho sang SCSC để dùng catalog H21.
          </p>
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const addFromCatalog = (item: ScscH21CatalogItem) => {
    const line = invoiceLineFromCatalogItem(item);
    if (!line) return;
    setLines((prev) => [...prev, line as ScscH21InvoiceLine]);
  };

  const patchLine = (id: string, patch: Partial<ScscH21InvoiceLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if (patch.quantity != null || patch.unitPrice != null) {
          next.amount =
            Math.round((next.quantity || 0) * (next.unitPrice || 0) * 10000) / 10000;
        }
        return next;
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const clamped = clampScscH21InvoiceLines(lines) as ScscH21InvoiceLine[];
      await onSave(clamped);
      toast.success(`Đã lưu ${clamped.length} dòng invoice`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu invoice thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[180] flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
      data-testid="scsc-h21-invoice-modal"
    >
      <div
        className={`${OPS.modal} flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-xl`}
        role="dialog"
        aria-modal="true"
        aria-label="Invoice H21 SCSC"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-black/[0.08] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">Invoice H21 · SCSC</h2>
            <p className="text-xs text-ui-text-muted">
              AWB {shipment.awb || "—"} · {shipment.flight || "—"} · chọn từ danh mục kho SCSC
            </p>
          </div>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
            {lines.length} dòng · ${totals.amount} · {totals.weight} kg
          </span>
          <Button type="button" variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            Lưu vào lô
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-2">
          <aside className="flex min-h-0 flex-col border-b border-black/[0.08] md:border-b-0 md:border-r">
            <div className="flex flex-wrap gap-2 border-b border-black/[0.06] p-3">
              <input
                className={`${OPS.input} min-w-[140px] flex-1`}
                placeholder="Tìm catalog…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select
                className={OPS.input}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">Tất cả loại</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? (
                <p className="p-3 text-xs text-ui-text-muted">Đang tải catalog…</p>
              ) : filteredCatalog.length === 0 ? (
                <p className="p-3 text-xs text-ui-text-muted">Không có mặt hàng khớp.</p>
              ) : (
                filteredCatalog.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={OPS.pickItem}
                    onClick={() => addFromCatalog(item)}
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <div className="text-[10px] font-bold text-indigo-700">{item.category}</div>
                      <div className="line-clamp-2 text-xs font-medium">{item.description}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-ui-text-muted">
                        HS {item.hsCode || "—"} · {item.qty1} {item.uom1} · ${item.unitPrice}
                      </div>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-apple-blue">+</span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2">
              <span className="text-xs font-semibold">Dòng trên lô</span>
              <button
                type="button"
                className="text-[11px] font-semibold text-red-700 hover:underline"
                onClick={() => setLines([])}
              >
                Xóa hết
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {lines.length === 0 ? (
                <div className={OPS.empty}>Chọn mặt hàng bên trái để thêm vào invoice.</div>
              ) : (
                lines.map((line, idx) => (
                  <div key={line.id} className={`${OPS.card} mb-2 p-2`}>
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="text-[10px] font-bold text-ui-text-muted">#{idx + 1}</span>
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-red-700"
                        onClick={() => setLines((prev) => prev.filter((x) => x.id !== line.id))}
                      >
                        Xóa
                      </button>
                    </div>
                    <p className="mb-2 line-clamp-2 text-xs font-medium">{line.description}</p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <label className="text-[10px] text-ui-text-muted">
                        SL
                        <input
                          type="number"
                          className={`${OPS.input} mt-0.5 w-full`}
                          value={line.quantity}
                          onChange={(e) =>
                            patchLine(line.id, { quantity: Number(e.target.value) || 0 })
                          }
                        />
                      </label>
                      <label className="text-[10px] text-ui-text-muted">
                        ĐVT
                        <input
                          className={`${OPS.input} mt-0.5 w-full`}
                          value={line.uom}
                          onChange={(e) => patchLine(line.id, { uom: e.target.value })}
                        />
                      </label>
                      <label className="text-[10px] text-ui-text-muted">
                        Kg
                        <input
                          type="number"
                          className={`${OPS.input} mt-0.5 w-full`}
                          value={line.weightKg}
                          onChange={(e) =>
                            patchLine(line.id, { weightKg: Number(e.target.value) || 0 })
                          }
                        />
                      </label>
                      <label className="text-[10px] text-ui-text-muted">
                        Đ.giá $
                        <input
                          type="number"
                          step="0.01"
                          className={`${OPS.input} mt-0.5 w-full`}
                          value={line.unitPrice}
                          onChange={(e) =>
                            patchLine(line.id, { unitPrice: Number(e.target.value) || 0 })
                          }
                        />
                      </label>
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-ui-text-muted">
                      <span className="font-mono">HS {line.hsCode || "—"}</span>
                      <span className="font-semibold text-ui-text">${line.amount}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <footer className={`${OPS.footer} flex flex-wrap gap-2 px-3 py-2`}>
              <Button
                type="button"
                variant="secondary"
                disabled={!filteredCatalog.length}
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    ...pickInvoiceLinesFromCatalog(filteredCatalog.slice(0, 5)),
                  ])
                }
              >
                + 5 đầu lọc
              </Button>
              <span className="ml-auto self-center text-xs font-semibold">
                Tổng ${totals.amount} · {totals.weight} kg hàng
              </span>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
