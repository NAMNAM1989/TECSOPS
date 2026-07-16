import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomerDirectoryEntry, CustomerType } from "../types/customerDirectory";
import { CUSTOMER_TYPES } from "../types/customerDirectory";
import { assertCustomerDirectoryValid } from "../utils/customerDirectoryCore";
import type { CustomerFieldError } from "../utils/customerDirectoryValidation";
import {
  normalizeCustomerEntryForSave,
  validateCustomerDirectory,
} from "../utils/customerDirectoryValidation";
import type {
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
  CustomerSavedVehicle,
} from "../types/customerDirectory";
import { CustomerSavedProfilesEditor } from "../components/customerDirectory/CustomerSavedProfilesEditor";
import { CustomerDeleteConfirmModal } from "../components/customerDirectory/CustomerDeleteConfirmModal";
import {
  clampCustomerDirectoryEntry,
  customerDirectoryListCode,
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
import { formatVnPhoneDisplay, normalizeAgentCode } from "../utils/customerProfileInputFormat";
import { normalizeCustomerNameInput, customerNameWhileTyping } from "../utils/customerShipmentPatch";
import { normalizeCustomerShortCode } from "../utils/customerCodeOps";
import {
  formatDefaultRate,
  normalizeCustomerType,
  parseDefaultRate,
} from "../utils/customerAccountFields";
import {
  applyCustomsOpsImport,
  CUSTOMS_OPS_TEMPLATE_URL,
  downloadCustomsOpsExport,
  parseCustomsOpsWorkbook,
} from "../utils/customerCustomsOpsExcel";
import type { SyncStatus } from "../hooks/useShipmentSync";

type Props = {
  initial: readonly CustomerDirectoryEntry[];
  ready: boolean;
  syncStatus: SyncStatus;
  socketConnected: boolean;
  onSave: (customers: CustomerDirectoryEntry[]) => Promise<void>;
  onBack: () => void;
};

type TypeFilter = "ALL" | CustomerType;

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultShipper(entry: CustomerDirectoryEntry): CustomerSavedShipper | undefined {
  const list = entry.savedShippers ?? [];
  if (!list.length) return undefined;
  return list.find((s) => s.id === entry.defaultShipperId) ?? list[0];
}

/** Liên hệ account — ưu tiên field account (kể cả ""), chỉ fallback khi chưa có. */
function contactOf(entry: CustomerDirectoryEntry) {
  const s = defaultShipper(entry);
  return {
    phone: (entry.phone !== undefined ? entry.phone : s?.shipperPhone ?? "").trim(),
    email: (entry.email !== undefined ? entry.email : s?.shipperEmail ?? "").trim(),
    taxCode: (entry.taxCode !== undefined ? entry.taxCode : s?.taxCode ?? "").trim(),
    address: (entry.address !== undefined ? entry.address : s?.shipperAddress ?? "").trim(),
  };
}

/** Hydrate: đổ SĐT/email/MST/địa chỉ từ shipper mặc định lên account nếu account trống. */
function liftContactFromDefaultShipper(entry: CustomerDirectoryEntry): CustomerDirectoryEntry {
  const s = defaultShipper(entry);
  if (!s) return entry;
  return {
    ...entry,
    phone: entry.phone?.trim() || s.shipperPhone?.trim() || undefined,
    email: entry.email?.trim() || s.shipperEmail?.trim() || undefined,
    taxCode: entry.taxCode?.trim() || s.taxCode?.trim() || undefined,
    address: entry.address?.trim() || s.shipperAddress?.trim() || undefined,
  };
}

/** Đồng bộ Phone/MST/Email/Address account → shipper mặc định (một nguồn sự thật). */
function withSyncedDefaultShipper(entry: CustomerDirectoryEntry): CustomerDirectoryEntry {
  const shippers = [...(entry.savedShippers ?? [])];
  if (!shippers.length) return entry;
  const idx = Math.max(
    0,
    shippers.findIndex((s) => s.id === entry.defaultShipperId)
  );
  const cur = shippers[idx];
  if (!cur) return entry;
  shippers[idx] = {
    ...cur,
    shipperName: cur.shipperName.trim() || entry.name,
    // undefined = giữ shipper; "" = xóa theo account (tránh lệch 2 ô SĐT)
    shipperPhone: entry.phone !== undefined ? entry.phone.trim() : cur.shipperPhone,
    shipperEmail: entry.email !== undefined ? entry.email.trim() : cur.shipperEmail,
    shipperAddress: entry.address !== undefined ? entry.address.trim() : cur.shipperAddress,
    taxCode: entry.taxCode !== undefined ? entry.taxCode.trim() : cur.taxCode,
  };
  return { ...entry, savedShippers: shippers };
}

function profileBadge(c: CustomerDirectoryEntry): string {
  const n =
    (c.savedShippers?.length ?? 0) +
    (c.savedConsignees?.length ?? 0) +
    (c.savedGoods?.length ?? 0) +
    (c.savedVehicles?.length ?? 0);
  return n > 0 ? `${n} HS` : "";
}

function typeLabel(t: CustomerType | undefined): string {
  const v = t ?? "DIRECT_SHIPPER";
  if (v === "DIRECT_SHIPPER") return "Direct";
  if (v === "FORWARDER") return "Forwarder";
  if (v === "AGENT") return "Agent";
  return "Other";
}

export function CustomersPage({
  initial,
  ready,
  syncStatus,
  socketConnected,
  onSave,
  onBack,
}: Props) {
  const [draft, setDraft] = useState<CustomerDirectoryEntry[]>([]);
  const [baseline, setBaseline] = useState(() => JSON.stringify([]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<CustomerFieldError[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const syncFromInitial = useCallback((list: readonly CustomerDirectoryEntry[]) => {
    const next = list.map((e) =>
      clampCustomerDirectoryEntry(liftContactFromDefaultShipper(e))
    );
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setSelectedId((prev) => (prev && next.some((e) => e.id === prev) ? prev : next[0]?.id ?? null));
    setValidationErrors([]);
    setDeleteModalOpen(false);
  }, []);

  const dirty = useMemo(() => JSON.stringify(draft) !== baseline, [draft, baseline]);

  useEffect(() => {
    if (!ready) return;
    if (!hydrated) {
      syncFromInitial(initial);
      setHydrated(true);
      return;
    }
    if (dirty) return;
    syncFromInitial(initial);
  }, [ready, initial, syncFromInitial, dirty, hydrated]);

  const selected = draft.find((e) => e.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return draft.filter((e) => {
      if (typeFilter !== "ALL" && (e.customerType ?? "DIRECT_SHIPPER") !== typeFilter) {
        return false;
      }
      if (!needle) return true;
      const contact = contactOf(e);
      return [e.code, e.name, e.shortCode, contact.phone, contact.email, contact.taxCode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [draft, query, typeFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<TypeFilter, number> = {
      ALL: draft.length,
      DIRECT_SHIPPER: 0,
      FORWARDER: 0,
      AGENT: 0,
      OTHER: 0,
    };
    for (const e of draft) {
      const t = (e.customerType ?? "DIRECT_SHIPPER") as CustomerType;
      counts[t] += 1;
    }
    return counts;
  }, [draft]);

  function updateCustomer(
    id: string,
    patch: Partial<Omit<CustomerDirectoryEntry, "id" | "parties">>
  ) {
    setValidationErrors([]);
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== id) return row;
        return withSyncedDefaultShipper({ ...row, ...patch });
      })
    );
  }

  function selectCustomer(id: string) {
    setSelectedId(id);
    setValidationErrors([]);
    setDraft((rows) => {
      const next = rows.map((row) => (row.id === id ? ensureCustomerEditScaffold(row) : row));
      const wasClean = JSON.stringify(rows) === baseline;
      if (wasClean) {
        queueMicrotask(() => setBaseline(JSON.stringify(next)));
      }
      return next;
    });
  }

  function addCustomer() {
    const row = withSyncedDefaultShipper({
      ...scaffoldNewCustomer(newId("customer")),
      customerType: "DIRECT_SHIPPER",
    });
    setDraft((rows) => [...rows, row]);
    setSelectedId(row.id);
    setQuery("");
    setTypeFilter("ALL");
    queueMicrotask(() => {
      nameInputRef.current?.focus();
      document
        .querySelector<HTMLElement>(`[data-customer-id="${row.id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  async function onImportFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const rows = await parseCustomsOpsWorkbook(buf);
      const result = applyCustomsOpsImport(draft, rows);
      setDraft(result.customers.map((e) => clampCustomerDirectoryEntry(e)));
      const errHint =
        result.errors.length > 0
          ? `\n${result.errors
              .slice(0, 5)
              .map((e) => `Dòng ${e.rowNumber}: ${e.message}`)
              .join("\n")}${result.errors.length > 5 ? `\n… +${result.errors.length - 5} lỗi` : ""}`
          : "";
      window.alert(
        `Import: tạo ${result.created}, cập nhật ${result.updated}, bỏ ${result.skipped}.${errHint}\nNhớ bấm Lưu.`
      );
      const last = result.customers[result.customers.length - 1];
      if (last) setSelectedId(last.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Không đọc được file Excel.");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  const persistDraft = useCallback(async () => {
    const synced = draft.map((e) => withSyncedDefaultShipper(e));
    const check = validateCustomerDirectory(synced);
    if (!check.valid) {
      setValidationErrors(check.errors);
      window.alert(check.summary);
      return false;
    }
    const nextDraft = synced.map((e) => normalizeCustomerEntryForSave(e, synced));
    const normalized = nextDraft.map((e) => clampCustomerDirectoryEntry(e));
    try {
      assertCustomerDirectoryValid(normalized);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Danh sách không hợp lệ.");
      return false;
    }
    setSaving(true);
    try {
      await onSave(normalized);
      setDraft(normalized);
      setBaseline(JSON.stringify(normalized));
      setValidationErrors([]);
      return true;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Không lưu được.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  const handleBack = useCallback(() => {
    if (dirty && !window.confirm("Có thay đổi chưa lưu. Rời trang và hủy?")) return;
    onBack();
  }, [dirty, onBack]);

  const handleDiscard = useCallback(() => {
    if (!dirty) return;
    if (!window.confirm("Hủy mọi thay đổi chưa lưu?")) return;
    syncFromInitial(initial);
  }, [dirty, initial, syncFromInitial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) void persistDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, persistDraft]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // —— profile patch helpers ——
  function patchSavedShipper(customerId: string, index: number, patch: Partial<CustomerSavedShipper>) {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== customerId) return row;
        const list = [...(row.savedShippers ?? [])];
        const cur = list[index];
        if (!cur) return row;
        list[index] = { ...cur, ...patch };
        let next: CustomerDirectoryEntry = { ...row, savedShippers: list };
        // Nếu sửa shipper mặc định → phản chiếu lên account contact
        const isDefault = (row.defaultShipperId ?? list[0]?.id) === list[index]?.id;
        if (isDefault) {
          next = {
            ...next,
            ...(patch.shipperPhone != null ? { phone: patch.shipperPhone } : {}),
            ...(patch.shipperEmail != null ? { email: patch.shipperEmail } : {}),
            ...(patch.shipperAddress != null ? { address: patch.shipperAddress } : {}),
            ...(patch.taxCode != null ? { taxCode: patch.taxCode } : {}),
          };
        }
        return next;
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

  const syncLabel =
    syncStatus === "offline"
      ? "Offline"
      : syncStatus === "degraded" || !socketConnected
        ? "Sync chậm"
        : "Live";

  const filterActive = query.trim().length > 0 || typeFilter !== "ALL";
  const countLabel = filterActive
    ? `${filtered.length} / ${draft.length} khách`
    : `${draft.length} khách`;

  if (!ready || !hydrated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#E8EEF4] text-slate-600 dark:bg-[#070B14] dark:text-slate-300">
        <p className="text-sm font-semibold">Đang tải danh bạ…</p>
      </div>
    );
  }

  const contact = selected ? contactOf(selected) : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#E8EEF4] text-slate-900 dark:bg-[#070B14] dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#E8EEF4]/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#070B14]/90">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
          >
            ← Ops
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">Khách hàng</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {countLabel} · {syncLabel}
              {dirty ? " · chưa lưu" : ""}
            </p>
          </div>
          <a
            href={CUSTOMS_OPS_TEMPLATE_URL}
            download="customer-import-template.xlsx"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
          >
            Mẫu
          </a>
          <button
            type="button"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
          >
            {importing ? "…" : "Import"}
          </button>
          <button
            type="button"
            onClick={() => void downloadCustomsOpsExport(draft)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
          >
            Export
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={handleDiscard}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void persistDraft()}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col overflow-hidden sm:flex-row">
        {/* LIST */}
        <aside className="flex max-h-[42vh] w-full shrink-0 flex-col border-b border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-slate-900/50 sm:max-h-none sm:w-[17.5rem] sm:border-b-0 sm:border-r lg:w-72">
          <div className="space-y-1.5 border-b border-slate-100 p-2.5 dark:border-white/10">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã / tên / SĐT…"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 dark:border-white/10 dark:bg-slate-950"
            />
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["ALL", "Tất cả"],
                  ["DIRECT_SHIPPER", "Direct"],
                  ["FORWARDER", "FWDR"],
                  ["AGENT", "Agent"],
                  ["OTHER", "Khác"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTypeFilter(id)}
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                    typeFilter === id
                      ? "bg-teal-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
                  }`}
                >
                  {label} {typeCounts[id]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={addCustomer}
              className="w-full rounded-lg bg-teal-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
            >
              + Thêm khách
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {filtered.map((c) => {
              const active = c.id === selectedId;
              const badge = profileBadge(c);
              const phone = contactOf(c).phone;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-customer-id={c.id}
                  onClick={() => selectCustomer(c.id)}
                  className={`mb-0.5 w-full rounded-lg px-2.5 py-2 text-left transition ${
                    active
                      ? "bg-teal-50 ring-1 ring-teal-500/35 dark:bg-teal-500/15 dark:ring-teal-400/40"
                      : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="block truncate text-xs font-semibold">
                    {normalizeCustomerNameInput(c.name) || "Chưa đặt tên"}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] uppercase text-slate-500">
                      {customerDirectoryListCode(c)}
                    </span>
                    <span className="rounded bg-slate-100 px-1 py-px text-[9px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {typeLabel(c.customerType)}
                    </span>
                    {badge ? (
                      <span className="text-[9px] font-medium text-teal-700 dark:text-teal-300">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                  {phone ? (
                    <span className="mt-0.5 block truncate text-[10px] tabular-nums text-slate-400">
                      {phone}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-slate-400">Không tìm thấy.</p>
            ) : null}
          </div>
        </aside>

        {/* DETAIL */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                <div className="mx-auto max-w-2xl space-y-3">
                  <section className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Tài khoản
                      </p>
                      <button
                        type="button"
                        onClick={() => setDeleteModalOpen(true)}
                        className="text-[10px] font-semibold text-red-600 hover:underline dark:text-red-300"
                      >
                        Xóa khách
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">
                          Customer Code
                        </span>
                        <input
                          value={selected.code}
                          onChange={(e) => updateCustomer(selected.id, { code: e.target.value.toUpperCase() })}
                          onBlur={(e) =>
                            updateCustomer(selected.id, { code: normalizeAgentCode(e.target.value) })
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs font-bold uppercase outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 dark:border-white/10 dark:bg-slate-950"
                          placeholder="GLO"
                          maxLength={40}
                          spellCheck={false}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">Short</span>
                        <input
                          value={selected.shortCode ?? ""}
                          onChange={(e) =>
                            updateCustomer(selected.id, {
                              shortCode: normalizeCustomerShortCode(e.target.value),
                            })
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs font-bold uppercase outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 dark:border-white/10 dark:bg-slate-950"
                          maxLength={10}
                          spellCheck={false}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">Loại</span>
                        <select
                          value={selected.customerType ?? "DIRECT_SHIPPER"}
                          onChange={(e) =>
                            updateCustomer(selected.id, {
                              customerType: normalizeCustomerType(e.target.value),
                            })
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 dark:border-white/10 dark:bg-slate-950"
                        >
                          {CUSTOMER_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {typeLabel(t)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="col-span-2 block sm:col-span-4">
                        <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">Tên khách</span>
                        <input
                          ref={nameInputRef}
                          value={selected.name}
                          onChange={(e) =>
                            updateCustomer(selected.id, { name: customerNameWhileTyping(e.target.value) })
                          }
                          onBlur={() =>
                            updateCustomer(selected.id, {
                              name: normalizeCustomerNameInput(selected.name),
                            })
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold uppercase outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 dark:border-white/10 dark:bg-slate-950"
                          placeholder="Tên công ty / đại lý"
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Liên hệ (đồng bộ người gửi mặc định)
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">SĐT</span>
                        <input
                          value={contact?.phone ?? ""}
                          onChange={(e) => updateCustomer(selected.id, { phone: e.target.value })}
                          onBlur={(e) =>
                            updateCustomer(selected.id, {
                              phone: formatVnPhoneDisplay(e.target.value),
                            })
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs tabular-nums outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 dark:border-white/10 dark:bg-slate-950"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">Email</span>
                        <input
                          value={contact?.email ?? ""}
                          onChange={(e) => updateCustomer(selected.id, { email: e.target.value.trim() })}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 dark:border-white/10 dark:bg-slate-950"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">MST</span>
                        <input
                          value={contact?.taxCode ?? ""}
                          onChange={(e) => updateCustomer(selected.id, { taxCode: e.target.value.trim() })}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 dark:border-white/10 dark:bg-slate-950"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">
                          Đơn giá (VND/kg)
                        </span>
                        <input
                          value={formatDefaultRate(selected.defaultRate)}
                          onChange={(e) =>
                            updateCustomer(selected.id, { defaultRate: parseDefaultRate(e.target.value) })
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 dark:border-white/10 dark:bg-slate-950"
                          inputMode="decimal"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">Địa chỉ</span>
                        <textarea
                          value={contact?.address ?? ""}
                          onChange={(e) => updateCustomer(selected.id, { address: e.target.value })}
                          rows={2}
                          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/25 dark:border-white/10 dark:bg-slate-950"
                        />
                      </label>
                    </div>
                  </section>

                  <CustomerSavedProfilesEditor
                    entry={selected}
                    errors={validationErrors}
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
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Chưa chọn khách</p>
              <p className="max-w-xs text-xs text-slate-400">
                Chọn một dòng bên trái hoặc bấm « + Thêm khách ».
              </p>
              <button
                type="button"
                onClick={addCustomer}
                className="mt-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-500"
              >
                + Thêm khách
              </button>
            </div>
          )}
        </main>
      </div>

      <CustomerDeleteConfirmModal
        open={deleteModalOpen && Boolean(selected)}
        customerName={selected?.name ?? ""}
        customerCode={selected?.code ?? ""}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={() => {
          if (!selected) return;
          const id = selected.id;
          const next = draft.filter((row) => row.id !== id);
          setDraft(next);
          setSelectedId(next[0]?.id ?? null);
          setDeleteModalOpen(false);
        }}
      />
    </div>
  );
}
