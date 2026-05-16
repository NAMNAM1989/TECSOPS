import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { credFetch } from "../apiFetch";
import { useWeighSlips } from "../hooks/useWeighSlips";
import type {
  AirportLookupItem,
  ConsigneeLookupItem,
  CustomerLookupItem,
  WeighSlipDraft,
  WeighSlipRecord,
} from "../types/weighSlip";
import {
  applyConsigneeToWeighSlipDraft,
  applyCustomerToWeighSlipDraft,
} from "../utils/applyCustomerToWeighSlipDraft";
import { formatAwb } from "../utils/awbFormat";
import { mapWeighSlipRecordToScaleTicketFormData } from "../utils/mapWeighSlipRecordToScaleTicketFormData";
import {
  buildScscWeighReceiptDocumentHtml,
  printScscWeighReceiptFromFormData,
} from "../printing/scscWeigh/scscWeighPrint";
import { emptyWeighSlipDraft, validateWeighSlip } from "../utils/weighSlipValidation";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Tab = "list" | "form" | "preview";

function recordToDraft(r: WeighSlipRecord): WeighSlipDraft {
  const { id: _id, status: _s, printFormSnapshot: _p, createdAt: _c, updatedAt: _u, ...draft } = r;
  return draft;
}

function Field({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block space-y-1 ${className}`.trim()}>
      <span className="text-[11px] font-semibold text-apple-secondary">{label}</span>
      {children}
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-black/[0.12] bg-white px-3 py-2 text-sm text-apple-label outline-none focus:border-apple-blue";

export function WeighSlipManager({ open, onClose }: Props) {
  const api = useWeighSlips();
  const [tab, setTab] = useState<Tab>("list");
  const [postgresOk, setPostgresOk] = useState<boolean | null>(null);
  const [items, setItems] = useState<WeighSlipRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WeighSlipDraft>(() => emptyWeighSlipDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerLookupItem[]>([]);
  const [consignees, setConsignees] = useState<ConsigneeLookupItem[]>([]);
  const [airports, setAirports] = useState<AirportLookupItem[]>([]);
  const [statusMsg, setStatusMsg] = useState("");

  const previewHtml = useMemo(() => {
    if (tab !== "preview") return "";
    const record = { ...draft, id: editingId ?? "", status: "draft" as const, printFormSnapshot: null, createdAt: "", updatedAt: "" };
    const fd = mapWeighSlipRecordToScaleTicketFormData(record);
    return buildScscWeighReceiptDocumentHtml(fd);
  }, [tab, draft, editingId]);

  const refreshList = useCallback(async () => {
    const list = await api.list({ q: search || undefined });
    setItems(list);
  }, [api, search]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetch("/api/lookup/airports", { ...credFetch });
        if (!res.ok) {
          setPostgresOk(false);
          return;
        }
        setPostgresOk(true);
        const data = (await res.json()) as { items: AirportLookupItem[] };
        setAirports(data.items ?? []);
        await refreshList();
      } catch {
        setPostgresOk(false);
      }
    })();
  }, [open, refreshList]);

  useEffect(() => {
    if (!open || !postgresOk) return;
    const t = setTimeout(() => {
      void fetch(`/api/lookup/customers?q=${encodeURIComponent(customerQuery)}`, { ...credFetch })
        .then((r) => r.json())
        .then((d: { items: CustomerLookupItem[] }) => setCustomers(d.items ?? []))
        .catch(() => setCustomers([]));
    }, 250);
    return () => clearTimeout(t);
  }, [open, postgresOk, customerQuery]);

  const loadConsignees = useCallback(async (customerId: string) => {
    if (!customerId) {
      setConsignees([]);
      return;
    }
    const res = await fetch(`/api/lookup/customers/${encodeURIComponent(customerId)}/consignees`, {
      ...credFetch,
    });
    const data = (await res.json()) as { items: ConsigneeLookupItem[] };
    setConsignees(data.items ?? []);
  }, []);

  const startNew = () => {
    setEditingId(null);
    setDraft(emptyWeighSlipDraft());
    setErrors({});
    setTab("form");
    setStatusMsg("");
  };

  const startEdit = (r: WeighSlipRecord) => {
    setEditingId(r.id);
    setDraft(recordToDraft(r));
    setErrors({});
    setTab("form");
    void loadConsignees(r.customerId);
    setStatusMsg("");
  };

  const patch = (patch: Partial<WeighSlipDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const saveDraft = async () => {
    const v = validateWeighSlip(draft, { requireAll: false });
    setErrors(v.errors);
    if (!v.ok && draft.mawbNo.trim()) return;
    if (editingId) {
      await api.update(editingId, { ...draft, status: "draft" });
    } else {
      const created = await api.create(draft, { status: "draft" });
      setEditingId(created.id);
    }
    setStatusMsg("Đã lưu nháp.");
    await refreshList();
  };

  const finalize = async () => {
    const v = validateWeighSlip(draft, { requireAll: true });
    setErrors(v.errors);
    if (!v.ok) return;
    const formData = mapWeighSlipRecordToScaleTicketFormData({
      ...draft,
      id: editingId ?? "",
      status: "final",
      printFormSnapshot: null,
      createdAt: "",
      updatedAt: "",
    });
    if (editingId) {
      await api.update(editingId, { ...draft, status: "final" }, { printFormSnapshot: formData });
    } else {
      const created = await api.create(draft, { status: "final", printFormSnapshot: formData });
      setEditingId(created.id);
    }
    setStatusMsg("Đã chốt phiếu cân (final).");
    await refreshList();
  };

  const onPrint = () => {
    const v = validateWeighSlip(draft, { requireAll: false });
    const fd = mapWeighSlipRecordToScaleTicketFormData({
      ...draft,
      id: editingId ?? "",
      status: "draft",
      printFormSnapshot: null,
      createdAt: "",
      updatedAt: "",
    });
    if (!v.ok && !draft.mawbNo.trim()) {
      setErrors(v.errors);
      return;
    }
    printScscWeighReceiptFromFormData(fd);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-apple-label">Phiếu cân SCSC — nhập & in</h2>
            <p className="text-xs text-apple-secondary">Lưu Postgres · in qua template SCSC hiện có</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-black/[0.06]">
            Đóng
          </button>
        </div>

        {postgresOk === false ? (
          <div className="p-6 text-sm text-apple-secondary">
            Cần <strong className="text-apple-label">DATABASE_URL</strong> (Postgres) trên server. Chạy{" "}
            <code className="rounded bg-black/[0.06] px-1">npm run migrate:postgres-catalog</code> sau khi deploy.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-black/[0.06] px-5 py-2">
              {(["list", "form", "preview"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={
                    tab === t
                      ? "rounded-full bg-apple-blue px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-full border px-3 py-1.5 text-xs font-semibold"
                  }
                >
                  {t === "list" ? "Danh sách" : t === "form" ? "Nhập liệu" : "Xem trước"}
                </button>
              ))}
              {statusMsg ? <span className="ml-auto self-center text-xs text-emerald-700">{statusMsg}</span> : null}
              {api.error ? <span className="ml-auto self-center text-xs text-red-600">{api.error}</span> : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {tab === "list" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      className={inputCls + " max-w-xs"}
                      placeholder="Tìm MAWB / shipper…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button type="button" className="rounded-full bg-apple-blue px-4 py-2 text-xs font-semibold text-white" onClick={() => void refreshList()}>
                      Tải lại
                    </button>
                    <button type="button" className="rounded-full border px-4 py-2 text-xs font-semibold" onClick={startNew}>
                      + Phiếu mới
                    </button>
                  </div>
                  <ul className="divide-y rounded-xl border">
                    {items.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                        <span className="font-mono font-semibold">{r.mawbNo || "—"}</span>
                        <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] uppercase">{r.status}</span>
                        <span className="text-apple-secondary">{r.destinationAirport}</span>
                        <span className="ml-auto flex gap-2">
                          <button type="button" className="text-xs font-semibold text-apple-blue" onClick={() => startEdit(r)}>
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="text-xs font-semibold text-apple-secondary"
                            onClick={() => void api.duplicate(r.id).then(() => refreshList())}
                          >
                            Nhân bản
                          </button>
                        </span>
                      </li>
                    ))}
                    {!items.length ? <li className="px-3 py-6 text-center text-sm text-apple-secondary">Chưa có phiếu cân.</li> : null}
                  </ul>
                </div>
              ) : null}

              {tab === "form" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <section className="sm:col-span-2 rounded-xl border bg-apple-bg/40 p-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-apple-secondary">Khách hàng (lookup)</p>
                    <input
                      className={inputCls}
                      placeholder="Mã / tên khách…"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                    />
                    <ul className="mt-2 max-h-28 overflow-y-auto text-xs">
                      {customers.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white"
                            onClick={() => {
                              setDraft(applyCustomerToWeighSlipDraft(draft, c));
                              void loadConsignees(c.id);
                              setCustomerQuery(c.code);
                            }}
                          >
                            <strong>{c.code}</strong> — {c.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {consignees.length > 0 ? (
                      <select
                        className={inputCls + " mt-2"}
                        value={draft.customerConsigneeId}
                        onChange={(e) => {
                          const c = consignees.find((x) => x.id === e.target.value);
                          if (c) setDraft(applyConsigneeToWeighSlipDraft(draft, c));
                        }}
                      >
                        <option value="">— CNEE lưu sẵn —</option>
                        {consignees.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label || c.consigneeName}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </section>

                  <Field label="MAWB *" error={errors.mawbNo}>
                    <input
                      className={inputCls}
                      value={draft.mawbNo}
                      onChange={(e) => patch({ mawbNo: e.target.value })}
                      onBlur={() => patch({ mawbNo: formatAwb(draft.mawbNo) })}
                    />
                  </Field>
                  <Field label="HAWB">
                    <input className={inputCls} value={draft.hawbNo} onChange={(e) => patch({ hawbNo: e.target.value })} />
                  </Field>
                  <Field label="Sân bay đích (IATA) *" error={errors.destinationAirport}>
                    <input
                      className={inputCls}
                      list="airport-list"
                      maxLength={3}
                      value={draft.destinationAirport}
                      onChange={(e) => patch({ destinationAirport: e.target.value.toUpperCase() })}
                    />
                    <datalist id="airport-list">
                      {airports.map((a) => (
                        <option key={a.iata} value={a.iata}>
                          {a.name}
                        </option>
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Ngày chuyến">
                    <input
                      type="date"
                      className={inputCls}
                      value={draft.flightDate}
                      onChange={(e) => patch({ flightDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Số hiệu chuyến">
                    <input className={inputCls} value={draft.flightNo} onChange={(e) => patch({ flightNo: e.target.value })} />
                  </Field>
                  <Field label="Trạng thái HAWB / số nhóm">
                    <input className={inputCls} value={draft.hawbCountStatus} onChange={(e) => patch({ hawbCountStatus: e.target.value })} />
                  </Field>

                  <p className="sm:col-span-2 text-xs font-bold uppercase text-apple-secondary">Shipper</p>
                  <Field label="Tên *" error={errors.shipperName}>
                    <input className={inputCls} value={draft.shipperName} onChange={(e) => patch({ shipperName: e.target.value })} />
                  </Field>
                  <Field label="MST">
                    <input className={inputCls} value={draft.shipperTaxCode} onChange={(e) => patch({ shipperTaxCode: e.target.value })} />
                  </Field>
                  <Field label="Địa chỉ" >
                    <textarea className={inputCls} rows={2} value={draft.shipperAddress} onChange={(e) => patch({ shipperAddress: e.target.value })} />
                  </Field>
                  <Field label="Liên hệ / SĐT">
                    <input className={inputCls} value={draft.shipperContact} onChange={(e) => patch({ shipperContact: e.target.value })} />
                  </Field>
                  <Field label="Email / Fax">
                    <input className={inputCls} value={draft.shipperEmailFax} onChange={(e) => patch({ shipperEmailFax: e.target.value })} />
                  </Field>

                  <p className="sm:col-span-2 text-xs font-bold uppercase text-apple-secondary">Consignee</p>
                  <Field label="Tên">
                    <input className={inputCls} value={draft.consigneeName} onChange={(e) => patch({ consigneeName: e.target.value })} />
                  </Field>
                  <Field label="MST / tài khoản">
                    <input className={inputCls} value={draft.consigneeTaxAccount} onChange={(e) => patch({ consigneeTaxAccount: e.target.value })} />
                  </Field>
                  <Field label="Địa chỉ" className="sm:col-span-2">
                    <textarea className={inputCls} rows={2} value={draft.consigneeAddress} onChange={(e) => patch({ consigneeAddress: e.target.value })} />
                  </Field>

                  <p className="sm:col-span-2 text-xs font-bold uppercase text-apple-secondary">Notify / Agent</p>
                  <Field label="Tên agent">
                    <input className={inputCls} value={draft.notifyAgentName} onChange={(e) => patch({ notifyAgentName: e.target.value })} />
                  </Field>
                  <Field label="Liên hệ agent">
                    <input className={inputCls} value={draft.notifyAgentContact} onChange={(e) => patch({ notifyAgentContact: e.target.value })} />
                  </Field>
                  <Field label="Địa chỉ agent" className="sm:col-span-2">
                    <textarea className={inputCls} rows={2} value={draft.notifyAgentAddress} onChange={(e) => patch({ notifyAgentAddress: e.target.value })} />
                  </Field>
                  <Field label="Notify khác" className="sm:col-span-2">
                    <input className={inputCls} value={draft.notifyOther} onChange={(e) => patch({ notifyOther: e.target.value })} />
                  </Field>

                  <p className="sm:col-span-2 text-xs font-bold uppercase text-apple-secondary">Hàng & cân</p>
                  <Field label="Mô tả hàng">
                    <input className={inputCls} value={draft.goodsDescription} onChange={(e) => patch({ goodsDescription: e.target.value })} />
                  </Field>
                  <Field label="HS code">
                    <input className={inputCls} value={draft.hsCode} onChange={(e) => patch({ hsCode: e.target.value })} />
                  </Field>
                  <Field label="Kiện *" error={errors.pieces}>
                    <input
                      type="number"
                      className={inputCls}
                      value={draft.pieces ?? ""}
                      onChange={(e) => patch({ pieces: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Gross (kg) *" error={errors.grossWeight}>
                    <input
                      type="number"
                      step="0.1"
                      className={inputCls}
                      value={draft.grossWeight ?? ""}
                      onChange={(e) => patch({ grossWeight: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Chargeable (kg) *" error={errors.chargeableWeight}>
                    <input
                      type="number"
                      step="0.1"
                      className={inputCls}
                      value={draft.chargeableWeight ?? ""}
                      onChange={(e) => patch({ chargeableWeight: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Kích thước (mỗi dòng L x W x H x PCS)" error={errors.dimensions} className="sm:col-span-2">
                    <textarea className={inputCls} rows={4} value={draft.dimensions} onChange={(e) => patch({ dimensions: e.target.value })} />
                  </Field>
                  <Field label="Handling" className="sm:col-span-2">
                    <input className={inputCls} value={draft.handlingInstruction} onChange={(e) => patch({ handlingInstruction: e.target.value })} />
                  </Field>
                  <Field label="Ghi chú nội bộ (không in)" className="sm:col-span-2">
                    <textarea className={inputCls} rows={2} value={draft.internalNote} onChange={(e) => patch({ internalNote: e.target.value })} />
                  </Field>
                </div>
              ) : null}

              {tab === "preview" ? (
                <iframe
                  title="Preview phiếu cân"
                  className="mx-auto h-[70vh] w-full max-w-[210mm] border bg-gray-100"
                  srcDoc={previewHtml}
                />
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-black/[0.08] px-5 py-3">
              {tab === "form" ? (
                <>
                  <button type="button" disabled={api.loading} className="rounded-full border px-4 py-2 text-xs font-semibold" onClick={() => void saveDraft()}>
                    Lưu nháp
                  </button>
                  <button type="button" disabled={api.loading} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white" onClick={() => void finalize()}>
                    Chốt (final)
                  </button>
                  <button type="button" className="rounded-full bg-apple-blue px-4 py-2 text-xs font-semibold text-white" onClick={onPrint}>
                    In
                  </button>
                </>
              ) : null}
              {tab !== "preview" ? (
                <button type="button" className="ml-auto rounded-full px-4 py-2 text-xs font-semibold text-apple-secondary" onClick={() => setTab("preview")}>
                  Xem trước
                </button>
              ) : (
                <button type="button" className="rounded-full bg-apple-blue px-4 py-2 text-xs font-semibold text-white" onClick={onPrint}>
                  In từ preview
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
