import { useState, type ReactNode } from "react";
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
import { CD, cdInput } from "./customerDirectoryStyles";

const inputCls = `w-full text-sm ${cdInput}`;

type Props = {
  entry: CustomerDirectoryEntry;
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

function DefaultToggle({
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
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-sm leading-none ${
        active ? "text-amber-500" : `${CD.muted} hover:text-amber-500 dark:hover:text-amber-400`
      }`}
      aria-label={title}
      aria-pressed={active}
    >
      {active ? "★ Mặc định" : "☆ Đặt mặc định"}
    </button>
  );
}

function SectionHead({
  title,
  hint,
  onAdd,
  addLabel,
}: {
  title: string;
  hint: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-2 border-b border-black/[0.06] pb-2 dark:border-white/[0.08]">
      <div>
        <h4 className={`text-xs font-bold uppercase tracking-wide ${CD.title}`}>{title}</h4>
        <p className={`mt-0.5 text-[10px] leading-snug ${CD.muted}`}>{hint}</p>
      </div>
      <button type="button" onClick={onAdd} className={`shrink-0 ${CD.btnSmallAccent}`}>
        {addLabel}
      </button>
    </div>
  );
}

function CardShell({
  title,
  defaultControl,
  onRemove,
  canRemove,
  children,
}: {
  title: string;
  defaultControl: ReactNode;
  onRemove: () => void;
  canRemove: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`mb-2 rounded-xl border p-2.5 sm:p-3 ${CD.card}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${CD.secondary}`}>{title}</span>
        <div className="flex items-center gap-2">
          {defaultControl}
          {canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/15"
            >
              Xóa
            </button>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function OptionalFields({ children }: { children: ReactNode }) {
  return (
    <details className="mt-2">
      <summary className={`cursor-pointer text-[10px] font-semibold ${CD.muted}`}>Thêm chi tiết (tùy chọn)</summary>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </details>
  );
}

export function CustomerSavedProfilesEditor({
  entry,
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
  const [ocrHint, setOcrHint] = useState<string | null>(null);

  const shippers = entry.savedShippers ?? [];
  const consignees = entry.savedConsignees ?? [];
  const goods = entry.savedGoods ?? [];
  const vehicles = entry.savedVehicles ?? [];

  const applyOcrPaste = async (idx: number) => {
    setOcrHint(null);
    let raw = "";
    try {
      raw = await navigator.clipboard.readText();
    } catch {
      setOcrHint("Không đọc được clipboard.");
      return;
    }
    const ocr = parseCustomerProfileOcrJson(raw);
    if (!ocr) {
      setOcrHint("Clipboard không phải JSON OCR hợp lệ.");
      return;
    }
    const s = shippers[idx];
    if (!s) return;
    onPatchShipper(idx, patchShipperFromOcr(s, ocr));
    setOcrHint("Đã điền từ OCR.");
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

  return (
    <section className="space-y-4">
      <div className={`rounded-xl p-2.5 ${CD.panelSoft}`}>
        <label className={`mb-1 block text-[10px] font-semibold uppercase ${CD.muted}`}>
          Ghi chú in phiếu cân
        </label>
        <textarea
          value={entry.otherRequirementsPrint ?? ""}
          onChange={(e) => onPatch({ otherRequirementsPrint: e.target.value })}
          rows={2}
          className={`${inputCls} min-h-[3rem] resize-y`}
          placeholder="VD: GIỮ KHÔ, KHÔNG XẾP CHỒNG… (để trống nếu không có)"
        />
      </div>

      <div>
        <SectionHead
          title="Người gửi"
          hint="In trên phiếu cân · ★ = dùng mặc định khi booking"
          onAdd={onAddShipper}
          addLabel="+ Thêm"
        />
        {shippers.length === 0 ? (
          <p className={CD.empty}>Chưa có — bấm « + Thêm ».</p>
        ) : (
          shippers.map((s, idx) => (
            <CardShell
              key={s.id}
              title={s.shipperName.trim() || s.label.trim() || `Người gửi ${idx + 1}`}
              canRemove={shippers.length > 1}
              onRemove={() => onRemoveShipper(idx)}
              defaultControl={
                <DefaultToggle
                  active={entry.defaultShipperId === s.id}
                  onClick={() => onPatch({ defaultShipperId: s.id })}
                  title="Người gửi mặc định"
                />
              }
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Tên in phiếu</span>
                  <input
                    className={inputCls}
                    placeholder="Tên công ty / người gửi"
                    value={s.shipperName}
                    onChange={(e) => onPatchShipper(idx, { shipperName: e.target.value })}
                    onBlur={() => fillLabelIfEmpty(idx, s.shipperName, onPatchShipper, s.label)}
                  />
                </label>
                <label>
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Số điện thoại</span>
                  <input
                    className={`${inputCls} tabular-nums`}
                    placeholder="09…"
                    value={s.shipperPhone}
                    onChange={(e) => onPatchShipper(idx, { shipperPhone: e.target.value })}
                    onBlur={(e) => onPatchShipper(idx, { shipperPhone: formatVnPhoneDisplay(e.target.value) })}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Địa chỉ</span>
                  <textarea
                    className={`${inputCls} resize-y`}
                    rows={2}
                    placeholder="Enter để xuống dòng khi in"
                    value={s.shipperAddress}
                    onChange={(e) => onPatchShipper(idx, { shipperAddress: e.target.value })}
                  />
                </label>
              </div>
              <OptionalFields>
                <label>
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Mã nhận diện</span>
                  <input
                    className={`${inputCls} font-mono uppercase`}
                    placeholder="VD: HCM"
                    value={s.label}
                    onChange={(e) => onPatchShipper(idx, { label: e.target.value })}
                    onBlur={(e) => onPatchShipper(idx, { label: normalizeAgentCode(e.target.value) })}
                  />
                </label>
                <label>
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Mã số thuế</span>
                  <input
                    className={inputCls}
                    value={s.taxCode}
                    onChange={(e) => onPatchShipper(idx, { taxCode: e.target.value })}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Email</span>
                  <input
                    className={inputCls}
                    value={s.shipperEmail}
                    onChange={(e) => onPatchShipper(idx, { shipperEmail: e.target.value })}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  <button type="button" onClick={() => void applyOcrPaste(idx)} className={CD.btnSmallAccent}>
                    Dán OCR (clipboard)
                  </button>
                  {ocrHint ? <span className={`text-[10px] ${CD.secondary}`}>{ocrHint}</span> : null}
                </div>
              </OptionalFields>
            </CardShell>
          ))
        )}
      </div>

      <div>
        <SectionHead
          title="Người nhận (CNEE)"
          hint="Chọn khi in phiếu / booking có nhiều điểm nhận"
          onAdd={onAddConsignee}
          addLabel="+ Thêm"
        />
        {consignees.length === 0 ? (
          <p className={`${CD.empty} text-[11px]`}>Chưa có — bỏ qua nếu chỉ nhập trên từng lô.</p>
        ) : (
          consignees.map((c, idx) => (
            <CardShell
              key={c.id}
              title={c.consigneeName.trim() || c.label.trim() || `CNEE ${idx + 1}`}
              canRemove
              onRemove={() => onRemoveConsignee(idx)}
              defaultControl={
                <DefaultToggle
                  active={entry.defaultConsigneeId === c.id}
                  onClick={() => onPatch({ defaultConsigneeId: c.id })}
                  title="CNEE mặc định"
                />
              }
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Tên người nhận</span>
                  <input
                    className={inputCls}
                    value={c.consigneeName}
                    onChange={(e) => onPatchConsignee(idx, { consigneeName: e.target.value })}
                    onBlur={() => fillLabelIfEmpty(idx, c.consigneeName, onPatchConsignee, c.label)}
                  />
                </label>
                <label>
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Số điện thoại</span>
                  <input
                    className={`${inputCls} tabular-nums`}
                    value={c.consigneePhone}
                    onChange={(e) => onPatchConsignee(idx, { consigneePhone: e.target.value })}
                    onBlur={(e) => onPatchConsignee(idx, { consigneePhone: formatVnPhoneDisplay(e.target.value) })}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Địa chỉ</span>
                  <textarea
                    className={`${inputCls} resize-y`}
                    rows={2}
                    value={c.consigneeAddress}
                    onChange={(e) => onPatchConsignee(idx, { consigneeAddress: e.target.value })}
                  />
                </label>
              </div>
              <OptionalFields>
                <label>
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Mã nhận diện</span>
                  <input
                    className={`${inputCls} font-mono uppercase`}
                    value={c.label}
                    onChange={(e) => onPatchConsignee(idx, { label: e.target.value })}
                    onBlur={(e) => onPatchConsignee(idx, { label: normalizeAgentCode(e.target.value) })}
                  />
                </label>
                <label>
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Email</span>
                  <input
                    className={inputCls}
                    value={c.consigneeEmail}
                    onChange={(e) => onPatchConsignee(idx, { consigneeEmail: e.target.value })}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Notify</span>
                  <input
                    className={inputCls}
                    value={c.notifyName}
                    onChange={(e) => onPatchConsignee(idx, { notifyName: e.target.value })}
                  />
                </label>
              </OptionalFields>
            </CardShell>
          ))
        )}
      </div>

      <div>
        <SectionHead
          title="Tên hàng"
          hint="Mô tả in trên phiếu cân — có thể bỏ qua nếu nhập trên từng lô"
          onAdd={onAddGoods}
          addLabel="+ Thêm"
        />
        {goods.length === 0 ? (
          <p className={`${CD.empty} text-[11px]`}>Chưa có mẫu tên hàng.</p>
        ) : (
          goods.map((g, idx) => (
            <CardShell
              key={g.id}
              title={g.goodsDescription.trim() || g.label.trim() || `Hàng ${idx + 1}`}
              canRemove
              onRemove={() => onRemoveGoods(idx)}
              defaultControl={
                <DefaultToggle
                  active={entry.defaultGoodsId === g.id}
                  onClick={() => onPatch({ defaultGoodsId: g.id })}
                  title="Tên hàng mặc định"
                />
              }
            >
              <label>
                <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Mô tả in phiếu</span>
                <input
                  className={inputCls}
                  placeholder="VD: GARMENT, SEAFOOD…"
                  value={g.goodsDescription}
                  onChange={(e) => onPatchGoods(idx, { goodsDescription: e.target.value })}
                  onBlur={() => fillLabelIfEmpty(idx, g.goodsDescription, onPatchGoods, g.label)}
                />
              </label>
            </CardShell>
          ))
        )}
      </div>

      <div>
        <SectionHead
          title="Xe / tài xế"
          hint="Chỉ cần nếu đăng ký eCargo KHO SCSC"
          onAdd={onAddVehicle}
          addLabel="+ Thêm"
        />
        {vehicles.length === 0 ? (
          <p className={`${CD.empty} text-[11px]`}>Chưa có xe lưu sẵn.</p>
        ) : (
          vehicles.map((v, idx) => (
            <CardShell
              key={v.id}
              title={v.licensePlate.trim() || v.driverName.trim() || `Xe ${idx + 1}`}
              canRemove
              onRemove={() => onRemoveVehicle(idx)}
              defaultControl={
                <DefaultToggle
                  active={entry.defaultVehicleId === v.id}
                  onClick={() => onPatch({ defaultVehicleId: v.id })}
                  title="Xe mặc định eCargo"
                />
              }
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label>
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Biển số</span>
                  <input
                    className={`${inputCls} font-mono uppercase`}
                    placeholder="50H17480"
                    value={v.licensePlate}
                    onChange={(e) => onPatchVehicle(idx, { licensePlate: e.target.value })}
                    onBlur={(e) => onPatchVehicle(idx, { licensePlate: formatVehicleLicensePlate(e.target.value) })}
                  />
                </label>
                <label>
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>Tài xế</span>
                  <input
                    className={inputCls}
                    value={v.driverName}
                    onChange={(e) => onPatchVehicle(idx, { driverName: e.target.value })}
                  />
                </label>
                <label>
                  <span className={`mb-0.5 block text-[10px] font-medium ${CD.muted}`}>CCCD</span>
                  <input
                    className={`${inputCls} font-mono`}
                    inputMode="numeric"
                    value={v.driverId}
                    onChange={(e) => onPatchVehicle(idx, { driverId: e.target.value.replace(/\D/g, "") })}
                  />
                </label>
              </div>
            </CardShell>
          ))
        )}
      </div>
    </section>
  );
}
