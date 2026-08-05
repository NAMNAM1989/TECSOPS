import { useEffect, useMemo, useState } from "react";
import { isEcargoScscWarehouse } from "../constants/warehouses";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { findCustomerEntry } from "../utils/customerBookingResolve";
import {
  applyAgentDriverFallback,
  buildEcargoVctFillPayload,
  defaultVehiclePickForShipments,
  ECARGO_DEFAULT_GOODS,
  pickSavedVehicleForEcargo,
  resolveEcargoPiecesKg,
  type EcargoVehiclePick,
} from "../utils/buildEcargoVctFillPayload";
import {
  ECARGO_SCSC_CHANGED_EVENT,
  ecargoScscProfileIsComplete,
  getActiveEcargoScscProfile,
  loadEcargoScscStore,
  updateActiveEcargoScscProfile,
  type EcargoIdType,
  type EcargoScscProfile,
  type EcargoVehicleType,
} from "../utils/ecargoScscProfile";
import { pushEcargoScscStore } from "../utils/ecargoScscProfilesSync";
import {
  ensureEcargoArrivalDate,
  resolveEcargoArrivalDateFromShipments,
  todayLocalYmd,
} from "../utils/ecargoTextNormalize";
import {
  fillEcargoVctViaExtension,
  pingTcsExtension,
  registerEcargoVctViaExtension,
} from "../utils/tcsChromeExtension";
import { normalizeVehiclePlateInput } from "../utils/vehiclePlateNormalize";
import { formatAwbLabel } from "../utils/awbFormat";

type Props = {
  open: boolean;
  onClose: () => void;
  shipments: Shipment[];
  customers: CustomerDirectoryEntry[];
  /** Lô đang chọn trên bảng — pre-check. */
  preferredShipmentId?: string | null;
};

const ARRIVAL_SLOTS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, "0")}:00 – ${String(i + 1).padStart(2, "0")}:00`,
}));

const VEHICLE_TYPES: { value: EcargoVehicleType; label: string }[] = [
  { value: "OTO", label: "Ô tô" },
  { value: "XEMAY", label: "Xe máy" },
  { value: "BAGAC", label: "Xe ba gác" },
  { value: "DIBO", label: "Đi bộ" },
];

const ID_TYPES: { value: EcargoIdType; label: string }[] = [
  { value: "CCCD", label: "CCCD" },
  { value: "PP", label: "Passport" },
  { value: "GPLX", label: "GPLX" },
];

const INPUT =
  "mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-900";
const LABEL = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";

export function EcargoVctRegisterModal({
  open,
  onClose,
  shipments: shipmentsProp,
  customers,
  preferredShipmentId,
}: Props) {
  // Defense: chỉ lô kho SCSC — không nhận TECS-SCSC / TCS dù caller truyền nhầm.
  const shipments = useMemo(
    () => shipmentsProp.filter((s) => isEcargoScscWarehouse(s.warehouse)),
    [shipmentsProp],
  );
  const [profile, setProfile] = useState<EcargoScscProfile>(() => getActiveEcargoScscProfile());
  const [editingProfile, setEditingProfile] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [arrivalDate, setArrivalDate] = useState(todayLocalYmd);
  const [arrivalTime, setArrivalTime] = useState("8");
  const [arrivalHint, setArrivalHint] = useState("");
  const [vehicleMode, setVehicleMode] = useState<"saved" | "oneshot">("saved");
  const [savedVehicleId, setSavedVehicleId] = useState("");
  const [oneshot, setOneshot] = useState({
    licensePlate: "",
    driverName: "",
    driverId: "",
    driverIdType: "CCCD" as EcargoIdType,
    vehicleType: "OTO" as EcargoVehicleType,
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [lastQr, setLastQr] = useState<{ vctCode: string; qrDataUrl: string } | null>(
    null
  );
  const [phaseLabel, setPhaseLabel] = useState("");

  const shipmentIdsKey = useMemo(
    () => shipments.map((s) => s.id).join("|"),
    [shipments]
  );

  useEffect(() => {
    if (!open) return;
    const active = getActiveEcargoScscProfile();
    setProfile(active);
    setEditingProfile(!ecargoScscProfileIsComplete(active));
    setArrivalTime(active.defaultArrivalSlot || "8");
    setStatus("");
    setArrivalHint("");
    const preferred = preferredShipmentId
      ? shipments.filter((s) => s.id === preferredShipmentId)
      : [];
    const initial = preferred.length ? preferred : shipments.slice(0, 1);
    setSelectedIds(initial.map((s) => s.id));
    // Chỉ reset khi mở modal / đổi danh sách lô — tránh mảng `shipments` mới mỗi render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shipmentIdsKey thay cho shipments
  }, [open, preferredShipmentId, shipmentIdsKey]);

  useEffect(() => {
    if (!open) return;
    const onChange = () => setProfile(getActiveEcargoScscProfile());
    window.addEventListener(ECARGO_SCSC_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ECARGO_SCSC_CHANGED_EVENT, onChange);
  }, [open]);

  const selectedIdsKey = selectedIds.join("|");

  const selectedShipments = useMemo(
    () => shipments.filter((s) => selectedIds.includes(s.id)),
    [shipments, selectedIds]
  );

  // Đổi selection → mặc định ngày hàng vào = ngày bay sớm nhất (cho phép cùng ngày).
  useEffect(() => {
    if (!open || !selectedIdsKey) return;
    const rows = shipments.filter((s) => selectedIds.includes(s.id));
    if (!rows.length) return;
    const resolved = resolveEcargoArrivalDateFromShipments(rows);
    setArrivalDate(resolved.arrivalDate);
    setArrivalHint(resolved.warning || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedIdsKey đủ ổn định
  }, [open, selectedIdsKey, shipmentIdsKey]);

  const vehiclePool = useMemo(() => {
    const map = new Map<string, { vehicle: NonNullable<CustomerDirectoryEntry["savedVehicles"]>[number]; customerLabel: string }>();
    for (const s of selectedShipments.length ? selectedShipments : shipments.slice(0, 1)) {
      const entry = findCustomerEntry(s, customers);
      for (const v of entry?.savedVehicles ?? []) {
        if (!map.has(v.id)) {
          map.set(v.id, {
            vehicle: v,
            customerLabel: entry?.code || entry?.name || s.customerCode || "",
          });
        }
      }
    }
    return [...map.values()];
  }, [selectedShipments, shipments, customers]);

  useEffect(() => {
    if (!open) return;
    const pick = defaultVehiclePickForShipments(
      selectedShipments.length ? selectedShipments : shipments.slice(0, 1),
      customers,
      profile.defaultVehicleType
    );
    if (pick?.source === "saved") {
      setVehicleMode("saved");
      setSavedVehicleId(pick.vehicleId);
      setOneshot((prev) => ({
        ...prev,
        vehicleType: pick.vehicleType || profile.defaultVehicleType,
      }));
    } else {
      setVehicleMode("oneshot");
      setSavedVehicleId("");
      setOneshot((prev) => ({
        ...prev,
        vehicleType: profile.defaultVehicleType,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedIdsKey / shipmentIdsKey ổn định hơn object
  }, [open, selectedIdsKey, shipmentIdsKey, customers, profile.defaultVehicleType]);

  if (!open) return null;

  const toggleId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const saveProfile = async () => {
    updateActiveEcargoScscProfile({
      name: profile.name,
      agentPicName: profile.agentPicName,
      agentPicIdType: profile.agentPicIdType,
      agentPicId: profile.agentPicId,
      email: profile.email,
      mobilePhone: profile.mobilePhone,
      defaultArrivalSlot: arrivalTime,
      defaultVehicleType: oneshot.vehicleType || profile.defaultVehicleType,
    });
    await pushEcargoScscStore(loadEcargoScscStore());
    const next = getActiveEcargoScscProfile();
    setProfile(next);
    setEditingProfile(false);
    setStatus("Đã lưu hồ sơ đại lý eCargo.");
  };

  const resolveVehiclePick = (): EcargoVehiclePick | null => {
    const raw: EcargoVehiclePick | null =
      vehicleMode === "saved"
        ? (() => {
            const found = vehiclePool.find((x) => x.vehicle.id === savedVehicleId);
            if (!found) return null;
            return pickSavedVehicleForEcargo(
              found.vehicle,
              profile.defaultVehicleType,
            );
          })()
        : {
            source: "oneshot",
            licensePlate: normalizeVehiclePlateInput(oneshot.licensePlate),
            driverName: oneshot.driverName,
            driverId: oneshot.driverId,
            driverIdType: oneshot.driverIdType,
            vehicleType: oneshot.vehicleType,
          };
    if (!raw) return null;
    // Thiếu TX → gắn NV đại lý (cùng logic payload) để preview/validate nhất quán.
    return applyAgentDriverFallback(raw, profile).pick;
  };

  const preparePayload = () => {
    if (ecargoScscProfileIsComplete(profile)) {
      updateActiveEcargoScscProfile({
        name: profile.name,
        agentPicName: profile.agentPicName,
        agentPicIdType: profile.agentPicIdType,
        agentPicId: profile.agentPicId,
        email: profile.email,
        mobilePhone: profile.mobilePhone,
        defaultArrivalSlot: arrivalTime,
        defaultVehicleType:
          vehicleMode === "oneshot" ? oneshot.vehicleType : profile.defaultVehicleType,
      });
      void pushEcargoScscStore(loadEcargoScscStore());
    }
    const active = getActiveEcargoScscProfile();
    if (!ecargoScscProfileIsComplete(active)) {
      setEditingProfile(true);
      return { error: "Cần lưu đủ thông tin đại lý trước khi đăng ký eCargo." };
    }
    const vehicle = resolveVehiclePick();
    if (!vehicle) {
      return { error: "Chọn xe từ hồ sơ khách hoặc nhập xe lần này." };
    }
    const fromFlights = resolveEcargoArrivalDateFromShipments(selectedShipments);
    const safeArrivalDate = ensureEcargoArrivalDate(
      arrivalDate,
      new Date(),
      fromFlights.arrivalDate
    );
    if (safeArrivalDate !== arrivalDate) setArrivalDate(safeArrivalDate);
    const built = buildEcargoVctFillPayload({
      profile: active,
      vehicle,
      shipments: selectedShipments,
      customers,
      arrivalDate: safeArrivalDate,
      arrivalTime,
    });
    if (!built.payload) {
      const detail =
        built.warnings.length > 0
          ? `\n${built.warnings.slice(0, 4).join("\n")}`
          : "";
      return {
        error: `${built.error || "Không tạo được payload eCargo"}${detail}`,
      };
    }
    return { payload: built.payload, warnings: built.warnings };
  };

  const onFill = async () => {
    if (selectedIds.length === 0) {
      setStatus(
        shipments.length === 0
          ? "Không có lô kho SCSC trong ngày để điền. Chọn kho SCSC và kiểm tra bộ lọc."
          : "Chọn ít nhất 1 lô AWB trước khi điền form.",
      );
      return;
    }
    setBusy(true);
    setStatus("");
    setLastQr(null);
    setPhaseLabel("Điền form…");
    try {
      const prepared = preparePayload();
      if ("error" in prepared && prepared.error) {
        setStatus(prepared.error);
        return;
      }
      const ping = await pingTcsExtension(2500);
      if (!ping.ok) {
        setStatus(
          ping.message ||
            "Chưa thấy Chrome extension TECSOPS. Reload Ext v2.2.3 tại chrome://extensions, rồi F5 Ops.",
        );
        return;
      }
      const res = await fillEcargoVctViaExtension(prepared.payload!);
      if (!res.ok) {
        setStatus(res.message || "Điền eCargo thất bại");
        return;
      }
      const warn =
        (prepared.warnings?.length ?? 0) > 0
          ? `\n${prepared.warnings!.slice(0, 3).join("\n")}`
          : "";
      setStatus(`${res.message || "Đã điền eCargo."}${warn}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Lỗi không xác định khi điền eCargo.");
    } finally {
      setBusy(false);
      setPhaseLabel("");
    }
  };

  const onRegister = async () => {
    if (selectedIds.length === 0) {
      setStatus(
        shipments.length === 0
          ? "Không có lô kho SCSC trong ngày để đăng ký. Chọn kho SCSC và kiểm tra bộ lọc."
          : "Chọn ít nhất 1 lô AWB trước khi đăng ký.",
      );
      return;
    }
    setBusy(true);
    setStatus("");
    setLastQr(null);
    setPhaseLabel("Điền → Tạo phiếu → OTP → QR…");
    try {
      const prepared = preparePayload();
      if ("error" in prepared && prepared.error) {
        setStatus(prepared.error);
        return;
      }
      const ping = await pingTcsExtension(2500);
      if (!ping.ok) {
        setStatus(
          ping.message ||
            "Chưa thấy Chrome extension TECSOPS. Reload Ext v2.2.3 tại chrome://extensions, rồi F5 Ops.",
        );
        return;
      }
      setStatus(
        `Đang gửi lệnh đăng ký qua Ext v${ping.version || "?"}… Tab eCargo sẽ mở/điền form.`,
      );
      const res = await registerEcargoVctViaExtension({
        ...prepared.payload!,
        submit: true,
        apiBase: window.location.origin,
        shipmentIds: selectedIds,
      });
      if (!res.ok) {
        setStatus(res.message || "Đăng ký eCargo thất bại");
        return;
      }
      if (res.vctCode || res.qrDataUrl) {
        setLastQr({
          vctCode: res.vctCode || "",
          qrDataUrl: res.qrDataUrl || "",
        });
      }
      const warn =
        (prepared.warnings?.length ?? 0) > 0
          ? `\n${prepared.warnings!.slice(0, 3).join("\n")}`
          : "";
      setStatus(`${res.message || "Đã đăng ký eCargo."}${warn}`);
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Lỗi không xác định khi đăng ký eCargo.",
      );
    } finally {
      setBusy(false);
      setPhaseLabel("");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Đăng ký eCargo SCSC"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">Đăng ký eCargo SCSC</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              «Đăng ký eCargo» = điền + Tạo phiếu + OTP mail chung + lấy QR. «Chỉ điền form» để kiểm tra tay.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[12px] text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            disabled={busy}
          >
            Đóng
          </button>
        </div>

        <section className="mb-3 rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[12px] font-bold text-slate-800">Hồ sơ đại lý (lưu 1 lần)</h3>
            <button
              type="button"
              className="text-[11px] font-semibold text-sky-700 hover:underline"
              onClick={() => setEditingProfile((v) => !v)}
            >
              {editingProfile ? "Thu gọn" : "Sửa"}
            </button>
          </div>
          {!editingProfile && ecargoScscProfileIsComplete(profile) ? (
            <p className="text-[12px] text-slate-700">
              {profile.name} · NV {profile.agentPicName} · {profile.email} · {profile.mobilePhone}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className={LABEL}>Đại lý *</span>
                <input
                  className={INPUT}
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Tên đại lý trên eCargo"
                />
              </label>
              <label>
                <span className={LABEL}>Nhân viên đại lý *</span>
                <input
                  className={`${INPUT} uppercase`}
                  value={profile.agentPicName}
                  onChange={(e) => setProfile((p) => ({ ...p, agentPicName: e.target.value }))}
                  placeholder="NGUYEN VAN A"
                />
                <span className="mt-0.5 block text-[10px] text-slate-400">
                  Giữ khoảng cách giữa các từ (VD: NGUYEN VAN A) — bỏ dấu, không ký tự đặc biệt.
                </span>
              </label>
              <label>
                <span className={LABEL}>Giấy tờ NV</span>
                <div className="mt-0.5 flex gap-2">
                  <select
                    className={INPUT}
                    value={profile.agentPicIdType}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        agentPicIdType: e.target.value as EcargoIdType,
                      }))
                    }
                  >
                    {ID_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${INPUT} font-mono`}
                    value={profile.agentPicId}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, agentPicId: e.target.value }))
                    }
                    placeholder="Số giấy tờ"
                  />
                </div>
              </label>
              <label>
                <span className={LABEL}>Email OTP *</span>
                <input
                  className={INPUT}
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                />
              </label>
              <label>
                <span className={LABEL}>ĐTDĐ *</span>
                <input
                  className={INPUT}
                  inputMode="tel"
                  value={profile.mobilePhone}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, mobilePhone: e.target.value }))
                  }
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  className="rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                  onClick={() => void saveProfile()}
                  disabled={busy}
                >
                  Lưu hồ sơ đại lý
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="mb-3 rounded-xl border border-slate-200 p-3">
          <h3 className="mb-2 text-[12px] font-bold text-slate-800">Lô AWB đăng ký</h3>
          <p className="mb-2 text-[10px] text-slate-500">
            Tên hàng cố định: {ECARGO_DEFAULT_GOODS}. Thiếu kiện/kg → dùng 99 pcs / 999 kg.
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {shipments.length === 0 ? (
              <p className="text-[11px] text-slate-500">Không có lô SCSC trong ngày.</p>
            ) : (
              shipments.map((s) => {
                const qty = resolveEcargoPiecesKg(s);
                return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleId(s.id)}
                    />
                    <span className="font-mono text-[12px] font-semibold text-slate-800">
                      {formatAwbLabel(s.awb) || "—"}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {s.flight} {s.flightDate} · {s.dest} · {qty.pieces}pcs / {qty.weight}kg
                      {qty.usedDefaults ? " (mặc định)" : ""}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </section>

        <section className="mb-3 rounded-xl border border-slate-200 p-3">
          <h3 className="mb-2 text-[12px] font-bold text-slate-800">Ngày hàng vào</h3>
          <p className="mb-2 text-[11px] text-slate-500">
            Mặc định theo ngày bay của lô đã chọn — cho phép đăng ký cùng ngày. Chọn khung giờ (0h–23h) trước khi điền.
          </p>
          {arrivalHint ? (
            <p className="mb-2 text-[11px] text-amber-700">{arrivalHint}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={LABEL}>Ngày *</span>
              <input
                type="date"
                className={INPUT}
                min={todayLocalYmd()}
                value={arrivalDate}
                onChange={(e) =>
                  setArrivalDate(
                    ensureEcargoArrivalDate(e.target.value, new Date(), todayLocalYmd())
                  )
                }
              />
            </label>
            <label>
              <span className={LABEL}>Khung giờ *</span>
              <select
                className={INPUT}
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
              >
                {ARRIVAL_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="mb-3 rounded-xl border border-slate-200 p-3">
          <h3 className="mb-2 text-[12px] font-bold text-slate-800">Xe / tài xế</h3>
          <p className="mb-2 text-[10px] text-slate-500">
            Chỉ có biển số / thiếu TX → tự lấy NV đại lý ({profile.agentPicName || "…"}) làm tài xế
            mặc định.
          </p>
          <div className="mb-2 space-y-1">
            {vehiclePool.map(({ vehicle, customerLabel }) => {
              const missingDriver =
                !String(vehicle.driverName || "").trim() ||
                !String(vehicle.driverId || "").trim();
              return (
              <label
                key={vehicle.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name="ecargo-vehicle"
                  checked={vehicleMode === "saved" && savedVehicleId === vehicle.id}
                  onChange={() => {
                    setVehicleMode("saved");
                    setSavedVehicleId(vehicle.id);
                  }}
                />
                <span className="text-[12px] text-slate-800">
                  <span className="font-mono font-semibold">{vehicle.licensePlate}</span>
                  {" · "}
                  {vehicle.driverName?.trim()
                    ? vehicle.driverName
                    : (
                      <span className="italic text-amber-700">
                        TX = NV đại lý
                      </span>
                    )}
                  {vehicle.label ? (
                    <span className="text-slate-500"> · {vehicle.label}</span>
                  ) : null}
                  {customerLabel ? (
                    <span className="text-slate-400"> · {customerLabel}</span>
                  ) : null}
                  {missingDriver ? (
                    <span className="ml-1 text-[10px] font-semibold text-amber-700">
                      (thiếu TX)
                    </span>
                  ) : null}
                </span>
              </label>
              );
            })}
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50">
              <input
                type="radio"
                name="ecargo-vehicle"
                checked={vehicleMode === "oneshot"}
                onChange={() => setVehicleMode("oneshot")}
              />
              <span className="text-[12px] font-semibold text-slate-800">
                Nhập xe lần này (thuê ngoài / đổi xe)
              </span>
            </label>
          </div>
          {vehicleMode === "oneshot" ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label>
                <span className={LABEL}>Biển số *</span>
                <input
                  className={`${INPUT} font-mono uppercase`}
                  value={oneshot.licensePlate}
                  onChange={(e) =>
                    setOneshot((p) => ({ ...p, licensePlate: e.target.value }))
                  }
                  onBlur={(e) =>
                    setOneshot((p) => ({
                      ...p,
                      licensePlate: normalizeVehiclePlateInput(e.target.value),
                    }))
                  }
                  placeholder="50H17480"
                />
              </label>
              <label>
                <span className={LABEL}>Loại xe</span>
                <select
                  className={INPUT}
                  value={oneshot.vehicleType}
                  onChange={(e) =>
                    setOneshot((p) => ({
                      ...p,
                      vehicleType: e.target.value as EcargoVehicleType,
                    }))
                  }
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={LABEL}>Tài xế *</span>
                <input
                  className={`${INPUT} uppercase`}
                  value={oneshot.driverName}
                  onChange={(e) =>
                    setOneshot((p) => ({ ...p, driverName: e.target.value }))
                  }
                />
              </label>
              <label>
                <span className={LABEL}>Giấy tờ TX *</span>
                <div className="mt-0.5 flex gap-2">
                  <select
                    className={INPUT}
                    value={oneshot.driverIdType}
                    onChange={(e) =>
                      setOneshot((p) => ({
                        ...p,
                        driverIdType: e.target.value as EcargoIdType,
                      }))
                    }
                  >
                    {ID_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${INPUT} font-mono`}
                    value={oneshot.driverId}
                    onChange={(e) =>
                      setOneshot((p) => ({ ...p, driverId: e.target.value }))
                    }
                  />
                </div>
              </label>
            </div>
          ) : null}
        </section>

        {lastQr ? (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-[12px] font-bold text-emerald-900">
              {lastQr.vctCode ? `Mã phiếu: ${lastQr.vctCode}` : "Kết quả đăng ký"}
            </p>
            {lastQr.qrDataUrl ? (
              <img
                src={lastQr.qrDataUrl}
                alt="QR eCargo"
                className="mt-2 max-h-40 rounded bg-white p-2"
              />
            ) : null}
          </div>
        ) : null}

        {phaseLabel ? (
          <p className="mb-2 text-[11px] font-semibold text-emerald-800">{phaseLabel}</p>
        ) : null}
        {status ? (
          <p
            role="status"
            className={`mb-3 whitespace-pre-wrap rounded-lg px-3 py-2 text-[11px] ${
              /thất bại|lỗi|chưa|không|thiếu|failed|error/i.test(status)
                ? "border border-rose-200 bg-rose-50 text-rose-900"
                : "border border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {status}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            disabled={busy}
          >
            Hủy
          </button>
          <button
            type="button"
            className="rounded-full border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => void onFill()}
            disabled={busy}
            title="Chỉ điền form — bạn tự Tạo phiếu + OTP"
          >
            Chỉ điền form
          </button>
          <button
            type="button"
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={() => void onRegister()}
            disabled={busy}
          >
            {busy ? "Đang đăng ký…" : "Đăng ký eCargo"}
          </button>
        </div>
      </div>
    </div>
  );
}
