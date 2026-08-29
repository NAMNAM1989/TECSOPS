/** Đóng ô edit ngay, lưu nền — khớp optimistic sync. */
export function runInlineAsyncCommit(
  result: void | boolean | Promise<boolean | void>,
  opts: {
    setEditing: (v: boolean) => void;
    setSaving: (v: boolean) => void;
    onReject: () => void;
  },
): void {
  if (result && typeof (result as Promise<unknown>).then === "function") {
    opts.setEditing(false);
    opts.setSaving(true);
    void (result as Promise<boolean | void>)
      .then((ok) => {
        if (ok === false) {
          opts.onReject();
          opts.setEditing(true);
        }
      })
      .finally(() => opts.setSaving(false));
    return;
  }
  opts.setEditing(false);
}
