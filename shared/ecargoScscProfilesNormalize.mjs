/**
 * Normalize hồ sơ đại lý eCargo SCSC — nguồn sự thật server + client.
 */

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const ID_TYPES = new Set(["CCCD", "PP", "GPLX"]);
const VEHICLE_TYPES = new Set(["OTO", "XEMAY", "BAGAC", "DIBO"]);

export function normalizeEcargoIdType(raw, fallback = "CCCD") {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (u === "PASSPORT" || u === "PP") return "PP";
  if (ID_TYPES.has(u)) return u;
  return fallback;
}

export function normalizeEcargoVehicleType(raw, fallback = "OTO") {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (VEHICLE_TYPES.has(u)) return u;
  return fallback;
}

export function normalizeEcargoArrivalSlot(raw, fallback = "8") {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isInteger(n) || n < 0 || n > 23) return fallback;
  return String(n);
}

export function emptyEcargoScscStore() {
  const id = newId("ecargo");
  return {
    version: 1,
    activeId: id,
    profiles: [
      {
        id,
        name: "",
        agentIdent: "",
        agentCode: "",
        agentPicName: "",
        agentPicIdType: "CCCD",
        agentPicId: "",
        email: "",
        mobilePhone: "",
        defaultArrivalSlot: "8",
        defaultVehicleType: "OTO",
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}

export function normalizeEcargoScscStoreLoose(raw) {
  if (!raw || typeof raw !== "object") return emptyEcargoScscStore();
  const o = raw;
  if (o.version !== 1 || !Array.isArray(o.profiles)) return emptyEcargoScscStore();
  const profiles = o.profiles
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      id: String(p.id || newId("ecargo")),
      name: String(p.name || "").trim(),
      agentIdent: String(p.agentIdent || "")
        .replace(/\D/g, "")
        .trim(),
      agentCode: String(p.agentCode || "")
        .trim()
        .toUpperCase(),
      agentPicName: String(p.agentPicName || "").trim(),
      agentPicIdType: normalizeEcargoIdType(p.agentPicIdType),
      agentPicId: String(p.agentPicId || "")
        .replace(/\s+/g, "")
        .trim(),
      email: String(p.email || "").trim(),
      mobilePhone: String(p.mobilePhone || "")
        .replace(/\s+/g, "")
        .trim(),
      defaultArrivalSlot: normalizeEcargoArrivalSlot(p.defaultArrivalSlot),
      defaultVehicleType: normalizeEcargoVehicleType(p.defaultVehicleType),
      updatedAt: String(p.updatedAt || new Date().toISOString()),
    }));
  if (!profiles.length) return emptyEcargoScscStore();
  const activeId = profiles.some((p) => p.id === o.activeId) ? o.activeId : profiles[0].id;
  return { version: 1, activeId, profiles };
}

export function ecargoScscStoreHasUserData(store) {
  const s = normalizeEcargoScscStoreLoose(store);
  return s.profiles.some(
    (p) =>
      Boolean(p.name.trim()) ||
      Boolean(p.agentPicName.trim()) ||
      Boolean(p.agentPicId.trim()) ||
      Boolean(p.email.trim()) ||
      Boolean(p.mobilePhone.trim())
  );
}

export function ecargoScscProfileIsComplete(p) {
  if (!p || typeof p !== "object") return false;
  return Boolean(
    String(p.name || "").trim() &&
      String(p.agentPicName || "").trim() &&
      String(p.agentPicId || "").trim() &&
      String(p.email || "").trim() &&
      String(p.mobilePhone || "").trim()
  );
}
