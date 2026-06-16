import { useEffect, useMemo, useState } from "react";
import type { Shipment } from "../../types/shipment";
import type { CsdTemplateCatalog, CsdTemplateResolve } from "../../types/csdTemplate";
import {
  fetchCsdTemplateCatalog,
  openCsdPdfForShipment,
  resolveCsdTemplateForAwb,
} from "../../utils/csdPdfPrint";

type Props = {
  rows: Shipment[];
  selectedIds: Set<string>;
};

export function CsdFormPrintPanel({ rows, selectedIds }: Props) {
  const [catalog, setCatalog] = useState<CsdTemplateCatalog | null>(null);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsdTemplateResolve | null>(null);
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id) && String(r.awb ?? "").trim()),
    [rows, selectedIds]
  );

  useEffect(() => {
    let cancelled = false;
    void fetchCsdTemplateCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch((e) => {
        if (!cancelled) setCatalogErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const first = selectedRows[0];
    if (!first?.awb) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void resolveCsdTemplateForAwb(first.awb)
      .then((r) => {
        if (!cancelled) setPreview(r);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRows]);

  const filteredAirlines = useMemo(() => {
    if (!catalog) return [];
    const q = filter.trim().toLowerCase();
    const list = catalog.airlines.filter((a) => {
      if (!q) return true;
      return (
        a.awbPrefix.includes(q) ||
        a.airlineName.toLowerCase().includes(q) ||
        a.status.includes(q)
      );
    });
    return showAll ? list : list.filter((a) => a.status === "pending").slice(0, 12);
  }, [catalog, filter, showAll]);

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-sky-200/80 bg-sky-50/80 px-3 py-2 text-[11px] text-sky-950">
        <strong>CSD A4 theo hãng bay</strong> — form vector IATA trên giấy trắng (giống AWB Editor). Tự chọn mẫu theo prefix AWB (3 số đầu). Form scan overlay chỉ khi hãng đặt <code className="rounded bg-black/[0.04] px-1">renderMode: overlay</code> trên server.
      </p>

      {preview ? (
        <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] px-3 py-2 text-[11px]">
          <p className="font-semibold text-apple-label">
            Lô đang chọn: {preview.airlineName ?? "—"} · prefix {preview.awbPrefix ?? "?"}
          </p>
          <p className="mt-1 text-apple-secondary">
            Mẫu: <span className="font-medium text-apple-label">{preview.templateName}</span> ·{" "}
            {preview.paper} · <StatusBadge status={preview.templateStatus} />
          </p>
          {preview.templateStatus === "pending" ? (
            <p className="mt-1 text-amber-800">
              Chưa có slot riêng — đang dùng mẫu vector mặc định.
            </p>
          ) : null}
          {preview.renderMode ? (
            <p className="mt-1 text-apple-tertiary">Chế độ in: {preview.renderMode}</p>
          ) : null}
        </div>
      ) : null}

      {catalog ? (
        <div className="rounded-xl border px-3 py-2 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-apple-label">
              Slot hãng: {catalog.summary.ready}/{catalog.summary.total} đã gán form
            </p>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            >
              {showAll ? "Chỉ chưa gán" : "Xem tất cả"}
            </button>
          </div>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Lọc prefix / tên hãng…"
            className="mt-2 w-full rounded-lg border px-2 py-1 text-[11px]"
          />
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border">
            <table className="w-full text-left text-[10px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-apple-secondary">
                  <th className="px-2 py-1">Prefix</th>
                  <th className="px-2 py-1">Hãng</th>
                  <th className="px-2 py-1">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filteredAirlines.map((a) => (
                  <tr key={a.awbPrefix} className="border-b border-black/[0.04]">
                    <td className="px-2 py-1 font-mono">{a.awbPrefix}</td>
                    <td className="px-2 py-1">{a.airlineName}</td>
                    <td className="px-2 py-1">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-apple-tertiary">
            Mặc định: form vector IATA · tuỳ chọn <code className="rounded bg-black/[0.04] px-1">fields.json</code> để căn tọa độ · overlay scan khi cần form hãng đặc biệt.
          </p>
        </div>
      ) : catalogErr ? (
        <p className="text-[11px] text-red-600">{catalogErr}</p>
      ) : (
        <p className="text-[11px] text-apple-secondary">Đang tải danh mục mẫu CSD…</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "ready"
      ? "bg-emerald-100 text-emerald-900"
      : status === "pending"
        ? "bg-amber-100 text-amber-900"
        : status === "default"
          ? "bg-slate-100 text-slate-700"
          : "bg-zinc-100 text-zinc-700";
  const label =
    status === "ready"
      ? "Đã gán form"
      : status === "pending"
        ? "Chưa gán — dùng mặc định"
        : status === "default"
          ? "Mẫu mặc định"
          : status;
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

/** In CSD cho danh sách lô — dùng từ PrintCenter. */
export async function printCsdBatch(rows: Shipment[]): Promise<{ ok: number; err: string }> {
  let ok = 0;
  let err = "";
  for (const s of rows) {
    if (!String(s.awb ?? "").trim()) continue;
    try {
      await openCsdPdfForShipment(s);
      ok += 1;
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok, err };
}
