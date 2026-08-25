import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CustomerDirectoryEntry,
  CustomerType,
} from "../types/customerDirectory";
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
import { CustomerDefaultDataEditor } from "../components/customerDirectory/CustomerSavedProfilesEditor";
import { CustomerDeleteConfirmModal } from "../components/customerDirectory/CustomerDeleteConfirmModal";
import { CustomerEsidQuickFillModal } from "../components/customerDirectory/CustomerEsidQuickFillModal";
import {
  Banner,
  Button,
  ConfirmDialog,
  EmptyState,
  OverflowMenu,
  PageSkeleton,
  SyncStatusPill,
  useToast,
} from "../ui";
import { useIsMobile } from "../hooks/useIsMobile";
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
} from "../utils/customerDirectoryScaffold";
import {
  addCustomerSavedListItem,
  patchCustomerSavedListItem,
  removeCustomerSavedListItem,
} from "../utils/customerSavedListOps";
import { normalizeAgentCode } from "../utils/customerProfileInputFormat";
import {
  normalizeCustomerNameInput,
  customerNameWhileTyping,
} from "../utils/customerShipmentPatch";
import {
  normalizeCustomerShortCode,
  shortCodeWhileTyping,
} from "../utils/customerCodeOps";
import {
  formatDefaultRate,
  normalizeCustomerType,
  parseDefaultRate,
} from "../utils/customerAccountFields";
import {
  applyFullProfileImport,
  downloadCustomerFullProfileExport,
  downloadCustomerFullProfileTemplate,
  parseCustomerFullProfileWorkbook,
} from "../utils/customerFullProfileExcel";
import type { SyncStatus } from "../hooks/useShipmentSync";
import { formatSyncedPhrase, resolveCustomersSyncedAtMs } from "../utils/dbSyncedAt";

type Props = {
  initial: readonly CustomerDirectoryEntry[];
  ready: boolean;
  syncStatus: SyncStatus;
  socketConnected: boolean;
  /** max(ops_customers.synced_at) — không lấy lots. */
  customersMaxSyncedAt?: string | null;
  onSave: (customers: CustomerDirectoryEntry[]) => Promise<void>;
  onBack: () => void;
};

type TypeFilter = "ALL" | CustomerType;
type ProfileTab = "info" | "defaults";
type MobilePane = "list" | "detail";
type SaveStatus = "idle" | "saved" | "error";

const FIELD =
  "w-full min-h-11 touch-manipulation rounded-xl border border-ui-border/90 bg-ui-surface px-2.5 py-2 text-base text-ui-text shadow-ui-sm outline-none focus:border-ui-primary/50 focus:ring-2 focus:ring-ui-focus sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs";

function newId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultShipper(
  entry: CustomerDirectoryEntry,
): CustomerSavedShipper | undefined {
  const list = entry.savedShippers ?? [];
  if (!list.length) return undefined;
  return list.find((s) => s.id === entry.defaultShipperId) ?? list[0];
}

/** Liên hệ account — ưu tiên field account (kể cả""), chỉ fallback khi chưa có. */
function contactOf(entry: CustomerDirectoryEntry) {
  const s = defaultShipper(entry);
  return {
    phone: (entry.phone !== undefined
      ? entry.phone
      : (s?.shipperPhone ?? "")
    ).trim(),
    email: (entry.email !== undefined
      ? entry.email
      : (s?.shipperEmail ?? "")
    ).trim(),
    taxCode: (entry.taxCode !== undefined
      ? entry.taxCode
      : (s?.taxCode ?? "")
    ).trim(),
    address: (entry.address !== undefined
      ? entry.address
      : (s?.shipperAddress ?? "")
    ).trim(),
  };
}

/** Hydrate: đổ SĐT/email/MST/địa chỉ từ shipper mặc định lên account nếu account trống. */
function liftContactFromDefaultShipper(
  entry: CustomerDirectoryEntry,
): CustomerDirectoryEntry {
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
function withSyncedDefaultShipper(
  entry: CustomerDirectoryEntry,
): CustomerDirectoryEntry {
  const shippers = [...(entry.savedShippers ?? [])];
  if (!shippers.length) return entry;
  const idx = Math.max(
    0,
    shippers.findIndex((s) => s.id === entry.defaultShipperId),
  );
  const cur = shippers[idx];
  if (!cur) return entry;
  shippers[idx] = {
    ...cur,
    shipperName: cur.shipperName.trim() || entry.name,
    // undefined = giữ shipper;"" = xóa theo account (tránh lệch 2 ô SĐT)
    shipperPhone:
      entry.phone !== undefined ? entry.phone.trim() : cur.shipperPhone,
    shipperEmail:
      entry.email !== undefined ? entry.email.trim() : cur.shipperEmail,
    shipperAddress:
      entry.address !== undefined ? entry.address.trim() : cur.shipperAddress,
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
  customersMaxSyncedAt = null,
  onSave,
  onBack,
}: Props) {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<CustomerDirectoryEntry[]>([]);
  const [baseline, setBaseline] = useState(() => JSON.stringify([]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [profileTab, setProfileTab] = useState<ProfileTab>("info");
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");
  const [validationErrors, setValidationErrors] = useState<
    CustomerFieldError[]
  >([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [quickFillCustomer, setQuickFillCustomer] =
    useState<CustomerDirectoryEntry | null>(null);
  const [importing, setImporting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState<"back" | "discard" | null>(
    null,
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const detailTopRef = useRef<HTMLDivElement>(null);

  const syncFromInitial = useCallback(
    (list: readonly CustomerDirectoryEntry[]) => {
      const next = list.map((e) =>
        clampCustomerDirectoryEntry(liftContactFromDefaultShipper(e)),
      );
      setDraft(next);
      setBaseline(JSON.stringify(next));
      setSelectedId((prev) =>
        prev && next.some((e) => e.id === prev) ? prev : (next[0]?.id ?? null),
      );
      setValidationErrors([]);
      setDeleteModalOpen(false);
    },
    [],
  );

  const dirty = useMemo(
    () => JSON.stringify(draft) !== baseline,
    [draft, baseline],
  );

  /** Chỉ ops_customers — ẩn nếu thiếu/null, không trộn lots. */
  const customersSyncPhrase = useMemo(() => {
    const at = resolveCustomersSyncedAtMs({
      customers: initial,
      customersMaxSyncedAt,
    });
    return formatSyncedPhrase(at);
  }, [initial, customersMaxSyncedAt]);

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
      if (
        typeFilter !== "ALL" &&
        (e.customerType ?? "DIRECT_SHIPPER") !== typeFilter
      ) {
        return false;
      }
      if (!needle) return true;
      const contact = contactOf(e);
      return [
        e.code,
        e.name,
        e.shortCode,
        contact.phone,
        contact.email,
        contact.taxCode,
      ]
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
    patch: Partial<Omit<CustomerDirectoryEntry, "id" | "parties">>,
  ) {
    setValidationErrors([]);
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== id) return row;
        return withSyncedDefaultShipper({ ...row, ...patch });
      }),
    );
  }

  function selectCustomer(id: string) {
    if (id === selectedId) {
      if (isMobile) setMobilePane("detail");
      return;
    }
    if (
      dirty &&
      !window.confirm("Có thay đổi chưa lưu. Đổi khách sẽ hủy thay đổi?")
    ) {
      return;
    }
    setSelectedId(id);
    setValidationErrors([]);
    setSaveStatus("idle");
    setProfileTab("info");
    if (isMobile) setMobilePane("detail");
    setDraft((rows) => {
      const source = dirty
        ? initial.map((e) =>
            clampCustomerDirectoryEntry(liftContactFromDefaultShipper(e)),
          )
        : rows;
      const next = source.map((row) =>
        row.id === id ? ensureCustomerEditScaffold(row) : row,
      );
      queueMicrotask(() => setBaseline(JSON.stringify(next)));
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
    setProfileTab("info");
    setSaveStatus("idle");
    if (isMobile) setMobilePane("detail");
    queueMicrotask(() => {
      nameInputRef.current?.focus();
      document
        .querySelector<HTMLElement>(`[data-customer-id="${row.id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function focusFirstValidationError(errors: CustomerFieldError[]) {
    const first = errors.find((e) => e.field !== "_section") ?? errors[0];
    if (!first) return;
    if (first.section === "identity") setProfileTab("info");
    else setProfileTab("defaults");
    queueMicrotask(() => {
      const el =
        document.querySelector<HTMLElement>("[data-customer-invalid='true']") ??
        nameInputRef.current;
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  async function onImportFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const fullResult = await parseCustomerFullProfileWorkbook(buf);
      if (fullResult.customerCount <= 0) {
        throw new Error(
          "Không có dòng dữ liệu hợp lệ. Dùng đúng mẫu Hồ sơ KH (nút Mẫu).",
        );
      }
      const result = applyFullProfileImport(draft, fullResult.customers);
      setDraft(result.customers.map((e) => clampCustomerDirectoryEntry(e)));
      toast.success(
        `Tạo ${result.created}, cập nhật ${result.updated}. Bấm Lưu để ghi lên server.`,
        "Import Hồ sơ KH",
      );
      const last = result.customers[result.customers.length - 1];
      if (last) {
        setSelectedId(last.id);
        if (isMobile) setMobilePane("detail");
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "File không đúng mẫu Hồ sơ KH. Hãy tải Mẫu rồi nhập lại.",
        "Import thất bại",
      );
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
      setSaveStatus("error");
      toast.error(check.summary, "Kiểm tra lại");
      focusFirstValidationError(check.errors);
      return false;
    }
    const nextDraft = synced.map((e) =>
      normalizeCustomerEntryForSave(e, synced),
    );
    const normalized = nextDraft.map((e) => clampCustomerDirectoryEntry(e));
    try {
      assertCustomerDirectoryValid(normalized);
    } catch (e) {
      setSaveStatus("error");
      toast.error(
        e instanceof Error ? e.message : "Danh sách không hợp lệ.",
        "Không lưu được",
      );
      return false;
    }
    setSaving(true);
    setSaveStatus("idle");
    try {
      await onSave(normalized);
      setDraft(normalized);
      setBaseline(JSON.stringify(normalized));
      setValidationErrors([]);
      setSaveStatus("saved");
      toast.success("Đã lưu danh bạ khách.", "Lưu thành công");
      return true;
    } catch (err) {
      setSaveStatus("error");
      toast.error(
        err instanceof Error ? err.message : "Không lưu được.",
        "Lỗi lưu",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, onSave, toast]);

  const handleBack = useCallback(() => {
    if (dirty) {
      setConfirmLeave("back");
      return;
    }
    onBack();
  }, [dirty, onBack]);

  const handleDiscard = useCallback(() => {
    if (!dirty) return;
    setConfirmLeave("discard");
  }, [dirty]);

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

  // —— profile patch helpers (generic CRUD + shipper sync account) ——
  function patchSavedShipper(
    customerId: string,
    index: number,
    patch: Partial<CustomerSavedShipper>,
  ) {
    setDraft((rows) =>
      patchCustomerSavedListItem(
        rows,
        customerId,
        "savedShippers",
        index,
        patch,
        (next, list, i) => {
          const isDefault =
            (next.defaultShipperId ?? list[0]?.id) === list[i]?.id;
          if (!isDefault) return next;
          return {
            ...next,
            ...(patch.shipperPhone != null
              ? { phone: patch.shipperPhone }
              : {}),
            ...(patch.shipperEmail != null
              ? { email: patch.shipperEmail }
              : {}),
            ...(patch.shipperAddress != null
              ? { address: patch.shipperAddress }
              : {}),
            ...(patch.taxCode != null ? { taxCode: patch.taxCode } : {}),
          };
        },
      ),
    );
  }
  function removeSavedShipper(customerId: string, index: number) {
    setDraft((rows) =>
      removeCustomerSavedListItem(
        rows,
        customerId,
        "savedShippers",
        "defaultShipperId",
        index,
      ),
    );
  }
  function addSavedShipper(customerId: string) {
    setDraft((rows) =>
      addCustomerSavedListItem(
        rows,
        customerId,
        "savedShippers",
        "defaultShipperId",
        emptyCustomerSavedShipper,
      ),
    );
  }
  function patchSavedConsignee(
    customerId: string,
    index: number,
    patch: Partial<CustomerSavedConsignee>,
  ) {
    setDraft((rows) =>
      patchCustomerSavedListItem(
        rows,
        customerId,
        "savedConsignees",
        index,
        patch,
      ),
    );
  }
  function removeSavedConsignee(customerId: string, index: number) {
    setDraft((rows) =>
      removeCustomerSavedListItem(
        rows,
        customerId,
        "savedConsignees",
        "defaultConsigneeId",
        index,
      ),
    );
  }
  function addSavedConsignee(customerId: string) {
    setDraft((rows) =>
      addCustomerSavedListItem(
        rows,
        customerId,
        "savedConsignees",
        "defaultConsigneeId",
        emptyCustomerSavedConsignee,
      ),
    );
  }
  function patchSavedGoods(
    customerId: string,
    index: number,
    patch: Partial<CustomerSavedGoods>,
  ) {
    setDraft((rows) =>
      patchCustomerSavedListItem(rows, customerId, "savedGoods", index, patch),
    );
  }
  function removeSavedGoods(customerId: string, index: number) {
    setDraft((rows) =>
      removeCustomerSavedListItem(
        rows,
        customerId,
        "savedGoods",
        "defaultGoodsId",
        index,
      ),
    );
  }
  function addSavedGoods(customerId: string) {
    setDraft((rows) =>
      addCustomerSavedListItem(
        rows,
        customerId,
        "savedGoods",
        "defaultGoodsId",
        emptyCustomerSavedGoods,
      ),
    );
  }
  function patchSavedVehicle(
    customerId: string,
    index: number,
    patch: Partial<CustomerSavedVehicle>,
  ) {
    setDraft((rows) =>
      patchCustomerSavedListItem(
        rows,
        customerId,
        "savedVehicles",
        index,
        patch,
      ),
    );
  }
  function removeSavedVehicle(customerId: string, index: number) {
    setDraft((rows) =>
      removeCustomerSavedListItem(
        rows,
        customerId,
        "savedVehicles",
        "defaultVehicleId",
        index,
      ),
    );
  }
  function addSavedVehicle(customerId: string) {
    setDraft((rows) =>
      addCustomerSavedListItem(
        rows,
        customerId,
        "savedVehicles",
        "defaultVehicleId",
        emptyCustomerSavedVehicle,
      ),
    );
  }

  const filterActive = query.trim().length > 0 || typeFilter !== "ALL";
  const countLabel = filterActive
    ? `${filtered.length} / ${draft.length} khách`
    : `${draft.length} khách`;

  const headerStatus =
    saving
      ? "Đang lưu…"
      : dirty
        ? "Chưa lưu"
        : saveStatus === "saved"
          ? "Đã lưu"
          : saveStatus === "error"
            ? "Lỗi"
            : "";

  const showList = !isMobile || mobilePane === "list";
  const showDetail = !isMobile || mobilePane === "detail";

  if (!ready || !hydrated) {
    return <PageSkeleton variant="customers" />;
  }

  /** Cùng một mẫu Hồ sơ KH — mobile gói menu, desktop hiện nút. */
  const excelToolItems = [
    {
      id: "template",
      label: "Tải mẫu",
      description: "Mẫu Hồ sơ KH cố định",
      onSelect: () => void downloadCustomerFullProfileTemplate(),
    },
    {
      id: "import",
      label: importing ? "Đang import…" : "Import",
      description: "Nhập đúng mẫu Hồ sơ KH",
      disabled: importing,
      onSelect: () => importInputRef.current?.click(),
    },
    {
      id: "export",
      label: "Export",
      description: "Xuất đúng mẫu Hồ sơ KH",
      onSelect: () => void downloadCustomerFullProfileExport(draft),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-ui-background text-ui-text">
      <header className="sticky top-0 z-30 border-b border-ui-border/90 bg-ui-surface/95 pt-[env(safe-area-inset-top)] shadow-ui-sm backdrop-blur-[6px]">
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-3 py-2.5 sm:px-4">
          {isMobile && mobilePane === "detail" ? (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => setMobilePane("list")}
            >
              ← DS
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={handleBack}
            >
              ← Ops
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-base font-extrabold tracking-tight text-ui-navy sm:text-lg">
              {isMobile && mobilePane === "detail" && selected
                ? normalizeCustomerNameInput(selected.name) || "Khách hàng"
                : "Khách hàng"}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ui-text-muted">
              <span className="font-medium">{countLabel}</span>
              <SyncStatusPill status={syncStatus} socketConnected={socketConnected} />
              {customersSyncPhrase ? (
                <span
                  className="font-semibold text-ui-text-muted"
                  data-testid="customers-sync-stamp"
                  title="ops_customers.synced_at · Asia/Saigon"
                >
                  {customersSyncPhrase}
                </span>
              ) : null}
              {headerStatus ? (
                <span
                  className={
                    dirty || saveStatus === "error"
                      ? "font-semibold text-amber-700"
                      : "font-semibold text-emerald-700"
                  }
                >
                  {headerStatus}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isMobile ? (
              <OverflowMenu
                label="Excel"
                items={excelToolItems}
                compact
              />
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  title="Tải mẫu Hồ sơ KH cố định"
                  onClick={() => void downloadCustomerFullProfileTemplate()}
                >
                  Mẫu
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={importing}
                  title="Import đúng mẫu Hồ sơ KH"
                  onClick={() => importInputRef.current?.click()}
                >
                  {importing ? "…" : "Import"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  title="Export đúng mẫu Hồ sơ KH"
                  onClick={() => void downloadCustomerFullProfileExport(draft)}
                >
                  Export
                </Button>
              </>
            )}
            <div className="hidden items-center gap-1.5 sm:flex">
              <Button
                variant="secondary"
                size="sm"
                disabled={!dirty || saving}
                onClick={handleDiscard}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!dirty || saving}
                onClick={() => void persistDraft()}
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </Button>
            </div>
          </div>
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
        {showList ? (
          <aside className="flex min-h-0 w-full flex-1 flex-col border-ui-border bg-ui-surface sm:max-h-none sm:w-[17.5rem] sm:flex-none sm:border-r lg:w-72">
            <div className="space-y-1.5 border-b border-ui-border/90 bg-gradient-to-b from-slate-50/80 to-white p-2.5">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm mã / tên / SĐT…"
                className={FIELD}
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
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                      typeFilter === id
                        ? "bg-ui-primary text-white shadow-ui-sm"
                        : "bg-ui-surface-muted text-ui-text-muted ring-1 ring-ui-border/80 hover:text-ui-text"
                    }`}
                  >
                    {label} {typeCounts[id]}
                  </button>
                ))}
              </div>
              <Button variant="primary" size="sm" className="w-full" onClick={addCustomer}>
                + Thêm khách
              </Button>
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
                    className={`mb-1 w-full touch-manipulation rounded-xl border-l-[3px] px-2.5 py-2.5 text-left transition sm:py-2 ${
                      active
                        ? "border-l-teal-600 bg-teal-500/10 shadow-ui-sm ring-1 ring-teal-500/30"
                        : "border-l-transparent hover:border-l-slate-300 hover:bg-ui-surface-muted"
                    }`}
                  >
                    <span className="block truncate text-xs font-bold text-ui-navy">
                      {normalizeCustomerNameInput(c.name) || "Chưa đặt tên"}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] font-semibold uppercase text-ui-text-muted">
                        {customerDirectoryListCode(c)}
                      </span>
                      <span className="rounded-full bg-ui-surface-muted px-1.5 py-px text-[9px] font-bold text-ui-text-muted">
                        {typeLabel(c.customerType)}
                      </span>
                      {badge ? (
                        <span className="rounded-full bg-teal-50 px-1.5 py-px text-[9px] font-bold text-teal-800 ring-1 ring-teal-200/80">
                          {badge}
                        </span>
                      ) : null}
                    </span>
                    {phone ? (
                      <span className="mt-0.5 block truncate text-[10px] tabular-nums text-ui-text-muted">
                        {phone}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {filtered.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-ui-text-muted">
                  Không tìm thấy khách phù hợp.
                </p>
              ) : null}
            </div>
          </aside>
        ) : null}

        {showDetail ? (
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {selected ? (
              <>
                <div
                  ref={detailTopRef}
                  className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-24 sm:px-4 sm:pb-4"
                >
                  <div className="mx-auto max-w-2xl space-y-3">
                    <div
                      className="flex gap-1 rounded-xl border border-ui-border/90 bg-ui-surface p-1 shadow-ui-sm"
                      role="tablist"
                      aria-label="Nhóm hồ sơ"
                    >
                      {(
                        [
                          ["info", "Thông tin"],
                          ["defaults", "Hồ sơ mặc định"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={profileTab === id}
                          onClick={() => setProfileTab(id)}
                          className={`min-h-10 flex-1 touch-manipulation rounded-lg px-2 text-[12px] font-bold transition sm:min-h-9 sm:text-[11px] ${
                            profileTab === id
                              ? "bg-ui-primary text-white shadow-ui-sm"
                              : "text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {validationErrors.length > 0 ? (
                      <Banner tone="danger" title="Cần sửa trước khi lưu">
                        {validationErrors[0]?.message}
                      </Banner>
                    ) : null}

                    {profileTab === "info" ? (
                      <section className="rounded-2xl border border-ui-border/90 bg-ui-surface p-3.5 shadow-ui-md sm:p-4">
                        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ui-text-muted">
                            Thông tin
                          </p>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setQuickFillCustomer(selected)}
                          >
                            Điền eSID TCS
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <label className="col-span-1 block">
                            <span className="mb-0.5 block text-[10px] font-semibold text-ui-text-muted">
                              Customer Code
                            </span>
                            <input
                              value={selected.code}
                              onChange={(e) =>
                                updateCustomer(selected.id, {
                                  code: e.target.value.toUpperCase(),
                                })
                              }
                              onBlur={(e) =>
                                updateCustomer(selected.id, {
                                  code: normalizeAgentCode(e.target.value),
                                })
                              }
                              className={`${FIELD} font-mono font-bold uppercase`}
                              placeholder="GLO"
                              maxLength={40}
                              spellCheck={false}
                              data-customer-invalid={
                                validationErrors.some(
                                  (e) => e.section === "identity" && e.field === "code",
                                )
                                  ? "true"
                                  : undefined
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="mb-0.5 block text-[10px] font-semibold text-ui-text-muted">
                              Short
                            </span>
                            <input
                              value={selected.shortCode ?? ""}
                              onChange={(e) =>
                                updateCustomer(selected.id, {
                                  shortCode: shortCodeWhileTyping(e.target.value),
                                })
                              }
                              onBlur={(e) =>
                                updateCustomer(selected.id, {
                                  shortCode: normalizeCustomerShortCode(e.target.value),
                                })
                              }
                              className={`${FIELD} font-mono font-bold uppercase`}
                              maxLength={10}
                              spellCheck={false}
                              placeholder="VD: CÔNG CHÚA"
                            />
                          </label>
                          <label className="col-span-2 block sm:col-span-1">
                            <span className="mb-0.5 block text-[10px] font-semibold text-ui-text-muted">
                              Loại
                            </span>
                            <select
                              value={selected.customerType ?? "DIRECT_SHIPPER"}
                              onChange={(e) =>
                                updateCustomer(selected.id, {
                                  customerType: normalizeCustomerType(e.target.value),
                                })
                              }
                              className={FIELD}
                            >
                              {CUSTOMER_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {typeLabel(t)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="col-span-2 block">
                            <span className="mb-0.5 block text-[10px] font-semibold text-ui-text-muted">
                              Tên khách
                            </span>
                            <input
                              ref={nameInputRef}
                              value={selected.name}
                              onChange={(e) =>
                                updateCustomer(selected.id, {
                                  name: customerNameWhileTyping(e.target.value),
                                })
                              }
                              onBlur={() =>
                                updateCustomer(selected.id, {
                                  name: normalizeCustomerNameInput(selected.name),
                                })
                              }
                              className={`${FIELD} text-sm font-semibold uppercase`}
                              placeholder="Tên công ty / đại lý"
                              data-customer-invalid={
                                validationErrors.some(
                                  (e) => e.section === "identity" && e.field === "name",
                                )
                                  ? "true"
                                  : undefined
                              }
                            />
                          </label>
                          <label className="col-span-2 block sm:col-span-1">
                            <span className="mb-0.5 block text-[10px] font-semibold text-ui-text-muted">
                              Đơn giá (VND/kg)
                            </span>
                            <input
                              value={formatDefaultRate(selected.defaultRate)}
                              onChange={(e) =>
                                updateCustomer(selected.id, {
                                  defaultRate: parseDefaultRate(e.target.value),
                                })
                              }
                              className={`${FIELD} font-mono`}
                              inputMode="decimal"
                            />
                          </label>
                        </div>

                        <div className="mt-5 rounded-xl border border-red-300/80 bg-gradient-to-br from-red-50 to-rose-50/80 p-3.5 shadow-ui-sm">
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-red-900">
                            Vùng nguy hiểm
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-red-900/75">
                            Xóa khách khỏi danh bạ. Thao tác cần xác nhận và bấm Lưu để ghi nhận.
                          </p>
                          <Button
                            variant="danger"
                            size="sm"
                            className="mt-2.5"
                            onClick={() => setDeleteModalOpen(true)}
                          >
                            Xóa khách
                          </Button>
                        </div>
                      </section>
                    ) : null}

                    {profileTab === "defaults" ? (
                      <CustomerDefaultDataEditor
                        entry={selected}
                        errors={validationErrors}
                        onPatch={(patch) => updateCustomer(selected.id, patch)}
                        onPatchShipper={(idx, patch) =>
                          patchSavedShipper(selected.id, idx, patch)
                        }
                        onRemoveShipper={(idx) =>
                          removeSavedShipper(selected.id, idx)
                        }
                        onAddShipper={() => addSavedShipper(selected.id)}
                        onPatchConsignee={(idx, patch) =>
                          patchSavedConsignee(selected.id, idx, patch)
                        }
                        onRemoveConsignee={(idx) =>
                          removeSavedConsignee(selected.id, idx)
                        }
                        onAddConsignee={() => addSavedConsignee(selected.id)}
                        onPatchGoods={(idx, patch) =>
                          patchSavedGoods(selected.id, idx, patch)
                        }
                        onRemoveGoods={(idx) =>
                          removeSavedGoods(selected.id, idx)
                        }
                        onAddGoods={() => addSavedGoods(selected.id)}
                        onPatchVehicle={(idx, patch) =>
                          patchSavedVehicle(selected.id, idx, patch)
                        }
                        onRemoveVehicle={(idx) =>
                          removeSavedVehicle(selected.id, idx)
                        }
                        onAddVehicle={() => addSavedVehicle(selected.id)}
                      />
                    ) : null}
                  </div>
                </div>

                <div className="sticky bottom-0 z-20 border-t border-ui-border bg-ui-surface px-3 py-2.5 pb-[max(0.65rem,calc(4.25rem+env(safe-area-inset-bottom)))] sm:hidden">
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="md"
                      className="min-h-11 flex-1 touch-manipulation"
                      disabled={!dirty || saving}
                      onClick={handleDiscard}
                    >
                      Hủy
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      className="min-h-11 flex-1 touch-manipulation"
                      disabled={!dirty || saving}
                      onClick={() => void persistDraft()}
                    >
                      {saving ? "Đang lưu…" : "Lưu"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState
                  title="Chưa chọn khách"
                  description="Chọn một dòng bên trái hoặc bấm « + Thêm khách »."
                  actionLabel="+ Thêm khách"
                  onAction={addCustomer}
                />
              </div>
            )}
          </main>
        ) : null}
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

      <CustomerEsidQuickFillModal
        open={Boolean(quickFillCustomer)}
        customer={quickFillCustomer}
        onClose={() => setQuickFillCustomer(null)}
      />

      <ConfirmDialog
        open={confirmLeave === "back"}
        title="Chưa lưu thay đổi"
        message="Có thay đổi chưa lưu. Rời trang và hủy các thay đổi?"
        confirmLabel="Rời trang"
        cancelLabel="Ở lại"
        danger
        onCancel={() => setConfirmLeave(null)}
        onConfirm={() => {
          setConfirmLeave(null);
          onBack();
        }}
      />
      <ConfirmDialog
        open={confirmLeave === "discard"}
        title="Hủy thay đổi?"
        message="Hủy mọi thay đổi chưa lưu trên khách hiện tại?"
        confirmLabel="Hủy thay đổi"
        cancelLabel="Giữ lại"
        danger
        onCancel={() => setConfirmLeave(null)}
        onConfirm={() => {
          setConfirmLeave(null);
          syncFromInitial(initial);
        }}
      />
    </div>
  );
}
