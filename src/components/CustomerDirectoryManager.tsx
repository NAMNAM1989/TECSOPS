import { useEffect, useMemo, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { assertCustomerDirectoryValid } from "../utils/customerDirectoryCore";
import type { CustomerSavedConsignee } from "../types/customerDirectory";
import {
  clampCustomerDirectoryEntry,
  emptyCustomerProfileRow,
  emptyCustomerSavedConsignee,
} from "../utils/customerDirectoryProfile";

type Props = {
  open: boolean;
  initial: readonly CustomerDirectoryEntry[];
  onClose: () => void;
  onSave: (next: CustomerDirectoryEntry[]) => Promise<void>;
};

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CustomerDirectoryManager({ open, initial, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CustomerDirectoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = initial.map((e) => clampCustomerDirectoryEntry(e));
    setDraft(next);
    setSelectedId((prev) => (prev && next.some((e) => e.id === prev) ? prev : next[0]?.id ?? null));
    setQuery("");
  }, [initial, open]);

  const selected = draft.find((e) => e.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return draft;
    return draft.filter((e) => e.code.toLowerCase().includes(needle) || e.name.toLowerCase().includes(needle));
  }, [draft, query]);

  function updateCustomer(
    id: string,
    patch: Partial<Omit<CustomerDirectoryEntry, "id" | "parties">>
  ) {
    setDraft((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function patchSavedConsignee(customerId: string, index: number, patch: Partial<CustomerSavedConsignee>) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const list = [...(row.savedConsignees ?? [])];
        const cur = list[index];
        if (!cur) return row;
        list[index] = { ...cur, ...patch };
        return { ...row, savedConsignees: list };
      })
    );
  }

  function removeSavedConsignee(customerId: string, index: number) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const list = (row.savedConsignees ?? []).filter((_, i) => i !== index);
        return { ...row, savedConsignees: list };
      })
    );
  }

  function addSavedConsignee(customerId: string) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const list = [...(row.savedConsignees ?? []), emptyCustomerSavedConsignee()];
        return { ...row, savedConsignees: list };
      })
    );
  }

  function addCustomer() {
    const row = emptyCustomerProfileRow(newId("customer"));
    setDraft((rows) => [...rows, row]);
    setSelectedId(row.id);
  }

  function removeCustomer(id: string) {
    setDraft((rows) => {
      const next = rows.filter((row) => row.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  }

  async function handleSave() {
    const normalized = draft.map((e) => clampCustomerDirectoryEntry(e));
    try {
      assertCustomerDirectoryValid(normalized);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Danh sách không hợp lệ.");
      return;
    }
    setSaving(true);
    try {
      await onSave(normalized);
      onClose();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Không lưu được.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex bg-black/25 p-2 backdrop-blur-xl sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-manager-title"
    >
      <div className="mx-auto flex h-full w-full max-w-7xl overflow-hidden rounded-[28px] border border-black/[0.08] bg-white shadow-apple-md">
        <aside className="flex w-full max-w-[19rem] shrink-0 flex-col border-r border-black/[0.06] bg-apple-bg/70">
          <div className="border-b border-black/[0.06] p-4">
            <h2 id="customer-manager-title" className="text-lg font-semibold tracking-tight text-apple-label">
              Khách hàng
            </h2>
            <p className="mt-1 text-xs text-apple-secondary">Nhập hồ sơ in phiếu cân chuẩn cho từng khách.</p>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm khách / mẫu..."
              className="mt-3 w-full rounded-full border border-black/[0.08] bg-white px-3 py-2 text-sm font-medium text-apple-label outline-none focus:border-apple-blue/40 focus:ring-2 focus:ring-apple-blue/15"
            />
            <button
              type="button"
              onClick={addCustomer}
              className="mt-2 w-full rounded-full bg-apple-blue px-4 py-2 text-sm font-semibold text-white hover:bg-apple-blue-hover"
            >
              + Thêm khách
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filtered.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => setSelectedId(customer.id)}
                className={`mb-1 w-full rounded-2xl px-3 py-2.5 text-left transition ${
                  selectedId === customer.id
                    ? "bg-white text-apple-label shadow-sm ring-2 ring-apple-blue/20"
                    : "text-apple-secondary hover:bg-white/70"
                }`}
              >
                <span className="block truncate text-sm font-semibold">{customer.name || "Chưa đặt tên"}</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-apple-tertiary">
                  {customer.code || "CHƯA CÓ MÃ"} · {(customer.savedConsignees ?? []).length} CNEE ·{" "}
                  {customer.parties.length} mẫu
                </span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-apple-tertiary">Không tìm thấy khách.</p>
            ) : null}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
            <div className="min-w-0">
              <h3 className="truncate text-[19px] font-semibold tracking-tight text-apple-label">
                {selected ? selected.name || "Khách mới" : "Chưa chọn khách"}
              </h3>
              <p className="mt-1 text-xs text-apple-secondary">
                Booking sẽ ưu tiên lấy dữ liệu ở đây để in phiếu cân chính xác.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-apple-tertiary hover:bg-black/[0.05] hover:text-apple-label"
              aria-label="Đóng"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {selected ? (
              <div className="space-y-5">
                <section className="rounded-2xl border border-black/[0.08] bg-apple-bg/40 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={selected.code}
                      onChange={(e) => updateCustomer(selected.id, { code: e.target.value })}
                      className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 font-mono text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20 sm:max-w-[10rem]"
                      placeholder="Mã KH"
                    />
                    <input
                      value={selected.name}
                      onChange={(e) => updateCustomer(selected.id, { name: e.target.value })}
                      className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                      placeholder="Tên khách hàng"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Xóa khách ${selected.name || selected.code}?`)) removeCustomer(selected.id);
                      }}
                      className="rounded-xl px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Xóa khách
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl border border-apple-blue/20 bg-apple-blue/5 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-apple-blue">
                    Thông tin in phiếu cân (ưu tiên)
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      value={selected.shipperName ?? ""}
                      onChange={(e) => updateCustomer(selected.id, { shipperName: e.target.value })}
                      className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                      placeholder="Tên người gửi in phiếu cân"
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={selected.shipperPhone ?? ""}
                        onChange={(e) => updateCustomer(selected.id, { shipperPhone: e.target.value })}
                        className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                        placeholder="Số điện thoại"
                      />
                      <input
                        value={selected.shipperEmail ?? ""}
                        onChange={(e) => updateCustomer(selected.id, { shipperEmail: e.target.value })}
                        className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                        placeholder="Email người gửi"
                      />
                      <input
                        value={selected.taxCode ?? ""}
                        onChange={(e) => updateCustomer(selected.id, { taxCode: e.target.value })}
                        className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                        placeholder="Mã số thuế"
                      />
                    </div>
                    <textarea
                      value={selected.shipperAddress ?? ""}
                      onChange={(e) => updateCustomer(selected.id, { shipperAddress: e.target.value })}
                      rows={2}
                      className="w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                      placeholder="Địa chỉ người gửi"
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-black/[0.06] pt-2">
                    <p className="text-[11px] font-semibold uppercase text-apple-secondary">Agent</p>
                    <input value={selected.agentName ?? ""} onChange={(e) => updateCustomer(selected.id, { agentName: e.target.value })} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" placeholder="Tên agent" />
                    <textarea value={selected.agentAddress ?? ""} onChange={(e) => updateCustomer(selected.id, { agentAddress: e.target.value })} rows={2} className="w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" placeholder="Địa chỉ agent" />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input value={selected.agentPhone ?? ""} onChange={(e) => updateCustomer(selected.id, { agentPhone: e.target.value })} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" placeholder="SĐT agent" />
                      <input value={selected.agentEmail ?? ""} onChange={(e) => updateCustomer(selected.id, { agentEmail: e.target.value })} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" placeholder="Email agent" />
                      <input value={selected.agentTaxCode ?? ""} onChange={(e) => updateCustomer(selected.id, { agentTaxCode: e.target.value })} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" placeholder="VAT code agent" />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-black/[0.06] pt-2">
                    <p className="text-[11px] font-semibold uppercase text-apple-secondary">Consignee / Notify</p>
                    <input value={selected.consigneeName ?? ""} onChange={(e) => updateCustomer(selected.id, { consigneeName: e.target.value })} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" placeholder="Tên consignee" />
                    <textarea value={selected.consigneeAddress ?? ""} onChange={(e) => updateCustomer(selected.id, { consigneeAddress: e.target.value })} rows={2} className="w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" placeholder="Địa chỉ consignee" />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input value={selected.consigneePhone ?? ""} onChange={(e) => updateCustomer(selected.id, { consigneePhone: e.target.value })} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" placeholder="SĐT consignee" />
                      <input value={selected.consigneeEmail ?? ""} onChange={(e) => updateCustomer(selected.id, { consigneeEmail: e.target.value })} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" placeholder="Email consignee" />
                      <input value={selected.notifyName ?? ""} onChange={(e) => updateCustomer(selected.id, { notifyName: e.target.value })} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" placeholder="Notify" />
                    </div>
                  </div>
                  <div className="mt-4 border-t border-black/[0.06] pt-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase text-apple-secondary">
                      CNEE lưu sẵn (chọn khi booking / in phiếu cân)
                    </p>
                    <p className="mb-2 text-[10px] leading-snug text-apple-tertiary">
                      Mỗi mục là một bộ người nhận. Trên lô hàng có thể chọn mục này; nếu chưa chọn và có nhiều mục, lúc in
                      phiếu cân SCSC sẽ hỏi chọn CNEE.
                    </p>
                    <div className="space-y-3">
                      {(selected.savedConsignees ?? []).map((sc, idx) => (
                        <div
                          key={sc.id}
                          className="rounded-xl border border-black/[0.08] bg-white p-2.5 shadow-sm"
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase text-apple-tertiary">
                              CNEE #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeSavedConsignee(selected.id, idx)}
                              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                            >
                              Xóa
                            </button>
                          </div>
                          <input
                            value={sc.label}
                            onChange={(e) => patchSavedConsignee(selected.id, idx, { label: e.target.value })}
                            className="mb-1.5 w-full rounded-lg border border-black/[0.08] bg-apple-bg/40 px-2.5 py-1.5 text-xs font-semibold text-apple-label"
                            placeholder="Nhãn (VD: Tokyo, Singapore)"
                          />
                          <input
                            value={sc.consigneeName}
                            onChange={(e) =>
                              patchSavedConsignee(selected.id, idx, { consigneeName: e.target.value })
                            }
                            className="mb-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm text-apple-label"
                            placeholder="Tên consignee"
                          />
                          <textarea
                            value={sc.consigneeAddress}
                            onChange={(e) =>
                              patchSavedConsignee(selected.id, idx, { consigneeAddress: e.target.value })
                            }
                            rows={2}
                            className="mb-1.5 w-full resize-y rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm text-apple-label"
                            placeholder="Địa chỉ"
                          />
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                            <input
                              value={sc.consigneePhone}
                              onChange={(e) =>
                                patchSavedConsignee(selected.id, idx, { consigneePhone: e.target.value })
                              }
                              className="w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm text-apple-label"
                              placeholder="SĐT"
                            />
                            <input
                              value={sc.consigneeEmail}
                              onChange={(e) =>
                                patchSavedConsignee(selected.id, idx, { consigneeEmail: e.target.value })
                              }
                              className="w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm text-apple-label"
                              placeholder="Email"
                            />
                            <input
                              value={sc.notifyName}
                              onChange={(e) =>
                                patchSavedConsignee(selected.id, idx, { notifyName: e.target.value })
                              }
                              className="w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm text-apple-label"
                              placeholder="Notify"
                            />
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addSavedConsignee(selected.id)}
                        className="w-full rounded-full border border-dashed border-apple-blue/40 bg-apple-blue/5 py-2 text-xs font-semibold text-apple-blue hover:bg-apple-blue/10"
                      >
                        + Thêm CNEE lưu sẵn
                      </button>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-black/[0.08] bg-white p-3">
                  <p className="text-xs text-apple-secondary">
                    Đã bỏ module copy/dán thông tin theo yêu cầu. Danh bạ khách hàng hiện chỉ giữ dữ liệu in phiếu cân có cấu trúc.
                  </p>
                </section>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-black/[0.12] bg-apple-bg/50 p-8 text-center text-sm text-apple-tertiary">
                Chọn khách bên trái hoặc bấm “Thêm khách”.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-black/[0.06] px-5 py-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex-1 rounded-full bg-apple-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-apple-blue-hover disabled:cursor-wait disabled:opacity-70"
            >
              {saving ? "Đang lưu…" : "Lưu lên máy chủ"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/[0.12] bg-white px-5 py-2.5 text-sm font-semibold text-apple-label hover:bg-black/[0.03]"
            >
              Hủy
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
