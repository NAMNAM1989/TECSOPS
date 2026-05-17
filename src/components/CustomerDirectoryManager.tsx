import { useEffect, useMemo, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { assertCustomerDirectoryValid } from "../utils/customerDirectoryCore";
import type { CustomerSavedConsignee, CustomerSavedGoods, CustomerSavedShipper } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import { GlobalAgentsSettings } from "./GlobalAgentsSettings";
import { ScscWeighSenderSettings } from "./ScscWeighSenderSettings";
import { CustomerPrintProfileTabs } from "./customerDirectory/CustomerPrintProfileTabs";
import { clampGlobalAgentCatalog, defaultGlobalAgentCatalog } from "../utils/globalAgentsCore";
import {
  clampCustomerDirectoryEntry,
  emptyCustomerProfileRow,
  emptyCustomerSavedConsignee,
  emptyCustomerSavedGoods,
  emptyCustomerSavedShipper,
} from "../utils/customerDirectoryProfile";
import {
  clampScscWeighPrintSettings,
  defaultScscWeighPrintSettings,
} from "../printing/scscWeigh/scscWeighPrintSettingsCore";

type Props = {
  open: boolean;
  initial: readonly CustomerDirectoryEntry[];
  globalAgentsInitial: GlobalAgentCatalog;
  scscWeighPrintSettingsInitial?: ScscWeighPrintSettings;
  onClose: () => void;
  onSave: (payload: {
    customers: CustomerDirectoryEntry[];
    globalAgents: GlobalAgentCatalog;
    scscWeighPrintSettings?: ScscWeighPrintSettings;
  }) => Promise<void>;
};

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CustomerDirectoryManager({
  open,
  initial,
  globalAgentsInitial,
  scscWeighPrintSettingsInitial,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<CustomerDirectoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [mainTab, setMainTab] = useState<"profiles" | "agents">("profiles");
  const [globalAgentsDraft, setGlobalAgentsDraft] = useState<GlobalAgentCatalog>(defaultGlobalAgentCatalog());
  const [senderDraft, setSenderDraft] = useState<ScscWeighPrintSettings>(defaultScscWeighPrintSettings());

  useEffect(() => {
    if (!open) return;
    const next = initial.map((e) => clampCustomerDirectoryEntry(e));
    setDraft(next);
    setSelectedId((prev) => (prev && next.some((e) => e.id === prev) ? prev : next[0]?.id ?? null));
    setQuery("");
    setGlobalAgentsDraft(clampGlobalAgentCatalog(globalAgentsInitial));
    setSenderDraft(clampScscWeighPrintSettings(scscWeighPrintSettingsInitial));
  }, [initial, globalAgentsInitial, scscWeighPrintSettingsInitial, open]);

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
        const removed = row.savedConsignees?.[index];
        const defaultConsigneeId =
          removed && row.defaultConsigneeId === removed.id ? undefined : row.defaultConsigneeId;
        return { ...row, savedConsignees: list, defaultConsigneeId };
      })
    );
  }

  function patchSavedShipper(customerId: string, index: number, patch: Partial<CustomerSavedShipper>) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const list = [...(row.savedShippers ?? [])];
        const cur = list[index];
        if (!cur) return row;
        list[index] = { ...cur, ...patch };
        return { ...row, savedShippers: list };
      })
    );
  }

  function removeSavedShipper(customerId: string, index: number) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const list = (row.savedShippers ?? []).filter((_, i) => i !== index);
        const removed = row.savedShippers?.[index];
        const defaultShipperId =
          removed && row.defaultShipperId === removed.id ? undefined : row.defaultShipperId;
        return { ...row, savedShippers: list, defaultShipperId };
      })
    );
  }

  function addSavedShipper(customerId: string) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        return { ...row, savedShippers: [...(row.savedShippers ?? []), emptyCustomerSavedShipper()] };
      })
    );
  }

  function patchSavedGoods(customerId: string, index: number, patch: Partial<CustomerSavedGoods>) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const list = [...(row.savedGoods ?? [])];
        const cur = list[index];
        if (!cur) return row;
        list[index] = { ...cur, ...patch };
        return { ...row, savedGoods: list };
      })
    );
  }

  function removeSavedGoods(customerId: string, index: number) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const list = (row.savedGoods ?? []).filter((_, i) => i !== index);
        const removed = row.savedGoods?.[index];
        const defaultGoodsId = removed && row.defaultGoodsId === removed.id ? undefined : row.defaultGoodsId;
        return { ...row, savedGoods: list, defaultGoodsId };
      })
    );
  }

  function addSavedGoods(customerId: string) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        return { ...row, savedGoods: [...(row.savedGoods ?? []), emptyCustomerSavedGoods()] };
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
      await onSave({
        customers: normalized,
        globalAgents: clampGlobalAgentCatalog(globalAgentsDraft),
        scscWeighPrintSettings: clampScscWeighPrintSettings(senderDraft),
      });
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
                  {customer.code || "CHƯA CÓ MÃ"} · {(customer.savedShippers ?? []).length} shipper ·{" "}
                  {(customer.savedGoods ?? []).length} tên hàng · {(customer.savedConsignees ?? []).length} CNEE
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
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMainTab("profiles")}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  mainTab === "profiles"
                    ? "bg-apple-label text-white"
                    : "border border-black/[0.12] bg-white text-apple-label"
                }`}
              >
                Hồ sơ in theo khách
              </button>
              <button
                type="button"
                onClick={() => setMainTab("agents")}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  mainTab === "agents"
                    ? "bg-apple-label text-white"
                    : "border border-black/[0.12] bg-white text-apple-label"
                }`}
              >
                Agent hệ thống
              </button>
            </div>

            {mainTab === "agents" ? (
              <div className="space-y-4">
                <GlobalAgentsSettings catalog={globalAgentsDraft} onChange={setGlobalAgentsDraft} />
                <ScscWeighSenderSettings settings={senderDraft} onChange={setSenderDraft} />
              </div>
            ) : selected ? (
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

                <CustomerPrintProfileTabs
                  entry={selected}
                  onPatch={(patch) => updateCustomer(selected.id, patch)}
                  onPatchShipper={(idx, patch) => patchSavedShipper(selected.id, idx, patch)}
                  onRemoveShipper={(idx) => removeSavedShipper(selected.id, idx)}
                  onAddShipper={() => addSavedShipper(selected.id)}
                  onPatchConsignee={(idx, patch) => patchSavedConsignee(selected.id, idx, patch)}
                  onRemoveConsignee={(idx) => removeSavedConsignee(selected.id, idx)}
                  onAddConsignee={() => addSavedConsignee(selected.id)}
                  onPatchGoods={(idx, patch) => patchSavedGoods(selected.id, idx, patch)}
                  onRemoveGoods={(idx) => removeSavedGoods(selected.id, idx)}
                  onAddGoods={() => addSavedGoods(selected.id)}
                />
              </div>
            ) : (
              <div className="flex h-full min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-black/[0.12] bg-apple-bg/50 p-8 text-center text-sm text-apple-tertiary">
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
