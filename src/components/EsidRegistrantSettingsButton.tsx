import { useEffect, useState } from "react";
import {
  ESID_REGISTRANT_CHANGED_EVENT,
  getActiveEsidRegistrant,
  loadEsidRegistrantStore,
  registrantIsComplete,
  setActiveEsidRegistrantId,
  switchOrCreateEsidRegistrant,
  updateActiveEsidRegistrant,
  type EsidRegistrantProfile,
  type EsidRegistrantStoreV1,
} from "../utils/esidRegistrantProfile";
import { pushEsidRegistrantStore } from "../utils/esidProfilesSync";

type Props = {
  disabled?: boolean;
  compact?: boolean;
};

/**
 * Nút cấu hình người khai ESID (CCCD cố định).
 * Đổi người = nhập tên khác → tạo/chọn hồ sơ mới.
 */
export function EsidRegistrantSettingsButton({ disabled, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [store, setStore] = useState<EsidRegistrantStoreV1>(() => loadEsidRegistrantStore());
  const active = store.profiles.find((p) => p.id === store.activeId) || store.profiles[0];
  const [name, setName] = useState(active?.name || "");
  const [tel, setTel] = useState(active?.tel || "");
  const [cccd, setCccd] = useState(active?.cccd || "");

  useEffect(() => {
    const sync = () => {
      const next = loadEsidRegistrantStore();
      setStore(next);
      const a = next.profiles.find((p) => p.id === next.activeId) || next.profiles[0];
      setName(a?.name || "");
      setTel(a?.tel || "");
      setCccd(a?.cccd || "");
    };
    window.addEventListener(ESID_REGISTRANT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(ESID_REGISTRANT_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const a = getActiveEsidRegistrant();
    setName(a.name);
    setTel(a.tel);
    setCccd(a.cccd);
  }, [open]);

  const btn =
    "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-45 active:scale-[0.98] border border-sky-500/25 bg-sky-50/90 text-sky-900 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/50";

  const label = active?.name?.trim()
    ? `Người khai · ${active.name.trim().slice(0, 16)}`
    : "Người khai";

  const saveCurrent = () => {
    updateActiveEsidRegistrant({ name, tel, cccd });
    setStore(loadEsidRegistrantStore());
    void pushEsidRegistrantStore();
    setOpen(false);
  };

  const switchName = () => {
    const nextName = window.prompt(
      "Tên người khai mới (đổi người khai — CCCD/SĐT sẽ nhập riêng cho hồ sơ này):",
      name || ""
    );
    if (nextName === null) return;
    const created = switchOrCreateEsidRegistrant(nextName);
    setStore(loadEsidRegistrantStore());
    setName(created.name);
    setTel(created.tel);
    setCccd(created.cccd);
    void pushEsidRegistrantStore();
  };

  const selectProfile = (p: EsidRegistrantProfile) => {
    setActiveEsidRegistrantId(p.id);
    setStore(loadEsidRegistrantStore());
    setName(p.name);
    setTel(p.tel);
    setCccd(p.cccd);
    void pushEsidRegistrantStore();
  };

  const complete = registrantIsComplete({ name, tel, cccd });

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className={btn}
        disabled={disabled}
        title={
          complete
            ? `Người khai: ${active.name} · CCCD ${active.cccd}`
            : "Chưa đủ họ tên / SĐT / CCCD người khai ESID"
        }
        onClick={() => setOpen((v) => !v)}
      >
        {compact ? "CCCD" : label}
        {!complete ? <span className="text-amber-600">!</span> : null}
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-[min(92vw,320px)] rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-600 dark:bg-slate-900"
          role="dialog"
          aria-label="Hồ sơ người khai ESID"
        >
          <p className="mb-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            Người khai ESID (dùng chung mọi máy)
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
            Họ tên đầy đủ
            <input
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-800"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
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
          <label className="mb-2 block text-[10px] text-slate-500">
            Số CCCD
            <input
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-800"
              value={cccd}
              onChange={(e) => setCccd(e.target.value.replace(/\s+/g, ""))}
              inputMode="numeric"
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
              title="Tạo hoặc chuyển sang người khai tên khác"
            >
              Đổi tên người khai
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
