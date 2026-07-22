import { useEffect, useState, type ReactNode } from "react";

export type EsidProfileBase = {
  id: string;
  name: string;
};

export type EsidProfileStoreV1<P extends EsidProfileBase> = {
  version: 1;
  activeId: string;
  profiles: P[];
};

export type EsidProfileField<P extends EsidProfileBase> = {
  key: Exclude<keyof P & string, "id" | "updatedAt">;
  label: string;
  multiline?: boolean;
  inputMode?: "tel" | "numeric" | "email" | "text";
  autoComplete?: string;
  /** Transform giá trị khi gõ (vd. bỏ khoảng trắng CCCD). */
  transform?: (raw: string) => string;
  required?: boolean;
};

type Props<P extends EsidProfileBase> = {
  disabled?: boolean;
  compact?: boolean;
  /** Nhãn nút khi compact / chưa có tên */
  compactLabel: string;
  /** Prefix nhãn nút khi có tên active (vd. "Agent · …") */
  buttonLabelPrefix: string;
  buttonNameMax?: number;
  dialogTitle: string;
  dialogAriaLabel: string;
  switchPrompt: string;
  switchButtonLabel: string;
  incompleteTitle: string;
  completeTitle: (active: P) => string;
  changedEvent: string;
  loadStore: () => EsidProfileStoreV1<P>;
  getActive: () => P;
  updateActive: (patch: Partial<P>) => P;
  switchOrCreate: (name: string) => P;
  setActiveId: (id: string) => P;
  pushStore: () => Promise<boolean>;
  isComplete: (draft: Partial<P> & Pick<P, "name">) => boolean;
  fields: EsidProfileField<P>[];
  /** Field luôn có — họ tên */
  nameLabel: string;
  nameAutoComplete?: string;
  panelMaxWidthClass?: string;
  extraActions?: ReactNode;
};

const BTN =
  "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-45 active:scale-[0.98] border border-sky-500/25 bg-sky-50/90 text-sky-900 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/50";

const INPUT =
  "mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-800";

/**
 * UI cấu hình hồ sơ ESID dùng chung (Agent / Người khai).
 * Domain field khác nhau — truyền qua `fields` + store API.
 */
export function EsidProfileSettingsButton<P extends EsidProfileBase>({
  disabled,
  compact,
  compactLabel,
  buttonLabelPrefix,
  buttonNameMax = 14,
  dialogTitle,
  dialogAriaLabel,
  switchPrompt,
  switchButtonLabel,
  incompleteTitle,
  completeTitle,
  changedEvent,
  loadStore,
  getActive,
  updateActive,
  switchOrCreate,
  setActiveId,
  pushStore,
  isComplete,
  fields,
  nameLabel,
  nameAutoComplete,
  panelMaxWidthClass = "w-[min(92vw,340px)]",
}: Props<P>) {
  const [open, setOpen] = useState(false);
  const [store, setStore] = useState(() => loadStore());
  const active = store.profiles.find((p) => p.id === store.activeId) || store.profiles[0];
  const [name, setName] = useState(active?.name || "");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, String(active?.[f.key] ?? "")]))
  );

  const syncFromProfile = (p: P) => {
    setName(p.name || "");
    setFieldValues(Object.fromEntries(fields.map((f) => [f.key, String(p[f.key] ?? "")])));
  };

  useEffect(() => {
    const sync = () => {
      const next = loadStore();
      setStore(next);
      const a = next.profiles.find((p) => p.id === next.activeId) || next.profiles[0];
      if (a) syncFromProfile(a);
    };
    window.addEventListener(changedEvent, sync);
    return () => window.removeEventListener(changedEvent, sync);
  }, [changedEvent, loadStore, fields]);

  useEffect(() => {
    if (!open) return;
    syncFromProfile(getActive());
  }, [open, getActive, fields]);

  const draft = { name, ...fieldValues } as Partial<P> & Pick<P, "name">;
  const complete = isComplete(draft);

  const label = active?.name?.trim()
    ? `${buttonLabelPrefix} · ${active.name.trim().slice(0, buttonNameMax)}`
    : buttonLabelPrefix;

  const saveCurrent = () => {
    updateActive({ name, ...fieldValues } as Partial<P>);
    setStore(loadStore());
    void pushStore();
    setOpen(false);
  };

  const switchName = () => {
    const nextName = window.prompt(switchPrompt, name || "");
    if (nextName === null) return;
    const created = switchOrCreate(nextName);
    setStore(loadStore());
    syncFromProfile(created);
    void pushStore();
  };

  const selectProfile = (p: P) => {
    setActiveId(p.id);
    setStore(loadStore());
    syncFromProfile(p);
    void pushStore();
  };

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className={BTN}
        disabled={disabled}
        title={complete && active ? completeTitle(active) : incompleteTitle}
        onClick={() => setOpen((v) => !v)}
      >
        {compact ? compactLabel : label}
        {!complete ? <span className="text-amber-600">!</span> : null}
      </button>
      {open ? (
        <div
          className={`absolute left-0 top-full z-50 mt-1 ${panelMaxWidthClass} rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-600 dark:bg-slate-900`}
          role="dialog"
          aria-label={dialogAriaLabel}
        >
          <p className="mb-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            {dialogTitle}
          </p>
          {store.profiles.filter((p) => p.name.trim()).length > 1 ? (
            <label className="mb-2 block text-[10px] text-slate-500">
              Hồ sơ
              <select
                className={`${INPUT} bg-white dark:bg-slate-800`}
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
            {nameLabel}
            <input
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete={nameAutoComplete}
            />
          </label>
          {fields.map((f) => (
            <label
              key={f.key}
              className={`${f === fields[fields.length - 1] ? "mb-2" : "mb-1.5"} block text-[10px] text-slate-500`}
            >
              {f.label}
              {f.multiline ? (
                <textarea
                  className={INPUT}
                  rows={2}
                  value={fieldValues[f.key] ?? ""}
                  onChange={(e) => {
                    const v = f.transform ? f.transform(e.target.value) : e.target.value;
                    setFieldValues((prev) => ({ ...prev, [f.key]: v }));
                  }}
                />
              ) : (
                <input
                  className={INPUT}
                  value={fieldValues[f.key] ?? ""}
                  onChange={(e) => {
                    const v = f.transform ? f.transform(e.target.value) : e.target.value;
                    setFieldValues((prev) => ({ ...prev, [f.key]: v }));
                  }}
                  inputMode={f.inputMode}
                  autoComplete={f.autoComplete}
                />
              )}
            </label>
          ))}
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
              title={switchPrompt}
            >
              {switchButtonLabel}
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
