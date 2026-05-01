import { useCallback, useEffect, useMemo, useState } from "react";
import type { CustomerDirectoryEntry, CustomerParty, CustomerPartyType } from "../types/customerDirectory";
import { assertCustomerDirectoryValid } from "../utils/customerDirectoryCore";
import {
  buildCustomerPartyBlock,
  clampCustomerDirectoryEntry,
  CUSTOMER_PARTY_TYPES,
  emptyCustomerParty,
  emptyCustomerProfileRow,
  partyTypeLabel,
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

async function copyToClipboard(text: string): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    window.alert("Không sao chép được — thử chọn văn bản thủ công.");
    return false;
  }
}

function partyPreview(p: CustomerParty): string {
  const text = p.content.trim().replace(/\s+/g, " ");
  if (!text) return "Chưa nhập nội dung";
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

export function CustomerDirectoryManager({ open, initial, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CustomerDirectoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
    return draft.filter((e) => {
      const partyHit = e.parties.some(
        (p) =>
          p.type.toLowerCase().includes(needle) ||
          p.label.toLowerCase().includes(needle) ||
          p.content.toLowerCase().includes(needle)
      );
      return (
        e.code.toLowerCase().includes(needle) ||
        e.name.toLowerCase().includes(needle) ||
        partyHit
      );
    });
  }, [draft, query]);

  const flashCopied = useCallback((key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
  }, []);

  function updateCustomer(id: string, patch: Partial<Omit<CustomerDirectoryEntry, "id" | "parties">>) {
    setDraft((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
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

  function addParty(customerId: string, type: CustomerPartyType) {
    setDraft((rows) =>
      rows.map((row) =>
        row.id === customerId
          ? { ...row, parties: [...row.parties, emptyCustomerParty(type)] }
          : row
      )
    );
  }

  function updateParty(customerId: string, partyId: string, patch: Partial<Omit<CustomerParty, "id">>) {
    setDraft((rows) =>
      rows.map((row) =>
        row.id === customerId
          ? {
              ...row,
              parties: row.parties.map((p) => (p.id === partyId ? { ...p, ...patch } : p)),
            }
          : row
      )
    );
  }

  function removeParty(customerId: string, partyId: string) {
    setDraft((rows) =>
      rows.map((row) =>
        row.id === customerId ? { ...row, parties: row.parties.filter((p) => p.id !== partyId) } : row
      )
    );
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
            <p className="mt-1 text-xs text-apple-secondary">Chọn khách để tạo nhiều SHIPPER / CNEE / NOTIFY.</p>
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
                  {customer.code || "CHƯA CÓ MÃ"} · {customer.parties.length} mẫu
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
                Lưu các đoạn nguyên văn cần copy. Một khách có thể có nhiều mẫu cùng loại.
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

                {CUSTOMER_PARTY_TYPES.map((type) => {
                  const group = selected.parties.filter((p) => p.type === type);
                  return (
                    <section key={type} className="rounded-2xl border border-black/[0.08] bg-white p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-apple-label">{partyTypeLabel(type)}</h4>
                          <p className="text-[11px] text-apple-tertiary">{group.length} mẫu</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addParty(selected.id, type)}
                          className="rounded-full bg-apple-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-apple-blue-hover"
                        >
                          + {partyTypeLabel(type)}
                        </button>
                      </div>

                      {group.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-black/[0.12] bg-apple-bg/50 px-3 py-4 text-center text-xs text-apple-tertiary">
                          Chưa có mẫu {partyTypeLabel(type)}.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {group.map((party) => {
                            const copyKey = `${selected.id}:${party.id}`;
                            return (
                              <div key={party.id} className="rounded-2xl border border-black/[0.06] bg-apple-bg/40 p-2.5">
                                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                  <input
                                    value={party.label}
                                    onChange={(e) => updateParty(selected.id, party.id, { label: e.target.value })}
                                    className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-2.5 py-2 text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                                    placeholder={`Tên mẫu ${partyTypeLabel(type)} (VD: HCM, JAPAN...)`}
                                  />
                                  <button
                                    type="button"
                                    disabled={!party.content.trim()}
                                    onClick={async () => {
                                      const ok = await copyToClipboard(buildCustomerPartyBlock(party));
                                      if (ok) flashCopied(copyKey);
                                    }}
                                    className="rounded-full bg-apple-blue px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/[0.12]"
                                  >
                                    {copiedKey === copyKey ? "Đã chép" : "Copy"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeParty(selected.id, party.id)}
                                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                                  >
                                    Xóa
                                  </button>
                                </div>
                                <textarea
                                  value={party.content}
                                  onChange={(e) => updateParty(selected.id, party.id, { content: e.target.value })}
                                  rows={4}
                                  className="w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2 font-mono text-xs leading-relaxed text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                                  placeholder={`Dán nội dung ${partyTypeLabel(type)} cần copy...`}
                                />
                                <p className="mt-1 truncate text-[11px] text-apple-tertiary">{partyPreview(party)}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
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
