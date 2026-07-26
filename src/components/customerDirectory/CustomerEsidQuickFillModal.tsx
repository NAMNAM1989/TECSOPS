import { useState, useMemo, useEffect } from "react";
import type { CustomerDirectoryEntry } from "../../types/customerDirectory";
import type { Shipment } from "../../types/shipment";
import { getActiveEsidRegistrant } from "../../utils/esidRegistrantProfile";
import { getActiveEsidAgent } from "../../utils/esidAgentProfile";
import { buildEsidDeclareFillPayload } from "../../utils/buildEsidDeclareFillPayload";
import {
  fillEsidViaExtension,
  pingTcsExtension,
} from "../../utils/tcsChromeExtension";
import { declareFillTcsEsid } from "../../utils/tcsPortalAgentApi";

type Props = {
  open: boolean;
  customer: CustomerDirectoryEntry | null;
  onClose: () => void;
};

export function CustomerEsidQuickFillModal({ open, customer, onClose }: Props) {
  const [awb, setAwb] = useState("");
  const [flightNo, setFlightNo] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [dest, setDest] = useState("");
  const [pcs, setPcs] = useState<string>("");
  const [grossWeight, setGrossWeight] = useState<string>("");
  const [selectedShipperId, setSelectedShipperId] = useState<string>("");
  const [selectedConsigneeId, setSelectedConsigneeId] = useState<string>("");
  const [selectedGoodsId, setSelectedGoodsId] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const shippers = customer?.savedShippers ?? [];
  const consignees = customer?.savedConsignees ?? [];
  const goodsList = customer?.savedGoods ?? [];

  useEffect(() => {
    if (!customer) return;
    const defShipper =
      shippers.find((s) => s.id === customer.defaultShipperId) ?? shippers[0];
    const defCnee =
      consignees.find((c) => c.id === customer.defaultConsigneeId) ??
      consignees[0];
    const defGoods =
      goodsList.find((g) => g.id === customer.defaultGoodsId) ?? goodsList[0];

    setSelectedShipperId(defShipper?.id ?? "");
    setSelectedConsigneeId(defCnee?.id ?? "");
    setSelectedGoodsId(defGoods?.id ?? "");
    setStatusMsg("");
    setErrorMsg("");
  }, [customer]);

  const currentShipper = useMemo(() => {
    return shippers.find((s) => s.id === selectedShipperId) ?? shippers[0];
  }, [shippers, selectedShipperId]);

  const currentConsignee = useMemo(() => {
    return (
      consignees.find((c) => c.id === selectedConsigneeId) ?? consignees[0]
    );
  }, [consignees, selectedConsigneeId]);

  const currentGoods = useMemo(() => {
    return goodsList.find((g) => g.id === selectedGoodsId) ?? goodsList[0];
  }, [goodsList, selectedGoodsId]);

  if (!open || !customer) return null;

  const handleQuickFill = async () => {
    setErrorMsg("");
    setStatusMsg("");
    setLoading(true);

    try {
      const registrant = getActiveEsidRegistrant();
      const agent = getActiveEsidAgent();

      const synthShipment: Shipment = {
        id: `synth-${Date.now()}`,
        stt: 1,
        sessionDate: new Date().toISOString().slice(0, 10),
        awb: awb.trim() || "000-00000000",
        flight: flightNo.trim() || "",
        flightDate: flightDate.trim() || "",
        dest: dest.trim().toUpperCase() || "",
        cutoff: "",
        cutoffNote: "",
        note: "",
        pcs: pcs ? parseInt(pcs, 10) : null,
        kg: grossWeight ? parseFloat(grossWeight) : null,
        dimWeightKg: null,
        dimLines: null,
        dimDivisor: null,
        status: "PENDING",
        customerCode: customer.code,
        customer: customer.name,
        warehouse: "TECS-TCS",
        shipperNamePrint: currentShipper?.shipperName || customer.name,
        shipperAddressPrint:
          currentShipper?.shipperAddress || customer.address || "",
        shipperPhonePrint: currentShipper?.shipperPhone || customer.phone || "",
        shipperEmailPrint: currentShipper?.shipperEmail || customer.email || "",
        consigneeNamePrint: currentConsignee?.consigneeName || "",
        consigneeAddressPrint: currentConsignee?.consigneeAddress || "",
        consigneePhonePrint: currentConsignee?.consigneePhone || "",
        consigneeEmailPrint: currentConsignee?.consigneeEmail || "",
        goodsDescriptionPrint: currentGoods?.goodsDescription || "",
        otherRequirementsPrint: customer.otherRequirementsPrint || "",
      };

      const payload = buildEsidDeclareFillPayload(
        synthShipment,
        registrant,
        agent,
      );
      if (!payload) {
        setErrorMsg(
          "Vui lòng nhập đúng định dạng số AWB (VD: 232-18253045 hoặc 23218253045)",
        );
        setLoading(false);
        return;
      }

      setStatusMsg("Đang gửi thông tin Hồ sơ Khách hàng lên cổng TCS...");
      const ext = await pingTcsExtension();

      let res;
      if (ext.ok) {
        res = await fillEsidViaExtension(payload);
      } else {
        res = await declareFillTcsEsid(payload);
      }

      if (res.ok) {
        setStatusMsg(
          "✅ Đã điền 100% thông tin từ Hồ sơ Khách hàng vào form TCS! Vui lòng kiểm tra tab TCS.",
        );
      } else {
        setErrorMsg(
          res.message ||
            res.error ||
            "Điền eSID thất bại. Đảm bảo đã mở tab TCS.",
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Đã xảy ra lỗi khi điền eSID TCS",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 font-bold text-lg border border-amber-500/20">
              ⚡
            </div>
            <div>
              <h3 className="font-semibold text-lg text-amber-400">
                1-Click Điền Khai Báo eSID TCS
              </h3>
              <p className="text-xs text-slate-400">
                Khách hàng:{" "}
                <span className="font-medium text-slate-200">
                  {customer.name}
                </span>{" "}
                ({customer.code})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Quick Profile Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs">
            <div>
              <span className="text-amber-400/90 font-medium block mb-1">
                👤 Shipper chọn sẵn:
              </span>
              {shippers.length > 1 ? (
                <select
                  value={selectedShipperId}
                  onChange={(e) => setSelectedShipperId(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {shippers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label || s.shipperName}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-slate-300 font-semibold">
                  {currentShipper?.shipperName || customer.name}
                </p>
              )}
              <p className="text-slate-400 mt-1 truncate">
                {currentShipper?.shipperAddress ||
                  customer.address ||
                  "(Chưa có địa chỉ)"}
              </p>
            </div>

            <div>
              <span className="text-blue-400/90 font-medium block mb-1">
                📦 Consignee chọn sẵn:
              </span>
              {consignees.length > 1 ? (
                <select
                  value={selectedConsigneeId}
                  onChange={(e) => setSelectedConsigneeId(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {consignees.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || c.consigneeName}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-slate-300 font-semibold">
                  {currentConsignee?.consigneeName || "(Chưa có CNEE)"}
                </p>
              )}
              <p className="text-slate-400 mt-1 truncate">
                {currentConsignee?.consigneeAddress || "(Chưa có địa chỉ)"}
              </p>
            </div>
          </div>

          {/* Quick Shipment Numbers */}
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
              Thông tin Số hiệu (Nhập hoặc dán nhanh):
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Số AWB (Bắt buộc):
                </label>
                <input
                  type="text"
                  placeholder="VD: 232-18253045"
                  value={awb}
                  onChange={(e) => setAwb(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Mã Sân bay Đích (DEST):
                </label>
                <input
                  type="text"
                  placeholder="VD: KUL, CAN, DOH"
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Chuyến bay:
                </label>
                <input
                  type="text"
                  placeholder="VD: VJ881"
                  value={flightNo}
                  onChange={(e) => setFlightNo(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Ngày bay (DD-MM-YYYY):
                </label>
                <input
                  type="text"
                  placeholder="VD: 25-07-2026"
                  value={flightDate}
                  onChange={(e) => setFlightDate(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Số kiện (PCS):
                </label>
                <input
                  type="number"
                  placeholder="VD: 20"
                  value={pcs}
                  onChange={(e) => setPcs(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Số KG (Gross Wgt):
                </label>
                <input
                  type="number"
                  placeholder="VD: 230"
                  value={grossWeight}
                  onChange={(e) => setGrossWeight(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Feedback messages */}
          {statusMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3.5 text-xs text-emerald-300">
              {statusMsg}
            </div>
          )}
          {errorMsg && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3.5 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4 bg-slate-900/80">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
          >
            Đóng
          </button>
          <button
            onClick={handleQuickFill}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 text-xs shadow-lg shadow-amber-500/20 disabled:opacity-50 transition"
          >
            {loading ? "Đang điền..." : "⚡ 1-Click Điền Ngay Vào TCS"}
          </button>
        </div>
      </div>
    </div>
  );
}
