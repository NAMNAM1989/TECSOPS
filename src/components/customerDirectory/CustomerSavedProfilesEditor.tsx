import { useEffect, useState, type ReactNode } from "react";
import type {
  CustomerDirectoryEntry,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
  CustomerSavedVehicle,
} from "../../types/customerDirectory";
import {
  normalizeAgentCode,
  parseCustomerProfileOcrJson,
  patchShipperFromOcr,
} from "../../utils/customerProfileInputFormat";
import { normalizeVehiclePlateInput } from "../../utils/vehiclePlateNormalize";
import { suggestSavedItemLabel } from "../../utils/customerDirectoryScaffold";
import { emptyCustomerSavedConsignee } from "../../utils/customerDirectoryProfile";
import { normalizePrintAddressMultiline } from "../../utils/printAddressMultiline";
import { OPS } from "../../styles/opsModalStyles";
import {
  CustomerValidationBanner,
  FieldErrorText,
  SectionErrorHint,
  fieldInputClass,
} from "./CustomerValidationField";
import type { CustomerFieldError } from "../../utils/customerDirectoryValidation";
import { getFieldValidationError } from "../../utils/customerDirectoryValidation";

const inputCls = `w-full min-h-11 text-base sm:min-h-0 sm:text-xs ${OPS.input}`;

type ProfileTab = "shipper" | "consignee" | "goods" | "vehicle";

type Props = {
  entry: CustomerDirectoryEntry;
  errors: CustomerFieldError[];
  onPatch: (
    patch: Partial<Omit<CustomerDirectoryEntry, "id" | "parties">>,
  ) => void;
  onPatchShipper: (index: number, patch: Partial<CustomerSavedShipper>) => void;
  onRemoveShipper: (index: number) => void;
  onAddShipper: () => void;
  onPatchConsignee: (
    index: number,
    patch: Partial<CustomerSavedConsignee>,
  ) => void;
  onRemoveConsignee: (index: number) => void;
  onAddConsignee: () => void;
  onPatchGoods: (index: number, patch: Partial<CustomerSavedGoods>) => void;
  onRemoveGoods: (index: number) => void;
  onAddGoods: () => void;
  onPatchVehicle: (index: number, patch: Partial<CustomerSavedVehicle>) => void;
  onRemoveVehicle: (index: number) => void;
  onAddVehicle: () => void;
};

/** Nhãn tab khớp mẫu Excel Hồ sơ KH / điền OPS. */
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
        <span
          className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${OPS.secondary}`}
        >
          {title}
        </span>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-[10px] font-semibold text-red-600 hover:underline"
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
  return (
    <span className={`mb-0.5 block text-[10px] font-medium ${OPS.muted}`}>
      {children}
    </span>
  );
}

function resolveDefaultConsigneeIndex(
  entry: CustomerDirectoryEntry,
  consignees: CustomerSavedConsignee[],
): number {
  if (!consignees.length) return -1;
  const byId = consignees.findIndex((c) => c.id === entry.defaultConsigneeId);
  return byId >= 0 ? byId : 0;
}

/**
 * Tab « Dữ liệu mặc định » — field theo mẫu Excel Hồ sơ KH
 * (Người gửi / CNEE+Notify / Loại hàng / Xe·TX) để đồng bộ điền OPS.
 */
export function CustomerDefaultDataEditor({
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

  const defaultCneeIdx = resolveDefaultConsigneeIndex(entry, consignees);
  const defaultNotify =
    defaultCneeIdx >= 0 ? (consignees[defaultCneeIdx]?.notifyName ?? "") : "";

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
    currentLabel: string,
  ) => {
    if (currentLabel.trim()) return;
    const label = suggestSavedItemLabel(primary, entry.code);
    if (label) patch(idx, { label });
  };

  const patchDefaultNotify = (value: string) => {
    if (defaultCneeIdx >= 0) {
      onPatchConsignee(defaultCneeIdx, { notifyName: value });
      return;
    }
    const created = emptyCustomerSavedConsignee();
    onPatch({
      savedConsignees: [{ ...created, notifyName: value }],
      defaultConsigneeId: created.id,
    });
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
      <p className="text-[10px] font-bold uppercase tracking-wide text-ui-text-muted">
        <span className="sm:hidden">Hồ sơ mặc định</span>
        <span className="hidden sm:inline">
          Dữ liệu mặc định · mẫu Excel Hồ sơ KH
        </span>
      </p>

      <div className="rounded-lg border border-ui-border bg-ui-surface p-2 sm:p-2.5">
        <span className="mb-1.5 block text-[10px] font-bold uppercase text-ui-text-muted">
          Notify party
        </span>
        <textarea
          value={defaultNotify}
          onChange={(e) => patchDefaultNotify(e.target.value)}
          rows={2}
          className={`${inputCls} min-h-14 resize-y sm:min-h-[2.5rem]`}
          placeholder="VD: NOTIFY GLOBAL LOGISTICS…"
        />
        <p className={`mt-1 text-[10px] leading-snug ${OPS.muted}`}>
          Đồng bộ CNEE mặc định · điền OPS / eSID
        </p>
      </div>

      <div className="rounded-lg border border-ui-border bg-ui-surface">
        <div className="flex items-center gap-1 border-b border-ui-border px-1 py-1 sm:px-1.5">
          <div
            className="-mx-0.5 flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-0.5 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Nhóm hồ sơ mặc định"
          >
            {TAB_LABELS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`shrink-0 touch-manipulation rounded-md px-2.5 py-2 text-[12px] font-semibold transition sm:px-2 sm:py-1.5 sm:text-[11px] ${
                  tab === id
                    ? "bg-ui-surface shadow-sm ring-1 ring-ui-primary/30"
                    : "text-ui-text-muted hover:bg-ui-surface-muted"
                }`}
              >
                {label}
                {counts[id] > 0 ? ` (${counts[id]})` : ""}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1 pl-0.5">
            <SectionErrorHint errors={errors} section={tab} />
            <button
              type="button"
              onClick={tabAdd[tab]}
              className="touch-manipulation rounded-full border border-ui-border px-2.5 py-1.5 text-[11px] font-semibold text-ui-primary hover:bg-ui-primary/10 sm:py-1 sm:text-[10px]"
            >
              + Thêm
            </button>
          </div>
        </div>

        <div className="p-2">
          <CustomerValidationBanner
            errors={errors.filter((e) => e.section === tab)}
          />
          {tab === "shipper" ? (
            shippers.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${OPS.muted}`}>
                Chưa có người gửi.
              </p>
            ) : (
              shippers.map((s, idx) => (
                <ItemCard
                  key={s.id}
                  title={
                    s.shipperName.trim() || s.label.trim() || `#${idx + 1}`
                  }
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
                      <FieldLabel>Tên</FieldLabel>
                      <input
                        className={fieldInputClass(
                          Boolean(fe("shipper", "shipperName", s.id)),
                        )}
                        value={s.shipperName}
                        onChange={(e) =>
                          onPatchShipper(idx, { shipperName: e.target.value })
                        }
                        onBlur={() =>
                          fillLabelIfEmpty(
                            idx,
                            s.shipperName,
                            onPatchShipper,
                            s.label,
                          )
                        }
                      />
                      <FieldErrorText
                        message={fe("shipper", "shipperName", s.id)}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <FieldLabel>Địa chỉ</FieldLabel>
                      <textarea
                        className={`${fieldInputClass(false)} resize-y whitespace-pre-wrap break-words leading-relaxed`}
                        rows={2}
                        value={s.shipperAddress}
                        onChange={(e) =>
                          onPatchShipper(idx, {
                            shipperAddress: e.target.value,
                          })
                        }
                        onBlur={(e) =>
                          onPatchShipper(idx, {
                            shipperAddress: normalizePrintAddressMultiline(
                              e.target.value,
                              6,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      <FieldLabel>Email</FieldLabel>
                      <input
                        className={inputCls}
                        value={s.shipperEmail}
                        onChange={(e) =>
                          onPatchShipper(idx, {
                            shipperEmail: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <FieldLabel>ĐT</FieldLabel>
                      <input
                        className={`${fieldInputClass(Boolean(fe("shipper", "shipperPhone", s.id)))} tabular-nums`}
                        value={s.shipperPhone}
                        onChange={(e) =>
                          onPatchShipper(idx, { shipperPhone: e.target.value })
                        }
                        onBlur={(e) =>
                          onPatchShipper(idx, {
                            shipperPhone: e.target.value.trim(),
                          })
                        }
                      />
                      <FieldErrorText
                        message={fe("shipper", "shipperPhone", s.id)}
                      />
                    </label>
                    <label>
                      <FieldLabel>MST</FieldLabel>
                      <input
                        className={`${inputCls} font-mono`}
                        value={s.taxCode}
                        onChange={(e) =>
                          onPatchShipper(idx, { taxCode: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <FieldLabel>Mã / nhãn</FieldLabel>
                      <input
                        className={`${inputCls} font-mono uppercase`}
                        value={s.label}
                        onChange={(e) =>
                          onPatchShipper(idx, { label: e.target.value })
                        }
                        onBlur={(e) =>
                          onPatchShipper(idx, {
                            label: normalizeAgentCode(e.target.value),
                          })
                        }
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => void applyOcrPaste(idx)}
                        className={OPS.btnSmallAccent}
                      >
                        Dán OCR
                      </button>
                      {ocrHint ? (
                        <span className={`text-[10px] ${OPS.secondary}`}>
                          {ocrHint}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </ItemCard>
              ))
            )
          ) : null}

          {tab === "consignee" ? (
            consignees.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${OPS.muted}`}>
                Chưa có CNEE — có thể bỏ qua hoặc nhập Notify party phía trên.
              </p>
            ) : (
              consignees.map((c, idx) => (
                <ItemCard
                  key={c.id}
                  title={
                    c.consigneeName.trim() || c.label.trim() || `#${idx + 1}`
                  }
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
                        className={fieldInputClass(
                          Boolean(fe("consignee", "consigneeName", c.id)),
                        )}
                        value={c.consigneeName}
                        onChange={(e) =>
                          onPatchConsignee(idx, {
                            consigneeName: e.target.value,
                          })
                        }
                        onBlur={() =>
                          fillLabelIfEmpty(
                            idx,
                            c.consigneeName,
                            onPatchConsignee,
                            c.label,
                          )
                        }
                      />
                      <FieldErrorText
                        message={fe("consignee", "consigneeName", c.id)}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <FieldLabel>Địa chỉ</FieldLabel>
                      <textarea
                        className={`${fieldInputClass(false)} resize-y whitespace-pre-wrap break-words leading-relaxed`}
                        rows={2}
                        value={c.consigneeAddress}
                        onChange={(e) =>
                          onPatchConsignee(idx, {
                            consigneeAddress: e.target.value,
                          })
                        }
                        onBlur={(e) =>
                          onPatchConsignee(idx, {
                            consigneeAddress: normalizePrintAddressMultiline(
                              e.target.value,
                              6,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      <FieldLabel>Email</FieldLabel>
                      <input
                        className={inputCls}
                        value={c.consigneeEmail}
                        onChange={(e) =>
                          onPatchConsignee(idx, {
                            consigneeEmail: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <FieldLabel>ĐT</FieldLabel>
                      <input
                        className={`${fieldInputClass(Boolean(fe("consignee", "consigneePhone", c.id)))} tabular-nums`}
                        value={c.consigneePhone}
                        onChange={(e) =>
                          onPatchConsignee(idx, {
                            consigneePhone: e.target.value,
                          })
                        }
                        onBlur={(e) =>
                          onPatchConsignee(idx, {
                            consigneePhone: e.target.value.trim(),
                          })
                        }
                      />
                      <FieldErrorText
                        message={fe("consignee", "consigneePhone", c.id)}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <FieldLabel>Notify party</FieldLabel>
                      <textarea
                        className={`${inputCls} min-h-[2.25rem] resize-y`}
                        rows={2}
                        value={c.notifyName}
                        onChange={(e) =>
                          onPatchConsignee(idx, {
                            notifyName: e.target.value,
                          })
                        }
                        placeholder="NOTIFY…"
                      />
                    </label>
                    <label>
                      <FieldLabel>Mã / nhãn (DEST…)</FieldLabel>
                      <input
                        className={`${inputCls} font-mono uppercase`}
                        value={c.label}
                        onChange={(e) =>
                          onPatchConsignee(idx, { label: e.target.value })
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
              <p className={`py-3 text-center text-[11px] ${OPS.muted}`}>
                Chưa có loại hàng (Nature of Goods).
              </p>
            ) : (
              goods.map((g, idx) => (
                <ItemCard
                  key={g.id}
                  title={
                    g.goodsDescription.trim() || g.label.trim() || `#${idx + 1}`
                  }
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
                    <FieldLabel>Loại hàng</FieldLabel>
                    <input
                      className={fieldInputClass(
                        Boolean(fe("goods", "goodsDescription", g.id)),
                      )}
                      placeholder="GARMENT, SEAFOOD…"
                      value={g.goodsDescription}
                      onChange={(e) =>
                        onPatchGoods(idx, { goodsDescription: e.target.value })
                      }
                      onBlur={() =>
                        fillLabelIfEmpty(
                          idx,
                          g.goodsDescription,
                          onPatchGoods,
                          g.label,
                        )
                      }
                    />
                    <FieldErrorText
                      message={fe("goods", "goodsDescription", g.id)}
                    />
                  </label>
                </ItemCard>
              ))
            )
          ) : null}

          {tab === "vehicle" ? (
            vehicles.length === 0 ? (
              <p className={`py-3 text-center text-[11px] ${OPS.muted}`}>
                Chưa có xe — thêm biển số / tài xế nếu cần.
              </p>
            ) : (
              vehicles.map((v, idx) => (
                <ItemCard
                  key={v.id}
                  title={
                    v.licensePlate.trim() ||
                    v.driverName.trim() ||
                    `#${idx + 1}`
                  }
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
                      <FieldLabel>Nhãn</FieldLabel>
                      <input
                        className={fieldInputClass(false)}
                        value={v.label ?? ""}
                        onChange={(e) =>
                          onPatchVehicle(idx, { label: e.target.value })
                        }
                        placeholder="Xe cố định / Thuê ngoài"
                      />
                    </label>
                    <label>
                      <FieldLabel>Loại xe</FieldLabel>
                      <select
                        className={fieldInputClass(false)}
                        value={v.vehicleType ?? "OTO"}
                        onChange={(e) =>
                          onPatchVehicle(idx, {
                            vehicleType: e.target.value as
                              | "OTO"
                              | "XEMAY"
                              | "BAGAC"
                              | "DIBO",
                          })
                        }
                      >
                        <option value="OTO">Ô tô</option>
                        <option value="XEMAY">Xe máy</option>
                        <option value="BAGAC">Xe ba gác</option>
                        <option value="DIBO">Đi bộ</option>
                      </select>
                    </label>
                    <label>
                      <FieldLabel>Biển số xe</FieldLabel>
                      <input
                        className={`${fieldInputClass(Boolean(fe("vehicle", "licensePlate", v.id)))} font-mono uppercase`}
                        value={v.licensePlate}
                        onChange={(e) =>
                          onPatchVehicle(idx, { licensePlate: e.target.value })
                        }
                        onBlur={(e) =>
                          onPatchVehicle(idx, {
                            licensePlate: normalizeVehiclePlateInput(
                              e.target.value,
                            ),
                          })
                        }
                      />
                      <FieldErrorText
                        message={fe("vehicle", "licensePlate", v.id)}
                      />
                    </label>
                    <label>
                      <FieldLabel>Tên tài xế</FieldLabel>
                      <input
                        className={fieldInputClass(
                          Boolean(fe("vehicle", "driverName", v.id)),
                        )}
                        value={v.driverName}
                        onChange={(e) =>
                          onPatchVehicle(idx, { driverName: e.target.value })
                        }
                      />
                      <FieldErrorText
                        message={fe("vehicle", "driverName", v.id)}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <FieldLabel>Giấy tờ tài xế</FieldLabel>
                      <div className="mt-0.5 flex gap-1.5">
                        <select
                          className={fieldInputClass(false)}
                          value={v.driverIdType ?? "CCCD"}
                          onChange={(e) => {
                            const driverIdType = e.target.value as
                              | "CCCD"
                              | "PP"
                              | "GPLX";
                            const nextId =
                              driverIdType === "CCCD"
                                ? v.driverId.replace(/\D/g, "")
                                : v.driverId
                                    .replace(/[^A-Za-z0-9]/g, "")
                                    .toUpperCase();
                            onPatchVehicle(idx, { driverIdType, driverId: nextId });
                          }}
                        >
                          <option value="CCCD">CCCD</option>
                          <option value="PP">Passport</option>
                          <option value="GPLX">GPLX</option>
                        </select>
                        <input
                          className={`${fieldInputClass(Boolean(fe("vehicle", "driverId", v.id)))} font-mono uppercase`}
                          inputMode={
                            (v.driverIdType ?? "CCCD") === "CCCD"
                              ? "numeric"
                              : "text"
                          }
                          value={v.driverId}
                          onChange={(e) => {
                            const idType = v.driverIdType ?? "CCCD";
                            const raw = e.target.value;
                            onPatchVehicle(idx, {
                              driverId:
                                idType === "CCCD"
                                  ? raw.replace(/\D/g, "")
                                  : raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
                            });
                          }}
                        />
                      </div>
                      <FieldErrorText
                        message={fe("vehicle", "driverId", v.id)}
                      />
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

/** @deprecated Dùng `CustomerDefaultDataEditor` (tab Dữ liệu mặc định). */
export const CustomerSavedProfilesEditor = CustomerDefaultDataEditor;
