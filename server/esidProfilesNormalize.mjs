/** Normalize hồ sơ Người khai / Agent ESID trong app_state (dùng chung mọi máy). */

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyEsidRegistrantStore() {
  const id = newId("reg");
  return {
    version: 1,
    activeId: id,
    profiles: [{ id, name: "", tel: "", cccd: "", updatedAt: new Date().toISOString() }],
  };
}

export function emptyEsidAgentStore() {
  const id = newId("agt");
  return {
    version: 1,
    activeId: id,
    profiles: [
      {
        id,
        name: "",
        address: "",
        tel: "",
        email: "",
        vat: "",
        fax: "",
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}

export function normalizeEsidRegistrantStoreLoose(raw) {
  if (!raw || typeof raw !== "object") return emptyEsidRegistrantStore();
  const o = raw;
  if (o.version !== 1 || !Array.isArray(o.profiles)) return emptyEsidRegistrantStore();
  const profiles = o.profiles
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      id: String(p.id || newId("reg")),
      name: String(p.name || "").trim(),
      tel: String(p.tel || "").trim(),
      cccd: String(p.cccd || "")
        .replace(/\s+/g, "")
        .trim(),
      updatedAt: String(p.updatedAt || new Date().toISOString()),
    }));
  if (!profiles.length) return emptyEsidRegistrantStore();
  const activeId = profiles.some((p) => p.id === o.activeId) ? o.activeId : profiles[0].id;
  return { version: 1, activeId, profiles };
}

export function normalizeEsidAgentStoreLoose(raw) {
  if (!raw || typeof raw !== "object") return emptyEsidAgentStore();
  const o = raw;
  if (o.version !== 1 || !Array.isArray(o.profiles)) return emptyEsidAgentStore();
  const profiles = o.profiles
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      id: String(p.id || newId("agt")),
      name: String(p.name || "").trim(),
      address: String(p.address || "").trim(),
      tel: String(p.tel || "").trim(),
      email: String(p.email || "").trim(),
      vat: String(p.vat || "").trim(),
      fax: String(p.fax || "").trim(),
      updatedAt: String(p.updatedAt || new Date().toISOString()),
    }));
  if (!profiles.length) return emptyEsidAgentStore();
  const activeId = profiles.some((p) => p.id === o.activeId) ? o.activeId : profiles[0].id;
  return { version: 1, activeId, profiles };
}

export function esidRegistrantStoreHasUserData(store) {
  const s = normalizeEsidRegistrantStoreLoose(store);
  return s.profiles.some((p) => p.name.trim() || p.tel.trim() || p.cccd.trim());
}

export function esidAgentStoreHasUserData(store) {
  const s = normalizeEsidAgentStoreLoose(store);
  return s.profiles.some(
    (p) => p.name.trim() || p.address.trim() || p.tel.trim() || p.email.trim() || p.vat.trim()
  );
}
