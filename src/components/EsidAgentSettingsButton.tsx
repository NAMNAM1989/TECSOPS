import { useEffect, useState } from "react";
import {
  ESID_AGENT_CHANGED_EVENT,
  agentIsComplete,
  getActiveEsidAgent,
  loadEsidAgentStore,
  setActiveEsidAgentId,
  switchOrCreateEsidAgent,
  updateActiveEsidAgent,
  type EsidAgentProfile,
  type EsidAgentStoreV1,
} from "../utils/esidAgentProfile";

type Props = {
  disabled?: boolean;
  compact?: boolean;
};

/** Nút cấu hình Agent ESID cố định (giống Người khai). */
export function EsidAgentSettingsButton({ disabled, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [store, setStore] = useState<EsidAgentStoreV1>(() => loadEsidAgentStore());
  const active = store.profiles.find((p) => p.id === store.activeId) || store.profiles[0];
  const [name, setName] = useState(active?.name || "");
  const [address, setAddress] = useState(active?.address || "");
  const [tel, setTel] = useState(active?.tel || "");
  const [email, setEmail] = useState(active?.email || "");
  const [vat, setVat] = useState(active?.vat || "");

  useEffect(() => {
    const sync = () => {
      const next = loadEsidAgentStore();
      setStore(next);
      const a = next.profiles.find((p) => p.id === next.activeId) || next.profiles[0];
      setName(a?.name || "");
      setAddress(a?.address || "");
      setTel(a?.tel || "");
      setEmail(a?.email || "");
      setVat(a?.vat || "");
    };
    window.addEventListener(ESID_AGENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(ESID_AGENT_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const a = getActiveEsidAgent();
    setName(a.name);
    setAddress(a.address);
    setTel(a.tel);
    setEmail(a.email);
    setVat(a.vat);
  }, [open]);

  const btn =
    "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-45 active:scale-[0.98] border border-sky-500/25 bg-sky-50/90 text-sky-900 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/50";

  const label = active?.name?.trim()
    ? `Agent · ${active.name.trim().slice(0, 14)}`
    : "Agent";

  const saveCurrent = () => {
    updateActiveEsidAgent({ name, address, tel, email, vat });
    setStore(loadEsidAgentStore());
    setOpen(false);
  };

  const switchName = () => {
    const nextName = window.prompt(
      "Tên Agent mới (đổi agent — địa chỉ/SĐT nhập riêng cho hồ sơ này):",
      name || ""
    );
    if (nextName === null) return;
    const created = switchOrCreateEsidAgent(nextName);
    setStore(loadEsidAgentStore());
    setName(created.name);
    setAddress(created.address);
    setTel(created.tel);
    setEmail(created.email);
    setVat(created.vat);
  };

  const selectProfile = (p: EsidAgentProfile) => {
    setActiveEsidAgentId(p.id);
    setStore(loadEsidAgentStore());
    setName(p.name);
    setAddress(p.address);
    setTel(p.tel);
    setEmail(p.email);
    setVat(p.vat);
  };

  const complete = agentIsComplete({ name });

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className={btn}
        disabled={disabled}
        title={complete ? `Agent: ${active.name}` : "Chưa có tên Agent ESID cố định"}
        onClick={() => setOpen((v) => !v)}
      >
        {compact ? "Agent" : label}
        {!complete ? <span className="text-amber-600">!</span> : null}
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-[min(92vw,340px)] rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-600 dark:bg-slate-900"
          role="dialog"
          aria-label="Hồ sơ Agent ESID"
        >
          <p className="mb-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            Agent ESID (cố định trên máy)
          </p>
          {store.profiles.filter((p) => p.name.trim()).length > 1 ? (
            <label className="mb-2 block text-[10px] text-slate-500">
              Hồ sơ
              <select
                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-800"
                value={store.activeId}
                onChange={(e) => {
                  const p = store.profiles.find((x) => x.id === e.target.value);
                  if (p) selectProfile(p);
                }}
              >
                {store.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.trim() || "(chưa đặt tên)"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="mb-1.5 block text-[10px] text-slate-500">
            Họ tên / Name *
            <input
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-800"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="mb-1.5 block text-[10px] text-slate-500">
            Địa chỉ
            <textarea
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-800"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label className="mb-1.5 block text-[10px] text-slate-500">
            Điện thoại
            <input
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-800"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              inputMode="tel"
            />
          </label>
          <label className="mb-1.5 block text-[10px] text-slate-500">
            Email
            <input
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-800"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="mb-2 block text-[10px] text-slate-500">
            MST / VAT
            <input
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-800"
              value={vat}
              onChange={(e) => setVat(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-sky-700"
              onClick={saveCurrent}
            >
              Lưu
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
              onClick={switchName}
            >
              Đổi tên Agent
            </button>
            <button
              type="button"
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-slate-500"
              onClick={() => setOpen(false)}
            >
              Đóng
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
