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
import { normalizeVehiclePlateInput } from "../../utils/vehiclePlateNormalize";
import { suggestSavedItemLabel } from "../../utils/customerDirectoryScaffold";
import { normalizePrintAddressMultiline } from "../../utils/printAddressMultiline";
import { OPS, opsInput } from "../../styles/opsModalStyles";
import {
  CustomerValidationBanner,
  FieldErrorText,
  SectionErrorHint,
  fieldInputClass,
} from "./CustomerValidationField";
import type { CustomerFieldError } from "../../utils/customerDirectoryValidation";
import { getFieldValidationError } from "../../utils/customerDirectoryValidation";

const inputCls = `w-full text-xs ${opsInput}`;

type ProfileTab = "shipper" | "consignee" | "goods" | "vehicle";

type Props = {
  entry: CustomerDirectoryEntry;
  errors: CustomerFieldError[];
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
        active ? "text-amber-500" : `${OPS.muted} hover:text-amber-500`
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
  children,
}: {
  title: string;
  defaultStar: ReactNode;
  onRemove: () => void;
  canRemove: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`mb-1.5 rounded-lg border p-2 ${OPS.panelSoft}`}>
      <div className="mb-1.5 flex items-center gap-1.5">
        {defaultStar}
        <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${OPS.secondary}`}>{title}</span>
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
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className={`mb-0.5 block text-[10px] font-medium ${OPS.muted}`}>{children}</span>;
}

export function CustomerSavedProfilesEditor({
  entry,
  errors,
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

  useEffect(() => {
    setTab("shipper");
    setOcrHint(null);
  }, [entry.id]);

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

  return (
    <section className="space-y-2.5">
      <div className={`rounded-lg border p-2 ${OPS.card}`}>
        <span className={`mb-1.5 block text-[10px] font-bold uppercase ${OPS.muted}`}>
          Ghi chú in phiếu cân
        </span>
        <textarea
          value={entry.otherRequirementsPrint ?? ""}
          onChange={(e) => onPatch({ otherRequirementsPrint: e.target.value })}
          rows={2}
          className={`${inputCls} min-h-[2.5rem] resize-y`}
          placeholder="VD: GIỮ KHÔ, KHÔNG XẾP CHỒNG…"
        />
      </div>

      <div className={`rounded-lg border ${OPS.card}`}>
        <div className={`flex flex-wrap items-center gap-1 border-b px-1.5 py-1 ${OPS.border}`}>
          {TAB_LABELS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                tab === id ? OPS.navActive : OPS.navIdle
              }`}
            >
              {label}
              {counts[id] > 0 ? ` (${counts[id]})` : ""}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <SectionErrorHint errors={errors} section={tab} />
            <button type="button" onClick={tabAdd[tab]} className={OPS.btnSmallAccent}>
              + Thêm
            </button>
          </div>
        </div>

        <div className="p-2">
          <CustomerValidationBanner errors={errors.filter((e) => e.section === tab)} />
          {tab === "shipper" ? (
            shippers.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${OPS.muted}`}>Chưa có người gửi.</p>
            ) : (
              shippers.map((s, idx) => (
                <ItemCard
                  key={s.id}
                  title={s.shipperName.trim() || s.label.trim() || `#${idx + 1}`}
                  canRemove={shippers.length > 1}
                  onRemove={() => onRemoveShipper(idx)}
                  defaultStar={
                    <DefaultStar
                      active={entry.defaultShipperId === s.id}
                      onClick={() => onPatch({ defaultShipperId: s.id })}
                      title="Mặc định"
                    />
                  }
                >
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <label className="sm:col-span-2">
                      <FieldLabel>Tên in phiếu</FieldLabel>
                      <input
                        className={fieldInputClass(Boolean(fe("shipper", "shipperName", s.id)))}
                        value={s.shipperName}
                        onChange={(e) => onPatchShipper(idx, { shipperName: e.target.value })}
                        onBlur={() => fillLabelIfEmpty(idx, s.shipperName, onPatchShipper, s.label)}
                      />
                      <FieldErrorText message={fe("shipper", "shipperName", s.id)} />
                    </label>
                    <label>
                      <FieldLabel>SĐT</FieldLabel>
                      <input
                        className={`${fieldInputClass(Boolean(fe("shipper", "shipperPhone", s.id)))} tabular-nums`}
                        value={s.shipperPhone}
                        onChange={(e) => onPatchShipper(idx, { shipperPhone: e.target.value })}
                        onBlur={(e) =>
                          onPatchShipper(idx, { shipperPhone: formatVnPhoneDisplay(e.target.value) })
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
                        onChange={(e) => onPatchShipper(idx, { shipperAddress: e.target.value })}
                        onBlur={(e) =>
                          onPatchShipper(idx, {
                            shipperAddress: normalizePrintAddressMultiline(e.target.value, 6),
                          })
                        }
                      />
                    </label>
                  </div>
                  <details className="mt-1">
                    <summary className={`cursor-pointer text-[10px] ${OPS.muted}`}>Thêm (MST, email, OCR…)</summary>
                    <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      <label>
                        <FieldLabel>Mã</FieldLabel>
                        <input
                          className={`${inputCls} font-mono uppercase`}
                          value={s.label}
                          onChange={(e) => onPatchShipper(idx, { label: e.target.value })}
                          onBlur={(e) => onPatchShipper(idx, { label: normalizeAgentCode(e.target.value) })}
                        />
                      </label>
                      <label>
                        <FieldLabel>MST</FieldLabel>
                        <input
                          className={inputCls}
                          value={s.taxCode}
                          onChange={(e) => onPatchShipper(idx, { taxCode: e.target.value })}
                        />
                      </label>
                      <label className="sm:col-span-2">
                        <FieldLabel>Email (tùy chọn)</FieldLabel>
                        <input
                          className={inputCls}
                          value={s.shipperEmail}
                          onChange={(e) => onPatchShipper(idx, { shipperEmail: e.target.value })}
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                        <button type="button" onClick={() => void applyOcrPaste(idx)} className={OPS.btnSmallAccent}>
                          Dán OCR
                        </button>
                        {ocrHint ? <span className={`text-[10px] ${OPS.secondary}`}>{ocrHint}</span> : null}
                      </div>
                    </div>
                  </details>
                </ItemCard>
              ))
            )
          ) : null}

          {tab === "consignee" ? (
            consignees.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${OPS.muted}`}>Chưa có CNEE — có thể bỏ qua.</p>
            ) : (
              consignees.map((c, idx) => (
                <ItemCard
                  key={c.id}
                  title={c.consigneeName.trim() || c.label.trim() || `#${idx + 1}`}
                  canRemove
                  onRemove={() => onRemoveConsignee(idx)}
                  defaultStar={
                    <DefaultStar
                      active={entry.defaultConsigneeId === c.id}
                      onClick={() => onPatch({ defaultConsigneeId: c.id })}
                      title="Mặc định"
                    />
                  }
                >
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <label className="sm:col-span-2">
                      <FieldLabel>Tên</FieldLabel>
                      <input
                        className={fieldInputClass(Boolean(fe("consignee", "consigneeName", c.id)))}
                        value={c.consigneeName}
                        onChange={(e) => onPatchConsignee(idx, { consigneeName: e.target.value })}
                        onBlur={() => fillLabelIfEmpty(idx, c.consigneeName, onPatchConsignee, c.label)}
                      />
                      <FieldErrorText message={fe("consignee", "consigneeName", c.id)} />
                    </label>
                    <label>
                      <FieldLabel>SĐT</FieldLabel>
                      <input
                        className={`${fieldInputClass(Boolean(fe("consignee", "consigneePhone", c.id)))} tabular-nums`}
                        value={c.consigneePhone}
                        onChange={(e) => onPatchConsignee(idx, { consigneePhone: e.target.value })}
                        onBlur={(e) =>
                          onPatchConsignee(idx, { consigneePhone: formatVnPhoneDisplay(e.target.value) })
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
                        onChange={(e) => onPatchConsignee(idx, { consigneeAddress: e.target.value })}
                        onBlur={(e) =>
                          onPatchConsignee(idx, {
                            consigneeAddress: normalizePrintAddressMultiline(e.target.value, 6),
                          })
                        }
                      />
                    </label>
                  </div>
                </ItemCard>
              ))
            )
          ) : null}

          {tab === "goods" ? (
            goods.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${OPS.muted}`}>Chưa có mẫu tên hàng.</p>
            ) : (
              goods.map((g, idx) => (
                <ItemCard
                  key={g.id}
                  title={g.goodsDescription.trim() || g.label.trim() || `#${idx + 1}`}
                  canRemove
                  onRemove={() => onRemoveGoods(idx)}
                  defaultStar={
                    <DefaultStar
                      active={entry.defaultGoodsId === g.id}
                      onClick={() => onPatch({ defaultGoodsId: g.id })}
                      title="Mặc định"
                    />
                  }
                >
                  <label>
                    <FieldLabel>Mô tả in phiếu</FieldLabel>
                    <input
                      className={fieldInputClass(Boolean(fe("goods", "goodsDescription", g.id)))}
                      placeholder="GARMENT, SEAFOOD…"
                      value={g.goodsDescription}
                      onChange={(e) => onPatchGoods(idx, { goodsDescription: e.target.value })}
                      onBlur={() => fillLabelIfEmpty(idx, g.goodsDescription, onPatchGoods, g.label)}
                    />
                    <FieldErrorText message={fe("goods", "goodsDescription", g.id)} />
                  </label>
                </ItemCard>
              ))
            )
          ) : null}

          {tab === "vehicle" ? (
            vehicles.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${OPS.muted}`}>Chưa có xe — thêm biển số / tài xế nếu cần.</p>
            ) : (
              vehicles.map((v, idx) => (
                <ItemCard
                  key={v.id}
                  title={v.licensePlate.trim() || v.driverName.trim() || `#${idx + 1}`}
                  canRemove
                  onRemove={() => onRemoveVehicle(idx)}
                  defaultStar={
                    <DefaultStar
                      active={entry.defaultVehicleId === v.id}
                      onClick={() => onPatch({ defaultVehicleId: v.id })}
                      title="Xe mặc định"
                    />
                  }
                >
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                    <label>
                      <FieldLabel>Biển số</FieldLabel>
                      <input
                        className={`${fieldInputClass(Boolean(fe("vehicle", "licensePlate", v.id)))} font-mono uppercase`}
                        value={v.licensePlate}
                        onChange={(e) => onPatchVehicle(idx, { licensePlate: e.target.value })}
                        onBlur={(e) =>
                          onPatchVehicle(idx, { licensePlate: normalizeVehiclePlateInput(e.target.value) })
                        }
                      />
                      <FieldErrorText message={fe("vehicle", "licensePlate", v.id)} />
                    </label>
                    <label>
                      <FieldLabel>Tài xế</FieldLabel>
                      <input
                        className={fieldInputClass(Boolean(fe("vehicle", "driverName", v.id)))}
                        value={v.driverName}
                        onChange={(e) => onPatchVehicle(idx, { driverName: e.target.value })}
                      />
                      <FieldErrorText message={fe("vehicle", "driverName", v.id)} />
                    </label>
                    <label>
                      <FieldLabel>CCCD</FieldLabel>
                      <input
                        className={`${fieldInputClass(Boolean(fe("vehicle", "driverId", v.id)))} font-mono`}
                        inputMode="numeric"
                        value={v.driverId}
                        onChange={(e) => onPatchVehicle(idx, { driverId: e.target.value.replace(/\D/g, "") })}
                      />
                      <FieldErrorText message={fe("vehicle", "driverId", v.id)} />
                    </label>
                  </div>
                </ItemCard>
              ))
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
