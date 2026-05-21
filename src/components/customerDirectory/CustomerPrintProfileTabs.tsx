import { Fragment, useState } from "react";
import type {
  CustomerDirectoryEntry,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
  CustomerSavedVehicle,
} from "../../types/customerDirectory";
import { profileOptionLabel } from "../../utils/customerDirectoryDefaults";
import { formatVnPhoneDisplay, normalizeAgentCode } from "../../utils/customerProfileInputFormat";
import { CustomerShipperTable } from "./CustomerShipperTable";
import { CustomerVehicleTable } from "./CustomerVehicleTable";

type ProfileTab = "shipper" | "cnee" | "goods" | "vehicles";

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

const inputCls =
  "w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/15";

function StarButton({ active, onClick, title }: { active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-lg px-1.5 py-0.5 text-sm leading-none ${
        active ? "text-amber-500" : "text-apple-tertiary hover:text-amber-600"
      }`}
      aria-label={title}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

export function CustomerPrintProfileTabs({
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
  const [tab, setTab] = useState<ProfileTab>("shipper");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const shippers = entry.savedShippers ?? [];
  const consignees = entry.savedConsignees ?? [];
  const goods = entry.savedGoods ?? [];
  const vehicles = entry.savedVehicles ?? [];

  const tabs: { id: ProfileTab; label: string; count: number }[] = [
    { id: "shipper", label: "Shippers", count: shippers.length },
    { id: "cnee", label: "Consignees", count: consignees.length },
    { id: "goods", label: "Cargo Items", count: goods.length },
    { id: "vehicles", label: "Xe / tài xế", count: vehicles.length },
  ];

  function setDefaultShipper(id: string) {
    onPatch({ defaultShipperId: id });
  }
  function setDefaultConsignee(id: string) {
    onPatch({ defaultConsigneeId: id });
  }
  function setDefaultGoods(id: string) {
    onPatch({ defaultGoodsId: id });
  }
  function setDefaultVehicle(id: string) {
    onPatch({ defaultVehicleId: id });
  }

  return (
    <section className="rounded-xl border border-apple-blue/20 bg-apple-blue/[0.04] p-2.5 sm:p-3">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-apple-blue">Hồ sơ in phiếu cân</p>
      <p className="mb-2 text-[10px] leading-snug text-apple-tertiary">
        ★ = mặc định khi booking / eCargo · SĐT tự format · OCR/JSON patch shipper
      </p>

      <section className="mb-2 rounded-lg border border-violet-200/50 bg-white/80 p-2">
        <label className="mb-1 block text-[10px] font-semibold uppercase text-violet-900">
          Yêu cầu khác
        </label>
        <p className="mb-2 text-[10px] leading-snug text-apple-tertiary">
          In ở cuối phiếu cân SCSC (mỗi khách một nội dung). Để trống nếu không có.
        </p>
        <textarea
          value={entry.otherRequirementsPrint ?? ""}
          onChange={(e) => onPatch({ otherRequirementsPrint: e.target.value })}
          rows={3}
          className={`${inputCls} resize-y min-h-[4.5rem]`}
          placeholder="VD: KHÔNG XẾP CHỒNG, GIỮ KHÔ, GIAO TRƯỚC 14H…"
        />
      </section>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setExpandedKey(null);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.id
                ? "bg-apple-blue text-white shadow-sm"
                : "border border-black/[0.1] bg-white text-apple-label hover:bg-black/[0.03]"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {tab === "shipper" ? (
        <CustomerShipperTable
          shippers={shippers}
          defaultShipperId={entry.defaultShipperId}
          onSetDefault={setDefaultShipper}
          onPatch={onPatchShipper}
          onRemove={onRemoveShipper}
          onAdd={onAddShipper}
        />
      ) : null}

      {tab === "cnee" ? (
        <ProfileTable
          rows={consignees.map((c, idx) => ({
            key: c.id,
            starActive: entry.defaultConsigneeId === c.id,
            onStar: () => setDefaultConsignee(c.id),
            starTitle: "CNEE mặc định",
            cols: [c.label || "—", c.consigneeName || "—", c.consigneePhone || "—"],
            expanded: expandedKey === `cn-${c.id}`,
            onToggle: () => setExpandedKey(expandedKey === `cn-${c.id}` ? null : `cn-${c.id}`),
            onRemove: () => onRemoveConsignee(idx),
            detail: <ConsigneeDetail c={c} idx={idx} onPatch={onPatchConsignee} />,
          }))}
          headers={["Nhãn", "Tên CNEE", "SĐT"]}
          addLabel="+ Thêm CNEE"
          onAdd={onAddConsignee}
          emptyHint="Chưa có CNEE lưu sẵn."
        />
      ) : null}

      {tab === "goods" ? (
        <ProfileTable
          rows={goods.map((g, idx) => ({
            key: g.id,
            starActive: entry.defaultGoodsId === g.id,
            onStar: () => setDefaultGoods(g.id),
            starTitle: "Tên hàng mặc định",
            cols: [g.label || "—", g.goodsDescription || "—"],
            expanded: expandedKey === `gd-${g.id}`,
            onToggle: () => setExpandedKey(expandedKey === `gd-${g.id}` ? null : `gd-${g.id}`),
            onRemove: () => onRemoveGoods(idx),
            detail: <GoodsDetail g={g} idx={idx} onPatch={onPatchGoods} />,
          }))}
          headers={["Nhãn", "Mô tả in phiếu"]}
          addLabel="+ Thêm tên hàng"
          onAdd={onAddGoods}
          emptyHint="Chưa có tên hàng lưu sẵn."
        />
      ) : null}

      {tab === "vehicles" ? (
        <CustomerVehicleTable
          vehicles={vehicles}
          defaultVehicleId={entry.defaultVehicleId}
          onSetDefault={setDefaultVehicle}
          onPatch={onPatchVehicle}
          onRemove={onRemoveVehicle}
          onAdd={onAddVehicle}
        />
      ) : null}
    </section>
  );
}

function ProfileTable(props: {
  headers: string[];
  rows: {
    key: string;
    starActive: boolean;
    onStar: () => void;
    starTitle: string;
    cols: string[];
    expanded: boolean;
    onToggle: () => void;
    onRemove: () => void;
    detail: React.ReactNode;
  }[];
  addLabel: string;
  onAdd: () => void;
  emptyHint: string;
}) {
  const { headers, rows, addLabel, onAdd, emptyHint } = props;
  return (
    <div>
      {rows.length === 0 ? (
        <p className="mb-2 rounded-xl border border-dashed border-black/[0.12] bg-white/80 px-3 py-4 text-center text-xs text-apple-tertiary">
          {emptyHint}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-black/[0.08] bg-apple-bg/80 text-[10px] font-semibold uppercase text-apple-tertiary">
                <th className="w-8 px-2 py-2" />
                {headers.map((h) => (
                  <th key={h} className="px-2 py-2">
                    {h}
                  </th>
                ))}
                <th className="w-16 px-2 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.key}>
                  <tr className="border-b border-black/[0.06] hover:bg-apple-bg/40">
                    <td className="px-2 py-2 align-middle">
                      <StarButton active={row.starActive} onClick={row.onStar} title={row.starTitle} />
                    </td>
                    {row.cols.map((cell, i) => (
                      <td key={i} className="max-w-[8rem] truncate px-2 py-2 font-medium text-apple-label">
                        {cell}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right align-middle">
                      <button
                        type="button"
                        onClick={row.onToggle}
                        className="mr-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-apple-blue hover:bg-apple-blue/10"
                      >
                        {row.expanded ? "Thu" : "Sửa"}
                      </button>
                      <button
                        type="button"
                        onClick={row.onRemove}
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                  {row.expanded ? (
                    <tr key={`${row.key}-detail`}>
                      <td colSpan={headers.length + 2} className="bg-apple-bg/50 px-3 py-3">
                        {row.detail}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 w-full rounded-full border border-dashed border-apple-blue/40 bg-white py-2 text-xs font-semibold text-apple-blue hover:bg-apple-blue/5"
      >
        {addLabel}
      </button>
    </div>
  );
}

function ConsigneeDetail({
  c,
  idx,
  onPatch,
}: {
  c: CustomerSavedConsignee;
  idx: number;
  onPatch: (index: number, patch: Partial<CustomerSavedConsignee>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <input className={inputCls} placeholder="Nhãn" value={c.label} onChange={(e) => onPatch(idx, { label: e.target.value })} onBlur={(e) => onPatch(idx, { label: normalizeAgentCode(e.target.value) })} />
      <input
        className={inputCls}
        placeholder="Tên consignee"
        value={c.consigneeName}
        onChange={(e) => onPatch(idx, { consigneeName: e.target.value })}
      />
      <textarea
        className={`${inputCls} sm:col-span-2`}
        rows={2}
        placeholder="Địa chỉ — Enter để xuống dòng khi in"
        value={c.consigneeAddress}
        onChange={(e) => onPatch(idx, { consigneeAddress: e.target.value })}
      />
      <input className={inputCls} placeholder="SĐT" value={c.consigneePhone} onChange={(e) => onPatch(idx, { consigneePhone: e.target.value })} onBlur={(e) => onPatch(idx, { consigneePhone: formatVnPhoneDisplay(e.target.value) })} />
      <input className={inputCls} placeholder="Email" value={c.consigneeEmail} onChange={(e) => onPatch(idx, { consigneeEmail: e.target.value })} />
      <input
        className={`${inputCls} sm:col-span-2`}
        placeholder="Notify"
        value={c.notifyName}
        onChange={(e) => onPatch(idx, { notifyName: e.target.value })}
      />
    </div>
  );
}

function GoodsDetail({
  g,
  idx,
  onPatch,
}: {
  g: CustomerSavedGoods;
  idx: number;
  onPatch: (index: number, patch: Partial<CustomerSavedGoods>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      <input className={inputCls} placeholder="Nhãn" value={g.label} onChange={(e) => onPatch(idx, { label: e.target.value })} />
      <input
        className={inputCls}
        placeholder="Tên hàng in phiếu cân"
        value={g.goodsDescription}
        onChange={(e) => onPatch(idx, { goodsDescription: e.target.value })}
      />
      <p className="text-[10px] text-apple-tertiary">{profileOptionLabel(g.label, g.goodsDescription, g.id)}</p>
    </div>
  );
}
