import { useCallback, useEffect, useRef, useState } from "react";
import type { ScscH21StampId } from "../types/scscH21Catalog";
import {
  createScscH21Stamp,
  deleteScscH21Stamp,
  fetchScscH21Stamps,
  updateScscH21Stamp,
} from "../utils/scscH21Api";
import { fileToH21SealDataUrl } from "../utils/scscH21SealImage";
import { OPS } from "../styles/opsModalStyles";
import { Button, ConfirmDialog, Input, useToast } from "../ui";

type Draft = ScscH21StampId & { _isNew?: boolean };

function emptyDraft(): Draft {
  return {
    id: `new-${Date.now()}`,
    shipperName: "",
    shipperAddress: "",
    shipperPhone: "",
    stampId: "",
    warehouseScope: "SCSC",
    active: true,
    sealImageData: null,
    _isNew: true,
  };
}

/** CRUD shipper tờ khai H21 — dùng cho cột 「Tờ khai」 và invoice. */
export function ScscH21ShipperSection() {
  const toast = useToast();
  const [items, setItems] = useState<ScscH21StampId[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [sealBusy, setSealBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const sealFileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchScscH21Stamps());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải shipper tờ khai");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSave = async () => {
    if (!draft) return;
    const payload = {
      shipperName: draft.shipperName.trim(),
      shipperAddress: (draft.shipperAddress ?? "").trim(),
      shipperPhone: (draft.shipperPhone ?? "").trim(),
      stampId: draft.stampId.trim().toUpperCase(),
      active: draft.active !== false,
      sealImageData: draft.sealImageData ?? null,
    };
    if (!payload.shipperName || !payload.stampId) {
      toast.error("Nhập tên shipper và Stamp ID");
      return;
    }
    setSaving(true);
    try {
      if (draft._isNew) {
        const created = await createScscH21Stamp(payload);
        setItems((prev) => [...prev, created].sort((a, b) => a.shipperName.localeCompare(b.shipperName)));
        toast.success("Đã thêm shipper tờ khai");
      } else {
        const saved = await updateScscH21Stamp(draft.id, payload);
        setItems((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
        toast.success("Đã cập nhật shipper");
      }
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteScscH21Stamp(deleteId);
      toast.success("Đã xóa shipper");
      setDeleteId(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xóa thất bại");
    }
  };

  const handleSealFile = async (file: File | null) => {
    if (!file || !draft) return;
    setSealBusy(true);
    try {
      const dataUrl = await fileToH21SealDataUrl(file);
      setDraft((d) => (d ? { ...d, sealImageData: dataUrl } : d));
      toast.success("Đã gắn con dấu — bấm Lưu để ghi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload con dấu thất bại");
    } finally {
      setSealBusy(false);
      if (sealFileRef.current) sealFileRef.current.value = "";
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-ui-border/90 bg-ui-surface p-4 shadow-ui-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-ui-navy">Shipper tờ khai H21</h2>
          <p className="text-xs text-ui-text-muted">
            Danh sách shipper cố định trên invoice — mỗi công ty có thể upload con dấu riêng (cuối tờ invoice).
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setDraft(emptyDraft())}>
          + Thêm shipper
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-ui-text-muted">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-ui-text-muted">Chưa có shipper — thêm mới để dùng cột Tờ khai.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-ui-text-muted">
                <th className="py-1 pr-2">Con dấu</th>
                <th className="py-1 pr-2">Tên</th>
                <th className="py-1 pr-2">Địa chỉ</th>
                <th className="py-1 pr-2">SĐT</th>
                <th className="py-1 pr-2">Stamp ID</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-t border-ui-border/60">
                  <td className="py-1.5 pr-2">
                    {s.sealImageData ? (
                      <img
                        src={s.sealImageData}
                        alt={`Con dấu ${s.shipperName}`}
                        className="h-10 w-10 rounded border border-ui-border/70 object-contain bg-white"
                      />
                    ) : (
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-dashed border-ui-border/80 text-[9px] text-ui-text-muted">
                        —
                      </span>
                    )}
                  </td>
                  <td className="max-w-[12rem] truncate py-1.5 pr-2 font-semibold">{s.shipperName}</td>
                  <td className="max-w-[14rem] truncate py-1.5 pr-2 text-ui-text-muted">
                    {s.shipperAddress || "—"}
                  </td>
                  <td className="py-1.5 pr-2">{s.shipperPhone || "—"}</td>
                  <td className="py-1.5 pr-2 font-mono">{s.stampId}</td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      className="mr-2 text-[11px] font-semibold text-indigo-700"
                      onClick={() =>
                        setDraft({
                          ...s,
                          shipperAddress: s.shipperAddress ?? "",
                          shipperPhone: s.shipperPhone ?? "",
                          sealImageData: s.sealImageData ?? null,
                        })
                      }
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-red-700"
                      onClick={() => setDeleteId(s.id)}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft ? (
        <div className={`${OPS.card} mt-4 grid gap-2 p-3 sm:grid-cols-2`}>
          <label className="text-[11px] font-semibold sm:col-span-2">
            Tên shipper
            <Input
              className="mt-1"
              value={draft.shipperName}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, shipperName: e.target.value } : d))
              }
            />
          </label>
          <label className="text-[11px] font-semibold sm:col-span-2">
            Địa chỉ
            <Input
              className="mt-1"
              value={draft.shipperAddress}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, shipperAddress: e.target.value } : d))
              }
            />
          </label>
          <label className="text-[11px] font-semibold">
            SĐT
            <Input
              className="mt-1"
              value={draft.shipperPhone}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, shipperPhone: e.target.value } : d))
              }
            />
          </label>
          <label className="text-[11px] font-semibold">
            Stamp ID
            <Input
              className="mt-1 font-mono uppercase"
              value={draft.stampId}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, stampId: e.target.value.toUpperCase() } : d
                )
              }
            />
          </label>

          <div className="sm:col-span-2 rounded-xl border border-ui-border/70 bg-ui-surface-muted/40 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ui-navy">
              Con dấu trên invoice
            </div>
            <p className="mb-2 text-[10px] text-ui-text-muted">
              Ảnh PNG/JPG/WEBP — hiện góc dưới tờ invoice (review / Excel / PDF). Nên dùng nền trong suốt.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {draft.sealImageData ? (
                <img
                  src={draft.sealImageData}
                  alt="Xem trước con dấu"
                  className="h-24 w-24 rounded-lg border border-ui-border bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-ui-border text-[10px] text-ui-text-muted">
                  Chưa có
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={sealFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => void handleSealFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={sealBusy}
                  onClick={() => sealFileRef.current?.click()}
                >
                  {sealBusy ? "Đang xử lý…" : draft.sealImageData ? "Đổi ảnh con dấu" : "Upload con dấu"}
                </Button>
                {draft.sealImageData ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setDraft((d) => (d ? { ...d, sealImageData: null } : d))}
                  >
                    Xóa con dấu
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex gap-2 sm:col-span-2">
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              Lưu
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
              Hủy
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Xóa shipper tờ khai?"
        message="Shipper sẽ bị xóa khỏi danh sách dropdown Tờ khai."
        confirmLabel="Xóa"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </section>
  );
}
