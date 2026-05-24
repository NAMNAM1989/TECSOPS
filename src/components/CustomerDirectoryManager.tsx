import { useCallback, useEffect, useMemo, useState } from "react";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { assertCustomerDirectoryValid } from "../utils/customerDirectoryCore";
import type {
  CustomerFieldError,
  CustomerProfileSection,
} from "../utils/customerDirectoryValidation";
import {
  filterValidationErrorsForSection,
  normalizeCustomerEntryForSave,
  validateCustomerDirectory,
  validateCustomerEntrySection,
} from "../utils/customerDirectoryValidation";
import type { CustomerSavedConsignee, CustomerSavedGoods, CustomerSavedShipper, CustomerSavedVehicle } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import type { ScscWeighPrintSettings } from "../types/scscWeighPrintSettings";
import { GlobalAgentsSettings } from "./GlobalAgentsSettings";
import { ScscWeighSenderSettings } from "./ScscWeighSenderSettings";
import { CustomerSavedProfilesEditor } from "./customerDirectory/CustomerSavedProfilesEditor";
import { CustomerProfileStickyActionBar } from "./customerDirectory/CustomerProfileStickyActionBar";
import { CustomerSectionSaveButton } from "./customerDirectory/CustomerSectionSaveButton";
import { FieldErrorText, fieldInputClass } from "./customerDirectory/CustomerValidationField";
import { getFieldValidationError } from "../utils/customerDirectoryValidation";
import { CustomerDeleteConfirmModal } from "./customerDirectory/CustomerDeleteConfirmModal";
import { clampGlobalAgentCatalog, defaultGlobalAgentCatalog } from "../utils/globalAgentsCore";
import {
  clampCustomerDirectoryEntry,
  emptyCustomerSavedConsignee,
  emptyCustomerSavedGoods,
  emptyCustomerSavedShipper,
  emptyCustomerSavedVehicle,
} from "../utils/customerDirectoryProfile";
import {
  ensureCustomerEditScaffold,
  scaffoldNewCustomer,
  withNewDefault,
} from "../utils/customerDirectoryScaffold";
import {
  clampScscWeighPrintSettings,
  defaultScscWeighPrintSettings,
} from "../printing/scscWeigh/scscWeighPrintSettingsCore";
import { normalizeAgentCode } from "../utils/customerProfileInputFormat";
import { normalizeCustomerNameInput, customerNameWhileTyping } from "../utils/customerShipmentPatch";
import { UnmatchedCustomerReportModal } from "./UnmatchedCustomerReportModal";
import type { UnmatchedCustomerRow } from "../utils/fetchAppStateRows";
import { CD } from "./customerDirectory/customerDirectoryStyles";

type MainTab = "profiles" | "agents";

const MAIN_SECTIONS: { id: MainTab; label: string; hint: string }[] = [
  { id: "profiles", label: "Danh sách khách", hint: "Mã, tên, hồ sơ in" },
  { id: "agents", label: "Agent & SCSC", hint: "Agent toàn cục, người gửi in phiếu" },
];

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
  /** Áp dụng gợi ý map customer_id cho lô trên dashboard. */
  onApplyUnmatchedShipments?: (
    rows: UnmatchedCustomerRow[]
  ) => Promise<{ updated: number; failed: number }>;
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
  onApplyUnmatchedShipments,
}: Props) {
  const [draft, setDraft] = useState<CustomerDirectoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<CustomerFieldError[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>("profiles");
  const [globalAgentsDraft, setGlobalAgentsDraft] = useState<GlobalAgentCatalog>(defaultGlobalAgentCatalog());
  const [senderDraft, setSenderDraft] = useState<ScscWeighPrintSettings>(defaultScscWeighPrintSettings());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = initial.map((e) => clampCustomerDirectoryEntry(e));
    setDraft(next);
    setSelectedId((prev) => (prev && next.some((e) => e.id === prev) ? prev : next[0]?.id ?? null));
    setQuery("");
    setGlobalAgentsDraft(clampGlobalAgentCatalog(globalAgentsInitial));
    setSenderDraft(clampScscWeighPrintSettings(scscWeighPrintSettingsInitial));
    setDeleteModalOpen(false);
    setSavedSection(null);
    setValidationErrors([]);
  }, [initial, globalAgentsInitial, scscWeighPrintSettingsInitial, open]);

  const selected = draft.find((e) => e.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return draft;
    return draft.filter((e) => e.code.toLowerCase().includes(needle) || e.name.toLowerCase().includes(needle));
  }, [draft, query]);

  function selectCustomer(id: string) {
    setSelectedId(id);
    setValidationErrors([]);
    setDraft((rows) => rows.map((row) => (row.id === id ? ensureCustomerEditScaffold(row) : row)));
  }

  function updateCustomer(
    id: string,
    patch: Partial<Omit<CustomerDirectoryEntry, "id" | "parties">>
  ) {
    setValidationErrors([]);
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
        const shipper = emptyCustomerSavedShipper();
        const { list, defaultId } = withNewDefault(row.savedShippers ?? [], shipper, row.defaultShipperId);
        return { ...row, savedShippers: list, defaultShipperId: defaultId };
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
        const item = emptyCustomerSavedGoods();
        const { list, defaultId } = withNewDefault(row.savedGoods ?? [], item, row.defaultGoodsId);
        return { ...row, savedGoods: list, defaultGoodsId: defaultId };
      })
    );
  }

  function addSavedConsignee(customerId: string) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const item = emptyCustomerSavedConsignee();
        const { list, defaultId } = withNewDefault(row.savedConsignees ?? [], item, row.defaultConsigneeId);
        return { ...row, savedConsignees: list, defaultConsigneeId: defaultId };
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
        const item = emptyCustomerSavedVehicle();
        const { list, defaultId } = withNewDefault(row.savedVehicles ?? [], item, row.defaultVehicleId);
        return { ...row, savedVehicles: list, defaultVehicleId: defaultId };
      })
    );
  }

  function addCustomer() {
    const row = scaffoldNewCustomer(newId("customer"));
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

  const persistDraft = useCallback(
    async (opts?: { close?: boolean; flashKey?: string }) => {
      const sectionKey = opts?.flashKey as CustomerProfileSection | undefined;
      let nextDraft = draft;

      if (selectedId && sectionKey) {
        const current = draft.find((e) => e.id === selectedId);
        if (current) {
          const check = validateCustomerEntrySection(current, sectionKey, draft);
          if (!check.valid) {
            setValidationErrors(filterValidationErrorsForSection(check.errors, sectionKey));
            return;
          }
          const normalizedOne = normalizeCustomerEntryForSave(current);
          nextDraft = draft.map((e) => (e.id === selectedId ? normalizedOne : e));
          setDraft(nextDraft);
          setValidationErrors([]);
        }
      } else {
        const check = validateCustomerDirectory(draft);
        if (!check.valid) {
          setValidationErrors(check.errors);
          window.alert(check.summary);
          return;
        }
        nextDraft = draft.map((e) => normalizeCustomerEntryForSave(e));
        setDraft(nextDraft);
        setValidationErrors([]);
      }

      const normalized = nextDraft.map((e) => clampCustomerDirectoryEntry(e));
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
        if (opts?.flashKey) {
          setSavedSection(opts.flashKey);
          window.setTimeout(() => setSavedSection(null), 2000);
        }
        if (opts?.close) onClose();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Không lưu được.");
      } finally {
        setSaving(false);
      }
    },
    [draft, globalAgentsDraft, onClose, onSave, selectedId, senderDraft]
  );

  const handleSave = useCallback(() => void persistDraft({ close: true }), [persistDraft]);

  const handleSaveSection = useCallback(
    (key: string) => () => void persistDraft({ flashKey: key }),
    [persistDraft]
  );

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

  const mainTitle =
    mainTab === "agents"
      ? "Agent & người gửi SCSC"
      : selected
        ? selected.name || "Khách mới"
        : "Chọn khách hàng";

  const mainSubtitle = MAIN_SECTIONS.find((s) => s.id === mainTab)?.hint ?? "";

  return (
    <div
      className="fixed inset-0 z-[60] flex bg-black/25 p-1 backdrop-blur-sm dark:bg-black/45 sm:p-2"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-manager-title"
    >
      <div className={`mx-auto flex h-full w-full max-w-7xl overflow-hidden rounded-2xl border shadow-apple-md dark:border-white/10 ${CD.modal}`}>
        <aside className={`flex w-[min(100%,16rem)] shrink-0 flex-col border-r sm:w-60 ${CD.aside}`}>
          <div className={`border-b px-2.5 py-2.5 ${CD.border}`}>
            <h2 id="customer-manager-title" className={`text-sm font-semibold tracking-tight ${CD.title}`}>
              Khách hàng & Cài đặt
            </h2>
            <p className={`mt-0.5 text-[10px] leading-snug ${CD.muted}`}>
              Hồ sơ in & agent SCSC
            </p>
          </div>

          <nav className="space-y-0.5 p-1.5" aria-label="Khu vực cài đặt">
            {MAIN_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setMainTab(section.id)}
                className={`w-full rounded-lg px-2.5 py-2 text-left transition ${
                  mainTab === section.id ? CD.navActive : CD.navIdle
                }`}
              >
                <span className={`block text-xs font-semibold ${CD.title}`}>
                  {section.label}
                </span>
                <span className={`mt-0.5 block text-[10px] leading-snug ${CD.muted}`}>
                  {section.hint}
                </span>
              </button>
            ))}
          </nav>

          {mainTab === "profiles" ? (
            <>
              <div className={`border-t px-2.5 py-2 ${CD.border}`}>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm mã / tên…"
                  className={`w-full text-xs font-medium ${CD.input}`}
                />
                <button
                  type="button"
                  onClick={addCustomer}
                  className="mt-1.5 w-full rounded-lg bg-apple-blue px-2 py-1.5 text-xs font-semibold text-white hover:bg-apple-blue-hover"
                >
                  + Thêm khách
                </button>
                {onApplyUnmatchedShipments ? (
                  <button
                    type="button"
                    onClick={() => setUnmatchedOpen(true)}
                    className="mt-1.5 w-full rounded-lg border border-amber-300/60 bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200"
                  >
                    Lô chưa map khách…
                  </button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {filtered.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => selectCustomer(customer.id)}
                    className={`mb-0.5 w-full rounded-lg px-2 py-1.5 text-left transition ${
                      selectedId === customer.id ? CD.listActive : CD.listIdle
                    }`}
                  >
                    <span className={`block truncate text-xs font-semibold ${CD.title}`}>
                      {normalizeCustomerNameInput(customer.name) || "Chưa đặt tên"}
                    </span>
                    <span className={`mt-0.5 block truncate font-mono text-[10px] uppercase ${CD.muted}`}>
                      {customer.code || "—"}
                    </span>
                  </button>
                ))}
                {filtered.length === 0 ? (
                  <p className={`px-2 py-4 text-center text-xs ${CD.muted}`}>
                    Không tìm thấy.
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className={`border-t px-3 py-4 text-[10px] leading-snug ${CD.border} ${CD.muted}`}>
              Chọn mục bên trên để chỉnh cài đặt chung — không gắn với từng khách.
            </p>
          )}
        </aside>

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className={`flex shrink-0 items-start justify-between gap-3 border-b px-3 py-2.5 ${CD.border}`}>
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${CD.muted}`}>
                {MAIN_SECTIONS.find((s) => s.id === mainTab)?.label}
              </p>
              <h3 className={`truncate text-base font-semibold ${CD.title}`}>
                {mainTitle}
              </h3>
              {mainSubtitle ? (
                <p className={`mt-0.5 text-[11px] ${CD.secondary}`}>{mainSubtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`shrink-0 rounded-lg p-1.5 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] ${CD.muted}`}
              aria-label="Đóng"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {mainTab === "agents" ? (
              <div className="mx-auto max-w-3xl space-y-4 py-1">
                <GlobalAgentsSettings catalog={globalAgentsDraft} onChange={setGlobalAgentsDraft} />
                <ScscWeighSenderSettings settings={senderDraft} onChange={setSenderDraft} />
              </div>
            ) : selected ? (
              <div className="mx-auto max-w-4xl space-y-2.5">
                <section className={`rounded-lg border px-2.5 py-2 ${CD.card}`}>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className={`text-[10px] font-bold uppercase ${CD.muted}`}>Mã & tên</p>
                    <CustomerSectionSaveButton
                      compact
                      saving={saving}
                      saved={savedSection === "identity"}
                      onSave={handleSaveSection("identity")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                    <div className="w-full sm:max-w-[6rem]">
                      <input
                        value={selected.code}
                        onChange={(e) => updateCustomer(selected.id, { code: e.target.value.toUpperCase() })}
                        onBlur={(e) => updateCustomer(selected.id, { code: normalizeAgentCode(e.target.value) })}
                        className={`w-full font-mono text-xs font-bold uppercase ${fieldInputClass(
                          Boolean(getFieldValidationError(validationErrors, "identity", "code"))
                        )}`}
                        placeholder="Mã"
                        spellCheck={false}
                      />
                      <FieldErrorText message={getFieldValidationError(validationErrors, "identity", "code")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        value={selected.name}
                        onChange={(e) => updateCustomer(selected.id, { name: customerNameWhileTyping(e.target.value) })}
                        onBlur={() =>
                          updateCustomer(selected.id, { name: normalizeCustomerNameInput(selected.name) })
                        }
                        className={`w-full text-sm font-semibold uppercase ${fieldInputClass(
                          Boolean(getFieldValidationError(validationErrors, "identity", "name"))
                        )}`}
                        placeholder="Tên công ty / đại lý"
                      />
                      <FieldErrorText message={getFieldValidationError(validationErrors, "identity", "name")} />
                    </div>
                  </div>
                </section>

                <CustomerSavedProfilesEditor
                  entry={selected}
                  errors={validationErrors}
                  onEdit={() => setValidationErrors([])}
                  saving={saving}
                  savedSection={savedSection}
                  onSaveSection={(key) => void persistDraft({ flashKey: key })}
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
              <div className={`flex min-h-[12rem] flex-col items-center justify-center gap-2 p-8 text-center ${CD.empty}`}>
                <p className={`text-sm font-semibold ${CD.title}`}>
                  Chưa chọn khách
                </p>
                <p className={`max-w-xs text-xs ${CD.muted}`}>
                  Chọn một dòng bên trái hoặc bấm « + Thêm khách » để bắt đầu.
                </p>
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
      {onApplyUnmatchedShipments ? (
        <UnmatchedCustomerReportModal
          open={unmatchedOpen}
          onClose={() => setUnmatchedOpen(false)}
          onApplySuggestions={onApplyUnmatchedShipments}
        />
      ) : null}
    </div>
  );
}
