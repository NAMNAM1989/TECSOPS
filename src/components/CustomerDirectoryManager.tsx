import { useCallback, useEffect, useMemo, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { assertCustomerDirectoryValid } from "../utils/customerDirectoryCore";
import type { CustomerSavedConsignee, CustomerSavedGoods, CustomerSavedShipper, CustomerSavedVehicle } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import { GlobalAgentsSettings } from "./GlobalAgentsSettings";
import { ScscWeighSenderSettings } from "./ScscWeighSenderSettings";
import { CustomerPrintProfileTabs } from "./customerDirectory/CustomerPrintProfileTabs";
import { CustomerProfileStickyActionBar } from "./customerDirectory/CustomerProfileStickyActionBar";
import { CustomerDeleteConfirmModal } from "./customerDirectory/CustomerDeleteConfirmModal";
import { clampGlobalAgentCatalog, defaultGlobalAgentCatalog } from "../utils/globalAgentsCore";
import {
  clampCustomerDirectoryEntry,
  emptyCustomerProfileRow,
  emptyCustomerSavedConsignee,
  emptyCustomerSavedGoods,
  emptyCustomerSavedShipper,
  emptyCustomerSavedVehicle,
} from "../utils/customerDirectoryProfile";
import {
  clampScscWeighPrintSettings,
  defaultScscWeighPrintSettings,
} from "../printing/scscWeigh/scscWeighPrintSettingsCore";
import { ScscPrintTemplateEditor } from "../printing/components/ScscPrintTemplateEditor";
import { normalizeAgentCode } from "../utils/customerProfileInputFormat";

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
  const [mainTab, setMainTab] = useState<"profiles" | "agents" | "print-layout">("profiles");
  const [globalAgentsDraft, setGlobalAgentsDraft] = useState<GlobalAgentCatalog>(defaultGlobalAgentCatalog());
  const [senderDraft, setSenderDraft] = useState<ScscWeighPrintSettings>(defaultScscWeighPrintSettings());
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = initial.map((e) => clampCustomerDirectoryEntry(e));
    setDraft(next);
    setSelectedId((prev) => (prev && next.some((e) => e.id === prev) ? prev : next[0]?.id ?? null));
    setQuery("");
    setGlobalAgentsDraft(clampGlobalAgentCatalog(globalAgentsInitial));
    setSenderDraft(clampScscWeighPrintSettings(scscWeighPrintSettingsInitial));
    setDeleteModalOpen(false);
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

  function patchSavedVehicle(customerId: string, index: number, patch: Partial<CustomerSavedVehicle>) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const list = [...(row.savedVehicles ?? [])];
        const cur = list[index];
        if (!cur) return row;
        list[index] = { ...cur, ...patch };
        return { ...row, savedVehicles: list };
      })
    );
  }

  function removeSavedVehicle(customerId: string, index: number) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const list = (row.savedVehicles ?? []).filter((_, i) => i !== index);
        const removed = row.savedVehicles?.[index];
        const defaultVehicleId =
          removed && row.defaultVehicleId === removed.id ? undefined : row.defaultVehicleId;
        return { ...row, savedVehicles: list, defaultVehicleId };
      })
    );
  }

  function addSavedVehicle(customerId: string) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        return { ...row, savedVehicles: [...(row.savedVehicles ?? []), emptyCustomerSavedVehicle()] };
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

  const handleSave = useCallback(async () => {
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
  }, [draft, globalAgentsDraft, onClose, onSave, senderDraft]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleSave]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex bg-black/25 p-1 backdrop-blur-sm sm:p-2"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-manager-title"
    >
      <div className="mx-auto flex h-full w-full max-w-7xl overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-apple-md">
        <aside className="flex w-[min(100%,15rem)] shrink-0 flex-col border-r border-black/[0.08] bg-apple-bg/80 sm:w-56">
          <div className="border-b border-black/[0.06] px-2.5 py-2">
            <h2 id="customer-manager-title" className="text-sm font-semibold tracking-tight text-apple-label">
              Khách hàng
            </h2>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã / tên…"
              className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs font-medium text-apple-label outline-none focus:border-apple-blue/40 focus:ring-1 focus:ring-apple-blue/20"
            />
            <button
              type="button"
              onClick={addCustomer}
              className="mt-1.5 w-full rounded-lg bg-apple-blue px-2 py-1.5 text-xs font-semibold text-white hover:bg-apple-blue-hover"
            >
              + Thêm khách
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {filtered.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => setSelectedId(customer.id)}
                className={`mb-0.5 w-full rounded-lg px-2 py-1.5 text-left transition ${
                  selectedId === customer.id
                    ? "bg-white text-apple-label shadow-sm ring-1 ring-apple-blue/25"
                    : "text-apple-secondary hover:bg-white/80"
                }`}
              >
                <span className="block truncate text-xs font-semibold">{customer.name || "Chưa đặt tên"}</span>
                <span className="mt-0.5 block truncate font-mono text-[10px] uppercase text-apple-tertiary">
                  {customer.code || "—"} · S{customer.savedShippers?.length ?? 0} · C
                  {customer.savedConsignees?.length ?? 0} · V{customer.savedVehicles?.length ?? 0}
                </span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-apple-tertiary">Không tìm thấy.</p>
            ) : null}
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] px-3 py-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-apple-label">
                {selected ? selected.name || "Khách mới" : "Chi tiết hồ sơ"}
              </h3>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              {(
                [
                  ["profiles", "Hồ sơ KH"],
                  ["agents", "Agent"],
                  ["print-layout", "Mẫu in"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMainTab(id)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    mainTab === id ? "bg-apple-label text-white" : "border border-black/[0.1] bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-apple-tertiary hover:bg-black/[0.05]"
              aria-label="Đóng"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-1">
            {mainTab === "print-layout" ? (
              <div className="space-y-3 py-1">
                <p className="text-xs text-apple-secondary">
                  Chỉnh tọa độ mm phiếu cân SCSC — lưu Postgres, in PDF server.
                </p>
                <button
                  type="button"
                  onClick={() => setTemplateEditorOpen(true)}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Mở editor kéo thả
                </button>
              </div>
            ) : mainTab === "agents" ? (
              <div className="space-y-3 py-1">
                <GlobalAgentsSettings catalog={globalAgentsDraft} onChange={setGlobalAgentsDraft} />
                <ScscWeighSenderSettings settings={senderDraft} onChange={setSenderDraft} />
              </div>
            ) : selected ? (
              <div className="space-y-3">
                <section className="rounded-lg border border-black/[0.08] bg-apple-bg/30 px-2.5 py-2">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                    <input
                      value={selected.code}
                      onChange={(e) => updateCustomer(selected.id, { code: e.target.value.toUpperCase() })}
                      onBlur={(e) => updateCustomer(selected.id, { code: normalizeAgentCode(e.target.value) })}
                      className="w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 font-mono text-xs font-bold uppercase text-apple-label focus:border-apple-blue focus:outline-none focus:ring-1 focus:ring-apple-blue/25 sm:max-w-[7rem]"
                      placeholder="MÃ KH"
                      spellCheck={false}
                    />
                    <input
                      value={selected.name}
                      onChange={(e) => updateCustomer(selected.id, { name: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-1 focus:ring-apple-blue/25"
                      placeholder="Tên khách hàng"
                    />
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
                  onPatchVehicle={(idx, patch) => patchSavedVehicle(selected.id, idx, patch)}
                  onRemoveVehicle={(idx) => removeSavedVehicle(selected.id, idx)}
                  onAddVehicle={() => addSavedVehicle(selected.id)}
                />
              </div>
            ) : (
              <div className="flex min-h-[10rem] items-center justify-center rounded-lg border border-dashed border-black/[0.1] p-6 text-center text-xs text-apple-tertiary">
                Chọn khách bên trái hoặc thêm mới.
              </div>
            )}
          </div>

          <CustomerProfileStickyActionBar
            saving={saving}
            onSave={() => void handleSave()}
            onCancel={onClose}
            deleteLabel="Xóa khách"
            onDelete={
              selected && mainTab === "profiles"
                ? () => setDeleteModalOpen(true)
                : undefined
            }
          />
        </main>
      </div>

      <CustomerDeleteConfirmModal
        open={deleteModalOpen && Boolean(selected)}
        customerName={selected?.name ?? ""}
        customerCode={selected?.code ?? ""}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={() => {
          if (selected) removeCustomer(selected.id);
          setDeleteModalOpen(false);
        }}
      />
      <ScscPrintTemplateEditor open={templateEditorOpen} onClose={() => setTemplateEditorOpen(false)} />
    </div>
  );
}
