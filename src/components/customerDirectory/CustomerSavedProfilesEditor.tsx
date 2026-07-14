import { useEffect, useState, type ReactNode } from "react";
import type {
  CustomerDirectoryEntry,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
  CustomerSavedVehicle,
} from "../../types/customerDirectory";
import {
  formatVnPhoneDisplay,
  normalizeAgentCode,
  parseCustomerProfileOcrJson,
  patchShipperFromOcr,
} from "../../utils/customerProfileInputFormat";
import { formatVehicleLicensePlate } from "../../utils/customerVehicleCore";
import { suggestSavedItemLabel } from "../../utils/customerDirectoryScaffold";
import { normalizePrintAddressMultiline } from "../../utils/printAddressMultiline";
import { CD, cdInput } from "./customerDirectoryStyles";
import { CustomerSectionSaveButton } from "./CustomerSectionSaveButton";
import {
  CustomerValidationBanner,
  FieldErrorText,
  SectionErrorHint,
  fieldInputClass,
} from "./CustomerValidationField";
import type { CustomerFieldError } from "../../utils/customerDirectoryValidation";
import { getFieldValidationError } from "../../utils/customerDirectoryValidation";

const inputCls = `w-full text-xs ${cdInput}`;

type ProfileTab = "shipper" | "consignee" | "goods" | "vehicle";

type Props = {
  entry: CustomerDirectoryEntry;
  errors: CustomerFieldError[];
  onEdit: () => void;
  saving: boolean;
  savedSection: string | null;
  onSaveSection: (key: string) => void;
  onPatch: (patch: Partial<Omit<CustomerDirectoryEntry, "id" | "parties">>) => void;
  onPatchShipper: (index: number, patch: Partial<CustomerSavedShipper>) => void;
  onRemoveShipper: (index: number) => void;
  onAddShipper: () => void;
  onPatchConsignee: (index: number, patch: Partial<CustomerSavedConsignee>) => void;
  onRemoveConsignee: (index: number) => void;
  onAddConsignee: () => void;
  onPatchGoods: (index: number, patch: Partial<CustomerSavedGoods>) => void;
  onRemoveGoods: (index: number) => void;
  onAddGoods: () => void;
  onPatchVehicle: (index: number, patch: Partial<CustomerSavedVehicle>) => void;
  onRemoveVehicle: (index: number) => void;
  onAddVehicle: () => void;
};

const TAB_LABELS: { id: ProfileTab; label: string }[] = [
  { id: "shipper", label: "Người gửi" },
  { id: "consignee", label: "CNEE" },
  { id: "goods", label: "Tên hàng" },
  { id: "vehicle", label: "Xe / TX" },
];

function listIdsForTab(entry: CustomerDirectoryEntry, profileTab: ProfileTab): string[] {
  switch (profileTab) {
    case "shipper":
      return (entry.savedShippers ?? []).map((s) => s.id);
    case "consignee":
      return (entry.savedConsignees ?? []).map((c) => c.id);
    case "goods":
      return (entry.savedGoods ?? []).map((g) => g.id);
    case "vehicle":
      return (entry.savedVehicles ?? []).map((v) => v.id);
  }
}

function DefaultStar({
  active,
  onClick,
  title,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded px-1 text-sm leading-none ${
        active ? "text-amber-500" : `${CD.muted} hover:text-amber-500`
      }`}
      aria-label={title}
      aria-pressed={active}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

function ItemCard({
  title,
  defaultStar,
  onRemove,
  canRemove,
  editing,
  onStartEdit,
  viewContent,
  editContent,
}: {
  title: string;
  defaultStar: ReactNode;
  onRemove: () => void;
  canRemove: boolean;
  editing: boolean;
  onStartEdit: () => void;
  viewContent: ReactNode;
  editContent: ReactNode;
}) {
  return (
    <div
      className={`mb-1.5 rounded-lg border p-2 ${CD.panelSoft}${
        editing ? " ring-1 ring-apple-blue/35 dark:ring-sky-400/40" : ""
      }`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {defaultStar}
        <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${CD.secondary}`}>{title}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!editing ? (
            <button type="button" onClick={onStartEdit} className={CD.btnSmallAccent}>
              Sửa
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="text-[10px] font-semibold text-red-600 hover:underline dark:text-red-300"
            >
              Xóa
            </button>
          ) : null}
        </div>
      </div>
      {editing ? editContent : viewContent}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>{children}</span>;
}

function ReadOnlyValue({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const text = value.trim();
  return (
    <div className={multiline ? "sm:col-span-2" : undefined}>
      <FieldLabel>{label}</FieldLabel>
      <p
        className={`rounded-lg border border-black/[0.06] bg-black/[0.03] px-2 py-1 text-xs text-apple-label dark:border-white/10 dark:bg-black/20 dark:text-slate-200 ${
          multiline ? "whitespace-pre-wrap break-words leading-relaxed" : "truncate"
        }`}
      >
        {text || "—"}
      </p>
    </div>
  );
}

export function CustomerSavedProfilesEditor({
  entry,
  errors,
  onEdit,
  saving,
  savedSection,
  onSaveSection,
  onPatch,
  onPatchShipper,
  onRemoveShipper,
  onAddShipper,
  onPatchConsignee,
  onRemoveConsignee,
  onAddConsignee,
  onPatchGoods,
  onRemoveGoods,
  onAddGoods,
  onPatchVehicle,
  onRemoveVehicle,
  onAddVehicle,
}: Props) {
  const [tab, setTab] = useState<ProfileTab>("shipper");
  const [ocrHint, setOcrHint] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set());
  const [pendingEditTab, setPendingEditTab] = useState<ProfileTab | null>(null);

  useEffect(() => {
    setEditingIds(new Set());
    setPendingEditTab(null);
  }, [entry.id]);

  useEffect(() => {
    if (!savedSection || savedSection === "note" || savedSection === "identity") return;
    const sectionTab = savedSection as ProfileTab;
    setEditingIds((prev) => {
      const next = new Set(prev);
      const ids = listIdsForTab(entry, sectionTab);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, [savedSection, entry]);

  useEffect(() => {
    if (!pendingEditTab) return;
    const ids = listIdsForTab(entry, pendingEditTab);
    const lastId = ids[ids.length - 1];
    if (!lastId) return;
    setEditingIds((prev) => new Set(prev).add(lastId));
    setPendingEditTab(null);
  }, [entry, pendingEditTab]);

  const shippers = entry.savedShippers ?? [];
  const consignees = entry.savedConsignees ?? [];
  const goods = entry.savedGoods ?? [];
  const vehicles = entry.savedVehicles ?? [];

  const counts: Record<ProfileTab, number> = {
    shipper: shippers.length,
    consignee: consignees.length,
    goods: goods.length,
    vehicle: vehicles.length,
  };

  const applyOcrPaste = async (idx: number) => {
    setOcrHint(null);
    let raw = "";
    try {
      raw = await navigator.clipboard.readText();
    } catch {
      setOcrHint("Không đọc clipboard.");
      return;
    }
    const ocr = parseCustomerProfileOcrJson(raw);
    if (!ocr) {
      setOcrHint("JSON OCR không hợp lệ.");
      return;
    }
    const s = shippers[idx];
    if (!s) return;
    onPatchShipper(idx, patchShipperFromOcr(s, ocr));
    setOcrHint("Đã điền OCR.");
  };

  const fillLabelIfEmpty = (
    idx: number,
    primary: string,
    patch: (i: number, p: { label: string }) => void,
    currentLabel: string
  ) => {
    if (currentLabel.trim()) return;
    const label = suggestSavedItemLabel(primary, entry.code);
    if (label) patch(idx, { label });
  };

  const tabAdd: Record<ProfileTab, () => void> = {
    shipper: onAddShipper,
    consignee: onAddConsignee,
    goods: onAddGoods,
    vehicle: onAddVehicle,
  };

  const fe = (section: ProfileTab | "note", field: string, itemId?: string) =>
    getFieldValidationError(errors, section, field, itemId);

  const wrapPatch =
    <T,>(fn: (i: number, p: T) => void) =>
    (idx: number, patch: T) => {
      onEdit();
      fn(idx, patch);
    };

  const wrapAdd = (fn: () => void, profileTab: ProfileTab) => () => {
    onEdit();
    fn();
    setPendingEditTab(profileTab);
  };

  const startEditItem = (id: string) => {
    onEdit();
    setEditingIds((prev) => new Set(prev).add(id));
  };

  const isEditingItem = (id: string) => editingIds.has(id);

  const patchShipper = wrapPatch(onPatchShipper);
  const patchConsignee = wrapPatch(onPatchConsignee);
  const patchGoods = wrapPatch(onPatchGoods);
  const patchVehicle = wrapPatch(onPatchVehicle);

  return (
    <section className="space-y-2.5">
      <div className={`rounded-lg border p-2 ${CD.card}`}>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className={`text-[10px] font-bold uppercase ${CD.muted}`}>Ghi chú in phiếu cân</span>
          <CustomerSectionSaveButton
            compact
            saving={saving}
            saved={savedSection === "note"}
            onSave={() => onSaveSection("note")}
          />
        </div>
        <textarea
          value={entry.otherRequirementsPrint ?? ""}
          onChange={(e) => {
            onEdit();
            onPatch({ otherRequirementsPrint: e.target.value });
          }}
          rows={2}
          className={`${inputCls} min-h-[2.5rem] resize-y`}
          placeholder="VD: GIỮ KHÔ, KHÔNG XẾP CHỒNG…"
        />
      </div>

      <div className={`rounded-lg border ${CD.card}`}>
        <div className={`flex flex-wrap items-center gap-1 border-b px-1.5 py-1 ${CD.border}`}>
          {TAB_LABELS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                tab === id ? CD.navActive : CD.navIdle
              }`}
            >
              {label}
              {counts[id] > 0 ? ` (${counts[id]})` : ""}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <SectionErrorHint errors={errors} section={tab} />
            <button type="button" onClick={wrapAdd(tabAdd[tab], tab)} className={CD.btnSmallAccent}>
              + Thêm
            </button>
            <CustomerSectionSaveButton
              compact
              saving={saving}
              saved={savedSection === tab}
              onSave={() => onSaveSection(tab)}
            />
          </div>
        </div>

        <div className="p-2">
          <CustomerValidationBanner errors={errors.filter((e) => e.section === tab)} />
          {tab === "shipper" ? (
            shippers.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${CD.muted}`}>Chưa có người gửi.</p>
            ) : (
              shippers.map((s, idx) => (
                <ItemCard
                  key={s.id}
                  title={s.shipperName.trim() || s.label.trim() || `#${idx + 1}`}
                  canRemove={shippers.length > 1}
                  editing={isEditingItem(s.id)}
                  onStartEdit={() => startEditItem(s.id)}
                  onRemove={() => onRemoveShipper(idx)}
                  defaultStar={
                    <DefaultStar
                      active={entry.defaultShipperId === s.id}
                      onClick={() => onPatch({ defaultShipperId: s.id })}
                      title="Mặc định"
                    />
                  }
                  viewContent={
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      <ReadOnlyValue label="Tên in phiếu" value={s.shipperName} multiline />
                      <ReadOnlyValue label="SĐT" value={s.shipperPhone} />
                      <ReadOnlyValue label="Địa chỉ" value={s.shipperAddress} multiline />
                    </div>
                  }
                  editContent={
                    <>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        <label className="sm:col-span-2">
                          <FieldLabel>Tên in phiếu</FieldLabel>
                          <input
                            className={fieldInputClass(Boolean(fe("shipper", "shipperName", s.id)))}
                            value={s.shipperName}
                            onChange={(e) => patchShipper(idx, { shipperName: e.target.value })}
                            onBlur={() => fillLabelIfEmpty(idx, s.shipperName, patchShipper, s.label)}
                          />
                          <FieldErrorText message={fe("shipper", "shipperName", s.id)} />
                        </label>
                        <label>
                          <FieldLabel>SĐT</FieldLabel>
                          <input
                            className={`${fieldInputClass(Boolean(fe("shipper", "shipperPhone", s.id)))} tabular-nums`}
                            value={s.shipperPhone}
                            onChange={(e) => patchShipper(idx, { shipperPhone: e.target.value })}
                            onBlur={(e) =>
                              patchShipper(idx, { shipperPhone: formatVnPhoneDisplay(e.target.value) })
                            }
                          />
                          <FieldErrorText message={fe("shipper", "shipperPhone", s.id)} />
                        </label>
                        <label className="sm:col-span-2">
                          <FieldLabel>Địa chỉ</FieldLabel>
                          <textarea
                            className={`${fieldInputClass(false)} resize-y whitespace-pre-wrap break-words leading-relaxed`}
                            rows={2}
                            value={s.shipperAddress}
                            onChange={(e) => patchShipper(idx, { shipperAddress: e.target.value })}
                            onBlur={(e) =>
                              patchShipper(idx, {
                                shipperAddress: normalizePrintAddressMultiline(e.target.value, 6),
                              })
                            }
                          />
                        </label>
                      </div>
                      <details className="mt-1">
                        <summary className={`cursor-pointer text-[10px] ${CD.muted}`}>Thêm (MST, email, OCR…)</summary>
                        <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          <label>
                            <FieldLabel>Mã</FieldLabel>
                            <input
                              className={`${inputCls} font-mono uppercase`}
                              value={s.label}
                              onChange={(e) => patchShipper(idx, { label: e.target.value })}
                              onBlur={(e) => patchShipper(idx, { label: normalizeAgentCode(e.target.value) })}
                            />
                          </label>
                          <label>
                            <FieldLabel>MST</FieldLabel>
                            <input
                              className={inputCls}
                              value={s.taxCode}
                              onChange={(e) => patchShipper(idx, { taxCode: e.target.value })}
                            />
                          </label>
                          <label className="sm:col-span-2">
                            <FieldLabel>Email (tùy chọn)</FieldLabel>
                            <input
                              className={inputCls}
                              value={s.shipperEmail}
                              onChange={(e) => patchShipper(idx, { shipperEmail: e.target.value })}
                            />
                          </label>
                          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                            <button type="button" onClick={() => void applyOcrPaste(idx)} className={CD.btnSmallAccent}>
                              Dán OCR
                            </button>
                            {ocrHint ? <span className={`text-[10px] ${CD.secondary}`}>{ocrHint}</span> : null}
                          </div>
                        </div>
                      </details>
                    </>
                  }
                />
              ))
            )
          ) : null}

          {tab === "consignee" ? (
            consignees.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${CD.muted}`}>Chưa có CNEE — có thể bỏ qua.</p>
            ) : (
              consignees.map((c, idx) => (
                <ItemCard
                  key={c.id}
                  title={c.consigneeName.trim() || c.label.trim() || `#${idx + 1}`}
                  canRemove
                  editing={isEditingItem(c.id)}
                  onStartEdit={() => startEditItem(c.id)}
                  onRemove={() => onRemoveConsignee(idx)}
                  defaultStar={
                    <DefaultStar
                      active={entry.defaultConsigneeId === c.id}
                      onClick={() => onPatch({ defaultConsigneeId: c.id })}
                      title="Mặc định"
                    />
                  }
                  viewContent={
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      <ReadOnlyValue label="Tên" value={c.consigneeName} multiline />
                      <ReadOnlyValue label="SĐT" value={c.consigneePhone} />
                      <ReadOnlyValue label="Địa chỉ" value={c.consigneeAddress} multiline />
                    </div>
                  }
                  editContent={
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      <label className="sm:col-span-2">
                        <FieldLabel>Tên</FieldLabel>
                        <input
                          className={fieldInputClass(Boolean(fe("consignee", "consigneeName", c.id)))}
                          value={c.consigneeName}
                          onChange={(e) => patchConsignee(idx, { consigneeName: e.target.value })}
                          onBlur={() => fillLabelIfEmpty(idx, c.consigneeName, patchConsignee, c.label)}
                        />
                        <FieldErrorText message={fe("consignee", "consigneeName", c.id)} />
                      </label>
                      <label>
                        <FieldLabel>SĐT</FieldLabel>
                        <input
                          className={`${fieldInputClass(Boolean(fe("consignee", "consigneePhone", c.id)))} tabular-nums`}
                          value={c.consigneePhone}
                          onChange={(e) => patchConsignee(idx, { consigneePhone: e.target.value })}
                          onBlur={(e) =>
                            patchConsignee(idx, { consigneePhone: formatVnPhoneDisplay(e.target.value) })
                          }
                        />
                        <FieldErrorText message={fe("consignee", "consigneePhone", c.id)} />
                      </label>
                      <label className="sm:col-span-2">
                        <FieldLabel>Địa chỉ</FieldLabel>
                        <textarea
                          className={`${fieldInputClass(false)} resize-y whitespace-pre-wrap break-words leading-relaxed`}
                          rows={2}
                          value={c.consigneeAddress}
                          onChange={(e) => patchConsignee(idx, { consigneeAddress: e.target.value })}
                          onBlur={(e) =>
                            patchConsignee(idx, {
                              consigneeAddress: normalizePrintAddressMultiline(e.target.value, 6),
                            })
                          }
                        />
                      </label>
                    </div>
                  }
                />
              ))
            )
          ) : null}

          {tab === "goods" ? (
            goods.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${CD.muted}`}>Chưa có mẫu tên hàng.</p>
            ) : (
              goods.map((g, idx) => (
                <ItemCard
                  key={g.id}
                  title={g.goodsDescription.trim() || g.label.trim() || `#${idx + 1}`}
                  canRemove
                  editing={isEditingItem(g.id)}
                  onStartEdit={() => startEditItem(g.id)}
                  onRemove={() => onRemoveGoods(idx)}
                  defaultStar={
                    <DefaultStar
                      active={entry.defaultGoodsId === g.id}
                      onClick={() => onPatch({ defaultGoodsId: g.id })}
                      title="Mặc định"
                    />
                  }
                  viewContent={<ReadOnlyValue label="Mô tả in phiếu" value={g.goodsDescription} multiline />}
                  editContent={
                    <label>
                      <FieldLabel>Mô tả in phiếu</FieldLabel>
                      <input
                        className={fieldInputClass(Boolean(fe("goods", "goodsDescription", g.id)))}
                        placeholder="GARMENT, SEAFOOD…"
                        value={g.goodsDescription}
                        onChange={(e) => patchGoods(idx, { goodsDescription: e.target.value })}
                        onBlur={() => fillLabelIfEmpty(idx, g.goodsDescription, patchGoods, g.label)}
                      />
                      <FieldErrorText message={fe("goods", "goodsDescription", g.id)} />
                    </label>
                  }
                />
              ))
            )
          ) : null}

          {tab === "vehicle" ? (
            vehicles.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${CD.muted}`}>Chưa có xe — thêm biển số / tài xế nếu cần.</p>
            ) : (
              vehicles.map((v, idx) => (
                <ItemCard
                  key={v.id}
                  title={v.licensePlate.trim() || v.driverName.trim() || `#${idx + 1}`}
                  canRemove
                  editing={isEditingItem(v.id)}
                  onStartEdit={() => startEditItem(v.id)}
                  onRemove={() => onRemoveVehicle(idx)}
                  defaultStar={
                    <DefaultStar
                      active={entry.defaultVehicleId === v.id}
                      onClick={() => onPatch({ defaultVehicleId: v.id })}
                      title="Xe mặc định"
                    />
                  }
                  viewContent={
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <ReadOnlyValue label="Biển số" value={v.licensePlate} />
                      <ReadOnlyValue label="Tài xế" value={v.driverName} />
                      <ReadOnlyValue label="CCCD" value={v.driverId} />
                    </div>
                  }
                  editContent={
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <label>
                        <FieldLabel>Biển số</FieldLabel>
                        <input
                          className={`${fieldInputClass(Boolean(fe("vehicle", "licensePlate", v.id)))} font-mono uppercase`}
                          value={v.licensePlate}
                          onChange={(e) => patchVehicle(idx, { licensePlate: e.target.value })}
                          onBlur={(e) =>
                            patchVehicle(idx, { licensePlate: formatVehicleLicensePlate(e.target.value) })
                          }
                        />
                        <FieldErrorText message={fe("vehicle", "licensePlate", v.id)} />
                      </label>
                      <label>
                        <FieldLabel>Tài xế</FieldLabel>
                        <input
                          className={fieldInputClass(Boolean(fe("vehicle", "driverName", v.id)))}
                          value={v.driverName}
                          onChange={(e) => patchVehicle(idx, { driverName: e.target.value })}
                        />
                        <FieldErrorText message={fe("vehicle", "driverName", v.id)} />
                      </label>
                      <label>
                        <FieldLabel>CCCD</FieldLabel>
                        <input
                          className={`${fieldInputClass(Boolean(fe("vehicle", "driverId", v.id)))} font-mono`}
                          inputMode="numeric"
                          value={v.driverId}
                          onChange={(e) => patchVehicle(idx, { driverId: e.target.value.replace(/\D/g, "") })}
                        />
                        <FieldErrorText message={fe("vehicle", "driverId", v.id)} />
                      </label>
                    </div>
                  }
                />
              ))
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
