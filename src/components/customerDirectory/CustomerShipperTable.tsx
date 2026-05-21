import { Fragment, useState } from "react";
import type { CustomerSavedShipper } from "../../types/customerDirectory";
import {
  formatVnPhoneDisplay,
  normalizeAgentCode,
  parseCustomerProfileOcrJson,
  patchShipperFromOcr,
} from "../../utils/customerProfileInputFormat";

const inputCls =
  "w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/15";

function StarButton({ active, onClick, title }: { active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-lg px-1.5 py-0.5 text-base leading-none transition ${
        active ? "text-amber-500" : "text-apple-tertiary hover:text-amber-600"
      }`}
      aria-label={title}
      aria-pressed={active}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

type Props = {
  shippers: readonly CustomerSavedShipper[];
  defaultShipperId?: string;
  onSetDefault: (id: string) => void;
  onPatch: (index: number, patch: Partial<CustomerSavedShipper>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

/** Bảng Shipper — ★ mặc định, format SĐT, OCR patch. */
export function CustomerShipperTable({
  shippers,
  defaultShipperId,
  onSetDefault,
  onPatch,
  onRemove,
  onAdd,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ocrHint, setOcrHint] = useState<string | null>(null);

  const applyOcrPaste = async (idx: number) => {
    setOcrHint(null);
    let raw = "";
    try {
      raw = await navigator.clipboard.readText();
    } catch {
      setOcrHint("Không đọc được clipboard — dán JSON OCR thủ công vào ô bên dưới.");
      return;
    }
    const ocr = parseCustomerProfileOcrJson(raw);
    if (!ocr) {
      setOcrHint("Clipboard không phải JSON OCR hợp lệ.");
      return;
    }
    const s = shippers[idx];
    if (!s) return;
    onPatch(idx, patchShipperFromOcr(s, ocr));
    setOcrHint("Đã điền từ OCR.");
    setExpandedId(s.id);
  };

  return (
    <div>
      {shippers.length === 0 ? (
        <p className="mb-2 rounded-xl border border-dashed border-black/[0.12] bg-white/80 px-3 py-4 text-center text-xs text-apple-tertiary">
          Chưa có Shipper lưu sẵn.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[0.08] bg-white">
          <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-black/[0.08] bg-apple-bg/80 text-[10px] font-semibold uppercase text-apple-tertiary">
                <th className="w-10 px-2 py-1.5">MĐ</th>
                <th className="px-2 py-1.5">Nhãn</th>
                <th className="px-2 py-1.5">Tên shipper</th>
                <th className="px-2 py-1.5">SĐT</th>
                <th className="w-20 px-2 py-1.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {shippers.map((s, idx) => {
                const expanded = expandedId === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr className="border-b border-black/[0.06] hover:bg-apple-bg/30">
                      <td className="px-2 py-1.5 align-middle">
                        <StarButton
                          active={defaultShipperId === s.id}
                          onClick={() => onSetDefault(s.id)}
                          title="Shipper mặc định khi booking"
                        />
                      </td>
                      <td className="max-w-[6rem] truncate px-2 py-1.5 font-mono font-semibold uppercase text-apple-label">
                        {s.label || "—"}
                      </td>
                      <td className="max-w-[10rem] truncate px-2 py-1.5 font-medium text-apple-label">
                        {s.shipperName || "—"}
                      </td>
                      <td className="max-w-[8rem] truncate px-2 py-1.5 tabular-nums text-apple-secondary">
                        {s.shipperPhone || "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right align-middle">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : s.id)}
                          className="mr-0.5 rounded-lg px-2 py-1 text-[10px] font-semibold text-apple-blue hover:bg-apple-blue/10"
                        >
                          {expanded ? "Thu" : "Sửa"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(idx)}
                          className="rounded-lg px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={5} className="bg-apple-bg/40 px-3 py-2.5">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void applyOcrPaste(idx)}
                              className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-900"
                            >
                              Dán OCR (clipboard)
                            </button>
                            {ocrHint ? (
                              <span className="text-[10px] text-apple-secondary">{ocrHint}</span>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              className={`${inputCls} font-mono uppercase`}
                              placeholder="Nhãn / mã (VD: HCM)"
                              value={s.label}
                              onChange={(e) => onPatch(idx, { label: e.target.value })}
                              onBlur={(e) => onPatch(idx, { label: normalizeAgentCode(e.target.value) })}
                            />
                            <input
                              className={inputCls}
                              placeholder="Tên shipper in phiếu"
                              value={s.shipperName}
                              onChange={(e) => onPatch(idx, { shipperName: e.target.value })}
                            />
                            <input
                              className={inputCls}
                              placeholder="SĐT"
                              value={s.shipperPhone}
                              onChange={(e) => onPatch(idx, { shipperPhone: e.target.value })}
                              onBlur={(e) => onPatch(idx, { shipperPhone: formatVnPhoneDisplay(e.target.value) })}
                            />
                            <input
                              className={inputCls}
                              placeholder="Email"
                              value={s.shipperEmail}
                              onChange={(e) => onPatch(idx, { shipperEmail: e.target.value })}
                            />
                            <input
                              className={`${inputCls} sm:col-span-2`}
                              placeholder="MST"
                              value={s.taxCode}
                              onChange={(e) => onPatch(idx, { taxCode: e.target.value })}
                            />
                            <textarea
                              className={`${inputCls} sm:col-span-2`}
                              rows={2}
                              placeholder="Địa chỉ — Enter xuống dòng 2 (in phiếu cân)"
                              value={s.shipperAddress}
                              onChange={(e) => onPatch(idx, { shipperAddress: e.target.value })}
                            />
                            <textarea
                              className={`${inputCls} sm:col-span-2 font-mono text-[11px]`}
                              rows={2}
                              placeholder='JSON OCR: {"shipperName":"...","shipperAddress":"...","taxCode":"..."}'
                              onBlur={(e) => {
                                const ocr = parseCustomerProfileOcrJson(e.target.value);
                                if (ocr) {
                                  onPatch(idx, patchShipperFromOcr(s, ocr));
                                  e.target.value = "";
                                  setOcrHint("Đã điền từ JSON OCR.");
                                }
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 w-full rounded-full border border-dashed border-apple-blue/40 bg-white py-2 text-xs font-semibold text-apple-blue hover:bg-apple-blue/5"
      >
        + Thêm Shipper
      </button>
    </div>
  );
}
